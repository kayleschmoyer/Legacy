#!/usr/bin/env node
/**
 * Guard against the "mandated Makefile target missing from make_run's
 * allowlist" defect class (LS-10152; prior instances LS-9642, LS-9027).
 *
 * Shape of the defect: a skill or AGENTS.md tells an agent to run
 * `make <target>` (or shows a `make_run({ target: "<target>" })` example) as
 * a required or MCP-first-recommended step, but ALLOWED_TARGETS in
 * tools/mcp/make-server/src/tools/run-target.ts was never updated to include
 * it — so the only reachable path for that target is the raw Bash fallback
 * the MCP-first principle exists to avoid.
 *
 * Not every Makefile target mentioned in a skill is meant to be MCP-reachable
 * though — long-running dev servers, destructive/interactive local-only
 * flows, and targets superseded by a dedicated MCP tool are intentionally
 * excluded. EXPECTED_LOCAL_ONLY below is that explicit, reviewable exception
 * list (each entry documents *why*, mirroring how ALLOWED_TARGETS documents
 * why a target *is* reachable). A target mentioned in AGENTS.md or
 * .agents/skills/**\/*.md must be in one list or the other — anything left
 * over is exactly the LS-10152 defect shape, waiting to be discovered again
 * the hard way (a refused make_run call mid-session) instead of at review
 * time.
 *
 * Usage:
 *   node scripts/check-mandated-make-targets.mjs
 *
 * Make target: `make lint-mandated-make-targets`.
 * CI: .github/checks/mandated-make-targets.sh runs this on every PR.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Makefile targets that are legitimately never reachable through
 * `make_run` — each reason is the thing a reviewer would otherwise have to
 * rediscover before approving the ALLOWED_TARGETS addition this check would
 * otherwise demand.
 */
export const EXPECTED_LOCAL_ONLY = {
  'apply-ruleset':
    'owner-gated admin action (live GitHub ruleset PUT needing admin gh auth); not agent-reachable',
  'check-services':
    'checks locally-running dev servers; not meaningful in a headless MCP session',
  clean:
    'more destructive than the already-allowed clean-safe/clean-cache; intentionally not agent-reachable',
  'db-dump':
    'dumps prod RDS to S3; needs AWS access outside the MCP make-server sandbox',
  'db-dump-dev': "needs AWS (per the target's own doc comment)",
  'db-restore':
    'destructively overwrites the local Docker postgres instance; read paths go through the legacy-sports-db MCP server instead',
  'db-restore-dev':
    'destructively overwrites the local Docker postgres instance; read paths go through the legacy-sports-db MCP server instead',
  'db-tunnel':
    "opens a long-running foreground SSM tunnel; incompatible with make_run's bounded execution model",
  'deploy-lambdas':
    'production-impacting deploy; routed through the dedicated aws-server MCP tools (see the deploy skill), not make_run',
  dev: 'long-running foreground dev server process',
  'dev-db': 'long-running foreground dev server process',
  'dev-graphql': 'long-running foreground dev server process',
  'dev-mobile': 'long-running foreground dev server process',
  'dev-storybook': 'long-running foreground dev server process',
  'dev-web': 'long-running foreground dev server process',
  'docker-up': 'starts long-running Docker Compose services in the background',
  'e2e-auth':
    'AGENTS.md: "Agents cannot complete the interactive handshake — the human user must run this"',
  'force-clean':
    'Windows-local file-lock recovery; not applicable to MCP/cloud sessions',
  graphiql: 'long-running foreground dev server process',
  'modules-gc':
    'mutates the shared node_modules pool across worktrees; recovery flows call scripts/modules-pool/link.mjs directly',
  'modules-link':
    'mutates the shared node_modules pool across worktrees; recovery flows call scripts/modules-pool/link.mjs directly',
  pr: 'wraps the local-only twig CLI; superseded by the github_open_pr MCP tool',
  'rebase-tree': 'superseded by the dedicated worktree_rebase* MCP tools',
  'rebase-tree-auto': 'superseded by the dedicated worktree_rebase* MCP tools',
  'rebase-tree-skip': 'superseded by the dedicated worktree_rebase* MCP tools',
  'runner-lambdas-sync':
    'infrastructure-mutating; routed through dedicated terraform_*/aws-server MCP tools',
  'runner-plan':
    'infrastructure-mutating; routed through dedicated terraform_*/aws-server MCP tools',
  'ship-pr':
    'wraps the local-only twig CLI + gh CLI; superseded by github_* MCP tool calls',
  'sync-env':
    'may sync environment secrets; not appropriate for blanket MCP exposure',
  'sync-worktrees':
    'regenerates the local VS Code multi-root workspace file; a local-launcher-only concept',
  'sync-worktrees-add':
    'regenerates the local VS Code multi-root workspace file; a local-launcher-only concept',
  'sync-worktrees-remove':
    'regenerates the local VS Code multi-root workspace file; a local-launcher-only concept',
  'terraform-apply':
    'infrastructure-mutating and interactively prompts for confirmation',
  'terraform-plan':
    'infrastructure-mutating; routed through the dedicated terraform_plan MCP tool',
  'update-theme-baseline':
    'regenerates a ratchet baseline that needs human review of the diff before committing (same caution as mcp-tool-budget --update-budget)',
  'update-workflow-schemas':
    'fetches external vendored SchemaStore schemas over the network; the --check-only read path is already covered by lint-workflows',
  worktree: 'superseded by the dedicated make_worktree_create MCP tool',
  'wt-setup': 'superseded by the dedicated make_wt_setup MCP tool',
};

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** All documented Makefile target names (`<target>: ## ...` lines). */
export function extractMakefileTargets(text) {
  const targets = new Set();
  for (const m of text.matchAll(/^([A-Za-z0-9_-]+):.*##/gm)) {
    targets.add(m[1]);
  }
  return targets;
}

/**
 * ALLOWED_TARGETS from run-target.ts, parsed as text rather than imported
 * (it's TypeScript with no build step in this script's runtime). Extracts
 * every quoted string between the `ALLOWED_TARGETS = new Set([` opener and
 * its closing `]);`.
 */
export function extractAllowedTargets(text) {
  const start = text.indexOf('const ALLOWED_TARGETS = new Set([');
  if (start === -1) return null;
  const end = text.indexOf(']);', start);
  if (end === -1) return null;
  const body = text.slice(start, end);
  const allowed = new Set();
  for (const m of body.matchAll(/'([a-zA-Z0-9_-]+)'/g)) {
    allowed.add(m[1]);
  }
  return allowed;
}

/**
 * Find every `make <target>` and `make_run({ target: "<target>" ... })`
 * mention in markdown text whose <target> is a real Makefile target.
 * Returns { target, line }[] (1-indexed line numbers).
 */
export function findMandatedTargetMentions(text, validTargets) {
  const lines = text.split('\n');
  const mentions = [];
  const pattern =
    /\bmake[ _]run\(\{[^}]*?target:\s*["']([\w-]+)["']|\bmake\s+([a-zA-Z][\w-]*)/g;
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(pattern)) {
      const target = m[1] ?? m[2];
      if (target && validTargets.has(target)) {
        mentions.push({ target, line: idx + 1 });
      }
    }
  });
  return mentions;
}

/** Recursively list markdown files under a directory. */
function markdownFilesUnder(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...markdownFilesUnder(path));
    } else if (name.endsWith('.md')) {
      files.push(path);
    }
  }
  return files;
}

function main() {
  const makefileText = readFileSync(join(repoRoot, 'Makefile'), 'utf8');
  const validTargets = extractMakefileTargets(makefileText);

  const runTargetPath = join(
    repoRoot,
    'tools/mcp/make-server/src/tools/run-target.ts',
  );
  const allowedTargets = extractAllowedTargets(
    readFileSync(runTargetPath, 'utf8'),
  );
  if (!allowedTargets) {
    fail(
      `${relative(repoRoot, runTargetPath)}: could not locate ALLOWED_TARGETS definition`,
    );
  }

  // Exceptions must name real, current Makefile targets — otherwise a
  // rename/removal leaves a stale, unverifiable entry behind.
  const staleExceptions = Object.keys(EXPECTED_LOCAL_ONLY).filter(
    (t) => !validTargets.has(t),
  );
  if (staleExceptions.length > 0) {
    fail(
      `EXPECTED_LOCAL_ONLY in scripts/check-mandated-make-targets.mjs names target(s) that no ` +
        `longer exist in the Makefile: ${staleExceptions.join(', ')}. Remove the stale entries.`,
    );
  }

  const sources = [
    join(repoRoot, 'AGENTS.md'),
    ...markdownFilesUnder(join(repoRoot, '.agents', 'skills')),
  ];

  /** @type {Map<string, {file: string, line: number}[]>} */
  const violations = new Map();

  for (const file of sources) {
    const mentions = findMandatedTargetMentions(
      readFileSync(file, 'utf8'),
      validTargets,
    );
    for (const { target, line } of mentions) {
      if (allowedTargets.has(target)) continue;
      if (target in EXPECTED_LOCAL_ONLY) continue;
      const rel = relative(repoRoot, file);
      const existing = violations.get(target) ?? [];
      existing.push({ file: rel, line });
      violations.set(target, existing);
    }
  }

  if (violations.size === 0) {
    console.log(
      `✓ every mandated Makefile target referenced in AGENTS.md / .agents/skills/**/*.md is either ` +
        `in make_run's ALLOWED_TARGETS (${allowedTargets.size} target(s)) or explicitly documented ` +
        `as local-only (${Object.keys(EXPECTED_LOCAL_ONLY).length} exception(s))`,
    );
    process.exit(0);
  }

  console.log(
    `Found ${violations.size} Makefile target(s) mandated by AGENTS.md or a skill but missing from ` +
      `both make_run's ALLOWED_TARGETS and EXPECTED_LOCAL_ONLY:\n`,
  );
  for (const [target, locations] of [...violations.entries()].sort()) {
    console.log(`  - "${target}"`);
    for (const { file, line } of locations) {
      console.log(`      ${file}:${line}`);
    }
  }
  console.log(
    '\nEither add each target to ALLOWED_TARGETS in tools/mcp/make-server/src/tools/run-target.ts ' +
      '(if it should be MCP-reachable), or add it to EXPECTED_LOCAL_ONLY in ' +
      'scripts/check-mandated-make-targets.mjs with a one-line reason (if it should not be). ' +
      'This is the LS-10152 recurrence guard — see its AC3.\n',
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
