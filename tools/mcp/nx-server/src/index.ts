import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { showProjects } from './tools/show-projects.js';
import { showProject } from './tools/show-project.js';
import { affected } from './tools/affected.js';
import { runTarget } from './tools/run-target.js';
import { runAffected } from './tools/run-affected.js';
import { depGraph } from './tools/dep-graph.js';
import { installPackage } from './tools/install-package.js';
import { checkPackageHealth } from './tools/check-package-health.js';

const server = new McpServer({
  name: 'legacy-sports-nx',
  version: '1.0.0',
});

// --- nx_show_projects ---
server.tool(
  'nx_show_projects',
  'List Nx projects in the workspace. Optionally filter by affected status, target availability, or substring tag match. Use to discover which projects exist before running targets.',
  {
    affected: z
      .boolean()
      .default(false)
      .describe(
        'If true, only return projects affected by current changes vs origin/main.',
      ),
    withTarget: z
      .string()
      .optional()
      .describe(
        'Only return projects that have this target (e.g., "build", "test", "codegen").',
      ),
    tag: z
      .string()
      .optional()
      .describe(
        'Nx tag filter passed to --tag (e.g., "scope:lib", "scope:lambda").',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => showProjects(params),
);

// --- nx_show_project ---
server.tool(
  'nx_show_project',
  'Inspect a single Nx project: its root path, targets (with executors and dependsOn), tags, and project type. Use to understand what targets are available before running them.',
  {
    project: z
      .string()
      .describe('Nx project name (e.g., "web", "db", "scoring").'),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => showProject(params),
);

// --- nx_affected ---
server.tool(
  'nx_affected',
  'Show which projects are affected by current changes. Optionally filter to projects that have a specific target. Use before running builds/tests to scope work correctly.',
  {
    target: z
      .string()
      .optional()
      .describe(
        'Only return affected projects that have this target (e.g., "test", "build").',
      ),
    base: z
      .string()
      .default('origin/main')
      .describe('Git ref to compare against (default: origin/main).'),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => affected(params),
);

// --- nx_run ---
server.tool(
  'nx_run',
  'Run an Nx target on a specific project. Allowed targets: build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, storybook. Use for single-project operations.',
  {
    project: z
      .string()
      .describe('Nx project name (e.g., "web", "db", "scoring").'),
    target: z
      .string()
      .describe(
        'Target to run (e.g., "build", "test", "typecheck", "lint", "codegen").',
      ),
    configuration: z
      .string()
      .optional()
      .describe(
        'Named configuration to use (e.g., "production"). Omit for defaults.',
      ),
    noCache: z
      .boolean()
      .default(false)
      .describe(
        'If true, bypasses the Nx cache (--skip-nx-cache). Use when cache may be stale.',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => runTarget(params),
);

// --- nx_run_affected ---
server.tool(
  'nx_run_affected',
  'Run an Nx target on all affected projects. Allowed targets: build, test, lint, typecheck, codegen. This is the equivalent of `pnpm exec nx affected -t <target> --base=origin/main`.',
  {
    target: z
      .string()
      .describe(
        'Target to run on affected projects (e.g., "build", "test", "typecheck").',
      ),
    base: z
      .string()
      .default('origin/main')
      .describe('Git ref to compare against (default: origin/main).'),
    fix: z
      .boolean()
      .default(false)
      .describe(
        'If true and target is "lint", passes --fix to auto-fix lint errors.',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => runAffected(params),
);

// --- nx_dep_graph ---
server.tool(
  'nx_dep_graph',
  'Query the Nx dependency graph for a project. Returns either what the project depends on ("dependencies") or what depends on it ("dependents"). Use to understand impact before making changes.',
  {
    project: z
      .string()
      .describe('Nx project name to query (e.g., "scoring", "db-client").'),
    direction: z
      .enum(['dependencies', 'dependents'])
      .default('dependencies')
      .describe(
        'Direction: "dependencies" = what this project depends on, "dependents" = what depends on this project.',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => depGraph(params),
);

// --- Input validation patterns ---
// npm package names: optional @scope/ prefix, then alphanumeric/hyphens/dots/underscores
const NPM_NAME_REGEX = /^(@[a-z0-9\-._]+\/)?[a-z0-9\-._]+$/;
// Semver-ish: digits.digits.digits with optional pre-release/build, or dist-tags like "latest", "next"
const VERSION_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-+_^~>=<!* ]*$/;
// Absolute path: Windows (C:\...) or Unix (/...)
const ABSOLUTE_PATH_REGEX = /^([A-Za-z]:\\|\/)/;

// --- nx_install_package ---
server.tool(
  'nx_install_package',
  'Install an npm package safely in the pnpm monorepo. Enforces junction-aware safety: refuses to install if node_modules is a junction, scans for nested node_modules duplicates in lib/*, checks if @types/ companion is needed. All packages are installed at the workspace root (-w flag).',
  {
    name: z
      .string()
      .regex(NPM_NAME_REGEX, 'Invalid npm package name')
      .describe(
        'Package name to install (e.g., "lodash", "@tanstack/react-query").',
      ),
    version: z
      .string()
      .regex(VERSION_REGEX, 'Invalid version or dist-tag')
      .optional()
      .describe(
        'Specific version to install (e.g., "4.17.21"). Omit for latest.',
      ),
    dev: z
      .boolean()
      .default(false)
      .describe(
        'If true, install as a devDependency (-D flag). Use for build/test tools, @types/ packages, etc.',
      ),
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => installPackage(params),
);

// --- nx_check_package_health ---
server.tool(
  'nx_check_package_health',
  'Scan the workspace for package health issues: nested node_modules in lib/* (version duplication), wildcard dependency ranges in workspace packages, missing pnpm.overrides entries, and missing @types/ companions. Use after installing packages or to diagnose runtime crashes caused by duplicate package versions.',
  {
    worktreePath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'worktreePath must be an absolute path')
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => checkPackageHealth(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
