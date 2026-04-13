# MCP Gap Audit — Detailed Workflow

After every agent session, run the automated audit to identify Bash commands that should be MCP tool invocations, and MCP tool overflows/failures that need fixes. File tickets under the **current MCP gaps bucket epic** (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`).

## Quick Start

```
ci_audit_session_bash({ auditMode: true })
```

This produces a structured JSON report with:

- **Pre-classified gaps** with confidence scores (high/medium/low)
- **Draft Jira ticket summaries** ready to file
- **Noise filtering** (one-off investigative commands auto-excluded)
- **Overflow/failure triage** items for review

Shell fallback: `python scripts/audit-session-bash.py --audit`

## Steps

### 1. Run the audit

Call `ci_audit_session_bash({ auditMode: true })`. The script:

- Parses the full JSONL transcript (parent + all subagents)
- Classifies every Bash command as `covered` (has MCP equivalent), `gap` (needs a ticket), or `noise` (one-off investigative)
- Pre-classifies gaps into `missing-tool`, `missing-feature`, or `missing-awareness` with confidence scores
- Generates draft ticket summaries
- Includes MCP overflows and failures

**Current limitation:** Does not extract `powershell` tool invocations from Copilot CLI transcripts — review those separately in conversation history.

### 2. Review the report

The report has an `action_required` section with:

| Section                | What to do                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `gaps_auto_classified` | High-confidence gaps — accept unless you disagree                                      |
| `gaps_to_review`       | Medium/low-confidence gaps — verify gap_type and draft_summary                         |
| `overflows`            | Classify fix_type as `agent-error`, `bad-default`, or `missing-parameter`              |
| `failures`             | Classify fix_type as `permission-gap`, `bug`, `config-issue`, or `expected-limitation` |

The `informational` section shows `noise_filtered` (auto-skipped commands) and `covered_commands` (already have MCP tools) for transparency.

### 3. Check for existing tickets

Before creating new tickets, check for existing ones:

```
jira_list_children(key: <currentBucketEpicKey>)
```

Match on underlying capability, not exact wording.

### 4. Create tickets for approved gaps

For each approved gap, use `jira_create_ticket`:

- **Summary**: Use the `draft_summary` from the report (or edit it)
- **Type**: `Task`
- **Parent**: current bucket epic key

Description template:

```
## Gap Identified

**Shell command observed**: `<sample from report>`
**Gap type**: <gap_type from report>
**Confidence**: <confidence from report>

## Proposed MCP Tool

**Server**: <server from report>

## Context

Identified during automated audit on <date>.
```

For `missing-awareness` gaps, the description should note which skill doc or AGENTS.md section needs updating.

### 5. Classify overflows and failures

For **overflows** in the report:

- **`agent-error`**: Tool has limiting params but agent didn't use them — update docs, no ticket
- **`bad-default`**: Tool returns too much without limits — file ticket to change server default
- **`missing-parameter`**: Tool has no way to limit output — file ticket to add the parameter

For **failures**:

- **`permission-gap`**: Token lacks scopes — file ticket for permission or graceful degradation
- **`bug`** / **`bug/timeout`** / **`bug/state-loss`**: Code defect — file ticket with repro steps
- **`config-issue`**: Wrong setup — doc fix only
- **`expected-limitation`**: Working as designed — no ticket

### 6. Report findings

Summarize to the user:

- Total commands reviewed
- Gaps found (with ticket keys)
- Overflows/failures classified
- Noise auto-filtered

## Gotchas

- **Don't create duplicate tickets** — always search the bucket epic's children first
- **Don't ticket one-off commands** — the script filters these, but verify if uncertain
- **`missing-feature` vs `missing-tool`** — if a tool exists but needs a new parameter, that's `missing-feature`
- **Overflow != gap** — if the tool works with correct params, fix docs not the tool
- **Documented exceptions still count** — patterns marked as "shell fallback" in AGENTS.md are tracked gaps, not permanent exemptions

## Known Recurring Patterns

These are pre-classified by the script at high confidence:

| Pattern                | Gap type            | Reason                                                 |
| ---------------------- | ------------------- | ------------------------------------------------------ |
| `git show origin/...`  | `missing-tool`      | Remote ref:path reads have no MCP equivalent           |
| `git ls-tree`          | `missing-tool`      | Listing files on remote branches has no MCP equivalent |
| `find .` / `find $wt`  | `missing-awareness` | Should use Glob tool                                   |
| `grep -r` / `grep -rl` | `missing-awareness` | Should use Grep tool                                   |

## Known High-Frequency Overflow Patterns

| Tool                       | Frequency | Root cause                     | Fix                           |
| -------------------------- | --------- | ------------------------------ | ----------------------------- |
| `ci_get_logs`              | Very high | Full logs without `maxLines`   | Enforce `maxLines` default    |
| `searchJiraIssuesUsingJql` | High      | Broad JQL without `maxResults` | Add pagination                |
| `worktree_run`             | Medium    | `git diff` on lockfiles        | Use `--stat` or `--name-only` |
