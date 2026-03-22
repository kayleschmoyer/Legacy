import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { runCommand, getRepoRoot } from './run-command.js';
import { runTarget } from './tools/run-target.js';
import { worktreeCreate } from './tools/worktree-create.js';
import { wtSetup } from './tools/wt-setup.js';

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
    noFrozenLockfile: z
      .boolean()
      .default(false)
      .describe(
        'If true, runs `pnpm install --no-frozen-lockfile` first, then `make install` for ' +
          'Poetry sync and git hooks (the frozen-lockfile pnpm step inside make install is a ' +
          'fast no-op since deps are already resolved). ' +
          'Use when the branch has added new workspace packages that changed the lockfile.',
      ),
  },
  async (params) => wtSetup(params),
);

// --- terraform_fmt ---
server.tool(
  'terraform_fmt',
  'Format Terraform (.tf) files using terraform fmt. Runs in the terraform/ subdirectory ' +
    'of the repo or worktree. Use before committing infrastructure changes.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
    check: z
      .boolean()
      .default(false)
      .describe(
        'If true, check-only mode — lists unformatted files without modifying them.',
      ),
    files: z
      .array(z.string())
      .optional()
      .describe(
        'Specific .tf files to format (relative to terraform/ directory). If omitted, formats all.',
      ),
  },
  async (params) => {
    const baseDir = params.worktreePath || getRepoRoot();
    const terraformDir = join(baseDir, 'terraform');

    // Validate terraform directory exists
    if (!existsSync(terraformDir)) {
      return {
        content: [
          {
            type: 'text',
            text: `Terraform directory not found: ${terraformDir}`,
          },
        ],
        isError: true,
      };
    }

    // Validate file names if provided
    if (params.files) {
      for (const f of params.files) {
        if (!/^[a-zA-Z0-9_.\-\/\\]+\.tf$/.test(f)) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid file name: "${f}". Only .tf files with safe characters are allowed.`,
              },
            ],
            isError: true,
          };
        }

        // Guard against path traversal — resolved path must stay within terraformDir
        const resolved = resolve(terraformDir, f);
        if (!resolved.startsWith(terraformDir)) {
          return {
            content: [
              {
                type: 'text',
                text: `Path traversal rejected: "${f}" resolves outside the terraform directory.`,
              },
            ],
            isError: true,
          };
        }
      }
    }

    const args: string[] = ['fmt'];
    if (params.check) args.push('-check');
    if (params.files) {
      args.push(...params.files);
    }

    try {
      const output = await runCommand('terraform', args, terraformDir, 60_000);
      const formatted = output.trim().split('\n').filter(Boolean);

      const result = params.check
        ? {
            success: true,
            mode: 'check' as const,
            cwd: terraformDir,
            filesChecked: formatted,
            needsFormatting: false,
            message: 'All files are properly formatted.',
          }
        : {
            success: true,
            mode: 'format' as const,
            cwd: terraformDir,
            filesFormatted: formatted,
            message:
              formatted.length > 0
                ? `${formatted.length} file(s) formatted.`
                : 'All files are properly formatted.',
          };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // terraform fmt -check exits non-zero when files need formatting
      if (params.check) {
        const lines = errorMsg.trim().split('\n').filter(Boolean);
        const tfFiles = lines.filter((line) => /\.tf\s*$/.test(line.trim()));

        // If no .tf file paths found, this is a real terraform error — surface it
        if (tfFiles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `terraform fmt -check failed with an unexpected error: ${errorMsg}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  mode: 'check',
                  cwd: terraformDir,
                  filesNeedFormatting: tfFiles.map((f) => f.trim()),
                  needsFormatting: true,
                  message: `${tfFiles.length} file(s) need formatting.`,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `terraform fmt failed: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
