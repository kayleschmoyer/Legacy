---
name: create-pr
description: 'Create a pull request with Jira linkage, standard template, and Copilot review request. Load when the user says "create PR", "open PR", or after code changes are ready to ship.'
---

# Skill: Create PR

You are a **PR creation operator**. Your job is to verify prerequisites, create a well-formed pull request, and transition the Jira ticket to "In Review". Follow the procedure exactly — do not improvise.

## Prerequisites (verify in order, stop on first failure)

1. **Not on main** — confirm branch name contains a Jira ticket key (e.g. `LS-1234/...`)
2. **Migrations applied** — `db_migration_status` shows no pending migrations; if pending, run `db_migrate`
3. **Validation passes** — `make pc` exits cleanly; if `format:write` changes files, commit them and re-run
4. **Bug-fix verification** — if the branch contains `fix(` or the Jira ticket type is Bug, the PR body **must** include a `## Verification` section with before/after evidence. Stop and collect evidence before proceeding if missing. See [bug-verification-templates.md](bug-verification-templates.md) for the required format per bug category.
5. **Branch pushed** — `worktree_push` or `git push --force-with-lease origin HEAD`

## Command

Use `github_create_pr` MCP tool (**always preferred** over `gh` CLI). **Always create as draft** to prevent sweep/review agents from racing with the creating agent:

```
github_create_pr(
  title: "LS-#### type(scope): Brief description",
  body: <PR body markdown>,
  draft: true,
  worktreePath: <worktree path>
)
```

### PR Title Format

```
LS-#### type(scope): Brief description
```

Example: `LS-1234 feat(auth): add OAuth2 PKCE flow`

### PR Body Template

> **This description is read by Copilot as a prompt — not just by humans.** When reviewers use "Fix with Copilot" or `@copilot` on a review comment, Copilot's entire context is the PR title, this description, and the diff. A thin description produces repeated, incomplete, or misaligned fixes. Write it as if you are briefing an engineer who has never seen the ticket.

```markdown
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

1. If you used the `gh` CLI with `--body-file`, clean up the temp body file: `bash scripts/cleanup-pr-body.sh` (no-op if `.github/tmp-pr-body.md` does not exist)
2. **Apply `agent-in-progress` label** (while still a draft): `github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])` — marks the PR as actively watched so sweep and review agents skip it. Applying before marking ready closes the race window. **Remove this label when you exit the task** (PR merged or session ends without completion). Shell fallback: `gh pr edit <PR#> --add-label "agent-in-progress"`
3. **Mark ready for review**: `github_mark_pr_ready(number: <PR#>)` — this signals to sweep/review agents that the PR is available. Shell fallback (only if MCP unavailable): `gh pr ready <PR#>`
4. **Request Copilot review**: `github_request_review(prs: [<PR#>])` — Copilot review is triggered automatically by the repository ruleset for user-authored PRs, but **not for PRs authored by GitHub Apps** (the REST API silently drops Copilot when called with installation tokens). Calling this explicitly is harmless for user-authored PRs (the ruleset already handles it), but **required** for App-authored PRs (e.g., `legacy-sports-code-bot`) — installation tokens cannot trigger Copilot review via `requestReviewers`. Shell fallback: `gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers --method POST -f 'reviewers[]=copilot-pull-request-reviewer[bot]'`
5. Transition Jira: `jira_transition(key: "LS-####", status: "In Review")`
6. **Watch the PR to merge (REQUIRED)**: do NOT treat PR creation as the end of the task. Use the watch mechanism for your environment to shepherd the PR through CI and reviews:
   - **Local agents**: call `github_wait_for_pr_event({ number: <PR#> })` — it blocks until an agent-actionable event fires (CI fail/pass, new review thread, review decision, conflicts, merged, closed) and returns `{ event, pr, ... }`. Handle the event, then call it again until `merged` or `closed`. See [drive-pr](../../drive-pr/SKILL.md) Step 6 for the full event-handling table.
   - **Cloud agents (Claude Code on the web)**: call `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` to receive real-time `<github-webhook-activity>` messages, then react to incoming messages until `merged` or `closed`. Do not also call `github_wait_for_pr_event` — the webhook subscription replaces the polling loop.
   - See [workflow-overview](../../workflow-overview/SKILL.md) Step 13 for full details.
7. **MCP gap audit** (mandatory, after merge): review Bash commands from this session, classify gaps (`missing-tool`, `missing-feature`, `missing-awareness`), check for existing tickets under the current bucket epic (get via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`), and file new tickets for untracked gaps. Also audit MCP tool overflows. Follow the [audit workflow](../../mcp-gaps/references/audit-workflow.md) directly.

## Guardrails

- **Never** create a PR from the `main` branch
- **Never** skip `make pc` — each CI failure costs 40-60 min
- **Never** inline `--body` in PowerShell — always use `--body-file` or MCP tool
- **Never** create a PR body without a `## Context` section that includes a Jira link and problem statement — Copilot reads the PR description when fixing review comments; omitting context causes repeated, misaligned fixes
- **Never** create a bug-fix PR without a `## Verification` section — `make pc` passing does not prove the bug is fixed
- **Batch review comments** via "Start a review" before clicking "Fix with Copilot" — submitting each comment individually spawns a separate Copilot agent session per comment, causing duplicate or conflicting fixes
- If prerequisites fail, stop and report the failure — do not create the PR anyway
