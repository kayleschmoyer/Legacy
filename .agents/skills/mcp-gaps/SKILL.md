---
name: mcp-gaps
description: 'Identify and implement MCP tooling gaps. Phase 1 (Audit): run after shipping a PR to review Bash commands and MCP overflows from the session, filing tickets under LS-1455. Phase 2 (Triage): pick up and implement LS-1455 backlog tickets. Load when finishing ticket work (audit) or working through the AI Workspace Improvements backlog (triage).'
---

# Skill: MCP Gaps

## Overview

Three-phase workflow for closing MCP tooling gaps:

1. **Audit** — after every agent session, review Bash commands, MCP tool overflows, and MCP tool failures to identify gaps, then file tickets under the **LS-1455** epic.
2. **Triage** — pick up tickets from the LS-1455 backlog, implement the fix, validate, and ship a PR.

This skill enforces the **MCP-first principle** from AGENTS.md: shell commands are fallbacks, not defaults.

## When to Use

| Trigger                                         | Phase  |
| ----------------------------------------------- | ------ |
| End of any agent session (workflow step 12b)    | Audit  |
| User asks to audit MCP coverage                 | Audit  |
| User asks to work on MCP tooling improvements   | Triage |
| Processing the LS-1455 epic backlog             | Triage |
| After an audit identifies new gaps to implement | Triage |

---

## Phase 1: Audit (Quick Reference)

> Full procedure: [`references/audit-workflow.md`](references/audit-workflow.md)

1. **Collect** non-MCP Bash commands from the session by running `python scripts/audit-session-bash.py --include-mcp` (parses the full JSONL transcript — survives context compaction). Fallback: manually review conversation history. Skip one-off investigative commands and commands already covered by MCP tools. **Include documented Bash exceptions** — patterns marked as "shell fallback" or "no Nx target equivalent" in AGENTS.md/skill docs are acknowledged gaps, not permanent exemptions
2. **Classify** each as `missing-tool`, `missing-feature`, or `missing-awareness`. Documented exceptions should be classified as `missing-tool` or `missing-feature` as appropriate, with a note that they are currently documented
3. **File `missing-awareness` gaps as doc-fix tickets** — use summary prefix `docs(skills):`, type `Task`, and set parent epic to `LS-1455`. Without a ticket, the same awareness gap recurs across sessions
4. **Check** for existing tickets under LS-1455 (`jira_list_children` or JQL `parent = LS-1455`)
5. **Create** tickets for new gaps using the template in the reference doc
6. **Audit overflows** — review MCP tool calls that exceeded token limits; classify as `agent-error`, `bad-default`, or `missing-parameter`
   6b. **Audit failures** — review MCP tool calls that returned errors (403, path bugs, timeouts, state loss, etc.); classify as `permission-gap`, `bug`, `config-issue`, or `expected-limitation`. **Do NOT dismiss failures as "environmental" or "known" without checking for an existing ticket first.**
   6c. **Audit sweep logic gaps** (after any `sweep-prs` session) — review the sweep for incorrect assumptions or skipped verification steps that caused missed or incorrectly settled PRs:
   - PRs that remained CONFLICTING after rebase — was mergeability actually checked (e.g., by locally merging the base branch into the PR branch and confirming no conflicts) or just assumed to be cache lag?
   - Bot-authored PRs with Copilot `COMMENTED` reviews and 0 unresolved threads — was a fresh Copilot review re-requested?
   - PRs where `statusCheckRollup` had < 3 entries — was a warning raised that CI may not have run on the current SHA?
   - PRs labeled `merge-when-ready` but still showing `reviewDecision: null` — were they checked for the auto-approve chain?

   For each gap found: check if a child ticket under LS-1455 already exists, file one if not (use gap type `missing-awareness` for doc-only fixes, `missing-feature` for behavioral fixes).

7. **Report** findings to the user

---

## Phase 2: Triage (Quick Reference)

> Full procedure: [`references/triage-workflow.md`](references/triage-workflow.md)

1. **Find** the next unblocked To Do ticket under LS-1455 (`jira_list_children(key: "LS-1455", status: "To Do")`)
2. **Understand** the gap type — determines implementation approach:
   - `missing-tool` — add a new tool to the appropriate MCP server
   - `missing-feature` — add a parameter/flag to an existing tool
   - `missing-awareness` / doc gap — update skill docs or AGENTS.md
3. **Implement** following the target MCP server's conventions
4. **Validate** with `make pc`
5. **Ship** — commit, push, create PR, transition Jira to "In Review"

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

### Extraction procedure

1. **Aggregate Bash commands** across all sessions in the project directory:

   ```python
   # One-liner to extract all Bash commands from recent sessions
   python -c "
   import json, collections
   from pathlib import Path
   cmds = collections.Counter()
   for f in Path('~/.claude/projects').expanduser().rglob('*.jsonl'):
       for line in open(f):
           msg = json.loads(line).get('message', {})
           for block in msg.get('content', []):
               if block.get('name') == 'Bash':
                   cmd = block['input']['command'].split()[0]
                   cmds[cmd] += 1
   for cmd, count in cmds.most_common(20):
       print(f'{count:4d}  {cmd}')
   "
   ```

2. **Drill into high-frequency commands** — for each command appearing 5+ times, extract the full command strings to understand patterns:

   ```python
   # Extract full commands for a specific binary (e.g., find)
   python -c "
   import json
   from pathlib import Path
   for f in Path('~/.claude/projects').expanduser().rglob('*.jsonl'):
       for line in open(f):
           msg = json.loads(line).get('message', {})
           for block in msg.get('content', []):
               if block.get('name') == 'Bash' and 'find ' in block['input']['command']:
                   print(block['input']['command'][:120])
   "
   ```

3. **Classify** using the same taxonomy as Phase 1 (Step 2): `missing-tool`, `missing-feature`, `missing-awareness`

### Frequency thresholds

| Threshold    | Action                                                       |
| ------------ | ------------------------------------------------------------ |
| 5+ across N  | Worth investigating — may warrant a ticket                   |
| 20+ across N | **High priority** — file ticket immediately under LS-1455    |
| 50+ across N | **Critical** — likely a systemic gap affecting every session |

### Reporting

After a deep audit, summarize:

- Top 10 Bash commands by frequency
- New gaps discovered (not already tracked under LS-1455)
- Existing gaps whose frequency increased (priority bump candidates)
- Gaps that decreased after recent fixes (effectiveness validation)

---

## Gotchas

- **No duplicate tickets** — always search LS-1455 children first, matching on underlying capability
- **MCP server scope** — each server has a defined domain (see AGENTS.md); don't cross boundaries
- **Overflow != gap** — if the tool works with correct parameters, fix the docs, not the tool
- **No `console.*`** — MCP servers use `process.stderr.write`; never `console.log`
- **Test manually** if possible — restart the MCP server and invoke the new tool to verify
