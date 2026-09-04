/**
 * After `git worktree remove --force` throws, decide whether it actually
 * completed the removal (deregistered the worktree, only the trailing
 * rmdir of the now-empty top-level directory failed — e.g. a Windows
 * file-lock from the calling shell's cwd) or whether it's a genuine
 * failure that should still be reported as such.
 */
export interface ForceRemoveFailureInputs {
  /** Whether the target path is still present in `git worktree list`. */
  stillRegistered: boolean;
  /** Whether the target path still exists on disk. */
  pathExists: boolean;
  /** Called only when `!stillRegistered && pathExists`, to check for leftovers. */
  isEmptyDir: () => boolean;
}

export interface ForceRemoveFailureClassification {
  /** True when the worktree was actually removed and this is not a real failure. */
  partial: boolean;
  /** True when a leftover empty directory is the only remnant. */
  leftoverEmptyDir: boolean;
}

export function classifyForceRemoveFailure(
  inputs: ForceRemoveFailureInputs,
): ForceRemoveFailureClassification {
  if (inputs.stillRegistered) {
    return { partial: false, leftoverEmptyDir: false };
  }
  if (!inputs.pathExists) {
    return { partial: true, leftoverEmptyDir: false };
  }
  const empty = inputs.isEmptyDir();
  return { partial: empty, leftoverEmptyDir: empty };
}
