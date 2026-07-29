import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { affected } from './tools/affected.js';
import { checkPackageHealth } from './tools/check-package-health.js';
import { depGraph } from './tools/dep-graph.js';
import { installPackage } from './tools/install-package.js';
import { jobList, jobStatus, jobWait } from './tools/job-tools.js';
import { runAffected } from './tools/run-affected.js';
import { runE2ESpecs } from './tools/run-e2e-specs.js';
import {
  runESLint,
  MAX_FILES as ESLINT_MAX_FILES,
} from './tools/run-eslint.js';
import { runPcChunk, PC_CHUNKS } from './tools/run-pc-chunk.js';
import {
  runPrettier,
  MAX_FILES as PRETTIER_MAX_FILES,
} from './tools/run-prettier.js';
import { runTarget } from './tools/run-target.js';
import { showProject } from './tools/show-project.js';
import { showProjects } from './tools/show-projects.js';

const server = new McpServer({
  name: 'legacy-sports-nx',
  version: '1.0.0',
});

// --- Input validation patterns ---
// npm package names: optional @scope/ prefix, then alphanumeric/hyphens/dots/underscores
const NPM_NAME_REGEX = /^(@[a-z0-9\-._]+\/)?[a-z0-9\-._]+$/;
// Semver-ish: digits.digits.digits with optional pre-release/build, or dist-tags like "latest", "next"
const VERSION_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-+_^~>=<!* ]*$/;
// Absolute path: Windows (C:\... or C:/...) or Unix (/...)
const ABSOLUTE_PATH_REGEX = /^([A-Za-z]:[/\\]|\/)/;

// --- nx_affected ---
server.tool(
  'nx_affected',
  'Show affected projects. Optionally filter by target.',
  {
    target: z
      .string()
      .optional()
      .describe('Filter to projects with this target'),
    base: z
      .string()
      .default('origin/main')
      .describe('Base ref (default: origin/main)'),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => affected(params),
);

// --- nx_check_package_health ---
server.tool(
  'nx_check_package_health',
  'Scan for package issues: nested node_modules, wildcard ranges, missing overrides, missing @types/.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => checkPackageHealth(params),
);

// --- nx_dep_graph ---
server.tool(
  'nx_dep_graph',
  'Query dependency graph: what a project depends on or what depends on it.',
  {
    project: z.string().describe('Project name'),
    direction: z
      .enum(['dependencies', 'dependents'])
      .default('dependencies')
      .describe('"dependencies" or "dependents"'),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => depGraph(params),
);

// --- nx_install_package ---
server.tool(
  'nx_install_package',
  'Prefer this over running `pnpm add -w` (or `pnpm add -Dw` for dev dependencies) via shell. Refuses if node_modules is a symlink. Checks for @types/ companion. Install an npm package at workspace root. ' +
    'Fast installs return in one call; an install still running after ~45s returns { status: "running", jobId } — poll nx_job_wait({ jobId }), do NOT re-run (re-invoking joins the in-flight install).',
  {
    name: z
      .string()
      .regex(NPM_NAME_REGEX, 'Invalid npm package name')
      .describe('Package name'),
    version: z
      .string()
      .regex(VERSION_REGEX, 'Invalid version or dist-tag')
      .optional()
      .describe('Version (default: latest)'),
    dev: z.boolean().default(false).describe('Install as devDependency'),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => installPackage(params),
);

// --- nx_run ---
// NOTE: The allowed-targets list in this description must stay in sync with
// ALLOWED_TARGETS in tools/run-target.ts (the canonical enforcement source).
server.tool(
  'nx_run',
  'Prefer this over `pnpm exec nx run <project>:<target>` via shell. Run an Nx target on a project. Allowed: build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, integration, storybook, format. Colon-suffixed variants of an allowed target (e.g. test:web, test:mobile) are also accepted. ' +
    'Fast targets return pass/fail output in one call. A run still going after ~45s returns { status: "running", jobId } instead of blocking into the ~60s MCP transport timeout — call nx_job_wait({ jobId }) to continue waiting; do NOT re-run (re-invoking joins the in-flight run).',
  {
    project: z.string().describe('Project name'),
    target: z.string().describe('Target to run'),
    configuration: z.string().optional().describe('Named configuration'),
    noCache: z.boolean().default(false).describe('Bypass Nx cache'),
    updateSnapshot: z
      .boolean()
      .default(false)
      .describe(
        'Update Jest snapshots (appends --updateSnapshot). Only applies to the "test" target.',
      ),
    args: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Extra flags after "--" (e.g. ["--verbose"] for verbose output). Array preferred; string split on whitespace. ' +
          'For multiple test patterns, pipe is preferred: ["--testPathPatterns", "FileA|FileB"]. ' +
          'Separate array elements also work: ["--testPathPatterns", "FileA", "FileB"] — on Windows these are automatically coalesced into a single pipe-separated token.',
      ),
    env: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Environment variables to set for the command (e.g. { "PLAYWRIGHT_GREP": "@regression" }).',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => runTarget(params),
);

// --- nx_run_affected ---
// NOTE: The allowed-targets list in this description must stay in sync with
// ALLOWED_TARGETS in tools/run-affected.ts (the canonical enforcement source).
server.tool(
  'nx_run_affected',
  'Prefer this over `pnpm exec nx affected -t <target>` via shell. Run an Nx target on all affected projects. Allowed: build, test, lint, typecheck, codegen. ' +
    'A run still going after ~45s returns { status: "running", jobId } — call nx_job_wait({ jobId }) to continue waiting; do NOT re-run (re-invoking joins the in-flight run).',
  {
    target: z.string().describe('Target to run on affected projects'),
    base: z
      .string()
      .default('origin/main')
      .describe('Base ref (default: origin/main)'),
    fix: z.boolean().default(false).describe('Pass --fix for lint target'),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => runAffected(params),
);

// --- nx_show_project ---
server.tool(
  'nx_show_project',
  'Inspect a project: root, targets, tags, type.',
  {
    project: z.string().describe('Project name'),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => showProject(params),
);

// --- nx_show_projects ---
server.tool(
  'nx_show_projects',
  'List Nx projects. Filter by affected, target, or tag.',
  {
    affected: z
      .boolean()
      .default(false)
      .describe('Only affected projects vs origin/main'),
    withTarget: z
      .string()
      .optional()
      .describe('Filter to projects with this target'),
    tag: z.string().optional().describe('Nx tag filter'),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => showProjects(params),
);

// --- nx_run_e2e_specs ---
server.tool(
  'nx_run_e2e_specs',
  'Prefer this over raw `npx playwright test` shell commands. ' +
    'Hermetic mode (default): runs specs from src/tests/ against a local static build, ' +
    'auto-selects a free E2E_PORT, and forces E2E_AUTH_MODE=ci (no OAuth needed). ' +
    'Requires dist/apps/web — run nx_run({ project: "web", target: "build" }) first if missing. ' +
    'Integration mode (integration: true): runs specs from src/integration/tests/ against the live backend ' +
    '(api.legacy-fantasy.com) with workers=1 to avoid throttling. ' +
    'Checks e2e JWT freshness (~/.legacy-sports/e2e-token.json) and E2EPOOLPASSWORD before launching. ' +
    'Set withTracing: true to enable Playwright tracing; trace.zip paths are returned in traceArtifacts. ' +
    'Returns a compact summary: pass/fail counts, failing test details, and (integration only) graphqlErrors and traceArtifacts. ' +
    'A run still going after ~45s returns { status: "running", jobId } — call nx_job_wait({ jobId }) for the same structured summary once done; do NOT re-run (re-invoking joins the in-flight run).',
  {
    specs: z
      .array(z.string())
      .min(1)
      .describe(
        'Spec file paths relative to apps/web-e2e/ (e.g. ["src/tests/roster-management.spec.ts"] for hermetic, ' +
          '"src/integration/tests/league.spec.ts" for integration). Absolute paths are also accepted.',
      ),
    project: z
      .string()
      .default('chromium')
      .describe(
        'Playwright project/browser to run against. Allowed: chromium, firefox, webkit, Mobile Chrome, Mobile Safari (default: chromium).',
      ),
    grep: z
      .string()
      .optional()
      .describe(
        'Filter tests by title regex (Playwright --grep). E.g. "@critical" or "should show roster".',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
    integration: z
      .boolean()
      .optional()
      .describe(
        'When true, runs specs against the live backend using playwright.integration.config.ts instead of the hermetic config. ' +
          'Enforces workers=1. Checks JWT freshness and E2EPOOLPASSWORD before launching.',
      ),
    withTracing: z
      .boolean()
      .optional()
      .describe(
        'When true (and integration: true), enables Playwright tracing (--trace=on). ' +
          'Trace zip paths are returned in traceArtifacts for post-run inspection.',
      ),
  },
  async (params) => runE2ESpecs(params),
);

// --- nx_run_pc_chunk ---
server.tool(
  'nx_run_pc_chunk',
  'Prefer this over `make pc-<chunk>` via shell for cloud agents. Run a single pre-commit ' +
    'validation chunk. Chunks must run IN ORDER: pc-db-prep → pc-typecheck → pc-format → ' +
    'pc-lint → pc-workflows → pc-test → pc-build. Fast chunks return structured pass/fail ' +
    'output in one call. A chunk still running after ~45s returns { status: "running", jobId } ' +
    'instead of blocking into the ~60s MCP transport timeout — the chunk keeps running in the ' +
    'background; call nx_job_wait({ jobId }) to continue waiting. Do NOT re-run the chunk: ' +
    're-invoking while it runs joins the in-flight job.',
  {
    chunk: z
      .enum(PC_CHUNKS)
      .describe(
        'Pre-commit validation chunk to run. One of: ' + PC_CHUNKS.join(', '),
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree path (default: repo root)'),
    verbose: z
      .boolean()
      .optional()
      .describe(
        'When true, include the full raw output (up to 30k chars) in the response instead of the ' +
          'default compact summary. Default false: prettier per-file listings (pc-format) are collapsed ' +
          'to a count, and the step body (e.g. eslint output for pc-lint) is truncated to 20 lines with a ' +
          'note to run the step directly for the rest. Use verbose: true only when you need the complete ' +
          'output for debugging.',
      ),
    maxWorkers: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Cap Jest worker parallelism for the pc-test chunk by passing MAXWORKERS=<n>, which the pc-test ' +
          'recipe forwards to `nx affected -t test` as `-- --maxWorkers=<n>`. Use on memory-constrained ' +
          'machines to avoid "Fatal process out of memory: Zone" crashes (with "spawn UNKNOWN" in ' +
          'jest-worker) from full-parallelism Jest workers across every affected project — that failure ' +
          'signature means retry pc-test with a lower maxWorkers, not that the code under test regressed. ' +
          'E.g. maxWorkers: 2. Ignored by chunks other than pc-test.',
      ),
  },
  async (params) => runPcChunk(params),
);

// --- nx_run_prettier ---
server.tool(
  'nx_run_prettier',
  'Prefer this over raw `pnpm exec prettier --check/--write <files>` via shell, and over ' +
    'nx_run_pc_chunk({ chunk: "pc-format" }) when you only need a small, explicit file list ' +
    '(e.g. fixing Prettier drift in 1-3 files after a rebase). Runs prettier --check or --write ' +
    'against exactly the given files — never the whole repo diff — so it carries none of ' +
    "pc-format's auto-amend-already-pushed-commit risk (LS-8367) or full per-file-listing " +
    `overflow risk (LS-8423). Capped at ${PRETTIER_MAX_FILES} files — for broader formatting use ` +
    'nx_run_pc_chunk({ chunk: "pc-format" }) instead.',
  {
    files: z
      .array(z.string())
      .min(1)
      .describe(
        'File paths (relative to worktreePath/repo root, or absolute) to check or format.',
      ),
    mode: z
      .enum(['check', 'write'])
      .default('check')
      .describe(
        '"check" reports formatting issues without modifying files (default); "write" reformats in place.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => runPrettier(params),
);

// --- nx_run_eslint ---
server.tool(
  'nx_run_eslint',
  'Prefer this over raw `pnpm exec eslint <files>` via shell when you need to lint a small, ' +
    'explicit file list. Runs eslint --max-warnings=0 — the same threshold as the nx lint ' +
    'target — against exactly the given files, and from the nearest directory owning an ' +
    "eslint.config.* so the project's flat config actually applies (ESLint 9 resolves flat " +
    'config from its cwd, not per file). A file list spanning two config roots is rejected — ' +
    `split it into one call per root. Capped at ${ESLINT_MAX_FILES} files. ` +
    'IMPORTANT — this is NOT a fast path in this repo: every TS config here enables type-aware ' +
    'rules via parserOptions.project, so ESLint builds a full TypeScript program before linting ' +
    'even one file. Measured in lambdas/db: one file 4m40s vs the whole project 4m42s — scoping ' +
    'saves ~2s of ~280s. That cost is per-run, not per-file. Use this when ' +
    'you want a narrow report; use nx_run({ project, target: "lint" }) for a whole project (it ' +
    'is Nx-cached) and nx_run_pc_chunk({ chunk: "pc-lint" }) for the repo. Note: typecheck ' +
    'cannot be file-scoped at all — tsc rejects explicit source files combined with -p — so use ' +
    'nx_run({ target: "typecheck" }) for project-granular type checking.',
  {
    files: z
      .array(z.string())
      .min(1)
      .describe(
        'File paths (relative to worktreePath/repo root, or absolute) to lint. All files must live under the same eslint.config.* root.',
      ),
    mode: z
      .enum(['check', 'fix'])
      .default('check')
      .describe(
        '"check" reports lint errors without modifying files (default); "fix" applies eslint --fix in place.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => runESLint(params),
);

// --- nx_job_status ---
server.tool(
  'nx_job_status',
  'Cheap, instant snapshot of a background job started by a job-backed nx tool ' +
    '(nx_run_pc_chunk, nx_run, nx_run_affected, nx_run_e2e_specs, nx_install_package). Returns ' +
    '{ status, elapsedSec, logTail } while running (never an error), or the final ' +
    'pass/fail output once done. Use nx_job_wait to block until completion.',
  {
    jobId: z
      .string()
      .describe('Job ID returned by a { status: "running" } result'),
  },
  async (params) => jobStatus(params),
);

// --- nx_job_wait ---
server.tool(
  'nx_job_wait',
  'Wait for a background job to finish, bounded at 55s per call (stays under the MCP ' +
    'transport timeout). If the job is still running when the wait expires, returns a ' +
    '{ status: "running" } snapshot with logTail — re-invoke to continue waiting. ' +
    'Never re-run the underlying command while a job is in progress.',
  {
    jobId: z
      .string()
      .describe('Job ID returned by a { status: "running" } result'),
    maxWaitMs: z.coerce
      .number()
      .int()
      .positive()
      .max(55_000)
      .optional()
      .describe('Max wait per call in ms (default and cap: 55000)'),
  },
  async (params) => jobWait(params),
);

// --- nx_job_list ---
server.tool(
  'nx_job_list',
  'List recent background jobs (newest first), including jobs started by a previous ' +
    'MCP server process. Use after a session resume or lost tool result to recover a ' +
    'job handle instead of re-running validation.',
  {},
  async () => jobList(),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
