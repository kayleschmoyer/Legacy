# MCP Gap Triage — Detailed Workflow

Pick up and implement MCP tooling gap tickets from the **current MCP gaps bucket epic**. Each ticket describes a missing or incomplete MCP tool, skill doc, or AGENTS.md gap that an agent identified during a prior session.

## Steps

### 1. Find the next ticket

List child tickets of the current MCP gaps bucket epic filtered to "To Do". First call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` to get the current key, then:

```
jira_list_children(key: <currentKey>, status: "To Do")
```

Select the first unblocked ticket. Check blockers with `jira_check_blockers`.

### 2. Understand the gap type

Read the ticket description carefully. Gap types determine the implementation approach:

| Gap type            | What to do                                                       |
| ------------------- | ---------------------------------------------------------------- |
| `missing-tool`      | Add a new tool to the appropriate MCP server                     |
| `missing-feature`   | Add a parameter/flag to an existing MCP tool                     |
| `missing-awareness` | Update skill docs or AGENTS.md to guide agents to existing tools |
| Skill doc gap       | Create or update `.agents/skills/<name>/SKILL.md`                |
| AGENTS.md gap       | Update AGENTS.md instructions                                    |

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
3. Create PR with `gh pr create` or `github_create_pr`
4. Transition Jira ticket to "In Review"

## Gotchas

- **Check for duplicates** — some tickets may already be done under a different key. Search for similar summaries before implementing.
- **MCP server scope** — each server has a defined domain. Don't add git tools to the DB server or Jira tools to the worktree server.
- **No `console.*`** — MCP servers use `process.stderr.write` for startup errors; never use `console.log`.
- **Test the tool manually** if possible — restart the MCP server and invoke the new tool to verify it works.
