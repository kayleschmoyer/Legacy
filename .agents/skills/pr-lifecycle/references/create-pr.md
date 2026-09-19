---
name: create-pr
description: 'Create a pull request with Jira linkage and standard template. Load when the user says "create PR", "open PR", or after code changes are ready to ship.'
---

# Skill: Create PR

You are a **PR creation operator**. Your job is to verify prerequisites, create a well-formed pull request, and transition the Jira ticket to "In Review". Follow the procedure exactly — do not improvise.

## Prerequisites

> **⛔ Draft-PR-first ordering (timeout resilience) — do NOT run `make pc` before the draft PR exists.** Open the draft PR **early**, right after the branch is pushed and **before** the long `make pc` validation. A draft PR is inert (CI and the Reviewer Bot are gated on `draft == false`, so opening it triggers nothing), but it gives an ephemeral/cloud container a durable substrate: a reap during `make pc` is then non-fatal, and a fresh container resumes from the continuation checkpoint instead of losing all work. The validated gate is **mark-ready, not open-draft** — `make pc` must pass before `github_mark_pr_ready`, but it does **not** need to pass before the draft PR is created. Running the full validation first is the dominant cloud-agent timeout failure mode. See the spine's [draft-PR-before-validation gate](../../workflow-overview/references/ticket-to-merge-spine.md#critical-gates-preconditions) and [cloud-agent-mode → Container timeout resilience](../../cloud-agent-mode/references/container-timeout-resilience.md#container-timeout-resilience).

### Gate A — before opening the draft PR (verify in order, stop on first failure)

1. **Not on main** — confirm the branch name / commits / PR title carry a Jira ticket key (e.g. `LS-1234`)
2. **Branch pushed** — `worktree_push(setUpstream: true)` or `git push --force-with-lease origin HEAD`

Then create the draft PR (see [Command](#command) below) and apply `agent-in-progress` **before** running validation.

### Gate B — before marking the PR ready (the validated gate)

3. **Migrations applied** — `pnpm --prefix lib/db-client run db:status` shows no pending migrations; if pending, run `pnpm --prefix lib/db-client run db:up`
4. **Validation passes** — validation exits cleanly; if `format:write` changes files, commit them and re-run. Locally, `make pc` (or `make_run({ target: "pc" })`) is fine. In **cloud** sessions, never run monolithic `make pc` — run the seven `pc-*` chunks **in order** via the environment's binding (`nx_run_pc_chunk` when present — mandatory; degraded CC web: background Bash chunks), checkpointing after each (LS-7906). Binding home: the [spine's binding table](../../workflow-overview/references/ticket-to-merge-spine.md#tool-binding-by-environment) and [`cloud-agent-mode/SKILL.md`](../../cloud-agent-mode/SKILL.md).
5. **Bug-fix verification** — if the branch contains `fix(` or the Jira ticket type is Bug, the PR body **must** include a `## Verification` section with before/after evidence. Stop and collect evidence before marking ready if missing. See [bug-verification-templates.md](bug-verification-templates.md) for the required format per bug category.

## PR-Creation Tool Routing (one home — link here, do not restate)

Pick the creation tool by which servers your session actually has (check the tool list / `ToolSearch`), in this preference order:

| #   | Environment signal                                                                  | Tool                                                                                                                                 | What it does / follow-ups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hosted `legacy-sports-github` connector available (tools named `github_*`)          | `github_open_pr(title, body, jiraKey, head)`                                                                                         | **One-shot Ship step**: push branch → create draft → mark ready → apply `bot:ready-for-review`; auto-inserts the jira-link marker from `jiraKey`. Pass `draft: true` to stop at draft (then apply `agent-in-progress` and finish the label sequence below yourself); `push: false` if already pushed. **Always pass `head` explicitly whenever the `legacy-sports-github` MCP server is hosted/Lambda-backed** — this includes local worktree sessions using the hosted connector, not just cloud sessions. A hosted server has no git checkout to auto-detect the branch from and can never stat a caller-side `worktreePath` (that path only exists on the caller's filesystem); omitting `head` fails with `"In Lambda mode, head must be passed explicitly"`. Passing `head` explicitly is never harmful, so do it unconditionally rather than relying on `worktreePath`. The default `push: true` is also a no-op in this mode (nothing to push from); push the branch manually via Bash first and pass `push: false`, or the create call 422s with `head invalid` on the unpushed branch. |
| 2   | Claude Code on the web without the connector (built-in `mcp__github__*` tools only) | `mcp__github__create_pull_request({ owner, repo, draft: true, ... })` then `mcp__github__update_pull_request({ ..., draft: false })` | Authenticates via the platform token (avoids attributing the PR to the user's personal account). Neither call applies any label or the jira-link marker — include the marker in the body yourself and run the full label sequence below via `github_manage_labels` (or built-in label tools if the connector is absent).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | No MCP path at all AND the user explicitly authorized CLI                           | `node scripts/open-pr.mjs --ticket LS-#### ...` (wraps `gh pr create`; injects the marker)                                           | Last resort only (`github_auth_status()` returned `configured: false` and the user confirmed). `gh pr create` silently uses the shell's cwd and targets the wrong branch in multi-worktree sessions — pass `--head` explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

> **Row 2 caveat (LS-9279, refining LS-9463):** every built-in read path — `mcp__github__pull_request_read` and `mcp__github__list_pull_requests` alike — strips `<!-- ... -->` HTML comments from the body it returns, so **a read-back can never confirm the jira-link marker and must not be used to decide whether the write landed** (it reads as missing every time), and **a body edit composed from a read-back deletes the marker**. On row 2: put the key in the title, put the marker in `create_pull_request`'s initial body, and treat it as written. Jira Link Check repairs a missing or malformed marker from the title key and passes, so the only escalation is a check that actually fails — read its job log (`mcp__github__get_job_logs`), which prints `✅ Jira Link Check passed (primary: LS-####)` or names every violation. PR #7128 is the worked example of the false negative: marker written, invisible to two read-backs, present in the stored body and passing CI throughout. Full playbook: [§ Seeing and fixing linkage on an open PR](#seeing-and-fixing-linkage-on-an-open-pr) and [mcp-first § Built-in GitHub Tools](../../mcp-first/references/service-operations.md#built-in-github-tools-claude-code-on-the-web).

> **Row 2 label caveat (LS-8933):** `mcp__github__update_pull_request` has no `labels` param — passing one either errors ("No update parameters provided", if `labels` is the only field) or is silently dropped (when combined with other fields like `draft`). On the row-2 built-in-only path (no hosted `legacy-sports-github` connector, so no `github_manage_labels`), the only way to set labels is `mcp__github__issue_write({ method: "update", issue_number, labels: [...] })` — but it **replaces the PR's entire label set**, not just the ones you pass. Always **read the PR's current labels first** (`mcp__github__pull_request_read` or `mcp__github__issue_read`) and include them in the `labels` array alongside whatever you're adding, or you will silently clobber labels set by other bots (e.g. `CI: Lint Failure`, `jira-mismatch`). Verified end-to-end (LS-8939, 2026-08-03): `issue_write({ method: "update", issue_number: <PR#>, labels: ["bot:ready-for-review"] })` applied the label and triggered the Reviewer Bot cycle — but note that call form drops every other label the PR had, so it's only safe when you've merged the current set in first.

**Mandatory label sequence after any non-one-shot create** (rows 2–3, and row 1 with `draft: true`): apply `agent-in-progress` while the PR is a draft → `github_mark_pr_ready(number)` — which applies `bot:ready-for-review` itself as its last, idempotent step. Only the CC-web built-in path (row 2) needs an explicit `bot:ready-for-review` label call after `update_pull_request({ draft: false })`, and it must be the **last** label op (see the "must be last label op" note in [quick-commands.md](quick-commands.md)). `github_open_pr` without `draft: true` performs the ready + label steps itself.

Before creating a PR, verify GitHub auth is working:

```
github_auth_status()
```

If `configured: false`, **stop and prompt the user** — do not silently fall back to `gh` CLI. Tell them their GitHub credentials are missing or expired and direct them to set `GH_TOKEN` or `GITHUB_TOKEN`, run `gh auth login`, or configure `AGENT_AUTHOR_APP_PRIVATE_KEY`. Only fall back to `gh` CLI after the user confirms their auth is working or explicitly asks you to try the CLI fallback.

**Cloud (Claude Code on the web)**: row 2 of the routing table above; see [`cloud-agent-mode/SKILL.md`](../../cloud-agent-mode/SKILL.md) for the full platform tool mapping.

## Command

> **⚠️ MCP tool string parameters are not shell-evaluated.** Unlike the Bash tool's `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc convention, an MCP tool call is a plain JSON call — there is no shell to expand `$(...)` or backticks. Passing `body: "$(cat /tmp/pr-body.md)"` to `github_open_pr`/`create_pull_request` (or `commentBody` to a Jira comment tool) lands as the literal string `$(cat /tmp/pr-body.md)`, not the file's contents (LS-8591, caught while opening the draft PR for LS-6031). If you assembled the body in a scratch file via `Write`/`Edit`, `Read` it back and inline the actual text into the `body` param instead. This is cheap to catch: after creating a PR from a scratch-file body, re-read it once (`pull_request_read`/`jira_view`) to confirm the content landed correctly before moving on.

Tool selection is homed in the [PR-creation tool routing table](#pr-creation-tool-routing-one-home--link-here-do-not-restate) below — the flow below shows the `github_open_pr` (hosted `legacy-sports-github`) path. **Always create as draft** to prevent sweep/review agents from racing with the creating agent:

```
github_open_pr(
  title: "LS-#### type(scope): Brief description",
  body: <PR body markdown>,
  draft: true,           # stop after creation; finish the label sequence yourself
  head: <branch-name>,   # from worktree_status().headRefName (required in Lambda mode)
  jiraKey: "LS-####"     # session's ticket — drives the jira-link marker; omit to derive from title
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

`github_open_pr` injects the marker automatically when the body lacks one: it uses the `jiraKey` param if passed, else the first `LS-####` in the title, else `none` (with the `no-jira` label applied automatically per LS-8298). Bodies that already contain a marker are left untouched, and a body that already has a visible `**Jira:**` line gets only the HTML comment (no duplicate link).

#### CCR fallback — hand-authoring the marker (no `jiraKey` convenience)

The generic `mcp__github__create_pull_request` tool (routing table row 2 — used when the hosted `legacy-sports-github`/`legacy-sports-jira` connectors are unauthenticated in a CCR session, or on Claude Code on the web without the connector) takes a plain `body` string only. It has **no `jiraKey` param** and does **not** auto-prepend the marker — you must hand-author the exact three-line block yourself, in the body you pass to the initial `create_pull_request` call.

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

❌ Invalid — inline `key=value` syntax. Jira Link Check now **repairs** this form (and a missing marker) from the title key rather than failing the PR — see [below](#jira-link-check-repairs-the-marker-for-you-ls-9279) — but the repair costs a CI cycle and only fires when the title carries exactly one key, so still write the valid form. Before LS-9279 this failed the check with `jira-link marker has no \`primary:\` line`, caught only by fetching CI job logs and forcing a follow-up `update_pull_request` body edit (per LS-8932/LS-6141).

Copy-pasteable example for a `mcp__github__create_pull_request` body (substitute the real ticket key):

```markdown
<!-- jira-link
primary: LS-1234
-->

**Jira:** [LS-1234](https://bkrupa.atlassian.net/browse/LS-1234)

## Context

...
```

If `legacy-sports-github` re-authenticates mid-session, prefer switching back to `github_open_pr({ jiraKey: "LS-####" })` for its auto-prepend convenience rather than continuing to hand-author the marker on the generic tool.

> **The write path is fine — do not treat a missing marker as proof the hand-authored comment was stripped (LS-8694).** It is tempting to conclude `create_pull_request`/`update_pull_request` sanitize literal `<!-- ... -->` comments out of the `body` before GitHub stores it; LS-8694 tested that directly and found otherwise. Method: write a body containing the marker via `create_pull_request`, then a follow-up body via `update_pull_request` (including the inline `<!-- jira-link primary: LS-#### -->` form), and read the **stored** GitHub body back through a channel the built-in tools' own display stripping doesn't touch — `legacy-sports-github`'s `github_view_pr({ fields: ["body"] })`, which returns GitHub's API response directly. In both cases the literal comment came back byte-for-byte intact. So: the write path does not strip. Every apparent "the marker vanished" report (this ticket included, and its predecessors LS-9202/LS-8934/LS-9227/LS-9228 below) is the [read-path false-negative](#seeing-and-fixing-linkage-on-an-open-pr) — checking your own write by reading it back through `pull_request_read`/`list_pull_requests`/the built-in tool's own echo, all of which strip on **display** regardless of what's stored. Practical takeaways:
>
> - **Never verify a marker write by reading it back** through anything but `github_view_pr` on the hosted connector (or don't verify at all — see [below](#seeing-and-fixing-linkage-on-an-open-pr)). A "the comment is gone" read-back proves nothing about what GitHub actually stored.
> - **Hand-authoring the marker on this path works** — write it in the initial body as documented above and trust it landed.
> - **The title is still the durable safety net regardless** — put the ticket key in the PR title too, so [Jira Link Check's auto-repair](#jira-link-check-repairs-the-marker-for-you-ls-9279) covers you on the rare case the marker really is missing or malformed for an unrelated reason.

**Always put the ticket key in the PR title on this path** — the title is the only linkage signal that survives every read path, it is what `jira-branch-sync` falls back to, and it is what Jira Link Check repairs the marker from when the body's marker is missing or malformed.

#### Seeing and fixing linkage on an open PR

**Every built-in GitHub read path strips `<!-- ... -->` HTML comments out of a
PR body, so the jira-link marker is invisible to you no matter which tool you
reach for.** Verified on `mcp__github__pull_request_read` (LS-9463, PR #7128)
and on `mcp__github__list_pull_requests({ fields: ["body"] })` (LS-9279): the
stored bodies of open PRs start with the marker block, and both tools return a
body starting with the two blank lines where it used to be. A read-back is a
false negative 100% of the time, not evidence of anything.

Two consequences, and neither is optional:

1. **Never verify a marker write by reading the body back.** Write it (in
   `create_pull_request`'s initial body, or via `mcp__github__update_pull_request`),
   then treat it as landed.
2. **Never build a body edit out of a read-back.** Read → append → write
   deletes the marker you never saw. Compose the new body from text you hold —
   the body you sent, plus your edit — or accept that CI has to put the marker
   back.

To _see_ a PR's linkage, use a channel the sanitizer does not touch:

| What you need                            | Where to read it                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The primary ticket key                   | The **PR title** (Jira Link Check requires the key there) and the visible `**Jira:**` line in the body — neither is an HTML comment, so both survive every read path                                     |
| Whether the marker itself is well-formed | The **`Jira Link Check` check-run conclusion** — `pull_request_read({ method: "get_check_runs" })`. `success` means: exactly one marker, one valid `primary:`, matching the title, ticket exists in Jira |
| The parsed keys, verbatim                | The **Jira Link Check job log** — `mcp__github__get_job_logs` or `ci_get_logs`. It ends in `✅ Jira Link Check passed (primary: LS-####)`, plus `related:` keys when declared                            |
| Why it failed, and what to change        | The same job log, which names every violation and prints a copy-pasteable marker block                                                                                                                   |

To _add_ linkage to an existing PR, edit the body — `github_edit_pr({ number, body })`
on the hosted connector (it re-injects the marker for you, LS-8017), or
`mcp__github__update_pull_request({ pullNumber, body })` with the marker
hand-authored as the first three lines. No push, no branch rename.

#### Jira Link Check repairs the marker for you (LS-9279)

Because agents cannot see the marker, they cannot reliably maintain it — so CI
does. When a PR body's marker is **missing or malformed** and the PR title
carries **exactly one** `LS-####` key, Jira Link Check rewrites the body with a
well-formed marker (adding the visible `**Jira:**` line if the body has none)
and passes. This covers the failure modes agents actually hit: a body written
by `mcp__github__create_pull_request` with no marker at all, the inline
`<!-- jira-link primary=LS-#### -->` form, a bare `<!-- jira-link -->`,
duplicate markers, and a marker dropped by a read-modify-write body edit. Any
well-formed `related:` keys are carried across. The rewrite uses `GITHUB_TOKEN`,
whose events do not re-trigger workflows, so it never loops.

It deliberately does **not** repair — these still fail, and are yours to fix:

| Situation                                                 | Fix                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PR title carries no `LS-####` key                         | Retitle to `LS-#### type(scope): description` (or declare `primary: none` + the `no-jira` label)                   |
| PR title carries two or more distinct keys                | Retitle so only the primary key is present; move the rest to `related:`                                            |
| Marker declares a valid key that disagrees with the title | Decide which is right and edit the other — CI will not pick for you (this is what the `jira-mismatch` label flags) |
| `primary: none` without the `no-jira` label               | Add the label, or declare the real key — an opt-out has to be deliberate                                           |
| The primary key does not exist in Jira                    | Fix the typo in both title and marker                                                                              |

So the practical rule on any session without the hosted connector: put the key
in the title, put the marker in the body if you can, and let the check settle
the rest. Escalate only when Jira Link Check itself fails.

Historical context, since the prior tickets read the other way: LS-9202 and
LS-8934 concluded the _write_ path strips (LS-8934 attributing it to
intermittency and prescribing a read-back-and-retry loop), and LS-9227 /
LS-9228 were both closed **Won't Do** on that basis, reasoning that those
reports were the same read-path false-negative documented above rather than a
real write-side bug. LS-9191 landed on the same misdiagnosis again from a CCR
session; the CCR-specific pointer to this section now lives in
[`cloud-agent-mode/references/claude-code-remote.md` § jira-link marker "stripping" in CCR](../../cloud-agent-mode/references/claude-code-remote.md#jira-link-marker-stripping-in-ccr-is-a-read-path-false-negative-not-a-write-bug-ls-9191)
so a future CCR session hits the answer before re-investigating.

**LS-8694 confirms the Won't Do reasoning and closes the ambiguity: the write
path does not strip.** Its own report described the same symptom pattern —
write a body containing the marker via `create_pull_request` (and separately
via `update_pull_request`, including the inline `<!-- jira-link primary: LS-#### -->`
form), read it back, comment is gone — that reads exactly like real stripping
if the read-back goes through any of the built-in tools' own display paths
(`pull_request_read`, `list_pull_requests`, or the create/update call's own
echoed response), all independently confirmed above to strip on **display**
regardless of what GitHub actually stored. LS-8694 isolated the write path by
reading the result through `github_view_pr` on the hosted `legacy-sports-github`
connector instead — a channel that fetches GitHub's API response directly and
is not part of any built-in tool's read path. Both the `create_pull_request`
body and the follow-up `update_pull_request` body came back with the literal
HTML comment intact, byte-for-byte, including the inline form. There is
nothing to fix or route around on the write side: **root cause of every
"the marker got stripped" report in this ticket chain, including LS-8694's
own, is the documented read-path display stripping being mistaken for a write
bug**, not a sanitization step and not a markdown-processing bug. Given three
tickets now landing on the same conclusion (LS-9227, LS-9228, and now LS-8694
directly testing it), do not re-open this question on a future report without
first checking whether the report's "stored/returned body" was actually read
through the hosted connector's `github_view_pr` — if it wasn't, it is the same
misdiagnosis, not new evidence.

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

> **⛔ COMMON FAILURE MODE — never stop after `github_open_pr({ draft: true })`.** A draft PR is skipped by the reviewer bot, the CI Orchestrator (which is gated on bot review events), and sweep agents — it will receive no automated review or orchestrated CI until you explicitly mark it ready. All 9 steps below are required — `github_open_pr` with `draft: true` is only step 1 of 9.

1. If you used the `gh` CLI with `--body-file`, clean up the temp body file: `bash scripts/cleanup-pr-body.sh` (no-op if `.github/tmp-pr-body.md` does not exist)
2. **Apply `agent-in-progress` label** (while still a draft): `github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])` — marks the PR as actively watched so sweep and review agents skip it. Applying before marking ready closes the race window. **Remove this label when you exit the task** (PR merged or session ends without completion). Shell fallback: `gh pr edit <PR#> --add-label "agent-in-progress"`
   2a. **Now run Gate B (the validated gate) — this is where `make pc` runs, AFTER the draft PR exists**: apply migrations (prereq 3), run `make pc` to green (prereq 4), collect bug-fix verification if required (prereq 5), and complete the self-review. The draft PR + `agent-in-progress` label already exist, so a container reap during `make pc` here is non-fatal. **Do not mark ready until `make pc` is green.**
3. **Mark ready for review**: `github_mark_pr_ready(number: <PR#>)` — this fires the `ready_for_review` event that triggers the `Reviewer (W1)` workflow (Cycle 1 of the [Author Agent Contract](author-agent-contract.md)). The bot's resulting `pull_request_review` event then fires the `Legacy Sports CI Orchestrator`. Shell fallback (only if MCP unavailable): `gh pr ready <PR#>`
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
- **Never** create a PR body without the jira-link marker — it is the source of truth for ticket linkage. `github_open_pr` injects it automatically, and so does `node scripts/open-pr.mjs --ticket LS-#### …` (the `gh` fallback when the hosted MCP is down — a raw `gh pr create` without the marker is blocked by a PreToolUse hook, LS-10110); if you create a PR any other way, include the full three-line block manually, with exactly one `primary` (or `primary: none` for ticket-less bot PRs). An opening comment with no `primary:` line is **not** a valid marker and fails Jira Link Check:

  ```markdown
  <!-- jira-link
  primary: LS-####
  -->
  ```

- **Never** create a PR body without a `## Context` section that includes a Jira link and problem statement — Copilot reads the PR description when fixing review comments; omitting context causes repeated, misaligned fixes
- **Never** create a bug-fix PR without a `## Verification` section — `make pc` passing does not prove the bug is fixed
- **Batch review comments** via "Start a review" before clicking "Fix with Copilot" — submitting each comment individually spawns a separate Copilot agent session per comment, causing duplicate or conflicting fixes
- If prerequisites fail, stop and report the failure — do not create the PR anyway

## Agent-Session Marker (PR ↔ Session Linkage + Provenance) — one home, LS-8570

Any local session that picks up an existing PR it did not create (drive-pr, fix-pr, respond-to-review, sweep chips) must stamp itself onto the PR before entering the work loop:

```bash
bash scripts/link-pr-session.sh <PR#>
```

The script appends one idempotent marker line to the PR body via `gh pr edit --body-file`:

```
<!-- agent-session: <CLAUDE_CODE_SESSION_ID> (<YYYY-MM-DD>) -->
```

Two effects, and why `gh` (not MCP) is load-bearing here:

- **Provenance (guaranteed).** Marker lines accumulate over the PR's life — a durable record of every agent session that worked it, resolvable back to transcripts via the session id.
- **Desktop linkage (best-effort).** Claude Code Desktop links a session to a PR by detecting a PR on the _session's own branch_, or by parsing **harness-visible** `gh`/`git` PR interactions. MCP connector calls (`github_open_pr`, `github_manage_labels`, …) are invisible to the harness and never establish linkage — which is why pickup sessions historically showed an empty PR status bar. Caveat from live testing (desktop 2.1.215, LS-8570): `gh pr create` in-session reliably links (any branch) and Bash `git push` to the PR branch has been observed to link, but a `gh pr edit` body edit alone did **not**. Treat foreign-branch status-bar linkage as best-effort — the stamp is still the right first move (it is the only harness-visible interaction most pickup sessions perform), and an empty status bar after stamping is an upstream desktop limitation, not a workflow bug.

Skip only when: the PR is on the session's own branch (linkage is automatic — though stamping is still harmless and keeps provenance complete), or the environment has no `gh`/`CLAUDE_CODE_SESSION_ID` (cloud/API-only sessions — the script fails loudly and the miss is acceptable).

## Parent-Agent PR Recovery

When a subagent fails to push or create a PR, the parent agent should **prefer MCP tools** to recover — use `gh` only when MCP is unavailable. The subagent's commits already exist in its ephemeral worktree; the parent just needs to push and ship.

**Recovery sequence (MCP-first):**

```
# 1. Push the subagent's commits (include worktree path and setUpstream for new branches)
worktree_push(worktree: "<absolute path to subagent worktree>", setUpstream: true)
# OR if worktree_set is active for the subagent's worktree:
worktree_push(worktree: "<absolute path to subagent worktree>", setUpstream: true)

# 2. Create the PR as a draft, using the subagent's branch name (from worktree_status().headRefName)
github_open_pr(
  head: "<branch-name>",    # from worktree_status().headRefName
  title: "LS-#### type(scope): msg",
  body: <markdown>,
  jiraKey: "LS-####",
  push: false,              # step 1 already pushed
  draft: true
)

# 3. Apply the agent-in-progress label
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])

# 4. Mark ready for review
github_mark_pr_ready(number: <PR#>)
```

**Prefer MCP; use `gh` only when MCP is unavailable.** The `legacy-sports-github` MCP server exposes all required operations as first-class tools (`github_open_pr`, `github_mark_pr_ready`, `github_manage_labels`, `github_request_review`) and should always be preferred. `gh pr create` / `gh pr ready` / `gh pr edit --add-label` are shell-level fallbacks for when MCP servers are unavailable. Using `gh` CLI in a recovery context can also silently use the wrong working directory, bypasses the `head` parameter that routes the PR to the correct branch, and produces shell-history noise that MCP gap audits flag.

**Shell fallback (only if MCP server is unavailable) — hosted MCP is down (LS-10110):** use the wrapper, never raw `gh pr create`. It takes the ticket key as a required argument and injects the jira-link marker itself; a raw `gh pr create`/`gh pr edit` whose body lacks the marker is blocked by `.claude/hooks/guard-gh-pr-marker.mjs` (nine recurrences of the marker-less fallback, all fixed after the check failed). Validate an existing body without creating anything with `--check`; for a body edit on an existing PR, `--check` the file, then `gh pr edit <PR#> --body-file <file>` (the hook re-checks it).

```bash
node scripts/open-pr.mjs --ticket LS-#### --title "LS-#### type(scope): msg" --body-file ".github/tmp-pr-body.md" --head <branch> --draft
node scripts/open-pr.mjs --check ".github/tmp-pr-body.md" --title "LS-#### type(scope): msg"
bash scripts/cleanup-pr-body.sh
gh pr edit <PR#> --add-label "agent-in-progress"
gh pr ready <PR#>
```
