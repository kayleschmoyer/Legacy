import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runTarget } from './tools/run-target.js';
import { wtSetup } from './tools/wt-setup.js';
import { worktreeCreate } from './tools/worktree-create.js';

const ABSOLUTE_PATH_REGEX = /^([A-Za-z]:\\|\/)/;

const server = new McpServer({
  name: 'legacy-sports-make',
  version: '1.0.0',
});

// --- make_run ---
server.tool(
  'make_run',
  'Run a Makefile target in the specified directory. Targets are whitelisted for safety. ' +
    'Covers: validation (pc, quick-check), build, test, lint, typecheck, format, codegen, ' +
    'install, clean-safe, kill-stale, diagnose, and more. ' +
    'Prefer this over running `make` via Bash — it enforces the target whitelist and ' +
    'sets appropriate timeouts for heavy targets like pc and install.',
  {
    target: z
      .string()
      .describe(
        'Make target to run (e.g., "pc", "install", "build", "test", "lint-fix", "typecheck", "kill-stale").',
      ),
    cwd: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'cwd must be an absolute path')
      .optional()
      .describe(
        'Absolute path to run the make target in. Typically a worktree path. ' +
          'If omitted, uses the repo root where this server lives.',
      ),
    variables: z
      .string()
      .optional()
      .describe(
        'Optional make variables as a space-separated string (e.g., "DRYRUN=1", "FORCE=1"). ' +
          'Each must be KEY=VALUE format.',
      ),
  },
  async (params) => runTarget(params),
);

// --- make_wt_setup ---
server.tool(
  'make_wt_setup',
  'Set up a worktree for development: creates node_modules junction, copies .env, ' +
    'configures .twig, and installs git hooks. Optionally removes the junction and ' +
    'installs independent node_modules (needed when the branch has different dependencies). ' +
    'Run this after make_worktree_create or worktree_create.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .describe(
        'Absolute path to the worktree directory (e.g., "D:\\code\\legacy-sports-worktrees\\LS-1234-fix-scoring").',
      ),
    removeJunction: z
      .boolean()
      .default(false)
      .describe(
        'If true, removes the node_modules junction and runs `make install` to create ' +
          'independent node_modules in the worktree. Use when the branch has added/removed ' +
          'packages or when you need isolated dependencies.',
      ),
  },
  async (params) => wtSetup(params),
);

// --- make_worktree_create ---
server.tool(
  'make_worktree_create',
  'Create a new git worktree for a Jira ticket. Runs `make worktree TICKET=... DESC=...` ' +
    'which creates the branch, worktree directory, and registers the parent dependency. ' +
    'After creation, run make_wt_setup to install dependencies. ' +
    'IMPORTANT: Use this instead of `make worktree` via Bash — it validates inputs ' +
    'and provides structured output with next steps.',
  {
    ticket: z
      .string()
      .describe('Jira ticket key or number (e.g., "LS-1234" or "1234").'),
    description: z
      .string()
      .describe(
        'Short kebab-case description for the branch name (e.g., "fix-scoring", "add-draft-ui"). ' +
          'No spaces — use hyphens.',
      ),
    parent: z
      .string()
      .optional()
      .describe(
        'Parent branch to base off (e.g., "LS-507/fix-scoring" for stacked branches). ' +
          'Defaults to "main" if omitted.',
      ),
  },
  async (params) => worktreeCreate(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
