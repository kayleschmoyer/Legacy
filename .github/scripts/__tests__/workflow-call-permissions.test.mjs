/**
 * Unit tests for workflow-call-permissions.mjs (LS-9381).
 *
 * Covers:
 *  - The LS-9380 incident itself: callee declares `statuses: read`, caller's job
 *    block omits it → the check fails and names `statuses`.
 *  - Permission inheritance: job block absent, workflow-level block sufficient →
 *    passes. This is the main false-positive risk; ci-orchestrator.yml calls
 *    both of its children exactly this way.
 *  - Scope ordering: `write` satisfies `read`; `none` satisfies nothing.
 *  - Shorthands: `read-all`, `write-all`, and an empty `permissions: {}`.
 *  - Only local reusable workflows are considered — composite actions and
 *    third-party actions are ignored.
 *  - Unresolvable grants (no permissions anywhere) are skipped, never reported
 *    as violations.
 *  - The real .github/workflows set is clean, which is the precondition for
 *    promoting this check from advisory to blocking.
 *
 * Run via: node --test .github/scripts/__tests__/workflow-call-permissions.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseWorkflow,
  readPermissionsValue,
  grantedLevel,
  satisfies,
  missingScopes,
  isLocalReusableWorkflow,
  checkWorkflowCallPermissions,
  formatReport,
  stripComment,
} from '../workflow-call-permissions.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

// ---------------------------------------------------------------------------
// Fixture helpers — each case gets a throwaway repo containing only .github/workflows
// ---------------------------------------------------------------------------

/** @type {string[]} */
const tempRoots = [];

/**
 * Builds a temp repo root with the given workflow files and runs the check.
 *
 * @param {Record<string, string>} files filename → YAML contents
 * @returns {ReturnType<typeof checkWorkflowCallPermissions>}
 */
function runCheckOn(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'wcp-'));
  tempRoots.push(root);
  const workflowsDir = path.join(root, '.github', 'workflows');
  mkdirSync(workflowsDir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(workflowsDir, name), contents, 'utf8');
  }
  return checkWorkflowCallPermissions({ workflowsDir, root });
}

after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The incident
// ---------------------------------------------------------------------------

describe('LS-9380 incident reproduction', () => {
  // Reduced from the real deploy.yml / upload-lambdas.yml pair as they stood at
  // the moment the Deploy workflow started failing with startup_failure.
  const CALLER_MISSING_STATUSES = `name: Deploy

on:
  push:
    branches: [main]

jobs:
  upload-lambdas:
    name: Upload Lambdas
    permissions:
      actions: write
      id-token: write
      contents: read
      pull-requests: read
    uses: ./.github/workflows/upload-lambdas.yml
    secrets: inherit
`;

  const CALLEE_WITH_STATUSES = `name: Upload Lambdas

on:
  workflow_call:

permissions:
  actions: read
  id-token: write
  contents: read
  pull-requests: read
  statuses: read # Required to read the \`CI Gate\` commit status (LS-9378)

jobs:
  verify-ci:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;

  it('fails and names the missing `statuses` scope', () => {
    const result = runCheckOn({
      'deploy.yml': CALLER_MISSING_STATUSES,
      'upload-lambdas.yml': CALLEE_WITH_STATUSES,
    });

    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.callerFile, '.github/workflows/deploy.yml');
    assert.equal(violation.calleeFile, '.github/workflows/upload-lambdas.yml');
    assert.equal(violation.callerJob, 'upload-lambdas');
    assert.deepEqual(violation.gaps, [
      { scope: 'statuses', required: 'read', granted: 'none' },
    ]);
  });

  it('reports both file:line locations', () => {
    const result = runCheckOn({
      'deploy.yml': CALLER_MISSING_STATUSES,
      'upload-lambdas.yml': CALLEE_WITH_STATUSES,
    });
    const violation = result.violations[0];

    // `uses:` line in the caller, and the callee's top-level `permissions:` line.
    assert.equal(violation.callerLine, 15);
    assert.equal(violation.grantSource.scope, 'job');
    assert.equal(violation.grantSource.line, 10);
    assert.equal(violation.calleePermissionsLine, 6);

    const report = formatReport(result, false).join('\n');
    assert.match(report, /\.github\/workflows\/deploy\.yml:15/);
    assert.match(report, /\.github\/workflows\/upload-lambdas\.yml:6/);
    assert.match(
      report,
      /missing scope "statuses": callee requires read, caller grants none/,
    );
  });

  it('passes once the caller grants the scope (the LS-9380 fix)', () => {
    const fixed = CALLER_MISSING_STATUSES.replace(
      '      pull-requests: read\n',
      '      pull-requests: read\n      statuses: read\n',
    );
    const result = runCheckOn({
      'deploy.yml': fixed,
      'upload-lambdas.yml': CALLEE_WITH_STATUSES,
    });
    assert.deepEqual(result.violations, []);
    assert.equal(result.callSites.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Inheritance — the main false-positive risk
// ---------------------------------------------------------------------------

describe('permission inheritance', () => {
  const CALLEE = `name: Child

on:
  workflow_call:

permissions:
  contents: read
  statuses: write
`;

  it('falls back to the workflow-level block when the job declares none', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

permissions:
  contents: read
  statuses: write
  pull-requests: write

jobs:
  child:
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': CALLEE,
    });

    assert.deepEqual(result.violations, []);
    assert.equal(result.callSites.length, 1);
    assert.equal(result.callSites[0].grantSource.scope, 'workflow');
  });

  it('still reports a gap when the inherited workflow-level block is insufficient', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  child:
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': CALLEE,
    });

    assert.equal(result.violations.length, 1);
    assert.deepEqual(result.violations[0].gaps, [
      { scope: 'statuses', required: 'write', granted: 'none' },
    ]);
    assert.equal(result.violations[0].grantSource.scope, 'workflow');
  });

  it('lets a job-level block REPLACE (not merge with) the workflow-level block', () => {
    // GitHub semantics: a job's `permissions:` wholly replaces the workflow-level
    // block. A job block that drops a scope the workflow-level granted is a real
    // gap, not an inheritance false positive.
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

permissions:
  contents: read
  statuses: write

jobs:
  child:
    permissions:
      contents: read
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': CALLEE,
    });

    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].grantSource.scope, 'job');
    assert.deepEqual(result.violations[0].gaps, [
      { scope: 'statuses', required: 'write', granted: 'none' },
    ]);
  });

  it('skips a job whose permissions block is an unresolvable expression', () => {
    // The job block supersedes the workflow-level one, so falling back to the
    // workflow-level block here would compare against permissions this job does
    // not actually use — that can only manufacture false positives.
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  child:
    permissions: \${{ fromJSON(inputs.perms) }}
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': CALLEE,
    });

    assert.deepEqual(result.violations, []);
    assert.equal(result.callSites.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /calling job declares permissions/);
  });

  it('skips (never fails) when neither job nor workflow declares permissions', () => {
    // The repo/org default GITHUB_TOKEN permissions apply and are not knowable
    // from the workflow files. Guessing here would block every PR in the repo.
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': CALLEE,
    });

    assert.deepEqual(result.violations, []);
    assert.equal(result.callSites.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /default GITHUB_TOKEN permissions/);
  });
});

// ---------------------------------------------------------------------------
// Scope ordering
// ---------------------------------------------------------------------------

describe('scope ordering', () => {
  it('write satisfies read', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions:
      contents: write
      actions: write
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

permissions:
  contents: read
  actions: read
`,
    });

    assert.deepEqual(result.violations, []);
    assert.equal(result.callSites.length, 1);
  });

  it('read does NOT satisfy write', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions:
      contents: read
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

permissions:
  contents: write
`,
    });

    assert.deepEqual(result.violations[0].gaps, [
      { scope: 'contents', required: 'write', granted: 'read' },
    ]);
  });

  it('satisfies() ranks none < read < write', () => {
    assert.equal(satisfies('write', 'read'), true);
    assert.equal(satisfies('write', 'write'), true);
    assert.equal(satisfies('read', 'read'), true);
    assert.equal(satisfies('read', 'write'), false);
    assert.equal(satisfies('none', 'read'), false);
    assert.equal(satisfies('none', 'write'), false);
    assert.equal(satisfies('none', 'none'), true);
    assert.equal(satisfies('read', 'none'), true);
  });

  it('treats an unknown level as satisfying only itself', () => {
    assert.equal(satisfies('bogus', 'bogus'), true);
    assert.equal(satisfies('bogus', 'read'), false);
    assert.equal(satisfies('write', 'bogus'), false);
  });

  it('a callee requiring `none` never produces a gap', () => {
    const granted = { kind: 'map', scopes: {}, scopeLines: {}, line: 1 };
    const required = {
      kind: 'map',
      scopes: { contents: 'none', statuses: 'none' },
      scopeLines: {},
      line: 1,
    };
    assert.deepEqual(missingScopes(granted, required), []);
  });
});

// ---------------------------------------------------------------------------
// Shorthands
// ---------------------------------------------------------------------------

describe('permission shorthands', () => {
  it('parses read-all, write-all and empty {}', () => {
    const readAll = readPermissionsValue(['permissions: read-all'], 0, 0).spec;
    assert.deepEqual(readAll, { kind: 'all', level: 'read', line: 1 });

    const writeAll = readPermissionsValue(
      ['permissions: write-all'],
      0,
      0,
    ).spec;
    assert.deepEqual(writeAll, { kind: 'all', level: 'write', line: 1 });

    const empty = readPermissionsValue(['permissions: {}'], 0, 0).spec;
    assert.deepEqual(empty, {
      kind: 'map',
      scopes: {},
      scopeLines: {},
      line: 1,
    });
  });

  it('parses an inline flow map', () => {
    const spec = readPermissionsValue(
      ['permissions: { contents: read, statuses: write }'],
      0,
      0,
    ).spec;
    assert.deepEqual(spec.scopes, { contents: 'read', statuses: 'write' });
  });

  it('write-all on the caller satisfies any scope map on the callee', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

permissions: write-all

jobs:
  child:
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

permissions:
  contents: write
  statuses: read
`,
    });
    assert.deepEqual(result.violations, []);
  });

  it('read-all on the caller does not satisfy a write requirement', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

permissions: read-all

jobs:
  child:
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

permissions:
  contents: write
`,
    });
    assert.deepEqual(result.violations[0].gaps, [
      { scope: 'contents', required: 'write', granted: 'read' },
    ]);
  });

  it('an empty caller `permissions: {}` grants nothing', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions: {}
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

permissions:
  contents: read
`,
    });
    assert.deepEqual(result.violations[0].gaps, [
      { scope: 'contents', required: 'read', granted: 'none' },
    ]);
  });

  it('a callee declaring read-all needs a caller that is at least read-all', () => {
    const readAll = { kind: 'all', level: 'read', line: 1 };
    const writeAll = { kind: 'all', level: 'write', line: 1 };
    const partial = {
      kind: 'map',
      scopes: { contents: 'write' },
      scopeLines: {},
      line: 1,
    };

    assert.deepEqual(missingScopes(readAll, readAll), []);
    assert.deepEqual(missingScopes(writeAll, readAll), []);
    assert.deepEqual(missingScopes(readAll, writeAll), [
      { scope: 'write-all', required: 'write', granted: 'read' },
    ]);
    assert.deepEqual(missingScopes(partial, readAll), [
      { scope: 'read-all', required: 'read', granted: 'partial' },
    ]);
  });

  it('a callee declaring `permissions: {}` requires nothing', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions: {}
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

permissions: {}
`,
    });
    assert.deepEqual(result.violations, []);
    assert.equal(result.callSites.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Call-site selection
// ---------------------------------------------------------------------------

describe('call-site selection', () => {
  it('matches only local reusable workflows', () => {
    assert.equal(
      isLocalReusableWorkflow('./.github/workflows/deploy-web.yml'),
      true,
    );
    assert.equal(isLocalReusableWorkflow('./.github/workflows/ci.yaml'), true);
    // Composite actions use a different permission model — no workflow_call boundary.
    assert.equal(
      isLocalReusableWorkflow('./.github/actions/setup/action.yml'),
      false,
    );
    assert.equal(isLocalReusableWorkflow('actions/checkout@v4'), false);
    assert.equal(
      isLocalReusableWorkflow('owner/repo/.github/workflows/x.yml@main'),
      false,
    );
    assert.equal(isLocalReusableWorkflow(null), false);
  });

  it('ignores composite-action and step-level `uses:`', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
`,
    });
    assert.equal(result.callSites.length, 0);
    assert.equal(result.violations.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  it('records a dangling `uses:` target as skipped rather than crashing', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions:
      contents: read
    uses: ./.github/workflows/does-not-exist.yml
`,
    });
    assert.equal(result.violations.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /callee file not found/);
  });

  it('skips a callee that declares no top-level permissions', () => {
    const result = runCheckOn({
      'caller.yml': `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions:
      contents: read
    uses: ./.github/workflows/callee.yml
`,
      'callee.yml': `name: Child

on:
  workflow_call:

jobs:
  work:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`,
    });
    assert.equal(result.violations.length, 0);
    assert.match(result.skipped[0].reason, /no top-level permissions/);
  });

  it('finds every call site across multiple caller files', () => {
    const callee = `name: Child

on:
  workflow_call:

permissions:
  contents: read
`;
    const caller = (target) => `name: Caller

on:
  push:
    branches: [main]

jobs:
  child:
    permissions:
      contents: read
    uses: ./.github/workflows/${target}
`;
    const result = runCheckOn({
      'a.yml': caller('c1.yml'),
      'b.yml': caller('c2.yml'),
      'c1.yml': callee,
      'c2.yml': callee,
    });
    assert.equal(result.callSites.length, 2);
    assert.deepEqual(result.violations, []);
  });
});

// ---------------------------------------------------------------------------
// Parser details
// ---------------------------------------------------------------------------

describe('parser', () => {
  it('strips trailing comments without mangling values', () => {
    assert.equal(
      stripComment('  statuses: read # needed by verify-ci').trim(),
      'statuses: read',
    );
    assert.equal(stripComment('  # whole-line comment').trim(), '');
    assert.equal(stripComment('  contents: read').trim(), 'contents: read');
  });

  it('does not let comment or blank lines truncate a permissions block', () => {
    const text = `permissions:
  contents: read

  # verify-ci reads the CI Gate commit status (LS-9378)
  statuses: read

jobs:
  x:
    runs-on: ubuntu-latest
`;
    const { permissions } = parseWorkflow(text);
    assert.deepEqual(permissions.scopes, {
      contents: 'read',
      statuses: 'read',
    });
  });

  it('records 1-based line numbers for scopes and blocks', () => {
    const text = `name: X

permissions:
  contents: read
  statuses: write
`;
    const { permissions } = parseWorkflow(text);
    assert.equal(permissions.line, 3);
    assert.equal(permissions.scopeLines.contents, 4);
    assert.equal(permissions.scopeLines.statuses, 5);
  });

  it('does not treat a step-level `uses:` as a job-level call', () => {
    const text = `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/workflows/nope.yml
`;
    const { jobs } = parseWorkflow(text);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].uses, null);
  });

  it('marks an unresolvable permissions value as declared-but-null', () => {
    const text = `permissions: \${{ fromJSON(inputs.perms) }}

jobs:
  x:
    runs-on: ubuntu-latest
`;
    const parsedWorkflow = parseWorkflow(text);
    assert.equal(parsedWorkflow.permissionsDeclared, true);
    assert.equal(parsedWorkflow.permissions, null);
  });

  it('resolves grantedLevel for maps and all-shorthands', () => {
    const map = {
      kind: 'map',
      scopes: { contents: 'read' },
      scopeLines: {},
      line: 1,
    };
    assert.equal(grantedLevel(map, 'contents'), 'read');
    // An unlisted scope under an explicit block is `none` — precisely the
    // LS-9380 failure, where deploy.yml listed four scopes and omitted statuses.
    assert.equal(grantedLevel(map, 'statuses'), 'none');
    assert.equal(
      grantedLevel({ kind: 'all', level: 'write', line: 1 }, 'anything'),
      'write',
    );
  });
});

// ---------------------------------------------------------------------------
// The real workflow set
// ---------------------------------------------------------------------------

describe('this repository', () => {
  /** @type {ReturnType<typeof checkWorkflowCallPermissions>} */
  let result;

  before(() => {
    result = checkWorkflowCallPermissions({
      workflowsDir: path.join(REPO_ROOT, '.github', 'workflows'),
      root: REPO_ROOT,
    });
  });

  it('has no reusable-workflow call site missing a permission scope', () => {
    const detail = result.violations
      .map(
        (v) =>
          `${v.callerFile}:${v.callerLine} → ${v.calleeFile} missing ` +
          v.gaps.map((g) => `${g.scope}:${g.required}`).join(', '),
      )
      .join('\n');
    assert.deepEqual(result.violations, [], detail);
  });

  it('resolves the known call sites rather than silently finding none', () => {
    // Regression guard: a parser change that stops recognising `uses:` would
    // make the check vacuously green. Assert it still sees real call sites.
    assert.ok(
      result.callSites.length >= 3,
      `expected at least 3 resolved call sites, got ${result.callSites.length}`,
    );
    const pairs = result.callSites.map(
      (s) => `${s.callerFile} → ${s.calleeFile}`,
    );
    assert.ok(
      pairs.includes(
        '.github/workflows/deploy.yml → .github/workflows/upload-lambdas.yml',
      ),
      `deploy.yml → upload-lambdas.yml not found among: ${pairs.join(' | ')}`,
    );
  });
});
