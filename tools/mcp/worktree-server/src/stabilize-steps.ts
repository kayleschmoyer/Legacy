/**
 * Step construction for `worktree_stabilize`.
 *
 * Extracted from index.ts so the shell string the tool builds is unit-testable
 * without spawning a job (LS-10109). Two defects lived in the inlined version:
 *
 * 1. The trailing "next step" hint — human prose containing both parentheses
 *    and double quotes (`worktree_run(command: "make pc")`) — was interpolated
 *    into the `sh -c` command string via `echo '...'`. On Windows that string
 *    is handed to `bash.exe -c` through PowerShell's native-command argument
 *    re-serialization, which does not escape the embedded double quotes; bash
 *    then received a truncated `-c` payload and died with
 *    `unexpected EOF while looking for matching `''` BEFORE running any step.
 *    The tool aborted on its own help text, so db:print-schema and codegen
 *    never ran. Fixed two ways: prose hints are no longer shell-interpolated
 *    at all (the caller appends STABILIZE_NEXT_STEP_HINT to the result text in
 *    Node), and every value that still reaches the shell goes through
 *    `shellSingleQuote`.
 *
 * 2. The `node_modules`-is-a-symlink branch skipped `make install` and did
 *    nothing else, which is right about not mutating the shared pool slot but
 *    leaves the worktree broken when the rebase pulled in a NEW workspace
 *    package: the slot has no link for it and typecheck fails with TS2307 on
 *    a file the branch never touched. That branch now runs the pool linker,
 *    which is idempotent and does not mutate the slot's contents.
 */

/** One stabilization step: a display label and the command it runs. */
export interface StabilizeStep {
  label: string;
  cmd: string;
}

/**
 * Appended to the tool result in Node rather than echoed from the shell — see
 * this file's header. Keeping prose out of the command string is what makes
 * defect 1 unrepeatable rather than merely fixed for today's wording.
 */
export const STABILIZE_NEXT_STEP_HINT =
  'Stabilization complete. Next: worktree_run(command: "make pc") to validate.';

/** Emitted instead of `make install` when node_modules is a pool symlink. */
export const STABILIZE_POOL_LINK_NOTE =
  '⚠ node_modules is a symlink — running the modules-pool linker instead of `make install`, ' +
  'which would mutate shared deps. This links any workspace package the rebase added.';

/** The pool linker — idempotent, and never mutates the slot's contents. */
const POOL_LINK_CMD = 'node scripts/modules-pool/link.mjs';

/**
 * Wrap `value` in POSIX single quotes, escaping any embedded single quote via
 * the standard `'\''` (close, escaped literal, reopen) idiom. Guards against a
 * label ever re-introducing defect 1 through an apostrophe.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/**
 * Build the ordered step list.
 *
 * The dependency-restoring step (`make install` or the pool linker) must come
 * first: db:print-schema and codegen both resolve through node_modules.
 */
export function buildStabilizeSteps(
  nodeModulesIsSymlink: boolean,
): StabilizeStep[] {
  return [
    nodeModulesIsSymlink
      ? { label: POOL_LINK_CMD, cmd: POOL_LINK_CMD }
      : { label: 'make install', cmd: 'make install' },
    {
      label: 'pnpm exec nx run db:print-schema',
      cmd: 'pnpm exec nx run db:print-schema',
    },
    {
      label: 'pnpm exec nx affected -t codegen --base=origin/main',
      cmd: 'pnpm exec nx affected -t codegen --base=origin/main',
    },
  ];
}

/**
 * Chain the steps into one shell command. `&&` preserves the original
 * short-circuit-on-first-failure behaviour, and each step still echoes its own
 * label and success marker so a caller polling worktree_job_status sees the
 * same progress shape as before.
 */
export function buildStabilizeCommand(steps: StabilizeStep[]): string {
  return steps
    .map(
      (step) =>
        `echo ${shellSingleQuote(`$ ${step.label}`)} && ${step.cmd} && ` +
        `echo ${shellSingleQuote(`✓ ${step.label} succeeded`)}`,
    )
    .join(' && ');
}
