import { minifiedJson } from '@legacy-sports/mcp-format';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { registerJobFormatter } from '../job-formatters.js';
import type { FormattedJobResult } from '../job-formatters.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';
import { pnpmJobSpec, SYNC_BUDGET_MS } from '../nx-job.js';
import { getRepoRoot } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// This tool is for surgical lint feedback on a handful of files, not
// whole-project or whole-repo linting — nx_run({ target: 'lint' }) and
// nx_run_pc_chunk({ chunk: 'pc-lint' }) already cover those paths.
export const MAX_FILES = 50;

/**
 * Far longer than prettier's 60s (run-prettier.ts), and generous on purpose.
 *
 * Every TS config in this repo enables type-aware `@typescript-eslint` rules
 * via `parserOptions.project` (the workspace root config points at
 * `tsconfig.base.json`; `lambdas/db/eslint.config.mjs` at `tsconfig.*?.json`),
 * so ESLint must construct a full TypeScript program before it can lint even
 * one file. Measured in `lambdas/db`: a single file takes 4m40s and the entire
 * project (`eslint .`) takes 4m42s — scoping to one file saves ~2s of ~280s.
 * The cost is per-run, not per-file, so it does not shrink with the file list.
 *
 * An earlier 120s limit killed legitimate runs and surfaced as a bare
 * "Command failed" with no diagnostics, which is worse than waiting — same
 * reasoning as NX_RUN_TIMEOUT_MS in run-target.ts (LS-8353). This is now the
 * job runner's process-level kill timeout (LS-9594) — independent of the
 * ~45s single-call sync budget below, which only bounds how long one MCP
 * call blocks before handing back a jobId.
 */
const ESLINT_TIMEOUT_MS = 10 * 60 * 1000;

// Same defence-in-depth shell metacharacter block as nx_run_prettier's file
// list and nx_run's passthrough args (SHELL_METACHAR_REGEX in run-target.ts) —
// file paths never legitimately contain any of these.
const SHELL_METACHAR_REGEX = /[;&`${}]/;

// ESLint 9 flat-config filenames, in the order ESLint itself probes them.
const ESLINT_CONFIG_FILENAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];

export interface RunESLintParams {
  files: string[];
  mode?: 'check' | 'fix';
  worktreePath?: string;
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Normalise a path to forward slashes so argv is identical across platforms. */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Find the directory whose flat config governs `absFile`.
 *
 * ESLint 9 resolves `eslint.config.*` from the **current working directory**,
 * not from the linted file's directory. Linting `lambdas/db/src/queries.ts`
 * from the repo root therefore silently applies the root config and drops
 * `lambdas/db/eslint.config.mjs` — whose `@nx/enforce-module-boundaries`
 * allow-list turns legitimate `@apollo/server` imports into false violations.
 * Verified empirically against ESLint 9.39: `--print-config` for the same file
 * yields `allow: []` from the repo root but the project's allow-list from
 * `lambdas/db`.
 *
 * So walk up from the file to the nearest directory that owns a flat config,
 * bounded by `baseCwd`, and run ESLint from there. Falls back to `baseCwd`
 * (the root config) when no nearer config exists.
 *
 * Exported for unit testing.
 */
export function resolveConfigDir(absFile: string, baseCwd: string): string {
  let dir = dirname(absFile);

  for (;;) {
    if (
      ESLINT_CONFIG_FILENAMES.some((name) => existsSync(resolve(dir, name)))
    ) {
      return dir;
    }
    if (dir === baseCwd) return baseCwd;

    const parent = dirname(dir);
    // Defensive: stop at the filesystem root rather than looping forever if
    // `absFile` somehow sits outside `baseCwd`.
    if (parent === dir) return baseCwd;
    dir = parent;
  }
}

/**
 * Turn a terminal job's output into something actionable when the job runner
 * killed the process via its internal process-level timeout, rather than
 * ESLint itself finishing (with or without violations). On a real timeout the
 * accumulated log rarely contains useful diagnostics, so say so explicitly
 * instead of making the caller guess whether their code is broken or the run
 * was killed.
 *
 * Exported for unit testing.
 */
export function describeFailure(message: string, timedOut: boolean): string {
  if (!timedOut) return message;
  return (
    `${message}\n\n` +
    `Timed out after ${Math.round(ESLINT_TIMEOUT_MS / 1000)}s — this is a killed run, not a ` +
    `lint failure. Type-aware rules build a full TypeScript program before linting, which ` +
    `dominates the run time and does not shrink with the file list. Prefer ` +
    `nx_run({ project, target: "lint" }) for this project.`
  );
}

/** True when `absPath` is `baseCwd` itself or nested inside it. */
function isInside(baseCwd: string, absPath: string): boolean {
  const rel = relative(baseCwd, absPath);
  // `rel === ''` means absPath IS baseCwd. A leading `..` segment means it
  // escapes upward — compared segment-wise so a legitimate directory named
  // `..foo` is not mistaken for one. On Windows, `relative` across drives
  // returns an absolute path, which `isAbsolute` catches.
  if (isAbsolute(rel)) return false;
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** Shape of the job metadata written by runESLint for deferred formatting. */
interface ESLintJobMeta {
  mode?: unknown;
  filesCount?: unknown;
  projectRoot?: unknown;
}

/**
 * Build the structured eslint result body from a terminal job snapshot.
 * Shared between the inline (within sync budget) path and the deferred
 * nx_job_wait formatter so callers get the same result either way.
 */
function buildESLintResult(snapshot: JobSnapshot): FormattedJobResult {
  const meta = (snapshot.meta ?? {}) as ESLintJobMeta;
  const mode = typeof meta.mode === 'string' ? meta.mode : 'check';
  const filesCount = typeof meta.filesCount === 'number' ? meta.filesCount : 0;
  const projectRoot =
    typeof meta.projectRoot === 'string' ? meta.projectRoot : '.';

  const passed = snapshot.status === 'done';
  const timedOut = !passed && /internal timeout/i.test(snapshot.error ?? '');
  // A crash before eslint ever produced output (e.g. spawn failure) leaves
  // snapshot.log empty — fall back to the job runner's own error message so
  // the caller still sees something actionable instead of a blank string.
  const rawOutput = snapshot.log || snapshot.error || '';
  const output = describeFailure(rawOutput, timedOut);

  return {
    body: {
      mode,
      files: filesCount,
      projectRoot,
      passed,
      output: truncateOutput(output, MAX_OUTPUT_CHARS),
    },
    isError: !passed,
  };
}

// Deferred-completion formatter: a lint run still going when the sync budget
// expires, observed later via nx_job_wait / nx_job_status, gets the same
// structured result the inline path would have returned.
registerJobFormatter('eslint', (snapshot) =>
  Promise.resolve(buildESLintResult(snapshot)),
);

export async function runESLint(params: RunESLintParams): Promise<ToolResult> {
  // Normalised up front so the ancestor walk in `resolveConfigDir` can compare
  // directories by string equality on every platform.
  const cwd = resolve(params.worktreePath || getRepoRoot());
  const mode = params.mode ?? 'check';

  // The MCP schema enforces a non-empty list, but runESLint is also called
  // directly (tests, future callers) — fail with a message rather than
  // destructuring an empty group map below.
  if (params.files.length === 0) {
    return errorResult('No files given — pass at least one file to lint.');
  }

  if (params.files.length > MAX_FILES) {
    return errorResult(
      `Too many files (${params.files.length}) — nx_run_eslint is scoped to surgical fixes, capped at ${MAX_FILES}. ` +
        `For broader linting use nx_run({ project, target: "lint" }) or nx_run_pc_chunk({ chunk: "pc-lint" }) instead.`,
    );
  }

  for (const file of params.files) {
    if (file.startsWith('-')) {
      return errorResult(
        `Invalid file "${file}": must not start with "-" (would be interpreted as an eslint flag).`,
      );
    }
    if (SHELL_METACHAR_REGEX.test(file)) {
      return errorResult(
        `Invalid file "${file}": contains shell metacharacters (;&\`\${}) which are not allowed.`,
      );
    }
  }

  // Group the files by the flat config that governs them. ESLint applies one
  // config per invocation (resolved from cwd), so a list spanning two projects
  // cannot be linted correctly in a single run.
  const byConfigDir = new Map<string, string[]>();
  for (const file of params.files) {
    const absFile = resolve(cwd, file);
    if (!isInside(cwd, absFile)) {
      return errorResult(
        `Invalid file "${file}": resolves outside the working directory (${cwd}).`,
      );
    }

    const configDir = resolveConfigDir(absFile, cwd);
    const relFile = toPosix(relative(configDir, absFile));

    // The leading-hyphen guard above ran on the caller's path; relativising to
    // the config root can newly expose one (e.g. "lambdas/db/-weird.ts" becomes
    // "-weird.ts" once cwd is lambdas/db), which eslint would parse as a flag.
    if (relFile.startsWith('-')) {
      return errorResult(
        `Invalid file "${file}": resolves to "${relFile}" relative to its ESLint config root, ` +
          `which would be interpreted as an eslint flag.`,
      );
    }

    const group = byConfigDir.get(configDir);
    if (group) {
      group.push(relFile);
    } else {
      byConfigDir.set(configDir, [relFile]);
    }
  }

  if (byConfigDir.size > 1) {
    const roots = [...byConfigDir.keys()]
      .map((dir) => toPosix(relative(cwd, dir)) || '.')
      .sort();
    return errorResult(
      `Files span ${byConfigDir.size} ESLint config roots (${roots.join(', ')}). ` +
        `ESLint 9 resolves one flat config per run from its cwd, so a mixed list would apply the wrong ` +
        `rules to some files. Split this into one nx_run_eslint call per config root.`,
    );
  }

  const [configDir, files] = [...byConfigDir.entries()][0];
  const projectRoot = toPosix(relative(cwd, configDir)) || '.';

  // --max-warnings=0 matches the nx lint targetDefault ("eslint . --max-warnings=0",
  // nx.json), so this tool's verdict agrees with pc-lint's.
  const args = [
    'exec',
    'eslint',
    '--max-warnings=0',
    ...(mode === 'fix' ? ['--fix'] : []),
    ...files,
  ];

  // Run as a background job with a bounded sync wait: fast runs return their
  // result in one call, slow ones (this repo's type-aware ESLint config
  // floors at ~280s for even a single file — see ESLINT_TIMEOUT_MS above)
  // return a jobId to poll via nx_job_wait — never blocking into the ~60s
  // MCP transport timeout (LS-9594). Same job/jobId pattern as nx_run,
  // nx_run_test, and nx_run_pc_chunk.
  const jobSpec = pnpmJobSpec(args);
  const snapshot = await runJobWithBudget(
    {
      command: jobSpec.command,
      args: jobSpec.args,
      shell: jobSpec.shell,
      cwd: configDir,
      label: `eslint (${params.files.length} file${params.files.length === 1 ? '' : 's'})`,
      timeoutMs: ESLINT_TIMEOUT_MS,
      // Blind retries (e.g. after a lost transport) join the in-flight run
      // instead of spawning a duplicate eslint process.
      idempotencyKey: `eslint:${configDir}:${args.join(' ')}`,
      meta: {
        kind: 'eslint',
        mode,
        filesCount: params.files.length,
        projectRoot,
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
            mode,
            files: params.files.length,
            projectRoot,
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

  const formatted = buildESLintResult(snapshot);
  return {
    content: [{ type: 'text', text: minifiedJson(formatted.body) }],
    ...(formatted.isError ? { isError: true } : {}),
  };
}
