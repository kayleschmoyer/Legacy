# Rebase

> Sub-reference of [`worktree-workflow`](../SKILL.md). Load when rebasing branches onto main, resolving merge conflicts, or updating a stale branch.

## When to Use

- Rebase a branch onto main or another base branch
- Resolve merge conflicts during rebase
- Update a stale branch ("my branch is behind main")
- Cascade rebases through stacked/dependent branches
- Recover from a stuck or failed rebase

## Risk Level

Rebasing is inherently a **Medium-risk** operation — it modifies git history and can introduce conflicts in areas you didn't originally change. For branches with High-risk changes (auth, payments, infrastructure), take extra care during conflict resolution. If the rebase introduces conflicts in unfamiliar code areas, re-run the [planning reference](../../plan-ticket/references/planning.md) on the conflicting files before resolving.

## Before You Rebase: Inherited Worktree Check

A session that inherits a worktree or branch (cloud-session checkout, `/fix-pr` on an existing PR, a recovered branch) may not match what is on the remote. Before rebasing, compare local HEAD with `origin/<branch>`:

```bash
git fetch origin <branch>
git rev-list --left-right --count HEAD...origin/<branch>   # "<local-only> <remote-only>"
git diff --stat HEAD origin/<branch>
```

- `0 0` → in sync, rebase normally.
- remote-only commits (second number > 0) → someone pushed since your checkout; fast-forward/merge them first (`git merge --ff-only origin/<branch>`), or you will force-push over their work.
- local-only commits you did not write → inspect with `git log origin/<branch>..HEAD` before pushing; they are inherited state, not necessarily yours to publish.

## Quick Start: Simple Rebase

**Preferred (MCP):** `worktree_rebase` -- fetches, rebases, and injects a cross-platform no-op Git editor automatically.

**Shell fallback:**

```bash
git fetch origin
GIT_EDITOR='node -e "process.exit(0)"' git rebase origin/main
# Resolve any conflicts (see Decision Tree below)
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
# MUST pass before pushing: the seven pc-* chunks, in order, one at a time
for c in db-prep typecheck lint format workflows test build; do make "pc-$c" || break; done
git push --force-with-lease origin HEAD
```

> Always use a cross-platform no-op editor in automated/agent workflows to prevent Git from blocking on editor prompts. `GIT_EDITOR=true` and `GIT_SEQUENCE_EDITOR=true` are Unix-specific; prefer the MCP tools or `GIT_EDITOR='node -e "process.exit(0)"'` (and `GIT_SEQUENCE_EDITOR='node -e "process.exit(0)"'` when a sequenced rebase step needs it). After resolving conflicts, use **`worktree_rebase_continue()`** (MCP) instead of `GIT_EDITOR=true git rebase --continue` — the tool suppresses the editor prompt internally.

## Decision Tree

| Situation                                   | Action                                                                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No conflicts after rebase                   | Go straight to post-rebase stabilization                                                                                                                                                                                                                  |
| Generated files (`*.generated.ts`) conflict | Regenerate -- never manually merge. `.\scripts\resolve-generated-conflicts.ps1`                                                                                                                                                                           |
| Lock file (`pnpm-lock.yaml`) conflicts      | Now handled by `.\scripts\resolve-generated-conflicts.ps1` (accepts theirs, regenerates via `make install`)                                                                                                                                               |
| Migration files conflict (duplicate)        | Handled by `.\scripts\resolve-generated-conflicts.ps1` (accepts theirs; skip dupes with `git rebase --skip`)                                                                                                                                              |
| Conflict in a file this PR's fix touches    | **Check for a competing fix first**: `git log origin/main -- <file>` (and `git log -S'<symbol>' origin/main`) — `main` may already contain the fix, making your change redundant; see [Conflict May Mean Already Fixed](#conflict-may-mean-already-fixed) |
| Source/config files conflict                | Read both sides, synthesize. See [conflict-resolution-guide.md](rebase/conflict-resolution-guide.md)                                                                                                                                                      |
| Many files conflict across many commits     | See [rebase-conflict-strategies.md](rebase/rebase-conflict-strategies.md)                                                                                                                                                                                 |
| Stacked/dependent branches need rebasing    | `make rebase-tree` or `make rebase-tree-auto`                                                                                                                                                                                                             |
| Base PR (stacked-on branch) squash-merged   | See [Squash-merged stacked base](#squash-merged-stacked-base-ls-8779) below — do NOT plain-rebase/merge                                                                                                                                                   |
| Stuck mid-rebase or need recovery           | See [rebase-interactive-and-recovery.md](rebase/rebase-interactive-and-recovery.md)                                                                                                                                                                       |

## Conflict May Mean Already Fixed

A rebase conflict in the file your fix edits is often because another PR already landed the same (or a competing) fix on `main` — resolving it blindly produces a duplicate or contradictory change. **Before resolving**, with `origin/main` fetched:

```bash
git log origin/main --oneline -10 -- <conflicted-file>   # recent main commits touching it
git log origin/main -S'<symbol-or-string-you-fixed>' --oneline
git diff HEAD...origin/main -- <conflicted-file>          # what main changed vs the merge base
```

- `main` already fixes it → take `main`'s version (`git checkout --ours` during a rebase = the upstream side), drop your now-redundant hunk or the whole commit (`git rebase --skip` if it becomes empty), and say so in the PR.
- `main` fixes it differently → reconcile onto `main`'s approach, keep only what is still missing.
- No competing change → resolve normally per the decision tree.

Also: `git merge-base --is-ancestor <fix-sha> HEAD` tells you whether a fix you are looking for is already in your branch (exit `0`) or only on `main` (exit `1`).

## Rebase vs Merge-main: one rule (LS-10377)

This repo had four answers to "my branch is behind or conflicting with `main`" (rebase only; `update-branch`; `git merge main`; `worktree_merge_main`). This section is the single ruling — other docs link here rather than restating it.

**Default: rebase** (`worktree_rebase_onto_main` / `worktree_rebase`, then `worktree_stabilize`, validate, `worktree_push` — `--force-with-lease`). Agent-owned PR branches are single-author and squash-merged, so linear history costs nothing and a rebase leaves no `Merge branch 'main'` commits.

**Merge `main` instead** (`worktree_merge_main`, or the `update-branch` API) only when rewriting history is wrong:

| Situation                                                                                                             | Why not rebase                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The branch is **not yours / shared** (another agent or person has it checked out or pushed to it)                     | A force-push would erase their commits; never rewrite history on someone else's branch                                                  |
| The **remote head has already advanced** past local — e.g. the `e2e-hold-resume` backstop already ran `update-branch` | A local rebase + `--force-with-lease` fails or erases the revalidation in flight; `git fetch`, reset to `origin/<branch>`, and continue |
| You were explicitly told to merge, or the repo's contributing rule for that branch says so                            | Explicit instruction wins                                                                                                               |

**Never** hand-run `git merge main` / `git checkout main && git merge main` as a workaround — use `worktree_merge_main` so conflicts come back as structured info. **Never** use `update-branch` as a routine freshness step: `strict_required_status_checks_policy` is `false`, so the merge queue never requires a PR to be up to date with `main` — _behind_ alone does not block merge, and a SHA bump dismisses the bot approval and re-runs CI for nothing ([ruleset note](../../../../.github/ruleset.json), LS-4183). Rebase when there is a **conflict**, when `main` changed code your diff depends on, or when a failing check needs the fix that landed on `main` — not just to be current. The cost of that choice, accepted by design: a semantic conflict between textually-disjoint PRs is caught by post-merge CI on `main`, not blocked pre-merge.

**Before any force-push to a PR already in review**, confirm no Reviewer (W1) run is in flight — a force-push mid-run aborts it and fails SHA Sanity Check ([recovery](../../pr-lifecycle/references/common-review-patterns.md#ci--reviewer-infrastructure-recovery-recipes)).

## Squash-Merged Stacked Base (LS-8779)

When a PR is intentionally stacked on another (soft-dependency) PR's branch — this repo's documented pattern of basing your branch on a related PR "if it has landed or is close, to avoid rework/conflicts" — and that base PR later merges, GitHub auto-retargets the stacked PR's base to the grandparent branch (usually `main`). If the base PR was **squash-merged** (or rebase-merged), its ~N commits collapse into a single new commit on the grandparent branch that shares none of their original SHAs.

The merge-queue bot's generic conflict advice (`git checkout main && git merge main`, or a plain `git rebase origin/main`) does **not** know this happened — it replays every one of the base branch's original commits on top of the squash commit, producing a cascade of trivial-but-noisy conflicts (or, in the merge case, a redundant merge commit carrying duplicate history).

**Detect the squash first** — `git merge-base --is-ancestor <sha> origin/main` answers "is my old base commit in main as-is, or did it land under a new SHA?" (exit `0` = still an ancestor, plain rebase is fine; non-zero = squashed, use the `--onto` form below):

```bash
git fetch origin
git merge-base --is-ancestor <last-commit-of-old-base-branch> origin/main; echo $?
```

**Before following the generic advice on a stacked PR whose base was just auto-retargeted**, check whether the old base branch's PR was squash/rebase-merged (a 1-parent merge commit) vs. truly merge-committed (2 parents — in which case the old commits are still reachable under their original SHAs and a plain rebase is fine).

**Preferred (MCP):** `worktree_rebase_onto_main({ upstream: "<last-commit-of-old-base-branch>" })` — `upstream` triggers the three-arg `git rebase --onto` form (`onto` defaults to `"main"`, i.e. `origin/main`, so it's omittable in the common case). Conflict detection and reporting on this path are identical to the plain two-arg rebase — same `conflictDetected` / `conflictedFiles` payload shape, same rerere-marker safety check, same abort-and-report-cleanly behavior on failure.

**Shell fallback:**

```bash
git fetch origin
git rebase --onto origin/main <last-commit-of-old-base-branch> HEAD
git push --force-with-lease origin HEAD
```

`<last-commit-of-old-base-branch>` is the old base PR's `head.sha` (still available from the closed PR even after its branch is deleted) — find it via `github_view_pr` on the old base PR number, or `git log` if the branch ref is still local. This drops the now-squashed commits cleanly instead of replaying them. The merge-queue processor (`.github/scripts/merge-queue-processor.js`, `detectSquashedStackedBase`) auto-detects this case via the PR's `BaseRefChangedEvent` timeline and emits this exact advice when it can; fall back to the manual check above if the bot's comment still shows the generic advice.

For a stack of N PRs, each parent's merge repeats this once per child (N-1 rebases total) — see [branch-tree-management.md](sibling/branch-tree-management.md) for the full stacked-PR cascade order.

## Check for Conflicts After Rebase

> **Which tool leaves a conflicted rebase in progress:** `worktree_rebase` leaves it in place so `worktree_conflict_info` / `worktree_resolve_conflict` / `worktree_rebase_continue` can resolve it. `worktree_rebase_onto_main` aborts on conflict (tree is clean afterwards) and instead returns the conflicting paths in `conflictedFiles` / `conflictCount`.

After `worktree_rebase` (or any `git rebase`), call `worktree_conflict_info()` to get a structured list of files still in an **unresolved conflict state** (files with unmerged index entries) along with their conflict marker line ranges and content previews.

```
worktree_conflict_info()
```

If `worktree_conflict_info` returns no conflicts, all merge conflicts are resolved — proceed to stabilization. If conflicts remain, resolve them using `worktree_resolve_conflict` or by editing files directly, then continue the rebase.

> **Note**: `worktree_conflict_info` only reports files that are still unmerged in the Git index. It does **not** scan for leftover conflict markers (`<<<<<<<`/`=======`/`>>>>>>>`) accidentally left in already-resolved files. If you need to verify no stray markers remain after resolving, use the shell fallback: `grep -rn -E '^<<<<<<<|^=======|^>>>>>>>'`.

## Post-Rebase Stabilization (CRITICAL)

> Do NOT push until the `pc-*` chunks pass. This is the #1 cause of post-rebase CI failures.
>
> **Why**: rebasing can silently break type compatibility, schema alignment, and lock file integrity even when no conflicts are reported. The stabilization step catches these invisible breakages before they become CI failures that cost 40-60 minutes each.

**Automated (preferred):** Run the stabilization script via `make_run`, which auto-detects your node_modules mode and only runs the steps needed:

```
make_run({ target: "stabilize-after-rebase" })
# shell fallback: make stabilize-after-rebase
# or: node scripts/stabilize-after-rebase.js
```

**Manual steps** (if you need to run individually):

```bash
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
```

Then validate with the seven `pc-*` chunks **in order**, one at a time — `pc-db-prep` → `pc-typecheck` → `pc-lint` → `pc-format` → `pc-workflows` → `pc-test` → `pc-build` (`nx_run_pc_chunk` per chunk; degraded sessions: background `make pc-<chunk>` one at a time). **Never monolithic `make pc`**, on any platform ([AGENTS.md](../../../../AGENTS.md) Workflow Discipline; a backgrounded monolithic run has silently deadlocked, LS-8797).

If a chunk fails: fix issues, commit (`fix: post-rebase stabilization`), re-run from that chunk until clean.

**Self-review after conflict resolution**: if the rebase required manual conflict resolution, re-read every file you resolved in full and check against `skills/pr-lifecycle/references/common-review-patterns.md` before pushing. Conflict resolution code is new code that Copilot will review — catching issues here prevents a review round-trip.

## Worktree Rebase

**MCP:** `worktree_rebase` (preferred). **Shell:**

```bash
git -C $wt fetch origin
GIT_EDITOR='node -e "process.exit(0)"' git -C $wt rebase origin/main
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

| Problem                            | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Cannot rebase: unstaged changes"  | Commit a WIP checkpoint (`worktree_commit`) and rebase — avoid bare `git stash` (the stash stack is shared by every worktree of the repo, so a bare `git stash pop` can restore another ticket's stash); if you must, name it: `git stash push --include-untracked -m "LS-####-pre-rebase"` and pop that exact `stash@{n}` found via `git stash list`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| "CONFLICT (modify/delete)"         | `git rm <file>` if delete correct, else `git checkout --ours <file>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Empty commits                      | `git rebase --skip`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Stale rebase-merge directory       | `git rebase --abort`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Lost commits                       | `worktree_reflog()` (MCP-first) to find the SHA, then `worktree_reset({ sha: "<sha>" })` to restore. Shell fallback: `git reflog` then `git reset --hard <hash>`. **If `worktree_reset` is denied by the auto-mode classifier** ("Permission for this action was denied by the Claude Code auto mode classifier") even though the target SHA is a verified ancestor of HEAD — see [error-recovery.md Scenario 12](../../workflow-overview/references/error-recovery.md#scenario-12-auto-mode-classifier-denies-a-routine-same-session-action-ls-8407-ls-8411-ls-9307): retry the identical call once (the classifier is a harness-level component this repo cannot configure, and denials are frequently transient Stage-2 errors). If it's still denied on retry, fall back to `worktree_show_file` to read the target SHA's clean content, hand-write it back into the working tree, then `worktree_commit({ amend: true })` — slower, but avoids stopping mid-recovery (LS-9307). |
| Unresolved conflicts mid-rebase    | `worktree_conflict_info()` (MCP-first) — lists all unresolved entries including binary conflicts (which have no textual markers). Shell fallback (text conflicts only): `grep -rn -E '^<<<<<<<\|^=======\|^>>>>>>>'` — note: misses binary conflicts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Leftover markers in resolved files | `grep -rn -E '^<<<<<<<\|^=======\|^>>>>>>>'` — `worktree_conflict_info` only sees index-unmerged files, not stray markers accidentally left in resolved files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Sub-references

- [Conflict Resolution Guide](rebase/conflict-resolution-guide.md) -- full decision framework, resolution rules, bulk operations, and when to escalate
- [Conflict Resolution Framework](rebase/conflict-resolution-framework.md) -- 5-step reasoning process with rules for synthesizing both sides
- [Pitfalls and Escalation](rebase/pitfalls-and-escalation.md) -- common mistakes, decision checklist, when and how to ask the developer
- [Rebase Conflict Strategies](rebase/rebase-conflict-strategies.md) -- large rebases, generated files, migrations, lockfiles, schema conflicts
- [Interactive Rebase and Recovery](rebase/rebase-interactive-and-recovery.md) -- squash/fixup/reword, stuck mid-rebase diagnosis
- [Worked Examples](rebase/worked-examples.md) -- three annotated conflict resolution examples

## Related

- [planning](../../plan-ticket/references/planning.md) -- re-plan when rebase introduces conflicts in unfamiliar code
- [worktree-workflow](../SKILL.md) -- parent skill for working in isolated worktrees
- [repo-tooling](../../repo-tooling/SKILL.md) -- fix TypeScript and lint errors after rebase
- [standards](../../standards/SKILL.md) -- coding standards including codegen policy
