/**
 * Shell-script construction for `worktree_run_on_ref` (LS-10108).
 *
 * Extracted into a pure function — same rationale as `buildStabilizeCommand`
 * in `stabilize-steps.ts` (LS-10109): the string this tool hands to a shell
 * is unit-testable without spawning a real process.
 *
 * The command execution step is run as a background job (see `jobs.ts`)
 * instead of blocking the MCP tool call in-process, because a single call
 * cannot legally block past the ~60s cloud MCP transport timeout (LS-8559) —
 * and a cold `tsc --noEmit` on one project already takes 35-40s, leaving no
 * margin (LS-10108). Job-backing alone isn't enough here though: unlike
 * `worktree_run_long`, this tool also owns a throwaway `git worktree` that
 * MUST be removed no matter how the command ends — including being killed by
 * the job runner's own process-level timeout (`killJobTree`, a SIGTERM to the
 * whole process group). A plain `cmd1 && cleanup` sequence would skip cleanup
 * in that case, since SIGTERM ends the shell before it reaches `cleanup`.
 * `trap cleanup EXIT` is the standard POSIX-shell idiom that avoids this: the
 * trap fires on normal exit, a non-zero exit, AND a caught signal, and
 * (absent an explicit `exit` inside the trap) preserves the exit status the
 * shell already had — so the job's reported exitCode is still the command's,
 * not the cleanup step's.
 */

/**
 * Wrap `value` in POSIX single quotes, escaping any embedded single quote via
 * the standard `'\''` (close, escaped literal, reopen) idiom. Duplicated from
 * `stabilize-steps.ts` rather than imported — the two files intentionally
 * have no dependency on each other, and this is a two-line pure function.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/** Printed by the cleanup step so the caller can tell cleanup succeeded. */
export const RUN_ON_REF_CLEANED_UP_MARKER =
  '<<worktree_run_on_ref: cleaned up>>';
/** Printed when every cleanup fallback failed — a stray worktree may remain. */
export const RUN_ON_REF_CLEANUP_FAILED_MARKER =
  '<<worktree_run_on_ref: cleanup failed>>';

export interface RunOnRefScriptOptions {
  tmpWorktreePath: string;
  mainRepo: string;
  /** Arbitrary trusted shell command — see RunOnRefArgs's doc comment in run-on-ref.ts. */
  command: string;
  /**
   * cmd.exe (last-resort fallback when git-bash isn't found — see
   * `resolveWindowsShell` in index.ts) has no trap/signal-handler
   * equivalent, so a cmd.exe job's cleanup only covers normal completion
   * (success or failure exit), not being killed on timeout. Every other
   * shell this tool runs under (POSIX `/bin/sh` and git-bash on Windows,
   * both real bash/sh) gets the full trap-based guarantee.
   */
  isCmdShell?: boolean;
}

/**
 * Build the single shell script run as one background job: `cd` into the
 * throwaway worktree, run `command`, and always attempt to remove the
 * worktree afterward (`git worktree remove --force`, falling back to
 * `rm -rf` + `git worktree prune` exactly like the previous synchronous
 * cleanup did) — regardless of whether `command` succeeded, failed, or the
 * job was killed for exceeding its timeout.
 */
export function buildRunOnRefScript(opts: RunOnRefScriptOptions): string {
  if (opts.isCmdShell) {
    const tmp = opts.tmpWorktreePath;
    const main = opts.mainRepo;
    return (
      `cd /d "${tmp}" && (${opts.command}) & ` +
      `set RC=%ERRORLEVEL% & ` +
      `cd /d "${main}" & ` +
      `(git worktree remove --force "${tmp}" >nul 2>&1 && echo ${RUN_ON_REF_CLEANED_UP_MARKER}) || ` +
      `(rmdir /s /q "${tmp}" & git worktree prune >nul 2>&1 & echo ${RUN_ON_REF_CLEANED_UP_MARKER}) & ` +
      `exit /b %RC%`
    );
  }

  const tmp = shellSingleQuote(opts.tmpWorktreePath);
  const main = shellSingleQuote(opts.mainRepo);
  return [
    'cleanup() {',
    `  cd ${main} || return`,
    `  if git worktree remove --force ${tmp} >/dev/null 2>&1; then`,
    `    echo '${RUN_ON_REF_CLEANED_UP_MARKER}'`,
    '  else',
    `    rm -rf ${tmp}`,
    '    if git worktree prune >/dev/null 2>&1; then',
    `      echo '${RUN_ON_REF_CLEANED_UP_MARKER}'`,
    '    else',
    `      echo '${RUN_ON_REF_CLEANUP_FAILED_MARKER}'`,
    '    fi',
    '  fi',
    '}',
    'trap cleanup EXIT',
    `cd ${tmp} && ${opts.command}`,
  ].join('\n');
}
