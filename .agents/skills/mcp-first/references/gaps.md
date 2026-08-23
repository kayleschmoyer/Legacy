# MCP Gaps

## Overview

Three-phase workflow for closing MCP tooling gaps:

1. **Audit** — after merge (workflow step 14), review Bash and PowerShell commands, MCP tool overflows, and MCP tool failures to identify gaps, then file tickets under the **current MCP gaps bucket epic** (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`).
2. **Triage** — pick up tickets from the current bucket epic backlog, implement the fix, validate, and ship a PR.

This reference enforces the **MCP-first principle** from AGENTS.md: shell commands are fallbacks, not defaults.

**Why this matters**: every shell command in an agent session represents friction that slows down all future sessions. Filing tickets for gaps is how we systematically eliminate that friction — each ticket closed makes every agent faster.

## When to Use

| Trigger                                         | Phase  |
| ----------------------------------------------- | ------ |
| After merge (workflow step 14)                  | Audit  |
| User asks to audit MCP coverage                 | Audit  |
| User asks to work on MCP tooling improvements   | Triage |
| Processing the current bucket epic backlog      | Triage |
| After an audit identifies new gaps to implement | Triage |

> **Bucket fan-out command**: `/work-ticket LS-####`. When `/work-ticket` is invoked on the mcp-gaps bucket epic, Parent Dispatch Mode dispatches one chip per To Do child using `/work-ticket` (each child is a standalone leaf ticket — no special per-child command). See [`.agents/skills/work-ticket/references/bucket-epic-routing.md`](../../work-ticket/references/bucket-epic-routing.md).

---

## The Consolidation Gate

**Applies to both phases** — when filing a gap (Phase 1) and when implementing one (Phase 2).

This loop is the only active feedback mechanism on our MCP tool surface, and until LS-9703 it could only ever **add**. Every gap type resolved to "write more tool": `missing-tool` adds a tool, `missing-feature` adds a param, `missing-awareness` adds docs. Nothing in the taxonomy could merge or remove anything. The result: 81 tools (April 2026) → 173 (June) → 219 (August), with no net removal ever, and ~89,250 tokens of tool definitions that every session pays whether or not it calls them.

**Before filing or implementing any `missing-tool` gap, answer this:**

> Could this be an `action` value, or an optional param, on an existing tool in the same server?

- **Yes** → file it as `missing-feature`, not `missing-tool`.
- **No** → `missing-tool` is correct. Say _why_ in the ticket: which existing tools you considered and what makes the schemas incompatible.

Check the sibling tools before answering — `docs/mcp/api-reference.html` is searchable, or grep the server's `src/tools/`. A gap whose natural name shares a domain prefix with an existing tool (`ci_*`, `worktree_*`, `github_pr_*`) is a strong signal it belongs as an action on that tool.

**The gate has a real escape hatch.** Forcing unrelated operations into one tool produces a wide union of mutually-exclusive optional params — that costs _more_ than two tools and validates nothing. If more than roughly half the params would be action-scoped, they don't belong together. See the union-schema anti-pattern in [mcp-tool-consolidation.md](../../create/references/mcp-tool-consolidation.md).

**Ticket template addition** — every `missing-tool` ticket must carry:

```
Consolidation gate: considered <existing tools>; not viable because <reason>.
```

A `missing-tool` ticket without that line is not ready to implement — send it back through the gate.

> **Implementing a `redundant-tool` or a consolidation?** Read [mcp-tool-consolidation.md](../../create/references/mcp-tool-consolidation.md) first. The non-negotiable part: **deregister the superseded tool in the same PR** — from the stdio server _and_ the hosted Lambda mirror — or the change saves nothing. Reviewers enforce this as pattern #48.

---

## Phase 1: Audit (Quick Reference)

> Full procedure: [`audit-workflow.md`](audit-workflow.md)

### Minimum threshold — skip shallow sessions

Before running the audit, check session depth. If **all three** of the following are true, skip the audit entirely (report "session too shallow for gap audit"):

1. Fewer than 10 Bash tool calls in the session
2. No MCP tool call failures or overflows observed
3. No new shell patterns (novel `find`, `grep`, `ls`, `cat` usage not already tracked)

The audit adds ~850K tokens to a session. On short sessions (ticket triage, single Jira transition, quick investigation), it contributes noise without actionable signal. Save it for sessions where real tool friction occurred.

1. **Run** `ci_audit_session_bash({ auditMode: true })` — produces a structured JSON report with pre-classified gaps, confidence scores, draft ticket summaries, and noise filtering for Bash activity. The tool is Node-native (LS-8316) and needs no Python interpreter; there is no shell fallback — if the `legacy-sports-ci` server is unavailable, fix the connection (see [diagnostics.md](diagnostics.md)) or fall back to manual review of session Bash commands.
2. **Manually review** conversation history for Copilot CLI `powershell` tool invocations — `ci_audit_session_bash` does **not** currently extract them, so inspect those commands separately and include any gaps they reveal in the audit
3. **Review** the `action_required` section — accept high-confidence gaps, verify medium/low-confidence ones, classify overflow/failure fix types
4. **Check** for existing tickets under the current bucket epic (`jira_list_children`)
5. **Gate** every proposed `missing-tool` — could it be an `action` value or optional param on an existing tool in the same server? If yes, reclassify as `missing-feature`. The pre-classifier does not do this for you. See [The Consolidation Gate](#the-consolidation-gate)
6. **Create** tickets for approved gaps using the draft summaries from the report plus any manually identified `powershell` gaps
7. **Report** findings to the user

The tool handles Bash classification, noise filtering, and ticket drafting automatically. The agent's role is to review and approve, not classify from scratch; `powershell` command review is still manual until extraction support is added.

---

## Phase 2: Triage (Quick Reference)

> Full procedure: [`triage-workflow.md`](triage-workflow.md)

1. **Find** the next unblocked To Do ticket: call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` to get the current epic key, then `jira_list_children(key: <currentKey>, status: "To Do")`
2. **Understand** the gap type — determines implementation approach and risk:
   - `missing-tool` — add a new tool to the appropriate MCP server. **Risk: Medium** (new code in a shared server used by all agents). **Apply the [consolidation gate](#the-consolidation-gate) first** — most `missing-tool` tickets are really `missing-feature`.
   - `missing-feature` — add a parameter/flag or `action` value to an existing tool. **Risk: Medium** (modifying existing server code)
   - `redundant-tool` — a tool that duplicates, or could be an `action` on, an existing tool. Consolidate and **deregister** the superseded tool. **Risk: Medium** (call sites across skills/commands must be updated)
   - `missing-awareness` / doc gap — update skill docs or AGENTS.md. **Risk: Low** (doc changes only)
     For `missing-tool`, `missing-feature`, and `redundant-tool` gaps, run the [planning reference](../../plan-ticket/references/planning.md) before implementation to understand the MCP server's existing patterns, conventions, and tool registration approach. Changes to auth-related tools or tools that make external API calls are **High risk**.
3. **Implement** following the target MCP server's conventions
4. **Validate** with `make pc`
5. **Self-review** — run `/review` (or the self-review steps in `skills/pr-lifecycle/references/self-review.md`) and check against `skills/pr-lifecycle/references/common-review-patterns.md` before pushing. MCP tool code is especially prone to patterns #11 (silent error swallowing), #12 (argument injection), #14 (`shell: true`), and #20 (unbounded output).
6. **Ship** — commit, push, create PR, transition Jira to "In Review"

---

## Phase 3: Periodic Deep Audit (Transcript Mining)

Per-session audits (Phase 1) rely on agents self-reporting. Patterns that agents don't notice — or that only emerge across many sessions — stay invisible. Periodic transcript mining catches these.

### When to run

- Monthly, or after a burst of agent sessions (10+ in a week)
- When a new MCP tool ships, to check if adoption is displacing Bash usage
- When investigating a recurring agent behavior (e.g., "why do agents keep using `find`?")

### Where transcripts live

| Location                                                          | Content               |
| ----------------------------------------------------------------- | --------------------- |
| `~/.claude/projects/<project-hash>/*.jsonl`                       | Parent session logs   |
| `~/.claude/projects/<project-hash>/<sessionId>/subagents/*.jsonl` | Subagent session logs |

Each JSONL line is a message object. Bash tool calls appear as:

```json
{
  "message": {
    "content": [
      { "type": "tool_use", "name": "Bash", "input": { "command": "..." } }
    ]
  }
}
```

> **Note:** `~/.claude/projects/` contains only Claude Code session transcripts. GitHub Copilot CLI sessions are logged separately (outside `~/.claude/projects/`) and cannot be mined with the tools below. For Copilot CLI `powershell` invocations, rely on conversation-history review (Step 1).

### Extraction procedure

All extraction is Node-native via the `legacy-sports-ci` MCP tools (LS-8316) — no Python, no ad-hoc transcript scripts.

1. **Aggregate Bash commands per session** — run `ci_audit_session_bash({ sessionId: "<uuid>", gapsOnly: true })` for each recent session (enumerate candidates with `ci_find_session` or take the most recent by omitting `sessionId`). Each call returns a frequency table of normalised command patterns already split into potential-gap vs MCP-covered; merge the per-session tables to spot cross-session repeats. `ci_session_stats` gives the quick per-session `bashFallbackRatio` heuristic to decide which sessions are worth auditing.

2. **Drill into high-frequency commands** — for each pattern appearing 5+ times, locate the sessions using it with `ci_find_session({ query: "<command prefix>" })`, then pull the full command strings from those sessions via `ci_audit_session_bash({ sessionId, ... })` (default JSON mode returns every command verbatim with timestamps and source transcripts).

3. **Classify** using the same taxonomy as Phase 1 (Step 2): `missing-tool`, `missing-feature`, `redundant-tool`, `missing-awareness` — or let `ci_audit_session_bash({ auditMode: true })` pre-classify with confidence scores and draft ticket summaries. Apply [the consolidation gate](#the-consolidation-gate) to every `missing-tool` before it becomes a ticket — the pre-classifier does not apply it for you.

### Frequency thresholds

| Threshold    | Action                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| 5+ across N  | Worth investigating — may warrant a ticket                                |
| 20+ across N | **High priority** — file ticket immediately under the current bucket epic |
| 50+ across N | **Critical** — likely a systemic gap affecting every session              |

### Reporting

After a deep audit, summarize:

- Top 10 Bash and PowerShell commands by frequency
- New gaps discovered (not already tracked under the current bucket epic)
- Existing gaps whose frequency increased (priority bump candidates)
- Gaps that decreased after recent fixes (effectiveness validation)

---

## References

- [`batch-tool-inventory.md`](batch-tool-inventory.md) — full inventory of every tool across the 10 in-repo MCP servers, classified as already-batched / needs-batch / single-use, with a prioritized list of batch-variant candidates (grounds epic LS-8031).

---

## Gotchas

- **No duplicate tickets** — always search the current bucket epic's children first, matching on underlying capability
- **MCP server scope** — each server has a defined domain (see AGENTS.md); don't cross boundaries
- **Overflow != gap** — if the tool works with correct parameters, fix the docs, not the tool
- **No `console.*`** — MCP servers use `process.stderr.write`; never `console.log`
- **Test manually** if possible — restart the MCP server and invoke the new tool to verify
- **A Bug/Task cannot parent to a Story** — if the bucket epic's ACs say to file GAP bugs "as a child of this Story," parenting directly 400s (`"Please select valid parent issue"`). Parent to the bucket Epic instead and `jira_link_issues(..., linkType: "Relates")` to the Story. See [bucket-epic-routing.md](../../work-ticket/references/bucket-epic-routing.md#gotcha-filing-gap-bugs-under-a-buckets-own-story) (LS-8481).
