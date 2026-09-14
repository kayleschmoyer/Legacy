import { minifiedJson } from '@legacy-sports/mcp-format';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { registerJobFormatter } from '../job-formatters.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';
import { pnpmJobSpec, SYNC_BUDGET_MS } from '../nx-job.js';
import { getRepoRoot, runCommand, runPnpm } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// Above this many changed lockfile lines, a one-package install is almost
// certainly dragging in unrelated peer-graph re-resolution rather than just
// the requested package's own entries (see LS-10189).
const LOCKFILE_CHURN_WARNING_THRESHOLD = 100;

// Runaway backstop only — transport safety comes from the sync budget +
// bounded nx_job_wait calls. Cold installs with lock contention can be slow.
const INSTALL_TIMEOUT = 600_000;

interface InstallPackageParams {
  name: string;
  version?: string;
  dev?: boolean;
  worktreePath?: string;
}

interface PnpmInfoTypesResult {
  types?: string;
  typings?: string;
}

interface RootPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Check if node_modules is a symlink. Works cross-platform. */
async function isSymlink(cwd: string): Promise<boolean> {
  try {
    const stat = await lstat(join(cwd, 'node_modules'));
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Check if a package bundles its own types (has `types` or `typings` field). */
async function hasBuiltinTypes(
  packageName: string,
  cwd: string,
): Promise<boolean> {
  try {
    const output = await runPnpm(
      ['info', packageName, 'types', 'typings', '--json'],
      cwd,
      15_000,
    );
    const parsed = JSON.parse(output) as PnpmInfoTypesResult;
    // pnpm info --json returns an object with the fields
    return Boolean(parsed.types || parsed.typings);
  } catch {
    // If pnpm info fails (e.g. package not in registry yet), assume no bundled types
    return false;
  }
}

/** Check if @types/ companion exists in the npm registry. */
async function typesCompanionExists(
  packageName: string,
  cwd: string,
): Promise<boolean> {
  // Scoped packages: @foo/bar -> @types/foo__bar
  const typesName = packageName.startsWith('@')
    ? `@types/${packageName.slice(1).replace('/', '__')}`
    : `@types/${packageName}`;

  try {
    await runPnpm(['info', typesName, 'version'], cwd, 15_000);
    return true;
  } catch {
    return false;
  }
}

/** Scan lib/ for nested node_modules that indicate version duplication (Node-based, cross-platform). */
async function findNestedNodeModules(cwd: string): Promise<string[]> {
  const nested: string[] = [];
  const libPath = join(cwd, 'lib');

  try {
    const libDirs = await readdir(libPath, { withFileTypes: true });
    for (const entry of libDirs) {
      if (!entry.isDirectory()) continue;
      const nmDir = join(libPath, entry.name, 'node_modules');
      try {
        await access(nmDir);
        nested.push(`lib/${entry.name}/node_modules`);
      } catch {
        // No nested node_modules — good
      }
    }
  } catch {
    // lib/ may not exist
  }

  return nested;
}

const PACKAGE_NAME_REGEX = /^(?:@[a-z0-9-._]+\/)?[a-z0-9-._]+$/i;
const PACKAGE_VERSION_REGEX = /^[0-9a-z.*+_~^-]+$/i;

/**
 * Resolve the range to write into package.json for a new dependency.
 *
 * Mirrors `pnpm add`'s default `^` save-prefix for a bare semver version
 * (e.g. "1.2.3" -> "^1.2.3"). A caller-supplied range/operator/dist-tag
 * (e.g. "^1.2.3", "~1.2.3", "latest") is used verbatim. When no version is
 * given, resolves the registry's `latest` dist-tag the same way `pnpm add
 * <name>` would.
 */
async function resolveVersionRange(
  name: string,
  version: string | undefined,
  cwd: string,
): Promise<string> {
  if (version != null) {
    return /^\d/.test(version) ? `^${version}` : version;
  }
  const latest = await runPnpm(['info', name, 'version'], cwd, 15_000);
  return `^${latest.trim()}`;
}

/**
 * Declare a new dependency in root package.json directly, without invoking
 * `pnpm add`. `pnpm add` re-resolves the entire peer-dependency graph when it
 * rewrites the lockfile, which on this workspace's react-native/expo tree
 * produces thousands of lines of unrelated churn for a single new dependency
 * (LS-10189). Editing package.json ourselves and letting a plain `pnpm
 * install` patch the lockfile against its existing resolutions reproduces
 * pnpm's minimal-diff path instead.
 *
 * Inserts the entry in alphabetical position to match this repo's existing
 * (pnpm-maintained) sort order in both dependency maps, and re-serializes
 * with the file's existing 2-space indent + trailing newline.
 */
async function declareDependency(
  cwd: string,
  name: string,
  versionRange: string,
  dev: boolean,
): Promise<string> {
  const pkgPath = join(cwd, 'package.json');
  const raw = await readFile(pkgPath, 'utf-8');
  const pkgJson = JSON.parse(raw) as RootPackageJson;
  const field = dev ? 'devDependencies' : 'dependencies';
  const existing = pkgJson[field] ?? {};
  const sortedEntries = Object.entries({
    ...existing,
    [name]: versionRange,
  }).sort(([a], [b]) => a.localeCompare(b));
  pkgJson[field] = Object.fromEntries(sortedEntries);
  await writeFile(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf-8');
  return raw;
}

/**
 * Count how many lines `pnpm-lock.yaml` changed relative to the working
 * tree's current HEAD (insertions + deletions from `git diff --numstat`).
 * Returns `undefined` when the count can't be determined (e.g. not a git
 * checkout) rather than failing the whole install.
 */
async function getLockfileDiffLineCount(
  cwd: string,
): Promise<number | undefined> {
  try {
    const output = await runCommand(
      'git',
      ['diff', '--numstat', '--', 'pnpm-lock.yaml'],
      cwd,
      15_000,
    );
    if (!output.trim()) return 0;
    const [insertions, deletions] = output.trim().split('\t');
    const ins = Number.parseInt(insertions, 10);
    const del = Number.parseInt(deletions, 10);
    if (Number.isNaN(ins) || Number.isNaN(del)) return undefined;
    return ins + del;
  } catch {
    return undefined;
  }
}

export async function installPackage(
  params: InstallPackageParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  if (!PACKAGE_NAME_REGEX.test(params.name)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid package name: "${params.name}". Only scoped or unscoped npm package names are allowed.`,
        },
      ],
      isError: true,
    };
  }
  if (params.version != null && !PACKAGE_VERSION_REGEX.test(params.version)) {
    return {
      content: [
        { type: 'text', text: `Invalid version string: "${params.version}".` },
      ],
      isError: true,
    };
  }

  // --- Safety: detect symlinked node_modules ---
  const linked = await isSymlink(cwd);
  if (linked) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            error: 'SYMLINK_DETECTED',
            message:
              'node_modules is a symlink into a shared, immutable content-addressable pool slot. Installing here would mutate a slot other worktrees may be running. ' +
              'To add a package: remove the symlink first (`rm node_modules` in Git Bash — no -r, and NEVER a trailing slash, which deletes through the link into the shared slot), add the dependency to package.json and run `pnpm install` (this rewrites the lockfile), then `make install` (or `node scripts/modules-pool/link.mjs`) to materialise and link the new slot. The risk guard allows this once the symlink is gone, so no `# risk-ok` marker is needed.',
            cwd,
          }),
        },
      ],
      isError: true,
    };
  }

  // --- Declare + install (avoids `pnpm add`'s peer-graph re-resolution churn — LS-10189) ---
  // Symlink guard already ran above, so it's safe to touch package.json/pnpm directly.
  let versionRange: string;
  try {
    versionRange = await resolveVersionRange(params.name, params.version, cwd);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            error: 'VERSION_RESOLUTION_FAILED',
            package: params.name,
            message: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
  const originalPackageJson = await declareDependency(
    cwd,
    params.name,
    versionRange,
    params.dev ?? false,
  );

  // Background job + bounded sync wait — see run-target.ts for rationale.
  const jobSpec = pnpmJobSpec(['install']);
  const snapshot = await runJobWithBudget(
    {
      command: jobSpec.command,
      args: jobSpec.args,
      shell: jobSpec.shell,
      cwd,
      label: `pnpm install (${params.name}@${versionRange})`,
      timeoutMs: INSTALL_TIMEOUT,
      idempotencyKey: `pnpm-install:${cwd}:${params.name}:${versionRange}:${params.dev ? 'dev' : 'prod'}`,
      meta: {
        kind: 'install',
        name: params.name,
        dev: params.dev ?? false,
        cwd,
      },
    },
    SYNC_BUDGET_MS,
  );

  if (snapshot.status === 'running' || snapshot.status === 'orphaned') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            package: params.name,
            status: snapshot.status,
            jobId: snapshot.jobId,
            elapsedSec: snapshot.elapsedSec,
            logTail: truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS),
            hint: snapshot.hint,
          }),
        },
      ],
      ...(snapshot.status === 'orphaned' ? { isError: true } : {}),
    };
  }

  if (snapshot.status === 'failed') {
    // Roll back the package.json edit — the install itself never completed,
    // so leaving a declared-but-unresolved dependency behind would be worse
    // than the previous `pnpm add` failure mode (which never touched
    // package.json without also updating the lockfile).
    await writeFile(join(cwd, 'package.json'), originalPackageJson, 'utf-8');
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            error: 'INSTALL_FAILED',
            package: params.name,
            message:
              snapshot.error ??
              `pnpm install failed for ${params.name}@${versionRange}`,
            output: truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS),
          }),
        },
      ],
      isError: true,
    };
  }

  // --- Post-install checks (full set — registry lookups included) ---
  const warnings: string[] = [];

  // 1. Check for nested node_modules
  const nestedDirs = await findNestedNodeModules(cwd);
  if (nestedDirs.length > 0) {
    warnings.push(
      `Found nested node_modules (potential version duplication): ${nestedDirs.join(', ')}. ` +
        'Consider adding pnpm.overrides in root package.json to pin the version.',
    );
  }

  // 2. Check if @types/ companion is needed
  let typesStatus: string;
  if (params.name.startsWith('@types/')) {
    typesStatus = 'installed_directly';
  } else if (await hasBuiltinTypes(params.name, cwd)) {
    typesStatus = 'bundled';
  } else if (await typesCompanionExists(params.name, cwd)) {
    typesStatus = 'companion_available';
    warnings.push(
      `Package "${params.name}" does not bundle types. A @types/ companion exists in the registry. ` +
        'Consider installing it as a dev dependency for full type support.',
    );
  } else {
    typesStatus = 'none_available';
  }

  // 3. Read installed version from root package.json
  const installedVersion = await readInstalledVersion(cwd, params.name);

  // 4. Report lockfile churn so the caller can sanity-check it against the
  // one-package expectation (LS-10189) — the declare-then-install flow above
  // keeps this small in practice, but a warning still catches any residual
  // unrelated re-resolution rather than relying on the agent to notice.
  const lockfileDiffLines = await getLockfileDiffLineCount(cwd);
  if (
    lockfileDiffLines != null &&
    lockfileDiffLines > LOCKFILE_CHURN_WARNING_THRESHOLD
  ) {
    warnings.push(
      `pnpm-lock.yaml changed ${lockfileDiffLines} lines for a single-package install — ` +
        'this is far more than one package usually needs and may indicate unrelated ' +
        'peer-dependency re-resolution. Review the lockfile diff before committing.',
    );
  }

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          package: params.name,
          installedVersion,
          dev: params.dev ?? false,
          typesStatus,
          ...(lockfileDiffLines != null && { lockfileDiffLines }),
          ...(warnings.length > 0 && { warnings }),
          output: truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS),
        }),
      },
    ],
  };
}

/** Read the installed version spec from root package.json (best-effort). */
async function readInstalledVersion(
  cwd: string,
  name: string,
): Promise<string | undefined> {
  try {
    const pkgJson = JSON.parse(
      await readFile(join(cwd, 'package.json'), 'utf-8'),
    ) as RootPackageJson;
    const deps: Record<string, string> = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };
    return deps[name];
  } catch {
    // Non-critical — version reporting is best-effort
    return undefined;
  }
}

// Deferred-completion formatter: when a slow install finishes and the result
// is observed via nx_job_wait, rebuild the install summary from filesystem
// state only. Registry lookups (pnpm info) are skipped — they could push the
// bounded wait call past the transport window.
registerJobFormatter('install', async (snapshot: JobSnapshot) => {
  const meta = snapshot.meta as
    | { name?: unknown; dev?: unknown; cwd?: unknown }
    | undefined;
  const name = typeof meta?.name === 'string' ? meta.name : null;
  const cwd = typeof meta?.cwd === 'string' ? meta.cwd : null;
  if (!name || !cwd) return null;

  if (snapshot.status === 'failed') {
    return {
      body: {
        error: 'INSTALL_FAILED',
        package: name,
        message: snapshot.error ?? `pnpm install failed for ${name}`,
        output: truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS),
      },
      isError: true,
    };
  }

  const warnings: string[] = [];
  const nestedDirs = await findNestedNodeModules(cwd);
  if (nestedDirs.length > 0) {
    warnings.push(
      `Found nested node_modules (potential version duplication): ${nestedDirs.join(', ')}. ` +
        'Consider adding pnpm.overrides in root package.json to pin the version.',
    );
  }

  const lockfileDiffLines = await getLockfileDiffLineCount(cwd);
  if (
    lockfileDiffLines != null &&
    lockfileDiffLines > LOCKFILE_CHURN_WARNING_THRESHOLD
  ) {
    warnings.push(
      `pnpm-lock.yaml changed ${lockfileDiffLines} lines for a single-package install — ` +
        'this is far more than one package usually needs and may indicate unrelated ' +
        'peer-dependency re-resolution. Review the lockfile diff before committing.',
    );
  }

  return {
    body: {
      package: name,
      installedVersion: await readInstalledVersion(cwd, name),
      dev: meta?.dev === true,
      typesStatus: 'not_checked',
      ...(lockfileDiffLines != null && { lockfileDiffLines }),
      ...(warnings.length > 0 && { warnings }),
      output: truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS),
    },
    isError: false,
  };
});
