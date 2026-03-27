---
name: mcp-gaps
description: 'Identify and implement MCP tooling gaps. Phase 1 (Audit): run after shipping a PR to review Bash commands and MCP overflows from the session, filing tickets under LS-1455. Phase 2 (Triage): pick up and implement LS-1455 backlog tickets. Load when finishing ticket work (audit) or working through the AI Workspace Improvements backlog (triage).'
---

# Skill: MCP Gaps

## Overview

Two-phase workflow for closing MCP tooling gaps:

1. **Audit** — after every agent session, review Bash commands and MCP tool overflows to identify gaps, then file tickets under the **LS-1455** epic.
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

1. **Collect** non-MCP Bash commands from the session (skip one-off investigative commands and commands already covered by MCP tools). **Include documented Bash exceptions** — patterns marked as "shell fallback" or "no Nx target equivalent" in AGENTS.md/skill docs are acknowledged gaps, not permanent exemptions
2. **Classify** each as `missing-tool`, `missing-feature`, or `missing-awareness`. Documented exceptions should be classified as `missing-tool` or `missing-feature` as appropriate, with a note that they are currently documented
3. **Filter** `missing-awareness` gaps — these are doc fixes, not tool gaps
4. **Check** for existing tickets under LS-1455 (`jira_list_children` or JQL `parent = LS-1455`)
5. **Create** tickets for new gaps using the template in the reference doc
6. **Audit overflows** — review MCP tool calls that exceeded token limits; classify as `agent-error`, `bad-default`, or `missing-parameter`
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

## Gotchas

- **No duplicate tickets** — always search LS-1455 children first, matching on underlying capability
- **MCP server scope** — each server has a defined domain (see AGENTS.md); don't cross boundaries
- **Overflow != gap** — if the tool works with correct parameters, fix the docs, not the tool
- **No `console.*`** — MCP servers use `process.stderr.write`; never `console.log`
- **Test manually** if possible — restart the MCP server and invoke the new tool to verify
