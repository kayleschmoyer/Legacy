# Reference: Ticket-to-Merge Spine (environment-neutral)

This is the **canonical ordering** for taking a ticket to merge. It is environment-neutral: both [workflow-overview](../SKILL.md) (local) and [cloud-agent-mode](../../cloud-agent-mode/SKILL.md) (cloud) implement this exact sequence. Each step names a **gate** (what must be true) and an **action** (what to do). The concrete **tool binding** — which MCP tool or shell command performs each action in your environment — lives in your environment's skill, not here. Read this file for the order and the gates; read your env skill for the tools.

> **Why this file exists.** The ordering used to be restated in full in both the local and cloud skills, and the two copies drifted — the cloud copy dropped the task-graph enforcement (below), so cloud agents ran validation before opening a draft PR. There is now **one** source of truth for the order. Do not re-state the sequence in an environment skill; link here instead.

## Read first: the enforcement that survives compaction

**Prose ordering does not survive context compaction; a task graph does.** A future agent (or this agent after a `/compact`) holds a _gist_ of the workflow, not the literal numbered steps — and the gist of "validate, then open a PR" is a strong prior that overrides a buried "open the draft PR first" instruction. The defense is mechanical, not prose:

**Before writing any code, create the workflow tracking tasks with `TaskCreate` and chain them with `TaskUpdate(addBlockedBy: [...])`** so the ordering is enforced by the task graph rather than remembered:

1. **Implement + commit**
2. **Push + open draft PR + apply `agent-in-progress` + post continuation checkpoint** — `blockedBy` (1)
3. **Migrations + validation (`make pc`)** — `blockedBy` (2)
4. **Self-review green + mark ready + watch to merge** — `blockedBy` (3)

Task (3) being `blockedBy` task (2) is the load-bearing edge: the durable checkpoint (pushed branch + draft PR) exists **before** the long validation, so a container kill mid-`make pc` is recoverable. Never start a blocked task, and never delete a dependency to "unblock" yourself — that defeats the only mechanism that survives compaction. This enforcement is **mandatory in every environment**, local and cloud alike.

## Critical gates (preconditions)

These four preconditions hold regardless of environment. Each is phrased as "before X, Y must be true."

| Gate                              | Precondition                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Draft PR before validation**    | Open the PR as a **draft** right after the first push, _before_ running `make pc`. A draft PR is inert (CI and review are gated on `draft == false`), so it triggers nothing — but the branch + PR + continuation checkpoint now survive a container kill during the longest step. This reorders the classic "`make pc` must pass before you open a PR" rule: the **draft** opens early as a durable substrate; the gate that still holds is the next one. |
| **`make pc` before mark-ready**   | A PR may be **opened as draft** with validation never run, but it must **not be marked ready** until `make pc` is green. Marking ready — not creating the PR — is the validated gate.                                                                                                                                                                                                                                                                      |
| **Migrations before `make pc`**   | Run migration status + apply before validating, even if you think no migrations were added. `make pc` assumes the local DB schema is current.                                                                                                                                                                                                                                                                                                              |
| **Self-review before first push** | Do not push without completing the self-review gate (mechanical pattern lint + the judgment-requiring review of every changed file). `make pc` passing is necessary but not sufficient. See [common-review-patterns.md](../../pr-lifecycle/references/common-review-patterns.md) and [self-review.md](../../pr-lifecycle/references/self-review.md).                                                                                                       |

## The sequence

Numbers are the canonical step order. "Tool binding" always means: look up the concrete call in your environment skill's binding section.

0. **Epic check** — if the ticket is an Epic, do not implement it directly; defer to the `work-ticket` skill's Parent Dispatch Mode (enumerate To Do descendants, check blockers, batch-dispatch chips).
1. **Identify/create the ticket** — complex/ambiguous work runs `/define` first; well-understood work creates directly with `sprint: "current"`. Capture planning output in the `context`/`risk`/`planningNotes` fields.
   - **1b. Plan** — assess scope, read relevant code, identify constraints, classify risk ([planning skill](../../planning/SKILL.md)). Skip for trivial tasks.
   - **1c. Create the tracking-task graph** — the mandatory enforcement described in [Read first](#read-first-the-enforcement-that-survives-compaction) above. This happens _before_ code.
2. **Dependency/blocker check** — inspect "blocked-by" links. Blocker not In Review/Done → **STOP**. Blocker In Review → branch off its branch. Blocker Done or none → branch off `origin/main`. Always fetch before branching.
3. **Transition Jira to In Progress** — only after the blocker check passes. Move the ticket to the current sprint if it isn't already.
4. **Claim the ticket** — atomically validates blockers/status and transitions to In Progress. Resolve the assignee from the environment first. Read the returned `branchRecommendation` for the git base; handle `STOP` / `ALREADY_CLAIMED` per the tool's contract.
5. **Working tree ready** — be on the correct branch/worktree, dependencies available. (Local: ephemeral or sibling worktree + node_modules symlink. Cloud: branch off latest main in the repo root.)
6. **Implement** — write the change. Prefer the env's structured run tool over raw shell. Test any new/modified spec files locally before committing; scope pre-`make pc` test runs to the specs you touched (don't run full platform suites — `make pc` re-runs them).
7. **Commit** — include the ticket key (`type(scope): LS-#### msg`) for Jira linking. Do not pre-run the formatter; `make pc` handles formatter rewrites and auto-commits them.
8. **First push** — establish the durable remote branch (set upstream).
9. **Open the draft PR (durable checkpoint)** — title `LS-#### type(scope): msg`, `draft: true`. Apply `agent-in-progress` while still draft (closes the sweep race window). Post a continuation checkpoint recording what's left (migrations, `make pc`, self-review, mark ready, merge). **This is the [draft-PR-before-validation gate](#critical-gates-preconditions).** A resuming container reads the checkpoint and continues instead of restarting.
10. **Rebase onto parent** (if needed) and **post-rebase stabilize** before validating.
11. **Migrations** — status + apply ([migrations-before-`make pc`gate](#critical-gates-preconditions)).
12. **Validate** — run `make pc` to green ([`make pc`-before-mark-ready gate](#critical-gates-preconditions)). Overlap the self-review reading with the run rather than idle-waiting. In timeout-prone sessions, the identical pipeline is runnable as the seven checkpointed `pc-*` chunks **in order**; update the checkpoint after each.
13. **Self-review** — the mandatory gate before considering the PR shippable: mechanical pattern lint, then read every changed file in full and check the judgment patterns; fix everything; produce a Self-Review Summary. Re-run `make pc` if you changed code. Run any mandated integration spec locally.
14. **Mark ready** — once `make pc` is green and self-review is done, refresh the checkpoint and mark the draft PR ready (this applies the bot trigger label). **Draft is a working state, not an ending state — never end a turn with the PR still in draft.** Transition Jira to In Review.
15. **Watch to merge** — PR events (CI, review threads, conflicts, merge) surface natively; handle each as it arrives, reply to review threads, drive until merged. Do not poll with sleep loops, and do not start unrelated work while the PR is open.
16. **After merge** — run the MCP gap audit (skip only below the minimum threshold), complete every tracking task, and clean up.

## Tool binding by environment

For the concrete call behind each action above, see your environment's binding section:

| Action                        | Local (workflow-overview)                                                 | Cloud (cloud-agent-mode)                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Worktree / branch setup       | Native-checkbox or sibling worktree + `node_modules` symlink              | Branch off `origin/main` in the repo root (no worktrees)                                                 |
| Commit / push / status / diff | `worktree_commit` / `worktree_push` / `worktree_status` / `worktree_diff` | Same MCP tools on Copilot; `git` via Bash on default CC web                                              |
| Open PR / labels / mark ready | `github_create_pr` / `github_manage_labels` / `github_mark_pr_ready`      | Same on Copilot; built-in `mcp__github__*` on CC web (then `github_manage_labels` for the trigger label) |
| Validate                      | `make_run({ target: "pc" })`                                              | `make_run({ target: "pc", runInBackground: true })` on Copilot; `make pc` via Bash on CC web             |
| Jira                          | `jira_*` MCP tools                                                        | `jira_*` MCP tools on Copilot; Atlassian plugin on CC web                                                |

## Related

- [workflow-overview/SKILL.md](../SKILL.md) — local implementation: worktree flows, Windows specifics, local validation hooks.
- [cloud-agent-mode/SKILL.md](../../cloud-agent-mode/SKILL.md) — cloud implementation: platform matrix, degraded mode, auth, quirks.
- [ci-and-merge-pipeline.md](./ci-and-merge-pipeline.md) — what happens after the PR is marked ready (CI orchestrator, Copilot review, Jira sync, merge queue).
- [skill-authoring/SKILL.md](../../skill-authoring/SKILL.md) — why preconditions + TaskCreate beat prohibitions (the principle this file applies).
