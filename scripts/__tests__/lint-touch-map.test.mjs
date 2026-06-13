/**
 * Tests for the pattern-matching + touch-map parsing in scripts/lint-touch-map.js (LS-8000).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/lint-touch-map.test.mjs
 *
 * These pin the de-noise behavior of the `.github/workflows/...` row: only the
 * pipeline workflows the workflow-overview phase tables actually describe should
 * trigger the advisory, and a brace glob ({a,b}) must be treated as a glob (a
 * latent bug had `matchesPattern` only globbing on `*`/`?`, so brace patterns
 * silently never matched). They also pin that any file under the linked skill
 * directory satisfies the required-doc check.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { extractCodePattern, matchesPattern, parseTouchMap } = require(
  resolve(__dirname, '..', 'lint-touch-map.js'),
);

const WORKFLOWS_GLOB =
  '.github/workflows/{ci-pipeline,ci-orchestrator,merge-queue,required-checks-lint,ci-run-label}.yml';

// --- matchesPattern: brace globs are globs ---------------------------------

test('matchesPattern: brace glob matches an enumerated pipeline workflow', () => {
  assert.equal(
    matchesPattern('.github/workflows/ci-pipeline.yml', WORKFLOWS_GLOB),
    true,
  );
  assert.equal(
    matchesPattern('.github/workflows/merge-queue.yml', WORKFLOWS_GLOB),
    true,
  );
});

test('matchesPattern: brace glob does NOT match unrelated workflows (de-noise)', () => {
  // The PR #5246 false positive that motivated LS-8000.
  assert.equal(
    matchesPattern('.github/workflows/build-android-app.yml', WORKFLOWS_GLOB),
    false,
  );
  assert.equal(
    matchesPattern('.github/workflows/deploy-web.yml', WORKFLOWS_GLOB),
    false,
  );
  assert.equal(
    matchesPattern('.github/workflows/rebuild-runner-ami.yml', WORKFLOWS_GLOB),
    false,
  );
});

// --- extractCodePattern: brace glob survives cell parsing ------------------

test('extractCodePattern: extracts the brace glob from a backticked cell', () => {
  assert.equal(extractCodePattern(`\`${WORKFLOWS_GLOB}\``), WORKFLOWS_GLOB);
});

// --- parseTouchMap: the real table parses + the narrowed row is present ----

test('parseTouchMap: includes the narrowed workflows row pointing at the workflow-overview skill', () => {
  const rules = parseTouchMap();
  const row = rules.find((r) => r.pattern === WORKFLOWS_GLOB);
  assert.ok(row, 'expected the narrowed .github/workflows brace-glob row');
  // Any file under the workflow-overview skill dir should satisfy the gap.
  assert.ok(
    row.docPaths.includes('.agents/skills/workflow-overview'),
    `expected workflow-overview skill dir in docPaths, got ${JSON.stringify(row.docPaths)}`,
  );
});

test('parseTouchMap: pipeline workflow edit is satisfied by any doc in the skill dir', () => {
  const rules = parseTouchMap();
  const row = rules.find((r) => r.pattern === WORKFLOWS_GLOB);
  const docTouched = (changed) =>
    row.docPaths.some((doc) =>
      changed.some((f) => f === doc || f.startsWith(doc + '/')),
    );
  // A reference file under the skill counts, not just SKILL.md.
  assert.equal(
    docTouched([
      '.github/workflows/ci-pipeline.yml',
      '.agents/skills/workflow-overview/references/ci-and-merge-pipeline.md',
    ]),
    true,
  );
  assert.equal(docTouched(['.github/workflows/ci-pipeline.yml']), false);
});
