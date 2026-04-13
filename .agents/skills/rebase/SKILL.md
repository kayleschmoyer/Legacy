---
name: rebase
description: 'Rebase branches onto main (or another base) and resolve merge conflicts. Covers simple rebases, bulk PR rebases, stacked branch trees, conflict resolution strategies, post-rebase stabilization, and recovery. Load when rebasing, resolving conflicts, or updating a branch.'
---

# Skill: Rebase

## When to Use

- Rebase a branch onto main or another base branch
- Resolve merge conflicts during rebase
- Update a stale branch ("my branch is behind main")
- Cascade rebases through stacked/dependent branches
- Recover from a stuck or failed rebase

## Risk Level

Rebasing is inherently a **Medium-risk** operation — it modifies git history and can introduce conflicts in areas you didn't originally change. For branches with High-risk changes (auth, payments, infrastructure), take extra care during conflict resolution. If the rebase introduces conflicts in unfamiliar code areas, re-run the [planning skill](../planning/SKILL.md) on the conflicting files before resolving.

## Quick Start: Simple Rebase

**Preferred (MCP):** `worktree_rebase` -- fetches, rebases, sets `GIT_EDITOR=true` automatically.

**Shell fallback:**

```bash
git fetch origin
GIT_EDITOR=true git rebase origin/main
# Resolve any conflicts (see Decision Tree below)
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
make pc                          # MUST pass before pushing
git push --force-with-lease origin HEAD
```

> Always set `GIT_EDITOR=true` and `GIT_SEQUENCE_EDITOR=true` in automated/agent workflows to prevent Git from blocking on editor prompts.

## Decision Tree

| Situation                                   | Action                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| No conflicts after rebase                   | Go straight to post-rebase stabilization                                                                 |
| Generated files (`*.generated.ts`) conflict | Regenerate -- never manually merge. `.\scripts\resolve-generated-conflicts.ps1`                          |
| Lock file (`pnpm-lock.yaml`) conflicts      | Accept either side, then `pnpm install --no-frozen-lockfile` after rebase                                |
| Migration files conflict (duplicate)        | `git rebase --skip`                                                                                      |
| Source/config files conflict                | Read both sides, synthesize. See [conflict-resolution-guide.md](references/conflict-resolution-guide.md) |
| Many files conflict across many commits     | See [rebase-conflict-strategies.md](references/rebase-conflict-strategies.md)                            |
| Stacked/dependent branches need rebasing    | `make rebase-tree` or `make rebase-tree-auto`                                                            |
| Stuck mid-rebase or need recovery           | See [rebase-interactive-and-recovery.md](references/rebase-interactive-and-recovery.md)                  |

## Check for Conflicts After Rebase

After `worktree_rebase` (or any `git rebase`), call `worktree_conflict_info()` to get a structured list of files still in an **unresolved conflict state** (files with unmerged index entries) along with their conflict marker line ranges and content previews.

```
worktree_conflict_info()
```

If `worktree_conflict_info` returns no conflicts, all merge conflicts are resolved — proceed to stabilization. If conflicts remain, resolve them using `worktree_resolve_conflict` or by editing files directly, then continue the rebase.

> **Note**: `worktree_conflict_info` only reports files that are still unmerged in the Git index. It does **not** scan for leftover conflict markers (`<<<<<<<`/`=======`/`>>>>>>>`) accidentally left in already-resolved files. If you need to verify no stray markers remain after resolving, use the shell fallback: `grep -rn -E '^<<<<<<<|^=======|^>>>>>>>'`.

## Post-Rebase Stabilization (CRITICAL)

> Do NOT push until `make pc` passes. This is the #1 cause of post-rebase CI failures.
>
> **Why**: rebasing can silently break type compatibility, schema alignment, and lock file integrity even when no conflicts are reported. The stabilization step catches these invisible breakages before they become CI failures that cost 40-60 minutes each.

```bash
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
make pc
```

If `make pc` fails: fix issues, commit (`fix: post-rebase stabilization`), re-run until clean.

**Self-review after conflict resolution**: if the rebase required manual conflict resolution, re-read every file you resolved in full and check against `skills/pr-lifecycle/references/common-review-patterns.md` before pushing. Conflict resolution code is new code that Copilot will review — catching issues here prevents a review round-trip.

## Worktree Rebase

**MCP:** `worktree_rebase` (preferred). **Shell:**

```bash
git -C $wt fetch origin
GIT_EDITOR=true git -C $wt rebase origin/main
make -C $wt install
make -C $wt pc
git -C $wt push --force-with-lease origin HEAD
```

## Bulk Rebase (All Conflicting PRs)

**MCP (preferred):**

```
# List all open PRs with merge status — filter to CONFLICTING ones
github_list_prs(state: "open", limit: 200)
# Then filter results where mergeable == "CONFLICTING"
```

**Shell fallback:**

```powershell
$raw = gh pr list --author "@me" --state open --limit 200 --json number,headRefName,mergeable,mergeStateStatus
$conflicting = ($raw | ConvertFrom-Json) | Where-Object { $_.mergeable -eq "CONFLICTING" }
$conflicting | Select-Object number, headRefName
```

> Always fetch all PRs — the default limit silently misses most open PRs in large repos.

## Troubleshooting

| Problem                            | Fix                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cannot rebase: unstaged changes"  | `git stash --include-untracked`, rebase, then pop                                                                                                                                                                                                    |
| "CONFLICT (modify/delete)"         | `git rm <file>` if delete correct, else `git checkout --ours <file>`                                                                                                                                                                                 |
| Empty commits                      | `git rebase --skip`                                                                                                                                                                                                                                  |
| Stale rebase-merge directory       | `git rebase --abort`                                                                                                                                                                                                                                 |
| Lost commits                       | `git reflog` then `git reset --hard <hash>`                                                                                                                                                                                                          |
| Unresolved conflicts mid-rebase    | `worktree_conflict_info()` (MCP-first) — lists all unresolved entries including binary conflicts (which have no textual markers). Shell fallback (text conflicts only): `grep -rn -E '^<<<<<<<\|^=======\|^>>>>>>>'` — note: misses binary conflicts |
| Leftover markers in resolved files | `grep -rn -E '^<<<<<<<\|^=======\|^>>>>>>>'` — `worktree_conflict_info` only sees index-unmerged files, not stray markers accidentally left in resolved files                                                                                        |

## References

- [Conflict Resolution Guide](references/conflict-resolution-guide.md) -- full decision framework, resolution rules, bulk operations, and when to escalate
- [Conflict Resolution Framework](references/conflict-resolution-framework.md) -- 5-step reasoning process with rules for synthesizing both sides
- [Pitfalls and Escalation](references/pitfalls-and-escalation.md) -- common mistakes, decision checklist, when and how to ask the developer
- [Rebase Conflict Strategies](references/rebase-conflict-strategies.md) -- large rebases, generated files, migrations, lockfiles, schema conflicts
- [Interactive Rebase and Recovery](references/rebase-interactive-and-recovery.md) -- squash/fixup/reword, stuck mid-rebase diagnosis
- [Worked Examples](references/worked-examples.md) -- three annotated conflict resolution examples

## Related Skills

- [planning](../planning/SKILL.md) -- re-plan when rebase introduces conflicts in unfamiliar code
- [branch-tree](../branch-tree/SKILL.md) -- view and manage dependent branch trees
- [worktree-workflow](../worktree-workflow/SKILL.md) -- working in isolated worktrees
- [repo-tooling](../repo-tooling/SKILL.md) -- fix TypeScript and lint errors after rebase
- [codegen](../codegen/SKILL.md) -- regenerate GraphQL types
- [standards](../standards/SKILL.md) -- coding standards including codegen policy
