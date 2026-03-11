---
name: create-mcp-server
description: 'Create a new MCP (Model Context Protocol) server under tools/mcp/; covers directory structure, Nx project vs standalone setup, SDK patterns (McpServer class + StdioServerTransport), tool registration with Zod schemas, .vscode/mcp.json registration, build/typecheck configuration, and README conventions. Load this skill before adding any new MCP server to the repo.'
---

# Skill: Create a New MCP Server

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

### Pattern A: Standalone npm Module (recommended for most servers)

Simpler setup — no Nx project registration needed. The server runs via `tsx` directly.

**`package.json`**:

```json
{
  "name": "legacy-sports-mcp-<server-name>",
  "private": true,
  "type": "module"
}
```

**`tsconfig.json`**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

### Pattern B: Nx Project (for servers needing typecheck/lint/test targets)

Use this when the server should participate in `nx affected` workflows.

**`project.json`**:

```json
{
  "name": "mcp-<server-name>",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tools/mcp/<server-name>/src",
  "projectType": "application",
  "tags": ["scope:tool", "platform:node"],
  "targets": {
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p tools/mcp/<server-name>/tsconfig.lib.json"
      }
    }
  }
}
```

**`tsconfig.json`** (Nx variant):

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.lib.json" }]
}
```

**`tsconfig.lib.json`**:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}
```

**`.eslintrc.json`**:

```json
{
  "extends": ["../../../.eslintrc.json"],
  "ignorePatterns": ["!**/*", "dist", "node_modules"],
  "overrides": [
    {
      "files": ["*.ts"],
      "parserOptions": {
        "project": ["tools/mcp/<server-name>/tsconfig.*?.json"]
      }
    }
  ]
}
```

## Steps

### 1. Create the Directory

```powershell
New-Item -ItemType Directory -Path "tools/mcp/<server-name>/src/tools" -Force
```

### 2. Create package.json

Use Pattern A (standalone) or Pattern B (Nx project) from above.

### 3. Create the Entry Point (`src/index.ts`)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'legacy-sports-<server-name>',
  version: '1.0.0',
});

// --- tool_name ---
server.tool(
  'tool_name',
  'Description of what the tool does. Be specific — agents read this to decide when to call it.',
  {
    // Zod schema for parameters
    param1: z.string().describe('What this parameter is for'),
    param2: z.boolean().default(false).describe('Optional flag with default'),
  },
  async (params) => {
    // Tool implementation
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ success: true, data: '...' }),
        },
      ],
    };
  },
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 4. Implement Tool Handlers

For servers with more than 2 tools, split handlers into `src/tools/<tool-name>.ts`:

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface MyToolParams {
  param1: string;
  param2?: boolean;
}

export async function myTool(params: MyToolParams): Promise<CallToolResult> {
  // Implementation
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true }),
      },
    ],
  };
}
```

Then import and wire up in `src/index.ts`:

```typescript
import { myTool } from './tools/my-tool.js';

server.tool(
  'my_tool',
  'Description...',
  { param1: z.string().describe('...') },
  async (params) => myTool(params),
);
```

### 5. Register in `.vscode/mcp.json`

Add the server to `.vscode/mcp.json` so VS Code discovers it:

```json
{
  "inputs": [],
  "servers": {
    "<server-name>": {
      "type": "stdio",
      "command": "pnpm",
      "args": ["exec", "tsx", "tools/mcp/<server-name>/src/index.ts"]
    }
  }
}
```

**Command conventions**:

- Use `pnpm exec tsx` (not `npx tsx`) — consistent with repo conventions
- Path is relative to the workspace root
- Transport is always `stdio` for local MCP servers

### 6. Add a README

Create `tools/mcp/<server-name>/README.md`:

```markdown
# MCP <Server Name>

<One-line description of what the server provides.>

## Tools

- **tool_name** — description
- **another_tool** — description

## How It Works

<Brief explanation of implementation approach.>
```

### 7. Update the MCP README Index

Add the new server to `tools/mcp/README.md`.

### 8. Test the Server

Verify the server starts and responds to tool listing:

```powershell
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | pnpm exec tsx tools/mcp/<server-name>/src/index.ts
```

Or restart VS Code and check that the server appears in the MCP panel.

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

Always return structured JSON in the `text` field:

```typescript
return {
  content: [
    {
      type: 'text',
      text: JSON.stringify({ success: true, key: 'LS-1234' }),
    },
  ],
};
```

For errors, set `isError: true`:

```typescript
return {
  content: [{ type: 'text', text: 'Error message here' }],
  isError: true,
};
```

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
| Server crashes silently               | Run manually in terminal to see stderr: `pnpm exec tsx tools/mcp/<name>/src/index.ts`           |
| `@modelcontextprotocol/sdk` not found | Run `make install` — package is at workspace root                                               |
