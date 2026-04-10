import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { runCommand, getRepoRoot } from './run-command.js';
import { runTarget } from './tools/run-target.js';
import { worktreeCreate } from './tools/worktree-create.js';
import { wtSetup } from './tools/wt-setup.js';
import {
  terraformStatePull,
  terraformStatePush,
  terraformStateMv,
  terraformStateList,
  terraformStateRm,
  terraformStateMvBatch,
} from './tools/terraform-state.js';

// Absolute path: Windows (C:\... or C:/...) or Unix (/...)
const ABSOLUTE_PATH_REGEX = /^([A-Za-z]:[/\\]|\/)/;

const server = new McpServer({
  name: 'legacy-sports-make',
  version: '1.0.0',
});

// --- make_run ---
server.tool(
  'make_run',
  'Prefer this over `make <target>` via shell. Run a whitelisted Makefile target. Covers: pc, build, test, lint, typecheck, format, codegen, install, kill-stale, etc. ' +
    'NOTE: runner-apply has an interactive confirmation prompt — always pass variables="NO_CONFIRM=1" when invoking it, ' +
    'otherwise the process will block waiting for stdin. runner-apply also runs terraform plan+apply and may take 10+ minutes.',
  {
    target: z.string().describe('Make target'),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree or working directory (default: repo root)'),
    variables: z
      .string()
      .optional()
      .describe('Make variables, e.g. "DRYRUN=1 FORCE=1"'),
  },
  async (params) => runTarget(params),
);

// --- make_worktree_create ---
server.tool(
  'make_worktree_create',
  'Prefer this over `make worktree` via shell. Create a new git worktree for a Jira ticket. Runs `make worktree TICKET=... DESC=...` ' +
    'which creates the branch, worktree directory, and registers the parent dependency. ' +
    'After creation, run make_wt_setup to install dependencies. ' +
    'IMPORTANT: Use this instead of `make worktree` via Bash — it validates inputs ' +
    'and provides structured output with next steps. ' +
    'NOTE: When using a stacked parent (PARENT=...), the parent branch must already be ' +
    'pushed to origin — the script will fail fast with a clear message if it is not.',
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
  'Prefer this over `make wt-setup` via shell. Set up a worktree: junction node_modules, copy .env, configure .twig, install hooks. Run after worktree creation.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .describe('Absolute worktree path'),
    removeJunction: z
      .boolean()
      .default(false)
      .describe('Remove junction and install independent node_modules'),
    noFrozenLockfile: z
      .boolean()
      .default(false)
      .describe(
        'Run pnpm install --no-frozen-lockfile first (for new workspace packages)',
      ),
  },
  async (params) => wtSetup(params),
);

// --- terraform_gen_tfvars ---
server.tool(
  'terraform_gen_tfvars',
  'Generate terraform/secrets.auto.tfvars from environment variables. ' +
    'Reads GOOGLE_OAUTH_CLIENT_SECRET, JWT_SECRET_KEY, OAUTH_PROXY_COOKIE_SECRET, ' +
    'JIRA_CLIENT_ID/SECRET/CLOUD_ID (or JIRA_CREDENTIALS), ROLLBAR_ACCESS_TOKEN, ' +
    'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DISCORD_* and CLOUDFLARE_* vars. ' +
    'Safe to re-run — always overwrites. Use checkOnly to validate without writing.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Repo or worktree root (default: repo root)'),
    checkOnly: z
      .boolean()
      .default(false)
      .describe('Report missing vars without writing the file'),
  },
  async (params) => {
    const baseDir = params.worktreePath || getRepoRoot();
    const scriptPath = join(baseDir, 'scripts', 'gen-tfvars.js');

    if (!existsSync(scriptPath)) {
      return {
        content: [{ type: 'text', text: `Script not found: ${scriptPath}` }],
        isError: true,
      };
    }

    const extraArgs: string[] = [];
    if (params.checkOnly) extraArgs.push('--check');
    // dryRun is intentionally not exposed via MCP — it would print secret values
    // into tool output. Use checkOnly to validate vars without leaking values.

    try {
      const output = await runCommand(
        'node',
        [scriptPath, ...extraArgs],
        baseDir,
        30_000,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, output }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          { type: 'text', text: `terraform_gen_tfvars failed:\n${errorMsg}` },
        ],
        isError: true,
      };
    }
  },
);

// --- terraform_fmt ---
server.tool(
  'terraform_fmt',
  'Format .tf files in the terraform/ subdirectory.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree path (default: repo root)'),
    check: z
      .boolean()
      .default(false)
      .describe('Check-only mode (no modifications)'),
    files: z
      .array(z.string())
      .optional()
      .describe('Specific .tf files (relative to terraform/)'),
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

// --- terraform_state_pull ---
server.tool(
  'terraform_state_pull',
  'Pull the current Terraform state JSON from the remote backend. ' +
    'Equivalent to `terraform -chdir=<dir> state pull`. ' +
    'Returns the raw Terraform state JSON text; clients must parse it if they need an object. ' +
    'Use `dir` as a relative path like "terraform/main" or "terraform/runners", or an absolute path. ' +
    'Security warning: Terraform state commonly contains sensitive values such as provider credentials, tokens, and secrets, and MCP tool output may be persisted in logs or transcripts. Only use this tool when you explicitly need the full state contents.',
  {
    dir: z
      .string()
      .describe(
        'Terraform working directory, e.g. "terraform/main" or "terraform/runners". ' +
          'Relative to repo root, or absolute.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe(
        'Repo or worktree root (default: repo root). Used to resolve relative `dir` values.',
      ),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    return terraformStatePull({ dir: params.dir, repoRoot });
  },
);

// --- terraform_state_push ---
server.tool(
  'terraform_state_push',
  'Push a Terraform state JSON to the remote backend. ' +
    'Equivalent to `terraform -chdir=<dir> state push <state-file>`. ' +
    'The state is written to a temp file and pushed. ' +
    'CAUTION: This overwrites the remote state — always pull first and verify.',
  {
    dir: z
      .string()
      .describe(
        'Terraform working directory, e.g. "terraform/main" or "terraform/runners".',
      ),
    stateJson: z
      .string()
      .describe(
        'Full Terraform state as a JSON string (from terraform_state_pull).',
      ),
    force: z
      .boolean()
      .default(false)
      .describe(
        'Pass -force to bypass serial number check. Use only when you are certain the state is correct.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Repo or worktree root (default: repo root).'),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    return terraformStatePush({
      dir: params.dir,
      stateJson: params.stateJson,
      force: params.force,
      repoRoot,
    });
  },
);

// --- terraform_state_mv ---
server.tool(
  'terraform_state_mv',
  'Move a resource in Terraform state. ' +
    'Equivalent to `terraform -chdir=<dir> state mv <source> <destination>`. ' +
    'Use to rename resources or move them between modules without destroying/recreating.',
  {
    dir: z
      .string()
      .describe(
        'Terraform working directory, e.g. "terraform/main" or "terraform/runners".',
      ),
    source: z
      .string()
      .describe(
        'Source resource address, e.g. "aws_lambda_function.old_name".',
      ),
    destination: z
      .string()
      .describe(
        'Destination resource address, e.g. "aws_lambda_function.new_name".',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Repo or worktree root (default: repo root).'),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    return terraformStateMv({
      dir: params.dir,
      source: params.source,
      destination: params.destination,
      repoRoot,
    });
  },
);

// --- terraform_state_list ---
server.tool(
  'terraform_state_list',
  'List resources in Terraform state. ' +
    'Equivalent to `terraform -chdir=<dir> state list [<address>]`. ' +
    'Omit `address` to list all resources; provide an address to filter.',
  {
    dir: z
      .string()
      .describe(
        'Terraform working directory, e.g. "terraform/main" or "terraform/runners".',
      ),
    address: z
      .string()
      .optional()
      .describe(
        'Optional resource address filter, e.g. "aws_lambda_function.graphql". ' +
          'Supports partial module paths.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Repo or worktree root (default: repo root).'),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    return terraformStateList({
      dir: params.dir,
      address: params.address,
      repoRoot,
    });
  },
);

// --- terraform_state_rm ---
server.tool(
  'terraform_state_rm',
  'Remove a resource from Terraform state (does NOT destroy the real infrastructure). ' +
    'Equivalent to `terraform -chdir=<dir> state rm <address>`. ' +
    'Use `dryRun: true` to preview what would be removed without modifying state.',
  {
    dir: z
      .string()
      .describe(
        'Terraform working directory, e.g. "terraform/main" or "terraform/runners".',
      ),
    address: z
      .string()
      .describe(
        'Resource address to remove, e.g. "aws_lambda_function.old_resource".',
      ),
    dryRun: z
      .boolean()
      .default(false)
      .describe(
        'Pass -dry-run to preview removal without modifying state. Recommended before destructive removes.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Repo or worktree root (default: repo root).'),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    return terraformStateRm({
      dir: params.dir,
      address: params.address,
      dryRun: params.dryRun,
      repoRoot,
    });
  },
);

// --- terraform_state_mv_batch ---
server.tool(
  'terraform_state_mv_batch',
  'Batch-move resources in Terraform state. ' +
    'Accepts up to 200 { from, to } pairs and runs them sequentially. ' +
    'All pairs are attempted even if earlier ones fail; returns per-pair success/error results. ' +
    'Use for bulk module renames or resource restructuring.',
  {
    dir: z
      .string()
      .describe(
        'Terraform working directory, e.g. "terraform/main" or "terraform/runners".',
      ),
    moves: z
      .array(
        z.object({
          from: z.string().describe('Source resource address'),
          to: z.string().describe('Destination resource address'),
        }),
      )
      .min(1)
      .max(200)
      .describe('Array of { from, to } address pairs to move sequentially.'),
    batchTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .default(300)
      .describe(
        'Overall timeout for the entire batch in seconds (default: 300). ' +
          'If elapsed time exceeds this limit before all moves complete, ' +
          'remaining moves are skipped with a timeout error and partial results are returned.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Repo or worktree root (default: repo root).'),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    return terraformStateMvBatch({
      dir: params.dir,
      moves: params.moves,
      batchTimeoutSeconds: params.batchTimeoutSeconds,
      repoRoot,
    });
  },
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
