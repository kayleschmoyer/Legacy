# MCP Server Setup Patterns & Implementation

## Pattern A: Standalone npm Module (recommended for most servers)

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

## Pattern B: Nx Project (for servers needing typecheck/lint/test targets)

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

## Entry Point Template (`src/index.ts`)

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

## Split Tool Handlers (for >2 tools)

Create `src/tools/<tool-name>.ts`:

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface MyToolParams {
  param1: string;
  param2?: boolean;
}

export async function myTool(params: MyToolParams): Promise<CallToolResult> {
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

Wire up in `src/index.ts`:

```typescript
import { myTool } from './tools/my-tool.js';

server.tool(
  'my_tool',
  'Description...',
  { param1: z.string().describe('...') },
  async (params) => myTool(params),
);
```

## Cross-Client Registration

### `.vscode/mcp.json`

```json
{
  "inputs": [],
  "servers": {
    "<server-name>": {
      "type": "stdio",
      "command": "node",
      "args": ["--import", "tsx", "tools/mcp/<server-name>/src/index.ts"]
    }
  }
}
```

### `.mcp.json` (CLI-based agents)

```json
{
  "mcpServers": {
    "<server-id>": {
      "command": "pnpm",
      "args": ["exec", "tsx", "tools/mcp/<directory-name>/src/index.ts"]
    }
  }
}
```

> ⚠️ **Server ID ≠ directory name.** The config key (`<server-id>`) may differ from the on-disk directory (`<directory-name>`). Check `.vscode/mcp.json` for the canonical mapping.

**Key differences**:

| Feature         | VS Code agents    | CLI agents        |
| --------------- | ----------------- | ----------------- |
| Top-level key   | `servers`         | `mcpServers`      |
| Transport field | `"type": "stdio"` | Omitted (default) |
| Env var syntax  | `${env:VAR_NAME}` | `${VAR_NAME}`     |

> ⚠️ **Keep all config files in sync.** When adding or removing a server, update all MCP config files (`.vscode/mcp.json`, `.github/copilot/mcp.json`, `.mcp.json`) together.

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
