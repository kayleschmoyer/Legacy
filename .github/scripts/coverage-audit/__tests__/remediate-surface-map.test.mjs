/**
 * Unit tests for the surface-map auto-remediation bot (LS-7851).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  mergeSpecGlobs,
  withSpec,
  applyRemediation,
  partitionFindings,
  remediate,
  renderPrBody,
  serializeMap,
  serializeMapFile,
} from '../remediate-surface-map.mjs';

const REAL_MAPS = [
  '../../../../apps/web-e2e/src/e2e-surface-map.json',
  '../../../../apps/web-e2e/src/integration/integration-surface-map.json',
];

const e2eMap = () => ({
  $comment: 'e2e map',
  runAllWhenChanged: ['lib/shared-components/src/**'],
  specs: {
    'apps/web-e2e/src/tests/about-page.spec.ts': [
      'apps/web/src/pages/about/**',
    ],
    'apps/web-e2e/src/tests/draft-functionality.spec.ts': [
      'apps/web/src/pages/draft/**',
    ],
  },
});

const integrationMap = () => ({
  $comment: 'integration map',
  runAllWhenChanged: ['lambdas/db/schema.graphql'],
  specs: {
    'apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts': [
      'apps/web/src/pages/draft/**',
    ],
  },
});

describe('mergeSpecGlobs', () => {
  it('appends only new globs, preserving existing order', () => {
    const { globs, added } = mergeSpecGlobs(
      ['a/**', 'b/**'],
      ['b/**', 'c/**', 'd/**'],
    );
    assert.deepEqual(globs, ['a/**', 'b/**', 'c/**', 'd/**']);
    assert.deepEqual(added, ['c/**', 'd/**']);
  });

  it('is a no-op when every suggested glob already exists', () => {
    const { globs, added } = mergeSpecGlobs(['a/**', 'b/**'], ['a/**']);
    assert.deepEqual(globs, ['a/**', 'b/**']);
    assert.deepEqual(added, []);
  });

  it('never drops an existing glob', () => {
    const { globs } = mergeSpecGlobs(['keep/**'], []);
    assert.deepEqual(globs, ['keep/**']);
  });
});

describe('withSpec', () => {
  it('replaces an existing spec in place, preserving key order', () => {
    const specs = { a: ['x'], b: ['y'], c: ['z'] };
    const out = withSpec(specs, 'b', ['NEW']);
    assert.deepEqual(Object.keys(out), ['a', 'b', 'c']);
    assert.deepEqual(out.b, ['NEW']);
  });

  it('inserts a new spec in sorted position', () => {
    const specs = { a: ['x'], c: ['z'] };
    const out = withSpec(specs, 'b', ['y']);
    assert.deepEqual(Object.keys(out), ['a', 'b', 'c']);
  });

  it('appends a new spec that sorts last', () => {
    const specs = { a: ['x'], b: ['y'] };
    const out = withSpec(specs, 'zz', ['w']);
    assert.deepEqual(Object.keys(out), ['a', 'b', 'zz']);
  });

  it('does not mutate the input', () => {
    const specs = { a: ['x'] };
    withSpec(specs, 'b', ['y']);
    assert.deepEqual(Object.keys(specs), ['a']);
  });
});

describe('applyRemediation', () => {
  it('appends missing globs to an already-mapped spec', () => {
    const res = applyRemediation(e2eMap(), [
      {
        spec: 'apps/web-e2e/src/tests/about-page.spec.ts',
        mapped: true,
        files: [
          'apps/web/src/pages/about/NewThing.tsx',
          'apps/web/src/lib/x.ts',
        ],
        suggestedGlobs: ['apps/web/src/lib/**', 'apps/web/src/pages/about/**'],
      },
    ]);
    assert.equal(res.changed, true);
    // about/** already present → only lib/** is genuinely new.
    assert.deepEqual(
      res.map.specs['apps/web-e2e/src/tests/about-page.spec.ts'],
      ['apps/web/src/pages/about/**', 'apps/web/src/lib/**'],
    );
    assert.deepEqual(res.changes, [
      {
        spec: 'apps/web-e2e/src/tests/about-page.spec.ts',
        onboarded: false,
        added: ['apps/web/src/lib/**'],
      },
    ]);
  });

  it('onboards a brand-new, never-mapped spec in sorted position', () => {
    const res = applyRemediation(e2eMap(), [
      {
        spec: 'apps/web-e2e/src/tests/billing.spec.ts',
        mapped: false,
        files: ['apps/web/src/pages/billing/Page.tsx'],
        suggestedGlobs: ['apps/web/src/pages/billing/**'],
      },
    ]);
    assert.equal(res.changed, true);
    assert.deepEqual(Object.keys(res.map.specs), [
      'apps/web-e2e/src/tests/about-page.spec.ts',
      'apps/web-e2e/src/tests/billing.spec.ts',
      'apps/web-e2e/src/tests/draft-functionality.spec.ts',
    ]);
    assert.deepEqual(res.changes[0], {
      spec: 'apps/web-e2e/src/tests/billing.spec.ts',
      onboarded: true,
      added: ['apps/web/src/pages/billing/**'],
    });
  });

  it('is idempotent — re-applying the same findings is a no-op', () => {
    const findings = [
      {
        spec: 'apps/web-e2e/src/tests/billing.spec.ts',
        mapped: false,
        files: ['apps/web/src/pages/billing/Page.tsx'],
        suggestedGlobs: ['apps/web/src/pages/billing/**'],
      },
    ];
    const once = applyRemediation(e2eMap(), findings);
    const twice = applyRemediation(once.map, findings);
    assert.equal(twice.changed, false);
    assert.deepEqual(twice.changes, []);
    assert.deepEqual(twice.map.specs, once.map.specs);
  });

  it('preserves top-level key order and never touches runAllWhenChanged', () => {
    const before = e2eMap();
    const res = applyRemediation(before, [
      {
        spec: 'apps/web-e2e/src/tests/billing.spec.ts',
        mapped: false,
        files: ['apps/web/src/pages/billing/Page.tsx'],
        suggestedGlobs: ['apps/web/src/pages/billing/**'],
      },
    ]);
    assert.deepEqual(Object.keys(res.map), [
      '$comment',
      'runAllWhenChanged',
      'specs',
    ]);
    assert.deepEqual(res.map.runAllWhenChanged, before.runAllWhenChanged);
  });

  it('does not mutate the input map', () => {
    const before = e2eMap();
    applyRemediation(before, [
      {
        spec: 'apps/web-e2e/src/tests/about-page.spec.ts',
        mapped: true,
        files: ['apps/web/src/lib/x.ts'],
        suggestedGlobs: ['apps/web/src/lib/**'],
      },
    ]);
    assert.deepEqual(
      before.specs['apps/web-e2e/src/tests/about-page.spec.ts'],
      ['apps/web/src/pages/about/**'],
    );
  });

  it('reports no change when findings are empty', () => {
    const res = applyRemediation(e2eMap(), []);
    assert.equal(res.changed, false);
    assert.deepEqual(res.changes, []);
  });
});

describe('partitionFindings', () => {
  it('splits under-selection findings by map and ignores dead globs', () => {
    const byMap = partitionFindings({
      underSelection: [
        { map: 'e2e', spec: 's1', suggestedGlobs: ['a/**'] },
        { map: 'integration', spec: 's2', suggestedGlobs: ['b/**'] },
        { map: 'e2e', spec: 's3', suggestedGlobs: ['c/**'] },
      ],
      deadGlobs: [{ map: 'e2e', spec: 's1', glob: 'a/**' }],
    });
    assert.equal(byMap.e2e.length, 2);
    assert.equal(byMap.integration.length, 1);
  });

  it('is defensive against a missing/garbage underSelection field', () => {
    assert.deepEqual(partitionFindings({}), { e2e: [], integration: [] });
    assert.deepEqual(partitionFindings(null), { e2e: [], integration: [] });
    assert.deepEqual(partitionFindings({ underSelection: 'nope' }), {
      e2e: [],
      integration: [],
    });
  });
});

describe('remediate', () => {
  it('routes findings to the right map and reports aggregate change', () => {
    const audit = {
      underSelection: [
        {
          map: 'e2e',
          spec: 'apps/web-e2e/src/tests/about-page.spec.ts',
          mapped: true,
          files: ['apps/web/src/lib/x.ts'],
          suggestedGlobs: ['apps/web/src/lib/**'],
        },
        {
          map: 'integration',
          spec: 'apps/web-e2e/src/integration/tests/new-thing.integration.spec.ts',
          mapped: false,
          files: ['apps/web/src/pages/thing/Page.tsx'],
          suggestedGlobs: ['apps/web/src/pages/thing/**'],
        },
      ],
    };
    const res = remediate({
      audit,
      maps: { e2e: e2eMap(), integration: integrationMap() },
    });
    assert.equal(res.changed, true);
    assert.equal(res.summary.e2e.length, 1);
    assert.equal(res.summary.integration.length, 1);
    assert.ok(
      res.maps.e2e.specs['apps/web-e2e/src/tests/about-page.spec.ts'].includes(
        'apps/web/src/lib/**',
      ),
    );
    assert.ok(
      'apps/web-e2e/src/integration/tests/new-thing.integration.spec.ts' in
        res.maps.integration.specs,
    );
  });

  it('reports no change when there is no under-selection', () => {
    const res = remediate({
      audit: { underSelection: [], deadGlobs: [] },
      maps: { e2e: e2eMap(), integration: integrationMap() },
    });
    assert.equal(res.changed, false);
  });
});

describe('renderPrBody', () => {
  it('lists added globs and states the additive-only / no-auto-merge contract', () => {
    const body = renderPrBody(
      {
        e2e: [
          {
            spec: 'apps/web-e2e/src/tests/billing.spec.ts',
            onboarded: true,
            added: ['apps/web/src/pages/billing/**'],
          },
        ],
        integration: [],
      },
      { runUrl: 'https://github.com/x/y/actions/runs/1' },
    );
    assert.match(body, /additive-only/i);
    assert.match(body, /Never auto-merged/i);
    assert.match(body, /apps\/web\/src\/pages\/billing\/\*\*/);
    assert.match(body, /onboarded/i);
    assert.match(body, /actions\/runs\/1/);
  });

  it('omits both map sections but keeps the contract structure when summary is empty', () => {
    const body = renderPrBody({ e2e: [], integration: [] }, {});
    // No per-map sections...
    assert.doesNotMatch(body, /e2e-surface-map\.json/);
    assert.doesNotMatch(body, /integration-surface-map\.json/);
    // ...but the additive-only / never-auto-merge contract still renders.
    assert.match(body, /additive-only/i);
    assert.match(body, /Never auto-merged/i);
    assert.match(body, /Review notes/);
  });
});

describe('serializeMapFile', () => {
  // The remediation diff is only minimal if the printer reproduces the
  // committed, prettier-clean formatting byte-for-byte on untouched entries.
  for (const rel of REAL_MAPS) {
    it(`round-trips ${rel.split('/').pop()} byte-for-byte`, () => {
      const orig = readFileSync(new URL(rel, import.meta.url), 'utf8');
      assert.equal(serializeMapFile(JSON.parse(orig)), orig);
    });
  }

  it('inlines a short array and expands one that exceeds printWidth 80', () => {
    const out = serializeMap({
      specs: {
        'apps/web-e2e/src/tests/app.spec.ts': ['apps/web/src/pages/home/**'],
        'apps/web-e2e/src/tests/wide.spec.ts': [
          'apps/web/src/pages/baseball/**',
          'apps/web/src/pages/football/**',
        ],
      },
    });
    assert.match(
      out,
      /"apps\/web-e2e\/src\/tests\/app\.spec\.ts": \["apps\/web\/src\/pages\/home\/\*\*"\]/,
    );
    // Two globs inline clearly exceed 80 cols → one element per line.
    assert.match(
      out,
      /"apps\/web-e2e\/src\/tests\/wide\.spec\.ts": \[\n\s+"apps\/web\/src\/pages\/baseball\/\*\*",\n\s+"apps\/web\/src\/pages\/football\/\*\*"\n\s+\]/,
    );
  });

  it('ends with a single trailing newline', () => {
    const text = serializeMapFile({ specs: { a: ['x'] } });
    assert.ok(text.endsWith('}\n'));
    assert.ok(!text.endsWith('\n\n'));
  });
});
