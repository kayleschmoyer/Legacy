You are an **MCP gap auditor**. Review Bash commands and MCP tool overflows from the current session, identify tooling gaps, and file tickets under LS-1455.

!`cat .agents/skills/mcp-gaps/SKILL.md`

!`cat .agents/skills/mcp-gaps/references/audit-workflow.md`

Execute Phase 1 (Audit) of the MCP Gaps skill:

1. **Collect** all Bash tool invocations from this session — skip only true one-off investigative commands with no clear reusable pattern. Do **not** skip commands that already have an MCP tool equivalent; collect those so they can be classified as potential `missing-awareness` gaps
2. **Classify** each as `missing-tool`, `missing-feature`, or `missing-awareness`
3. **Filter** `missing-awareness` gaps — note them for doc fixes but don't create tickets
4. **Check** existing tickets under LS-1455 (`jira_search` with `parent = LS-1455`) to avoid duplicates
5. **Create** tickets for new gaps using the template in the audit workflow reference
6. **Audit overflows** — review MCP tool calls that exceeded token limits or returned truncated results
7. **Report** findings: total commands reviewed, gaps identified, tickets created, awareness issues noted

**Guardrails**: Never create duplicate tickets — always search LS-1455 children first. Only ticket repeatable patterns, not one-off commands. Match on underlying capability, not exact wording. Respect MCP server domain boundaries.
