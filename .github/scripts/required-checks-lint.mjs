#!/usr/bin/env node
/**
 * required-checks-lint.mjs
 *
 * Validates naming discipline between .github/ruleset.json required checks
 * and the GitHub Actions workflow jobs that provide them.
 *
 * Three assertions:
 *  1. Every required check context in ruleset.json has a matching job name
 *     (or a .github/checks/*.sh script) so checks can never be "Expected" but
 *     never-run due to a name typo.
 *  2. No workflow containing a required-check job has paths:/paths-ignore:
 *     filters at the pull_request trigger level — such filters cause the check
 *     to be skipped on PRs that don't touch those paths, creating stuck checks.
 *  3. Every required-check job has timeout-minutes <= 30.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const CHECKS_DIR = join(ROOT, '.github', 'checks');
const RULESET_FILE = join(ROOT, '.github', 'ruleset.json');
const MAX_REQUIRED_JOB_TIMEOUT = 30;

let passed = 0;
let failed = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
  passed++;
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed++;
}

// ── Load required check contexts from ruleset.json ───────────────────────────

function loadRequiredContexts() {
  const raw = JSON.parse(readFileSync(RULESET_FILE, 'utf8'));
  const contexts = [];
  for (const rule of raw.rules ?? []) {
    if (rule.type === 'required_status_checks' && !rule._staged) {
      for (const check of rule.parameters?.required_status_checks ?? []) {
        if (typeof check.context === 'string') {
          contexts.push(check.context);
        }
      }
    }
  }
  return contexts;
}

// ── Parse a workflow YAML file ────────────────────────────────────────────────
//
// Simple line-by-line state machine. Only handles standard 2-space-indented
// GitHub Actions YAML (sufficient for this repo's workflow files).

function parseWorkflow(text) {
  /** @type {Record<string, { name: string|null, timeoutMinutes: number|null }>} */
  const jobs = {};
  const onPullRequest = { hasPaths: false, hasPathsIgnore: false };

  let inOn = false;
  let inPullRequest = false;
  let inJobs = false;
  let currentJob = null;

  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;

    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (indent === 0) {
      // YAML's `on` keyword is used as a top-level key in GitHub Actions workflows.
      // We match the literal text form because we're doing text-level parsing.
      inOn =
        line === 'on:' ||
        line.startsWith('on: ') ||
        line === "'on':" ||
        line === '"on":';
      inJobs = line === 'jobs:';
      inPullRequest = false;
      currentJob = null;
      continue;
    }

    if (indent === 2 && inOn) {
      inPullRequest =
        line === 'pull_request:' || line.startsWith('pull_request: ');
      continue;
    }

    if (indent === 4 && inOn && inPullRequest) {
      if (line === 'paths:' || line.startsWith('paths: '))
        onPullRequest.hasPaths = true;
      if (line === 'paths-ignore:' || line.startsWith('paths-ignore: '))
        onPullRequest.hasPathsIgnore = true;
      continue;
    }

    if (indent === 2 && inJobs) {
      const m = line.match(/^([\w-]+):\s*$/);
      if (m) {
        currentJob = m[1];
        jobs[currentJob] = { name: null, timeoutMinutes: null };
      }
      continue;
    }

    if (indent === 4 && inJobs && currentJob) {
      const nameM = line.match(/^name:\s+(.+)$/);
      if (nameM) {
        jobs[currentJob].name = nameM[1].trim().replace(/^['"](.*)['"]$/, '$1');
      }
      const toM = line.match(/^timeout-minutes:\s+(\d+)/);
      if (toM) {
        jobs[currentJob].timeoutMinutes = parseInt(toM[1], 10);
      }
    }
  }

  // If a job has no explicit display name, its job ID is the check context.
  for (const [id, job] of Object.entries(jobs)) {
    if (job.name === null) job.name = id;
  }

  return { jobs, onPullRequest };
}

// ── Load check script names from .github/checks/*.sh ─────────────────────────

function loadCheckScripts() {
  if (!existsSync(CHECKS_DIR)) return new Set();
  return new Set(
    readdirSync(CHECKS_DIR)
      .filter((f) => f.endsWith('.sh'))
      .map((f) => f.slice(0, -3)),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const requiredContexts = loadRequiredContexts();
const checkScripts = loadCheckScripts();

console.log(
  `\nRequired check contexts in ruleset.json (${requiredContexts.length}):`,
);
for (const ctx of requiredContexts) console.log(`  • ${ctx}`);

const workflowFiles = readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => join(WORKFLOWS_DIR, f));

/**
 * Map: context name → first workflow file + job metadata.
 * @type {Map<string, { file: string, id: string, timeoutMinutes: number|null }>}
 */
const contextProviders = new Map();

/**
 * Map: file → which required contexts it provides + its pull_request trigger config.
 * @type {Map<string, { onPullRequest: { hasPaths: boolean, hasPathsIgnore: boolean }, provides: string[] }>}
 */
const workflowMeta = new Map();

for (const file of workflowFiles) {
  const text = readFileSync(file, 'utf8');
  const { jobs, onPullRequest } = parseWorkflow(text);

  const provides = [];
  for (const [id, job] of Object.entries(jobs)) {
    const displayName = job.name ?? id;
    if (requiredContexts.includes(displayName)) {
      provides.push(displayName);
      if (!contextProviders.has(displayName)) {
        contextProviders.set(displayName, {
          file,
          id,
          timeoutMinutes: job.timeoutMinutes,
        });
      }
    }
  }

  if (provides.length > 0) {
    workflowMeta.set(file, { onPullRequest, provides });
  }
}

// ── Assertion 1: every required check has a matching job or script ────────────

console.log(
  '\n─── Assertion 1: every required check has a matching job/script ─────',
);
for (const ctx of requiredContexts) {
  if (contextProviders.has(ctx)) {
    ok(
      `"${ctx}" → ${relative(ROOT, contextProviders.get(ctx).file).replace(/\\/g, '/')}`,
    );
  } else if (checkScripts.has(ctx)) {
    ok(`"${ctx}" → .github/checks/${ctx}.sh`);
  } else {
    fail(
      `"${ctx}" is listed as a required check in ruleset.json but has no matching ` +
        `job name in any .github/workflows/*.yml or script in .github/checks/`,
    );
  }
}

// ── Assertion 2: required-check workflows have no paths filters ───────────────

console.log(
  '\n─── Assertion 2: required-check workflows have no paths filters ─────',
);
for (const [file, { onPullRequest, provides }] of workflowMeta) {
  const relFile = relative(ROOT, file).replace(/\\/g, '/');
  if (onPullRequest.hasPaths) {
    fail(
      `${relFile} contains required check(s) [${provides.map((p) => `"${p}"`).join(', ')}] ` +
        `but has a "paths:" filter on its pull_request trigger. ` +
        `Remove it — paths filters prevent the check from running on all PRs, ` +
        `causing stuck "Expected" checks.`,
    );
  } else if (onPullRequest.hasPathsIgnore) {
    fail(
      `${relFile} contains required check(s) [${provides.map((p) => `"${p}"`).join(', ')}] ` +
        `but has a "paths-ignore:" filter on its pull_request trigger. Remove it.`,
    );
  } else {
    ok(`${relFile} has no paths filters`);
  }
}

// ── Assertion 3: required-check jobs have timeout-minutes <= 30 ──────────────

console.log(
  '\n─── Assertion 3: required-check jobs have timeout-minutes <= 30 ────',
);
for (const [ctx, { file, timeoutMinutes }] of contextProviders) {
  const relFile = relative(ROOT, file).replace(/\\/g, '/');
  if (timeoutMinutes === null) {
    fail(
      `"${ctx}" in ${relFile} has no timeout-minutes ` +
        `(must be set and <= ${MAX_REQUIRED_JOB_TIMEOUT})`,
    );
  } else if (timeoutMinutes > MAX_REQUIRED_JOB_TIMEOUT) {
    fail(
      `"${ctx}" in ${relFile} has timeout-minutes: ${timeoutMinutes} ` +
        `(max allowed for required checks: ${MAX_REQUIRED_JOB_TIMEOUT})`,
    );
  } else {
    ok(`"${ctx}" has timeout-minutes: ${timeoutMinutes}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
  console.error(`❌ ${failed} assertion(s) failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✅ ${passed} assertion(s) passed`);
