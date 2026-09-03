/**
 * Presence + selection tests for the HERMETIC e2e surface map (LS-7846).
 *
 * The selection ENGINE (globToRegExp / selectSpecs) is shared with the
 * integration surface map and is unit-tested in select-specs.test.mjs; this
 * file only guards the e2e manifest:
 *
 * ⚠️ LS-9661 transition: the hand-maintained e2e map is in SHADOW-MODE
 * replacement by the graph-derived generator (.github/scripts/e2e-graph/).
 * The generator's own tests carry the successor presence guarantee (every
 * spec on disk mapped, derived from the module graph). This lint stays
 * REQUIRED while the hand map is still the live selector; retire the e2e
 * half of it (together with the map and the LS-7851 remediation bot's e2e
 * targeting) in the flip PR once the shadow period clears.
 *   1. Coverage — every hermetic spec on disk is mapped, and the manifest
 *      references no specs that no longer exist (the gate that forces a NEW
 *      spec to get a map entry at PR time).
 *   2. Wiring — a handful of representative selections behave as expected so a
 *      malformed glob in the manifest is caught here rather than in CI.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectSpecs } from '../select-specs.mjs';

const REPO_ROOT = path.resolve(
  fileURLToPath(import.meta.url),
  '../../../../..',
);
const manifestPath = path.join(
  REPO_ROOT,
  'apps/web-e2e/src/e2e-surface-map.json',
);
const specsDir = path.join(REPO_ROOT, 'apps/web-e2e/src/tests');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

describe('e2e-surface-map.json coverage', () => {
  it('maps every spec on disk and references no missing specs', () => {
    // recursive: true (Node 20.1+) so specs nested under subdirectories
    // (e.g. tests/shared/*.dual.spec.ts) are discovered, not just top-level files.
    const onDisk = readdirSync(specsDir, { recursive: true })
      .filter((f) => f.endsWith('.spec.ts'))
      .map((f) => `apps/web-e2e/src/tests/${f.split(path.sep).join('/')}`)
      .sort();
    const mapped = Object.keys(manifest.specs).sort();

    const unmapped = onDisk.filter((s) => !mapped.includes(s));
    const stale = mapped.filter((s) => !onDisk.includes(s));

    assert.deepEqual(
      unmapped,
      [],
      `unmapped e2e specs (add them to apps/web-e2e/src/e2e-surface-map.json): ${unmapped.join(', ')}`,
    );
    assert.deepEqual(
      stale,
      [],
      `manifest references specs that no longer exist: ${stale.join(', ')}`,
    );
  });

  it('every spec maps to at least one non-empty surface glob', () => {
    const empty = Object.entries(manifest.specs)
      .filter(([, globs]) => !Array.isArray(globs) || globs.length === 0)
      .map(([spec]) => spec);
    assert.deepEqual(
      empty,
      [],
      `specs with no surface globs: ${empty.join(', ')}`,
    );
  });

  it('declares runAllWhenChanged broad-surface globs', () => {
    assert.ok(
      Array.isArray(manifest.runAllWhenChanged) &&
        manifest.runAllWhenChanged.length > 0,
      'runAllWhenChanged must be a non-empty array',
    );
    // LS-8920: the blanket `lib/shared-components/src/**` glob was narrowed
    // to per-directory entries (attribution data: 12/70 sampled PRs tripped
    // full-suite via this one glob, spread thinly across many independent
    // feature subfolders). Generic, genuinely cross-cutting UI primitives
    // (lib/shared-components/src/components/**) still force the full suite;
    // feature-scoped subfolders with adequate per-spec surface coverage were
    // dropped so the affected-spec selection can actually engage for them.
    assert.ok(
      manifest.runAllWhenChanged.includes(
        'lib/shared-components/src/components/**',
      ),
      'generic shared-component changes must still force the full suite',
    );
  });
});

describe('e2e surface-map selection', () => {
  it('selects every admin spec for an admin page change', () => {
    // Superset check, not an exhaustive-membership check: the coverage
    // auditor may legitimately map a non admin-*-named spec onto an admin
    // glob (e.g. entitlement-tiers.spec.ts exercises admin-page premium
    // gating) as real coverage data comes in. This test's job is to catch a
    // malformed/missing glob breaking admin coverage, not to assert that
    // admin pages are exclusively covered by admin-named specs.
    const r = selectSpecs({
      changedFiles: ['apps/web/src/pages/admin/AdminConsole.tsx'],
      manifest,
    });
    assert.equal(r.runAll, false);
    const adminSpecs = Object.keys(manifest.specs).filter((s) =>
      s.includes('/admin-'),
    );
    assert.ok(
      adminSpecs.length > 0,
      'expected at least one admin-* spec in the manifest',
    );
    const missing = adminSpecs.filter((s) => !r.specs.includes(s));
    assert.deepEqual(
      missing,
      [],
      `expected every admin-* spec to be selected, missing: ${missing.join(', ')}`,
    );
  });

  it('runs ALL specs when a generic shared component changes', () => {
    const r = selectSpecs({
      changedFiles: ['lib/shared-components/src/components/Button.tsx'],
      manifest,
    });
    assert.equal(r.runAll, true);
    assert.equal(r.specs.length, Object.keys(manifest.specs).length);
  });

  it('does not run-all for a feature-scoped shared-components change with existing surface coverage (LS-8920)', () => {
    // elite-draft was the single largest runAllWhenChanged contributor in the
    // LS-8920 attribution sample (4/12 shared-components hits) and is fully
    // covered by per-spec surface globs, so it was dropped from the blanket
    // run-all list. This locks in that it still resolves to a real (non-empty)
    // narrow selection rather than silently selecting nothing.
    const r = selectSpecs({
      changedFiles: [
        'lib/shared-components/src/features/elite-draft/DraftTopBand.tsx',
      ],
      manifest,
    });
    assert.equal(r.runAll, false);
    assert.ok(
      r.specs.length > 0,
      'expected a non-empty narrow spec selection for elite-draft changes',
    );
  });

  it('runs ALL specs when a shared E2E harness file changes (LS-9787)', () => {
    // Page objects, mock factories, fixtures, component wrappers, drivers and
    // the POM base classes are shared by dozens of specs each, so a change to
    // any of them can break any spec — exactly what runAllWhenChanged is for.
    // Before LS-9787 only utils/, global-setup.ts and playwright.config.ts were
    // listed, so `players.page.ts` (which 107 specs reach) selected ZERO specs.
    for (const file of [
      'apps/web-e2e/src/pages/players.page.ts',
      'apps/web-e2e/src/mocks/graphql/league.mocks.ts',
      'apps/web-e2e/src/fixtures/shared-mocks.ts',
      'apps/web-e2e/src/components/nav-header.component.ts',
      'apps/web-e2e/src/driver/playwright-web.driver.ts',
      'apps/web-e2e/src/base/base.page.ts',
      'apps/web-e2e/src/support/canonical-routes.ts',
    ]) {
      const r = selectSpecs({ changedFiles: [file], manifest });
      assert.equal(r.runAll, true, `expected runAll for ${file}`);
    }
  });

  it('selects player-stats.spec.ts for an LS-9036-shaped features/players change (LS-9787)', () => {
    // LS-8920 dropped features/players/** from runAllWhenChanged after verifying
    // per-spec coverage at SUBFOLDER granularity: 9 specs mapped features/players,
    // but not player-stats.spec.ts — whose page object asserts testIDs owned by
    // features/players/shell/StateCards.tsx. LS-9036 renamed two of them and the
    // spec landed deterministically red on main (fixed separately as LS-9762).
    const r = selectSpecs({
      changedFiles: [
        'lib/shared-components/src/features/players/shell/StateCards.tsx',
        'lib/shared-components/src/features/players/shell/StatsDataGrid.tsx',
      ],
      manifest,
    });
    assert.equal(r.runAll, false);
    assert.ok(
      r.specs.includes('apps/web-e2e/src/tests/player-stats.spec.ts'),
      `expected player-stats.spec.ts in selection, got: ${r.specs.join(', ')}`,
    );
  });

  it('selects nothing for a docs-only change', () => {
    const r = selectSpecs({ changedFiles: ['README.md'], manifest });
    assert.equal(r.runAll, false);
    assert.deepEqual(r.specs, []);
  });

  it('selects an edited spec itself', () => {
    const spec = 'apps/web-e2e/src/tests/twenty-questions.spec.ts';
    const r = selectSpecs({ changedFiles: [spec], manifest });
    assert.deepEqual(r.specs, [spec]);
  });
});
