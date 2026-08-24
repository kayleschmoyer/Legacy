import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { minifiedJson } from '@legacy-sports/mcp-format';
import { z } from 'zod';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { getRepoRoot, runCommand } from './run-command.js';
import { runTarget } from './tools/run-target.js';
import { runCustomChecks } from './tools/run-custom-checks.js';
import { validatePR } from './tools/validate-pr.js';
import { makeRunStatus, makeRunWait } from './tools/make-run-bg.js';
import { worktreeCreate } from './tools/worktree-create.js';
import { wtSetup } from './tools/wt-setup.js';
import {
  terraformStateList,
  terraformStateMvBatch,
  terraformStatePull,
  terraformStatePush,
  terraformStateRm,
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
  'Prefer this over `make <target>` via shell. Run a whitelisted Makefile target (pc, build, test, lint, ' +
    'typecheck, format, codegen, install, kill-stale, ...). A target still running after ~45s returns ' +
    '{ status: "running", jobId }; call make_run_wait({ jobId }) to keep waiting and do NOT re-run it. ' +
    'The pc pipeline also runs as ordered chunks (pc-db-prep, pc-typecheck, pc-format, pc-lint, pc-workflows, ' +
    'pc-test, pc-build) — equivalent to `pc` only when all run in that order. ' +
    'runner-apply prompts interactively: always pass variables="NO_CONFIRM=1". ' +
    'Target details and per-environment validation: .agents/skills/repo-tooling/SKILL.md.',
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
    maxWorkers: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Cap Jest worker parallelism on test-bearing targets (MAXWORKERS=<n>). Use on memory-constrained ' +
          'machines: an out-of-memory crash with "spawn UNKNOWN" in jest-worker means retry lower, not a real ' +
          'test regression. No effect on non-test targets.',
      ),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Runaway backstop in ms, not a transport guard. Defaults 600000 for heavy targets, 300000 otherwise; ' +
          'pass 900000 for `pc` on a cold cache. On timeout the result carries { timedOut: true }.',
      ),
    runInBackground: z
      .boolean()
      .optional()
      .describe(
        'Return a { jobId } immediately instead of waiting out the ~45s sync budget. The default already ' +
          'backgrounds safely; this only skips the initial wait. Follow with make_run_wait/make_run_status.',
      ),
    verbose: z
      .boolean()
      .optional()
      .describe(
        'Return full raw output (up to 30k chars) instead of the compact summary, which collapses prettier ' +
          'file listings to a count and truncates each step body to 20 lines.',
      ),
  },
  async (params) => runTarget(params),
);

// --- make_run_status ---
server.tool(
  'make_run_status',
  'Get the current status and output of a background make_run job. ' +
    'Returns instantly: { status: "running" | "done" | "failed", ... }. ' +
    'For heavy targets (pc, pre-commit, full-check) also returns structured step results on completion.',
  {
    jobId: z
      .string()
      .describe(
        'Job ID from a make_run / validate_pr result (status: "running")',
      ),
  },
  (params) => makeRunStatus(params),
);

// --- make_run_wait ---
server.tool(
  'make_run_wait',
  'Wait for a background make_run job to complete. ' +
    'Blocks until the job finishes or maxWaitMs elapses (default 50000, capped at 55000 to stay under the ~60s MCP transport timeout). ' +
    'If the job is still running when the wait expires, returns status: "running" — re-call to continue waiting. ' +
    'On completion returns the full structured result (step results for pc/pre-commit/full-check).',
  {
    jobId: z
      .string()
      .describe(
        'Job ID from a make_run / validate_pr result (status: "running")',
      ),
    maxWaitMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum milliseconds to block (default: 50000, max: 55000). ' +
          'Capped at 55000 to stay under the ~60s MCP transport timeout in cloud sessions.',
      ),
  },
  async (params) => makeRunWait(params),
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
  'Prefer this over `make wt-setup` via shell. Set up a worktree: symlink node_modules, copy .env, configure .twig, install hooks. Run after worktree creation.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .describe('Absolute worktree path'),
    removeSymlink: z
      .boolean()
      .default(false)
      .describe('Remove symlink and install independent node_modules'),
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
    const repoRoot = resolve(getRepoRoot());
    const baseDir = resolve(params.worktreePath || repoRoot);
    const scriptPath = resolve(baseDir, 'scripts', 'gen-tfvars.js');

    // Containment: the script we execute with `node` must live inside the repo
    // root and be exactly scripts/gen-tfvars.js — never an arbitrary file
    // reached via a crafted worktreePath (e.g. an absolute path or `..`
    // traversal pointing at attacker-controlled code). path.resolve has already
    // collapsed any `..`, so a relative() that escapes the repo root means the
    // worktreePath pointed outside it.
    const relToRoot = relative(repoRoot, scriptPath);
    if (
      relToRoot.startsWith('..') ||
      isAbsolute(relToRoot) ||
      scriptPath !== join(baseDir, 'scripts', 'gen-tfvars.js')
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Refused: worktreePath must resolve within the repository root; "${scriptPath}" is outside ${repoRoot}.`,
          },
        ],
        isError: true,
      };
    }

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
            text: minifiedJson({ success: true, output }),
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
        if (!/^[a-zA-Z0-9_.\-/\\]+\.tf$/.test(f)) {
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
            text: minifiedJson(result),
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
              text: minifiedJson({
                success: false,
                mode: 'check',
                cwd: terraformDir,
                filesNeedFormatting: tfFiles.map((f) => f.trim()),
                needsFormatting: true,
                message: `${tfFiles.length} file(s) need formatting.`,
              }),
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
  'Move one or more resources in Terraform state. ' +
    'Accepts 1–200 { from, to } pairs and runs them sequentially. ' +
    'Pass a single-element array to move one resource. ' +
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

// --- ci_run_custom_checks ---
server.tool(
  'ci_run_custom_checks',
  "Discover and run this repo's own `.github/checks/*.sh` custom-check scripts locally — the same scripts the 🚀 CI Pipeline / custom-checks job runs " +
    '(ci-failure-capture-tests.sh, format-check-pipefail-tests.sh, integration-select-tests.sh, etc.). Each script is a cheap, self-contained `node --test` ' +
    'runner with no external deps. Prefer this over raw `bash .github/checks/<name>.sh` or `node --test <path>` via shell — it discovers every script ' +
    'automatically and reports pass/fail per script in one call, instead of stopping at the first failure the way the CI step does. ' +
    'Running the relevant check before pushing catches failures (e.g. a missing e2e-surface-map.json entry) that would otherwise cost a CI round-trip. ' +
    'Pass `scripts` to run a named subset (e.g. ["integration-select-tests"] — the .sh suffix is optional); omit it to run every discovered script.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree or repo root (default: repo root)'),
    scripts: z
      .array(z.string())
      .optional()
      .describe(
        'Named subset of check scripts to run, by basename (e.g. "integration-select-tests" or "integration-select-tests.sh"). ' +
          'Omit to run every script under .github/checks/*.sh. Unknown names return an error listing the available scripts.',
      ),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Per-script timeout in milliseconds (default: 120000).'),
  },
  async (params) => runCustomChecks(params),
);

// --- make_ping ---
server.tool(
  'make_ping',
  'Check if the make server can locate make, the repo root, and the Makefile. Returns ready status, make version, repo root path, and whether the Makefile exists. Use this to verify the server is operational before using other make_* tools.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree or working directory (default: repo root)'),
  },
  async (params) => {
    const repoRoot = params.worktreePath || getRepoRoot();
    const makefileExists = existsSync(join(repoRoot, 'Makefile'));

    let makeVersion: string | undefined;
    let makeError: string | undefined;
    try {
      // shell: true — bare `make` on Windows is commonly resolved via a
      // .cmd/.bat shim that execFile cannot launch without a shell (LS-9153).
      const out = await runCommand(
        'make',
        ['--version'],
        repoRoot,
        10_000,
        true,
      );
      makeVersion = out.split('\n')[0]?.trim();
    } catch (err) {
      makeError = err instanceof Error ? err.message : String(err);
    }

    const ready = !makeError && makefileExists;
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ready,
            repoRoot,
            makefileExists,
            makeVersion,
            ...(makeError ? { makeError } : {}),
          }),
        },
      ],
    };
  },
);

// --- validate_pr ---
server.tool(
  'validate_pr',
  'Semantic one-shot for the mandatory migrate-before-pc gate: checks DB migration status → applies pending migrations → runs make pc. ' +
    'Guarantees the AGENTS.md invariant order and short-circuits on migration failure (does not run pc on a broken DB). ' +
    'Returns { migrations: { applied, pending, needsMigration }, pc: { passed, steps, errors } }. ' +
    'The default runs make pc as a background job with a ~45s bounded wait: if pc is still running the result is ' +
    '{ pc: { status: "running", jobId } } — poll with make_run_wait({ jobId }), never re-invoke while it runs. ' +
    'runPcInBackground: true skips the bounded wait and returns the jobId immediately. ' +
    'Use sanctionedChunks: true to run the seven pc steps individually (pc-db-prep → pc-typecheck → pc-format → pc-lint → pc-workflows → pc-test → pc-build); ' +
    'each call is budgeted to ~45s and may return { pc: { status: "in_progress", ... } } with resume instructions ' +
    '(re-invoke with startAtChunk, or make_run_wait a still-running chunk job) — never restart validation from scratch.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree or repo root (default: repo root)'),
    sanctionedChunks: z
      .boolean()
      .optional()
      .describe(
        'Run the seven pc chunks individually instead of make pc (timeout-resilient for cloud sessions). ' +
          'Runs as many chunks as fit in a ~45s budget, then returns an in_progress result with resume instructions. ' +
          'Ignored when runPcInBackground: true.',
      ),
    startAtChunk: z
      .enum([
        'pc-db-prep',
        'pc-typecheck',
        'pc-format',
        'pc-lint',
        'pc-workflows',
        'pc-test',
        'pc-build',
      ])
      .optional()
      .describe(
        'Resume sanctioned-chunk validation at this chunk (implies sanctionedChunks: true; skips the ' +
          'migration check — it ran in the initial call). Use the value from a previous in_progress result.',
      ),
    runPcInBackground: z
      .boolean()
      .optional()
      .describe(
        'Spawn make pc as a background job and return immediately with a { jobId } instead of waiting out ' +
          'the ~45s sync budget. Use make_run_wait({ jobId }) to poll for completion. ' +
          'The default already backgrounds make pc safely — this flag just skips the initial bounded wait.',
      ),
  },
  async (params) => validatePR(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
