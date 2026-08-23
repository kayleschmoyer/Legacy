# MCP Gap Triage — Detailed Workflow

Pick up and implement MCP tooling gap tickets from the **current MCP gaps bucket epic**. Each ticket describes a missing or incomplete MCP tool, skill doc, or AGENTS.md gap that an agent identified during a prior session.

## Steps

### 1. Find the next ticket

List child tickets of the current MCP gaps bucket epic filtered to "To Do". First call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` to get the current key, then:

```
jira_list_children(key: <currentKey>, status: "To Do", includeBlockers: true)
```

`includeBlockers` annotates every row with `blocked` / `blockers` in the same request — select the first row with `blocked = no`. Do not follow up with per-ticket `jira_check_blockers` calls, and never delegate the blocker sweep to a subagent. When you have keys but no listing, batch them: `jira_check_blockers({ keys: [...] })`.

### 2. Understand the gap type

Read the ticket description carefully. Gap types determine the implementation approach:

| Gap type            | What to do                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `missing-tool`      | Add a new tool to the appropriate MCP server — **only after the consolidation gate below** |
| `missing-feature`   | Add a parameter/flag or `action` value to an existing MCP tool                             |
| `redundant-tool`    | Consolidate into an existing tool and **deregister** the superseded one                    |
| `missing-awareness` | Update skill docs or AGENTS.md to guide agents to existing tools                           |
| Skill doc gap       | Create or update `.agents/skills/<name>/SKILL.md`                                          |
| AGENTS.md gap       | Update AGENTS.md instructions                                                              |

> **Consolidation gate — run this before implementing any `missing-tool` ticket.** Ask: could this be an `action` value or optional param on an existing tool in the same server? Check the siblings (`docs/mcp/api-reference.html`, or the server's `src/tools/`) rather than trusting the ticket's own classification — tickets filed before LS-9703 never went through the gate. If the answer is yes, re-scope the ticket to `missing-feature` and say so in a comment before writing code. Full rationale: [gaps.md — The Consolidation Gate](gaps.md#the-consolidation-gate).

### 3. Implement the fix

#### For MCP tool additions (`missing-tool`)

1. Identify the target MCP server in `tools/mcp/<server>/`
2. Read existing tool files to understand the pattern (each server has a slightly different structure)
3. Create the new tool following the server's conventions:
   - **Jira server** (`McpServer` API): create `src/tools/<name>.ts`, register in `src/index.ts` with `server.tool()`
   - **Worktree server** (`Server` API): add tool declaration in `ListToolsRequestSchema` handler, add `case` in `CallToolRequestSchema` handler
   - **Nx/Make/CI/DB servers**: follow the specific server's pattern
4. Ensure proper error handling with `isError: true` on failure
5. Return structured JSON responses

#### For MCP feature additions (`missing-feature`)

1. Find the existing tool implementation
2. Add the new parameter to the schema and handler
3. Maintain backwards compatibility (new params should be optional)
4. Where the addition is a new mode of operation rather than a tweak, model it as an `action` enum value instead of another boolean flag — six booleans cost six schema entries, one `.enum()` costs one

#### For consolidations (`redundant-tool`)

Read [mcp-tool-consolidation.md](../../create/references/mcp-tool-consolidation.md) before starting. The short version:

1. Fold the redundant tool's behavior into the surviving tool as an `action` value or widened param
2. **Deregister the superseded tool in the same PR** — a "thin alias" saves zero tokens and is explicitly forbidden
3. Remove it from the **hosted Lambda mirror** too — `lambda.ts` drifts behind `index.ts` (LS-9509); diff the tool literals rather than assuming
4. Update every call site: `.agents/skills/**`, `.claude/commands/**`, `.github/prompts/**`, `.cursor/`, `.opencode/`, `.codex/`, `docs/**`. A dangling pointer is worse than the alias was
5. `make mcp-api-reference` and commit the regenerated docs
6. Record the before/after token delta (`node scripts/mcp-token-measure/measure.mjs --json`) in the PR, and lower the CI ceiling to the new value in the same commit

#### For skill/doc updates

1. Follow existing skill doc conventions (frontmatter with `name`, `description`)
2. Use step-by-step format with clear headings
3. Include "When to Use", "Steps", and "Gotchas" sections

### 4. Validate

- **Code changes**: Run `make pc` in the worktree — must pass before pushing
- **Docs-only changes**: Verify markdown renders correctly

### 5. Ship

Follow the standard workflow:

1. Commit with conventional message: `feat(mcp): ...` or `docs(skills): ...`
2. Push with `--force-with-lease`
3. Create PR with `gh pr create` or `github_open_pr`
4. Transition Jira ticket to "In Review"

## Gotchas

- **Check for duplicates** — some tickets may already be done under a different key. Search for similar summaries before implementing.
- **MCP server scope** — each server has a defined domain. Don't add git tools to the DB server or Jira tools to the worktree server.
- **No `console.*`** — MCP servers use `process.stderr.write` for startup errors; never use `console.log`.
- **Test the tool manually** if possible — restart the MCP server and invoke the new tool to verify it works.
