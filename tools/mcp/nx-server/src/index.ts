import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { affected } from './tools/affected.js';
import { checkPackageHealth } from './tools/check-package-health.js';
import { depGraph } from './tools/dep-graph.js';
import { installPackage } from './tools/install-package.js';
import { runAffected } from './tools/run-affected.js';
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
  'Install an npm package at workspace root. Refuses if node_modules is a junction. Checks for @types/ companion.',
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
  'Run an Nx target on a project. Allowed: build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, integration, storybook.',
  {
    project: z.string().describe('Project name'),
    target: z.string().describe('Target to run'),
    configuration: z.string().optional().describe('Named configuration'),
    noCache: z.boolean().default(false).describe('Bypass Nx cache'),
    args: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Extra flags after "--" (e.g. ["-u"] for snapshots). Array preferred; string split on whitespace.',
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
  'Run an Nx target on all affected projects. Allowed: build, test, lint, typecheck, codegen.',
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

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
