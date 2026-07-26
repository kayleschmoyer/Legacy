// Default (addAll: false) stages only tracked changes so previously-staged
// stray untracked files never sneak into an amended commit; addAll: true
// opts into git add -A semantics, folding untracked files in too.
export function resolveAmendAddArgs(addAll: boolean): string[] {
  return addAll ? ['add', '-A'] : ['add', '-u'];
}
