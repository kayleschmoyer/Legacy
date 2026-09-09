---
name: rebase
description: 'Rebase the current branch onto main (or its parent branch) and resolve merge conflicts. Load when: a branch is behind main, a PR reports merge conflicts, /rebase is invoked, or a rebase is stuck mid-flight.'
metadata:
  scope: '**'
---

# Skill: Rebase

The routing target for the `/rebase` slash command. This file binds the rebase workflow to the tools available in each environment; the detailed playbook — conflict decision tree, resolution framework, stabilization steps, troubleshooting table, and recovery procedures — has one home: [worktree-workflow/references/rebase.md](../worktree-workflow/references/rebase.md). Read that reference before resolving any conflict; do not improvise resolution strategy from this file alone.

## Critical preconditions

- **Before rebasing, fetch**: the rebase target is `origin/main` (or the parent branch for stacked worktrees), never a stale local ref. `worktree_rebase` fetches for you; in shell flows run `git fetch origin` first.
- **Before pushing, validation is green**: a rebase can silently break types, schema alignment, and lock-file integrity even with zero reported conflicts. Run post-rebase stabilization (see the [playbook](../worktree-workflow/references/rebase.md#post-rebase-stabilization-critical)) and the environment's validation path before any push.
- **Before pushing after a real rebase, use `--force-with-lease`**: a rebased branch is rewritten history, so a plain `git push` is rejected. `git push --force-with-lease origin HEAD` is the sanctioned form — it fails safely if the remote moved underneath you. `main` is never a force-push target under any circumstances (Tier 1 rule in [AGENTS.md](../../../AGENTS.md)).
- **When conflicts look too complex to resolve confidently** (both sides changed the same business logic, unfamiliar High-risk code, resolution would discard behavior): stop and ask the user with the options you see, per [pitfalls-and-escalation.md](../worktree-workflow/references/rebase/pitfalls-and-escalation.md). A guessed resolution that drops behavior costs more than the question.

## Sequence

1. **Rebase**: `worktree_rebase` (fetches origin and rebases onto the worktree's parent, injecting a no-op Git editor).
2. **If conflicts**: `worktree_conflict_info()` for the structured conflict list, then resolve per the [decision tree](../worktree-workflow/references/rebase.md#decision-tree) — generated files/lockfiles/migrations regenerate rather than hand-merge; source files synthesize both sides.
3. **Continue**: `worktree_rebase_continue()` after each resolved conflict set (suppresses the editor prompt internally).
4. **Stabilize**: `make stabilize-after-rebase` (auto-detects what's needed), then the environment's validation path.
5. **Push**: `worktree_push` / `git push --force-with-lease origin HEAD` — only after validation passes.

## Environment binding

| Environment              | Binding                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local (Windows worktree) | The sequence above verbatim — full worktree MCP server available. Shell fallbacks per step live in the [playbook](../worktree-workflow/references/rebase.md).                                                                                                                                                                                                                                                                                          |
| Copilot Coding Agent     | `worktree_rebase` is outside the Copilot tool allowlist (see [cloud-agent-mode](../cloud-agent-mode/SKILL.md) for the authoritative list) — run the fetch/rebase itself via `worktree_run` with the shell commands below; `worktree_rebase_continue`, `worktree_stabilize`, and `worktree_push` are allowlisted.                                                                                                                                       |
| Claude Code on the web   | No worktree server — plain git via Bash: `git fetch origin main && GIT_EDITOR='node -e "process.exit(0)"' git rebase origin/main`, resolve conflicts by editing files, `git rebase --continue` (with the same no-op `GIT_EDITOR`), validate per the [cloud validation binding](../cloud-agent-mode/references/platform-detection.md#validation-binding-safety-critical--read-before-running-anything), then `git push --force-with-lease origin HEAD`. |

## Cloud gotchas

- **`--force-with-lease` vs the permission classifier** (observed 2026-07-18, LS-6058 session): cloud permission classifiers distinguish a force-push that follows a genuine rebase from an ad-hoc history rewrite (e.g. amending an already-pushed commit and force-pushing to dodge a fixup commit). The first is routine and goes through; the second can be blocked. After a real rebase, push with `--force-with-lease` normally; for any other history rewrite on a pushed branch, prefer a follow-up commit over an amend.
- **Conflict tooling is thinner in cloud**: `worktree_conflict_info` is unavailable, so after resolving check for stray markers yourself: `grep -rn -E '^<<<<<<<|^=======|^>>>>>>>'` (text conflicts only — binary conflicts show in `git status` as unmerged).
- **Post-rebase self-review still applies**: if the rebase required manual conflict resolution, re-read every resolved file against [common-review-patterns.md](../pr-lifecycle/references/common-review-patterns.md) before pushing — conflict resolutions are new code the Reviewer Bot will review.

## Related skills

- [worktree-workflow](../worktree-workflow/SKILL.md) — parent of the rebase playbook; worktree lifecycle rules.
- [cloud-agent-mode](../cloud-agent-mode/SKILL.md) — per-platform tool availability and validation binding.
- [pr-lifecycle](../pr-lifecycle/SKILL.md) — what happens to the PR after the rebased branch is pushed.
- [repo-tooling](../repo-tooling/SKILL.md) — fixing TypeScript/lint fallout surfaced by stabilization.

## Provenance and maintenance

- 2026-07-26 (LS-8484): created. The `/rebase` command routed to `Skill(skill: "rebase")` but no SKILL.md existed on disk — agents looking for repo-specific gotchas found nothing, and cloud-specific rebase lessons (LS-6058) had no durable home. This file intentionally stays thin: the playbook home is `worktree-workflow/references/rebase.md`; only environment binding and cloud gotchas live here.
- Verify playbook home exists: `ls .agents/skills/worktree-workflow/references/rebase.md`
- Verify command alignment: read `.claude/commands/rebase.md` — its numbered sequence must match § Sequence here.
- Verify Copilot allowlist claim: read the `tools` array in `.github/copilot/copilot-cloud-mcp-config.json`.
- Verify index row: `node scripts/generate-skill-index.mjs --check`
