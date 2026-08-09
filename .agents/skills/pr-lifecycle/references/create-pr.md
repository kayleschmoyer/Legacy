---
name: create-pr
description: 'Create a pull request with Jira linkage and standard template. Load when the user says "create PR", "open PR", or after code changes are ready to ship.'
---

# Skill: Create PR

You are a **PR creation operator**. Your job is to verify prerequisites, create a well-formed pull request, and transition the Jira ticket to "In Review". Follow the procedure exactly — do not improvise.

## Prerequisites

> **⛔ Draft-PR-first ordering (timeout resilience) — do NOT run `make pc` before the draft PR exists.** Open the draft PR **early**, right after the branch is pushed and **before** the long `make pc` validation. A draft PR is inert (CI and the Reviewer Bot are gated on `draft == false`, so opening it triggers nothing), but it gives an ephemeral/cloud container a durable substrate: a reap during `make pc` is then non-fatal, and a fresh container resumes from the continuation checkpoint instead of losing all work. The validated gate is **mark-ready, not open-draft** — `make pc` must pass before `github_mark_pr_ready`, but it does **not** need to pass before the draft PR is created. Running the full validation first is the dominant cloud-agent timeout failure mode. See the spine's [draft-PR-before-validation gate](../../workflow-overview/references/ticket-to-merge-spine.md#critical-gates-preconditions) and [cloud-agent-mode → Container timeout resilience](../../cloud-agent-mode/SKILL.md#container-timeout-resilience).

### Gate A — before opening the draft PR (verify in order, stop on first failure)

1. **Not on main** — confirm the branch name / commits / PR title carry a Jira ticket key (e.g. `LS-1234`)
2. **Branch pushed** — `worktree_push(setUpstream: true)` or `git push --force-with-lease origin HEAD`

Then create the draft PR (see [Command](#command) below) and apply `agent-in-progress` **before** running validation.

### Gate B — before marking the PR ready (the validated gate)

3. **Migrations applied** — `pnpm --prefix lib/db-client run db:status` shows no pending migrations; if pending, run `pnpm --prefix lib/db-client run db:up`
4. **Validation passes** — validation exits cleanly; if `format:write` changes files, commit them and re-run. Locally, `make pc` (or `make_run({ target: "pc" })`) is fine. In **cloud** sessions, never run monolithic `make pc` — run the seven `pc-*` chunks **in order** via the environment's binding (`nx_run_pc_chunk` when present — mandatory; degraded CC web: background Bash chunks), checkpointing after each (LS-7906). Binding home: the [spine's binding table](../../workflow-overview/references/ticket-to-merge-spine.md#tool-binding-by-environment) and [`cloud-agent-mode/SKILL.md`](../../cloud-agent-mode/SKILL.md).
5. **Bug-fix verification** — if the branch contains `fix(` or the Jira ticket type is Bug, the PR body **must** include a `## Verification` section with before/after evidence. Stop and collect evidence before marking ready if missing. See [bug-verification-templates.md](bug-verification-templates.md) for the required format per bug category.

## Command

> **⚠️ MCP tool string parameters are not shell-evaluated.** Unlike the Bash tool's `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc convention, an MCP tool call is a plain JSON call — there is no shell to expand `$(...)` or backticks. Passing `body: "$(cat /tmp/pr-body.md)"` to `github_create_pr`/`create_pull_request` (or `commentBody` to a Jira comment tool) lands as the literal string `$(cat /tmp/pr-body.md)`, not the file's contents (LS-8591, caught while opening the draft PR for LS-6031). If you assembled the body in a scratch file via `Write`/`Edit`, `Read` it back and inline the actual text into the `body` param instead. This is cheap to catch: after creating a PR from a scratch-file body, re-read it once (`pull_request_read`/`jira_view`) to confirm the content landed correctly before moving on.

Tool selection is homed in the [PR-creation tool routing table](../SKILL.md#pr-creation-tool-routing-one-home--link-here-do-not-restate) — the flow below shows the local `github_create_pr` (local-git stdio) path. **Always create as draft** to prevent sweep/review agents from racing with the creating agent:

```
github_create_pr(
  title: "LS-#### type(scope): Brief description",
  body: <PR body markdown>,
  draft: true,
  head: <branch-name>,   # from worktree_status().headRefName
  jiraPrimary: "LS-####" # session's ticket — drives the jira-link marker; omit to derive from title
)
```

### PR Title Format

```
LS-#### type(scope): Brief description
```

Example: `LS-1234 feat(auth): add OAuth2 PKCE flow`

### Jira-Link Marker (source of truth for ticket linkage)

Every new PR body **must** carry the structured `jira-link` marker (RFC: `docs/rfcs/draft-declared-ticket-linkage.md`, LS-7893). The HTML comment is the machine parse target consumed by jira-branch-sync and the audit; the visible `**Jira:**` line is for humans:

```markdown
<!-- jira-link
primary: LS-####
-->

**Jira:** [LS-####](https://bkrupa.atlassian.net/browse/LS-####)
```

- `primary` — **exactly one** key: the ticket this PR works on (the session's ticket). The only key automation transitions on.
- `related` — optional comma/space-separated keys (`related: LS-####, LS-####`) — informational only, **never auto-transitioned**.
- Bot/Dependabot PRs (no ticket) use `primary: none` and omit the visible line.
- Correcting linkage = **edit the PR body** — no force-push or branch rename.

`github_create_pr` injects the marker automatically when the body lacks one: it uses the `jiraPrimary` param if passed, else the first `LS-####` in the title, else `none`. Pass `jiraRelated` for related keys. Bodies that already contain a marker are left untouched, and a body that already has a visible `**Jira:**` line gets only the HTML comment (no duplicate link).

#### CCR fallback — hand-authoring the marker (no `jiraPrimary` convenience)

The generic `mcp__github__create_pull_request` tool (routing table row 3 — used when the hosted `legacy-sports-github`/`legacy-sports-jira` connectors are unauthenticated in a CCR session, or on Claude Code on the web without the connector) takes a plain `body` string only. It has **no `jiraPrimary` param** and does **not** auto-prepend the marker — you must hand-author the exact three-line block yourself, in the body you pass to the initial `create_pull_request` call.

The marker key is **newline-separated**, not inline. Both of these look plausible but only the first is valid:

```markdown
<!-- jira-link
primary: LS-####
-->
```

✅ Valid — `primary:` is its own line inside the comment.

```markdown
<!-- jira-link primary=LS-#### -->
```

❌ Invalid — inline `key=value` syntax. This fails the "Jira Link Check" required CI check with `jira-link marker has no \`primary:\` line`, and is only caught after the fact by fetching CI job logs, forcing a follow-up `update_pull_request` body edit (per LS-8932/LS-6141).

Copy-pasteable example for a `mcp__github__create_pull_request` body (substitute the real ticket key):

```markdown
<!-- jira-link
primary: LS-1234
-->

**Jira:** [LS-1234](https://bkrupa.atlassian.net/browse/LS-1234)

## Context

...
```

If `legacy-sports-github` re-authenticates mid-session, prefer switching back to `github_create_pr({ jiraPrimary: "LS-####" })` for its auto-prepend convenience rather than continuing to hand-author the marker on the generic tool.

### PR Body Template

> **This description is read by Copilot as a prompt — not just by humans.** When reviewers use "Fix with Copilot" or `@copilot` on a review comment, Copilot's entire context is the PR title, this description, and the diff. A thin description produces repeated, incomplete, or misaligned fixes. Write it as if you are briefing an engineer who has never seen the ticket.

```markdown
<!-- jira-link
primary: LS-####
-->

## Context

**Jira:** [LS-####](https://bkrupa.atlassian.net/browse/LS-####)

<1-2 sentences on the problem this PR solves and why the change is needed. Include any design decisions or constraints that a reviewer — or Copilot when fixing review comments — needs to understand the intent.>

## Summary

- <1-3 bullet points describing what changed and why>

## Test plan

- [ ] <How to verify the change works>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Bug-Fix PR Body Template

If the branch name contains `fix(` or the Jira ticket type is Bug, use this extended template instead. The `## Verification` section is **required** — do not create the PR without it.

```markdown
<!-- jira-link
primary: LS-####
-->

## Context

**Jira:** [LS-####](https://bkrupa.atlassian.net/browse/LS-####)

<1-2 sentences describing the bug, its root cause, and why the chosen fix is correct. Copilot reads this when addressing review comments — include any constraints that affect how the fix should be applied.>

## Summary

- <1-3 bullet points describing the bug and the fix>

## Verification

<Paste before/after evidence here. Use the appropriate template from
[bug-verification-templates.md](bug-verification-templates.md):

- UI bugs: before/after screenshots
- Resolver/logic bugs: failing → passing test output
- Data/query bugs: query results before → after
- Distributed system bugs: error logs/test output before → after
- Mixed bugs: combine templates for each layer>

## Test plan

- [ ] <Regression test file and name>
- [ ] <How to manually verify, if applicable>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## After PR Creation

> **⛔ COMMON FAILURE MODE — never stop after `github_create_pr`.** A draft PR is skipped by the reviewer bot, the CI Orchestrator (which is gated on bot review events), and sweep agents — it will receive no automated review or orchestrated CI until you explicitly mark it ready. All 9 steps below are required — `github_create_pr` with `draft: true` is only step 1 of 9.

1. If you used the `gh` CLI with `--body-file`, clean up the temp body file: `bash scripts/cleanup-pr-body.sh` (no-op if `.github/tmp-pr-body.md` does not exist)
2. **Apply `agent-in-progress` label** (while still a draft): `github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])` — marks the PR as actively watched so sweep and review agents skip it. Applying before marking ready closes the race window. **Remove this label when you exit the task** (PR merged or session ends without completion). Shell fallback: `gh pr edit <PR#> --add-label "agent-in-progress"`
   2a. **Now run Gate B (the validated gate) — this is where `make pc` runs, AFTER the draft PR exists**: apply migrations (prereq 3), run `make pc` to green (prereq 4), collect bug-fix verification if required (prereq 5), and complete the self-review. The draft PR + `agent-in-progress` label already exist, so a container reap during `make pc` here is non-fatal. **Do not mark ready until `make pc` is green.**
3. **Mark ready for review**: `github_mark_pr_ready(number: <PR#>)` — this fires the `ready_for_review` event that triggers the `Reviewer (W1)` workflow (Cycle 1 of the [Author Agent Contract](../SKILL.md#author-agent-contract-bot-pr-flow)). The bot's resulting `pull_request_review` event then fires the `Legacy Sports CI Orchestrator`. Shell fallback (only if MCP unavailable): `gh pr ready <PR#>`
4. **⛔ Apply `bot:ready-for-review` label — MANDATORY and MUST BE LAST**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })`. Cycle 1 fires from the `ready_for_review` event on its own, but **without this label any subsequent `synchronize` event (push of additional commits before the bot has reviewed, or any later fix-push) starts no reviewer run** — `Reviewer (W1)` only honors `synchronize` while this label is present (`.github/workflows/review.yml`). Applying it at PR creation closes that gap. Per LS-4678, the reviewer **preserves the label through merge — including on APPROVED** (see `.github/scripts/reviewer/index.mjs` — `cleanupOperationalLabels(..., { preserveReadyLabel: true })`) so post-approval pushes still fire a fresh cycle and don't silently stall behind the `bot-review` ruleset gate on the new HEAD SHA. Review Label Guard (W7) acts as a belt-and-suspenders: if something external strips the label between cycles, the next push re-applies it as long as a prior bot APPROVED exists. Re-application is required only if a prior cycle was rate-limited and the label was force-removed (see [fix-reviews.md](fix-reviews.md) step 8 for the remove-then-re-add pattern that re-triggers a stalled cycle). Shell fallback: `gh pr edit <PR#> --add-label "bot:ready-for-review"`. **⛔ `bot:ready-for-review` must be the last label operation in this session.** `Reviewer (W1)` uses `concurrency.cancel-in-progress: true` — any label applied after this one queues a new workflow run that cancels the reviewer run before it can post a review, then skips itself because the new label is not a qualifying trigger. If `agent-in-progress` is missing when you reach this step, go back and apply it first (step 2), then apply `bot:ready-for-review`.
5. **Subscribe to PR activity (only if the built-in tool is present)**: `mcp__github__subscribe_pr_activity(pullRequestNumber: <PR#>)`. **Current Claude Code sessions surface PR events (CI results, review threads, merge) automatically once the PR exists — no subscribe call is needed, and this built-in tool is absent from most sessions' tool lists** (it was never part of the `legacy-sports-github` MCP server and is unavailable in cloud/headless environments like Copilot Coding Agent and CI). **The tool being absent is NOT a monitoring failure** — do not conclude event delivery is broken, and do not fall back to polling; continue to the next step and react to events as they arrive (pr-lifecycle Critical Rule 9). Call the tool only if it actually appears in the session's tool list. In environments with no event delivery at all (e.g. Copilot), use event-triggered one-shot lookups (`github_view_pr` + `ci_list_runs`) when an external signal arrives — never a sleep/polling loop.
6. Transition Jira: `jira_transition(key: "LS-####", status: "In Review")`
7. **Watch the PR to merge (REQUIRED)**: do NOT treat PR creation as the end of the task. Claude Code surfaces PR events (CI results, review threads, conflicts, merge) natively — handle each event as it arrives until `merged` or `closed`. See [references/drive.md](./drive.md) Step 6 for the full event-handling table and [workflow-overview](../../workflow-overview/SKILL.md) Step 13 for full details.
8. **MCP gap audit** (mandatory, after merge): review Bash commands from this session, classify gaps (`missing-tool`, `missing-feature`, `missing-awareness`), check for existing tickets under the current bucket epic (get via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`), and file new tickets for untracked gaps. Also audit MCP tool overflows. Follow the [audit workflow](../../mcp-first/references/audit-workflow.md) directly.

## If the PR Was Auto-Created by Claude Code

Claude Code's built-in auto-create paths (the desktop "Create PR" affordance, cloud sessions, `/batch` subagents) produce a PR that satisfies **none** of this repo's contract: no jira-link marker (Jira Link Check fails), no labels (subsequent pushes fire no `Reviewer (W1)` cycle — silent stall), a `claude/<slug>` branch with no ticket key, and no Gate B validation or self-review. Run this remediation pass before expecting any repo automation to touch the PR:

1. **Add the jira-link marker** — edit the PR body (`github_edit_pr`) to prepend the full three-line marker block with the correct `primary` key:

   ```markdown
   <!-- jira-link
   primary: LS-####
   -->
   ```

   All three lines are required; an opening comment with no `primary:` line fails Jira Link Check. Never rename the branch to add a ticket key (breaks PR detection) — on a `claude/<slug>` branch the marker is the **only** linkage signal.

2. **Apply `agent-in-progress`** — `github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])` so sweep and review agents skip the PR while you remediate.
3. **Run Gate B** — migrations + validation to green; the auto-create path ran none of it.
4. **Self-review** — Phase 1 of [pr-lifecycle](../SKILL.md) is still mandatory before the PR is treated as ready.
5. **Finish the label sequence** — if the PR is still a draft, `github_mark_pr_ready(number: <PR#>)` (which applies `bot:ready-for-review` itself); if it was created non-draft, apply `bot:ready-for-review` via `github_manage_labels` as the **last** label op. Then transition Jira and watch to merge as in [After PR Creation](#after-pr-creation).

## Guardrails

- **Never** create a PR from the `main` branch
- **Never** skip `make pc` — each CI failure costs 40-60 min. It must pass before **mark-ready** (Gate B), but run it **after** the draft PR is open, not before — see the draft-PR-first note under [Prerequisites](#prerequisites). Running `make pc` before the draft PR exists is the dominant cloud-agent timeout failure mode.
- **Never** inline `--body` in PowerShell — always use `--body-file` or MCP tool
- **Never** create a PR body without the jira-link marker — it is the source of truth for ticket linkage. `github_create_pr` injects it automatically; if you create a PR any other way (e.g. `gh pr create` fallback), include the full three-line block manually, with exactly one `primary` (or `primary: none` for ticket-less bot PRs). An opening comment with no `primary:` line is **not** a valid marker and fails Jira Link Check:

  ```markdown
  <!-- jira-link
  primary: LS-####
  -->
  ```

- **Never** create a PR body without a `## Context` section that includes a Jira link and problem statement — Copilot reads the PR description when fixing review comments; omitting context causes repeated, misaligned fixes
- **Never** create a bug-fix PR without a `## Verification` section — `make pc` passing does not prove the bug is fixed
- **Batch review comments** via "Start a review" before clicking "Fix with Copilot" — submitting each comment individually spawns a separate Copilot agent session per comment, causing duplicate or conflicting fixes
- If prerequisites fail, stop and report the failure — do not create the PR anyway
