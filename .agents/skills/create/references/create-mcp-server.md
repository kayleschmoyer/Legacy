# Create a New MCP Server

## Overview

MCP servers live at `tools/mcp/<server-name>/` and expose structured tool interfaces for AI agents via the [Model Context Protocol](https://modelcontextprotocol.io). They run locally over **stdio** transport, invoked by VS Code's MCP client. Each server is a standalone TypeScript module executed with `tsx`.

## When to Use

- Adding a new MCP server to the repo
- Wrapping an existing CLI tool, API, or service for agent use
- Providing structured, validated tool access to a domain (DB, Jira, git, etc.)

## Prerequisites

- `@modelcontextprotocol/sdk` is installed at the workspace root (already present)
- `zod` is installed at the workspace root (already present)
- `tsx` is available via pnpm (already present)

## Directory Structure

```
tools/mcp/
├── README.md                    # Index of all MCP servers
├── <server-name>/
│   ├── src/
│   │   ├── index.ts             # Entry point — creates McpServer + registers tools
│   │   └── tools/               # One file per tool (recommended for >2 tools)
│   │       ├── my-action.ts
│   │       └── another-action.ts
│   ├── package.json             # Minimal: name, private, type: module
│   ├── tsconfig.json            # Extends base or standalone ES2022/NodeNext
│   └── README.md                # What the server does + tool list
```

## Two Setup Patterns

| Pattern                         | When                                       | Config                                                    |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **A: Standalone** (recommended) | Simple servers, no Nx targets              | `package.json` + `tsconfig.json` only                     |
| **B: Nx Project**               | Needs typecheck/lint/test in `nx affected` | Add `project.json`, `tsconfig.lib.json`, `.eslintrc.json` |

> Full config templates for both patterns: [mcp-setup-patterns.md](mcp-setup-patterns.md)

## Steps

1. **Create directory**: `New-Item -ItemType Directory -Path "tools/mcp/<server-name>/src/tools" -Force`
2. **Create package.json**: Use Pattern A or B from reference
3. **Create entry point** (`src/index.ts`): McpServer + StdioServerTransport + tool registrations (see reference for template)
4. **Split tool handlers** (>2 tools): One file per tool in `src/tools/`
5. **Register in `.vscode/mcp.json`**: Use `node --import tsx` as command (`.CMD` wrappers fail on Windows)
   - Also register in `.mcp.json` and `.github/copilot/mcp.json` — keep all in sync
6. **Add README**: `tools/mcp/<server-name>/README.md` with tool list
7. **Update MCP index**: Add to `tools/mcp/README.md`
8. **Test**: Run manually or restart VS Code to verify MCP panel

## Tool Design Guidelines

### Naming

- Tool names use **snake_case** with a domain prefix: `jira_create_ticket`, `db_query`, `worktree_list`
- Server names use **kebab-case**: `jira-server`, `db-server`, `worktree-server`

### Descriptions

Write tool descriptions as if an agent reads them to decide when to call the tool. Be specific about:

- What the tool does
- Any safety constraints (e.g., "READ-ONLY by default")
- What it replaces (e.g., "Avoids the acli --json duplication bug")

### Parameters

- Use Zod schemas for all parameters
- Add `.describe()` to every parameter
- Use `.default()` for sensible defaults
- Use `.optional()` for truly optional params
- Use `.enum()` to constrain string values

### Return Values

Return structured JSON in `text` field. Set `isError: true` for errors. See [mcp-setup-patterns.md](mcp-setup-patterns.md) for examples.

### Safety

- Default to **read-only** for data access tools — require explicit opt-in for writes
- Validate inputs before executing destructive operations
- Use timeouts on shell commands (`execFile` with `timeout` option)
- Never expose secrets in tool output

## Shared Utilities

If your server needs to:

| Need                       | Pattern                                                      |
| -------------------------- | ------------------------------------------------------------ |
| Run shell commands         | See `db-server/src/run-command.ts` — `execFile` with timeout |
| Connect to PostgreSQL      | See `db-server/src/db-connection.ts` — lazy `postgres` pool  |
| Call Jira REST API         | See `jira-server/src/jira-api.ts` — fetch with Basic Auth    |
| Read Atlassian credentials | See `jira-server/src/netrc.ts` — parse `~/.netrc`            |
| Run acli commands          | See `jira-server/src/acli.ts` — `execFile` wrapper           |

Copy and adapt these patterns rather than importing across MCP servers — each server should be self-contained.

## Troubleshooting

| Problem                               | Fix                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Server doesn't appear in VS Code      | Check `.vscode/mcp.json` syntax · Reload VS Code (`Developer: Reload Window`)                   |
| `Cannot find module` at runtime       | Ensure `.js` extensions in imports (ESM requirement) · Check `"type": "module"` in package.json |
| Tool parameters not validated         | Ensure Zod schemas match expected types · Check `.describe()` on all params                     |
| Server crashes silently               | Run manually in terminal to see stderr: `node --import tsx tools/mcp/<name>/src/index.ts`       |
| `@modelcontextprotocol/sdk` not found | Run `make install` — package is at workspace root                                               |
| `spawn pnpm ENOENT` (Windows)         | Use `node --import tsx` as command — `.CMD` wrappers fail without a shell                       |
