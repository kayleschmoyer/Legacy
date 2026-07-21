import { minifiedJson } from '@legacy-sports/mcp-format';
import { readFile, readdir, access } from 'node:fs/promises';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { registerJobFormatter } from '../job-formatters.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';
import { SYNC_BUDGET_MS, pnpmJobSpec } from '../nx-job.js';
import { getRepoRoot, runPnpm } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// Runaway backstop only — transport safety comes from the sync budget +
// bounded nx_job_wait calls. Cold installs with lock contention can be slow.
const INSTALL_TIMEOUT = 600_000;

interface InstallPackageParams {
  name: string;
  version?: string;
  dev?: boolean;
  worktreePath?: string;
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
    const parsed = JSON.parse(output);
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

  const spec = params.version
    ? `${params.name}@${params.version}`
    : params.name;

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
              'node_modules is a symlink into a shared, immutable content-addressable pool slot. Running pnpm add here would mutate a slot other worktrees may be running. ' +
              'To add a package: remove the symlink first (rm -rf node_modules in Git Bash), run `pnpm add -w <pkg>` (this rewrites the lockfile), then `make install` (or `node scripts/modules-pool/link.mjs`) to materialise and link the new slot.',
            cwd,
          }),
        },
      ],
      isError: true,
    };
  }

  // --- Install via pnpm add (cross-platform) ---
  // Symlink guard already ran above, so it's safe to call pnpm directly.
  const addArgs = ['add', '-w', ...(params.dev ? ['-D'] : []), spec];

  // Background job + bounded sync wait — see run-target.ts for rationale.
  const jobSpec = pnpmJobSpec(addArgs);
  const snapshot = await runJobWithBudget(
    {
      command: jobSpec.command,
      args: jobSpec.args,
      shell: jobSpec.shell,
      cwd,
      label: `pnpm add ${spec}`,
      timeoutMs: INSTALL_TIMEOUT,
      idempotencyKey: `pnpm-add:${cwd}:${spec}:${params.dev ? 'dev' : 'prod'}`,
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
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            error: 'INSTALL_FAILED',
            package: params.name,
            message: snapshot.error ?? `pnpm add ${spec} failed`,
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

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          package: params.name,
          installedVersion,
          dev: params.dev ?? false,
          typesStatus,
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
    );
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    return deps[name] as string | undefined;
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
        message: snapshot.error ?? `pnpm add ${name} failed`,
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
  return {
    body: {
      package: name,
      installedVersion: await readInstalledVersion(cwd, name),
      dev: meta?.dev === true,
      typesStatus: 'not_checked',
      ...(warnings.length > 0 && { warnings }),
      output: truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS),
    },
    isError: false,
  };
});
