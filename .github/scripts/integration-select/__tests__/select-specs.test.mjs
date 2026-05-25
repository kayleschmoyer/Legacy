/**
 * Unit tests for the surface-aware integration spec selector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { globToRegExp, matchesAny, selectSpecs } from '../select-specs.mjs';

const REPO_ROOT = path.resolve(
  fileURLToPath(import.meta.url),
  '../../../../..',
);

const FIXTURE = {
  runAllWhenChanged: [
    'lambdas/db/src/schema/**',
    'apps/web-e2e/src/integration/helpers/**',
  ],
  specs: {
    'apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts': [
      'apps/web/src/pages/draft/**',
      'lambdas/draft-processor/**',
    ],
    'apps/web-e2e/src/integration/tests/trade-flow-ui.integration.spec.ts': [
      'apps/web/src/features/roster/**',
    ],
  },
};

describe('globToRegExp', () => {
  it('matches cross-segment with **', () => {
    assert.ok(
      globToRegExp('apps/web/src/pages/draft/**').test(
        'apps/web/src/pages/draft/Board.tsx',
      ),
    );
    assert.ok(
      globToRegExp('apps/web/src/pages/draft/**').test(
        'apps/web/src/pages/draft/sub/X.tsx',
      ),
    );
  });
  it('does not match a sibling directory', () => {
    assert.equal(
      globToRegExp('apps/web/src/pages/draft/**').test(
        'apps/web/src/pages/standings/X.tsx',
      ),
      false,
    );
  });
  it('* stays within a segment', () => {
    assert.ok(globToRegExp('a/*.ts').test('a/b.ts'));
    assert.equal(globToRegExp('a/*.ts').test('a/b/c.ts'), false);
  });
});

describe('selectSpecs', () => {
  it('selects nothing when no surfaces are touched', () => {
    const r = selectSpecs({
      changedFiles: ['README.md', 'docs/x.md'],
      manifest: FIXTURE,
    });
    assert.equal(r.runAll, false);
    assert.deepEqual(r.specs, []);
  });

  it('selects a spec when its surface glob matches', () => {
    const r = selectSpecs({
      changedFiles: ['apps/web/src/pages/draft/Board.tsx'],
      manifest: FIXTURE,
    });
    assert.equal(r.runAll, false);
    assert.deepEqual(r.specs, [
      'apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts',
    ]);
  });

  it('selects a spec when a backend lambda surface matches', () => {
    const r = selectSpecs({
      changedFiles: ['lambdas/draft-processor/src/index.ts'],
      manifest: FIXTURE,
    });
    assert.deepEqual(r.specs, [
      'apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts',
    ]);
  });

  it('selects an edited spec itself', () => {
    const spec =
      'apps/web-e2e/src/integration/tests/trade-flow-ui.integration.spec.ts';
    const r = selectSpecs({ changedFiles: [spec], manifest: FIXTURE });
    assert.deepEqual(r.specs, [spec]);
  });

  it('runs ALL specs when a runAllWhenChanged pattern matches (backend schema)', () => {
    const r = selectSpecs({
      changedFiles: ['lambdas/db/src/schema/drafts.ts'],
      manifest: FIXTURE,
    });
    assert.equal(r.runAll, true);
    assert.equal(r.specs.length, Object.keys(FIXTURE.specs).length);
  });

  it('runs ALL specs when shared integration helpers change', () => {
    const r = selectSpecs({
      changedFiles: ['apps/web-e2e/src/integration/helpers/cleanup-league.ts'],
      manifest: FIXTURE,
    });
    assert.equal(r.runAll, true);
  });

  it('unions surface matches across multiple changed files without duplicates', () => {
    const r = selectSpecs({
      changedFiles: [
        'apps/web/src/pages/draft/Board.tsx',
        'apps/web/src/features/roster/Roster.tsx',
      ],
      manifest: FIXTURE,
    });
    assert.deepEqual(r.specs, [
      'apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts',
      'apps/web-e2e/src/integration/tests/trade-flow-ui.integration.spec.ts',
    ]);
  });
});

describe('matchesAny', () => {
  it('returns true if any glob matches', () => {
    assert.ok(matchesAny('a/b.ts', ['x/**', 'a/*.ts']));
    assert.equal(matchesAny('a/b.ts', ['x/**', 'y/*.ts']), false);
  });
});

// Keeps the manifest honest: every integration spec on disk must be mapped,
// and the manifest must not reference specs that no longer exist.
describe('integration-surface-map.json coverage', () => {
  const manifestPath = path.join(
    REPO_ROOT,
    'apps/web-e2e/src/integration/integration-surface-map.json',
  );
  const specsDir = path.join(REPO_ROOT, 'apps/web-e2e/src/integration/tests');

  it('maps every spec on disk and references no missing specs', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const onDisk = readdirSync(specsDir)
      .filter((f) => f.endsWith('.integration.spec.ts'))
      .map((f) => `apps/web-e2e/src/integration/tests/${f}`)
      .sort();
    const mapped = Object.keys(manifest.specs).sort();

    const unmapped = onDisk.filter((s) => !mapped.includes(s));
    const stale = mapped.filter((s) => !onDisk.includes(s));

    assert.deepEqual(
      unmapped,
      [],
      `unmapped integration specs (add them to integration-surface-map.json): ${unmapped.join(', ')}`,
    );
    assert.deepEqual(
      stale,
      [],
      `manifest references specs that no longer exist: ${stale.join(', ')}`,
    );
  });
});
