/**
 * Presence + selection tests for the HERMETIC e2e surface map (LS-7846).
 *
 * The selection ENGINE (globToRegExp / selectSpecs) is shared with the
 * integration surface map and is unit-tested in select-specs.test.mjs; this
 * file only guards the e2e manifest:
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
    assert.ok(
      manifest.runAllWhenChanged.includes('lib/shared-components/src/**'),
      'shared-components changes must force the full suite',
    );
  });
});

describe('e2e surface-map selection', () => {
  it('selects only the admin specs for an admin page change', () => {
    const r = selectSpecs({
      changedFiles: ['apps/web/src/pages/admin/AdminConsole.tsx'],
      manifest,
    });
    assert.equal(r.runAll, false);
    assert.ok(r.specs.length > 0);
    assert.ok(
      r.specs.every((s) => s.includes('/admin-')),
      `expected only admin-* specs, got: ${r.specs.join(', ')}`,
    );
  });

  it('runs ALL specs when shared-components changes', () => {
    const r = selectSpecs({
      changedFiles: ['lib/shared-components/src/ui/Button.tsx'],
      manifest,
    });
    assert.equal(r.runAll, true);
    assert.equal(r.specs.length, Object.keys(manifest.specs).length);
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
