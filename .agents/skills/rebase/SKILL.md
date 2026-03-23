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

## Post-Rebase Stabilization (CRITICAL)

> Do NOT push until `make pc` passes. This is the #1 cause of post-rebase CI failures.

```bash
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
make pc
```

If `make pc` fails: fix issues, commit (`fix: post-rebase stabilization`), re-run until clean.

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

```powershell
$raw = gh pr list --author "@me" --state open --limit 200 --json number,headRefName,mergeable,mergeStateStatus
$conflicting = ($raw | ConvertFrom-Json) | Where-Object { $_.mergeable -eq "CONFLICTING" }
$conflicting | Select-Object number, headRefName
```

> Always use `--limit 200` -- the default 30 silently misses most open PRs.

## Troubleshooting

| Problem                           | Fix                                                                    |
| --------------------------------- | ---------------------------------------------------------------------- |
| "Cannot rebase: unstaged changes" | `git stash --include-untracked`, rebase, then pop                      |
| "CONFLICT (modify/delete)"        | `git rm <file>` if delete correct, else `git checkout --ours <file>`   |
| Empty commits                     | `git rebase --skip`                                                    |
| Stale rebase-merge directory      | `git rebase --abort`                                                   |
| Lost commits                      | `git reflog` then `git reset --hard <hash>`                            |
| Leftover conflict markers         | Search with `grep -rn '^<<<<<<<\|^=======\|^>>>>>>>'` and fix manually |

## References

- [Conflict Resolution Guide](references/conflict-resolution-guide.md) -- full decision framework, resolution rules, bulk operations, and when to escalate
- [Conflict Resolution Framework](references/conflict-resolution-framework.md) -- 5-step reasoning process with rules for synthesizing both sides
- [Pitfalls and Escalation](references/pitfalls-and-escalation.md) -- common mistakes, decision checklist, when and how to ask the developer
- [Rebase Conflict Strategies](references/rebase-conflict-strategies.md) -- large rebases, generated files, migrations, lockfiles, schema conflicts
- [Interactive Rebase and Recovery](references/rebase-interactive-and-recovery.md) -- squash/fixup/reword, stuck mid-rebase diagnosis
- [Worked Examples](references/worked-examples.md) -- three annotated conflict resolution examples

## Related Skills

- [branch-tree](../branch-tree/SKILL.md) -- view and manage dependent branch trees
- [worktree-workflow](../worktree-workflow/SKILL.md) -- working in isolated worktrees
- [repo-tooling](../repo-tooling/SKILL.md) -- fix TypeScript and lint errors after rebase
- [codegen](../codegen/SKILL.md) -- regenerate GraphQL types
- [standards](../standards/SKILL.md) -- coding standards including codegen policy
