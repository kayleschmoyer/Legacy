/**
 * Unit tests for the surface-map drift auditor (LS-7850).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  unionFragments,
  collapseToDirGlobs,
  classifySpec,
  detectUnderSelection,
  detectDeadGlobs,
  auditCoverage,
  renderDiscord,
  renderReport,
} from '../audit-coverage.mjs';

const E2E_MAP = {
  runAllWhenChanged: ['lib/shared-components/src/**', 'apps/web/src/app/**'],
  specs: {
    'apps/web-e2e/src/tests/draft-functionality.spec.ts': [
      'apps/web/src/pages/draft/**',
      'lambdas/draft-processor/**',
    ],
    'apps/web-e2e/src/tests/about-page.spec.ts': [
      'apps/web/src/pages/about/**',
    ],
  },
};

const INTEGRATION_MAP = {
  runAllWhenChanged: ['lambdas/db/schema.graphql'],
  specs: {
    'apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts': [
      'apps/web/src/pages/draft/**',
      'lambdas/websocket/**',
    ],
  },
};

const MAPS = { e2e: E2E_MAP, integration: INTEGRATION_MAP };

describe('unionFragments', () => {
  it('unions files per spec across fragments, deduped', () => {
    const observed = unionFragments([
      { specs: { 's.ts': ['a.ts', 'b.ts'] } },
      { specs: { 's.ts': ['b.ts', 'c.ts'], 't.ts': ['d.ts'] } },
    ]);
    assert.deepEqual([...observed.get('s.ts')].sort(), [
      'a.ts',
      'b.ts',
      'c.ts',
    ]);
    assert.deepEqual([...observed.get('t.ts')], ['d.ts']);
  });

  it('is defensive against malformed fragments', () => {
    const observed = unionFragments([
      null,
      {},
      { specs: null },
      { specs: { 's.ts': 'not-an-array' } },
      { specs: { 's.ts': ['a.ts', 42] } },
    ]);
    assert.deepEqual([...observed.get('s.ts')], ['a.ts']);
  });
});

describe('collapseToDirGlobs', () => {
  it('collapses files to sorted, deduped directory globs', () => {
    assert.deepEqual(
      collapseToDirGlobs([
        'apps/web/src/pages/foo/Bar.tsx',
        'apps/web/src/pages/foo/Baz.tsx',
        'apps/web/src/pages/qux/Q.tsx',
      ]),
      ['apps/web/src/pages/foo/**', 'apps/web/src/pages/qux/**'],
    );
  });
});

describe('classifySpec', () => {
  it('routes integration before e2e', () => {
    assert.equal(
      classifySpec('apps/web-e2e/src/integration/tests/x.integration.spec.ts'),
      'integration',
    );
    assert.equal(classifySpec('apps/web-e2e/src/tests/x.spec.ts'), 'e2e');
    assert.equal(classifySpec('apps/web/src/pages/x.tsx'), null);
  });
});

describe('detectUnderSelection', () => {
  it('flags a covered file matched by no glob (HIGH, immediate)', () => {
    const observed = new Map([
      [
        'apps/web-e2e/src/tests/draft-functionality.spec.ts',
        new Set([
          'apps/web/src/pages/draft/Board.tsx', // matched by spec glob
          'apps/web/src/pages/newfeature/Widget.tsx', // NOT matched anywhere
        ]),
      ],
    ]);
    const findings = detectUnderSelection(observed, MAPS);
    assert.equal(findings.length, 1);
    assert.deepEqual(findings[0].files, [
      'apps/web/src/pages/newfeature/Widget.tsx',
    ]);
    assert.deepEqual(findings[0].suggestedGlobs, [
      'apps/web/src/pages/newfeature/**',
    ]);
    assert.equal(findings[0].mapped, true);
  });

  it('treats runAllWhenChanged as covered (no false positive)', () => {
    const observed = new Map([
      [
        'apps/web-e2e/src/tests/about-page.spec.ts',
        new Set([
          'apps/web/src/pages/about/Index.tsx',
          'lib/shared-components/src/Button.tsx', // in runAllWhenChanged
          'apps/web/src/app/Router.tsx', // in runAllWhenChanged
        ]),
      ],
    ]);
    assert.deepEqual(detectUnderSelection(observed, MAPS), []);
  });

  it('reports a spec absent from its map with all its files', () => {
    const observed = new Map([
      [
        'apps/web-e2e/src/tests/brand-new.spec.ts',
        new Set(['apps/web/src/pages/brand/New.tsx']),
      ],
    ]);
    const findings = detectUnderSelection(observed, MAPS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].mapped, false);
    assert.deepEqual(findings[0].files, ['apps/web/src/pages/brand/New.tsx']);
  });

  it('ignores specs outside both known suites', () => {
    const observed = new Map([['some/other/file.ts', new Set(['x.ts'])]]);
    assert.deepEqual(detectUnderSelection(observed, MAPS), []);
  });
});

describe('detectDeadGlobs', () => {
  const draftSpec = 'apps/web-e2e/src/tests/draft-functionality.spec.ts';

  it('does not flag a single miss (data-dependent under-cover)', () => {
    const observed = new Map([
      [draftSpec, new Set(['apps/web/src/pages/draft/Board.tsx'])],
    ]);
    const { findings, nextState } = detectDeadGlobs(observed, MAPS, null, 3);
    assert.deepEqual(findings, []);
    // draft glob alive -> 0; draft-processor glob missed once -> 1
    assert.equal(
      nextState.deadGlobCounters.e2e[draftSpec]['apps/web/src/pages/draft/**'],
      0,
    );
    assert.equal(
      nextState.deadGlobCounters.e2e[draftSpec]['lambdas/draft-processor/**'],
      1,
    );
  });

  it('flags only after K consecutive misses', () => {
    const observed = new Map([
      [draftSpec, new Set(['apps/web/src/pages/draft/Board.tsx'])],
    ]);
    let state = null;
    let lastFindings = [];
    for (let n = 0; n < 3; n++) {
      const r = detectDeadGlobs(observed, MAPS, state, 3);
      state = r.nextState;
      lastFindings = r.findings;
    }
    assert.equal(lastFindings.length, 1);
    assert.equal(lastFindings[0].glob, 'lambdas/draft-processor/**');
    assert.equal(lastFindings[0].consecutiveMisses, 3);
  });

  it('resets the counter when a glob matches again', () => {
    const missObserved = new Map([
      [draftSpec, new Set(['apps/web/src/pages/draft/Board.tsx'])],
    ]);
    let state = detectDeadGlobs(missObserved, MAPS, null, 3).nextState;
    state = detectDeadGlobs(missObserved, MAPS, state, 3).nextState;
    assert.equal(
      state.deadGlobCounters.e2e[draftSpec]['lambdas/draft-processor/**'],
      2,
    );
    // Now the processor surface is exercised — counter resets to 0.
    const aliveObserved = new Map([
      [
        draftSpec,
        new Set([
          'apps/web/src/pages/draft/Board.tsx',
          'lambdas/draft-processor/handler.ts',
        ]),
      ],
    ]);
    const r = detectDeadGlobs(aliveObserved, MAPS, state, 3);
    assert.deepEqual(r.findings, []);
    assert.equal(
      r.nextState.deadGlobCounters.e2e[draftSpec]['lambdas/draft-processor/**'],
      0,
    );
  });

  it('carries the counter forward unchanged when the spec did not run', () => {
    const seedState = {
      deadGlobCounters: {
        e2e: { [draftSpec]: { 'lambdas/draft-processor/**': 5 } },
        integration: {},
      },
    };
    // Empty observed map -> spec did not run this night.
    const r = detectDeadGlobs(new Map(), MAPS, seedState, 3);
    assert.deepEqual(r.findings, []); // not re-flagged from a non-observation
    assert.equal(
      r.nextState.deadGlobCounters.e2e[draftSpec]['lambdas/draft-processor/**'],
      5,
    );
  });

  it('prunes counters for globs no longer in the map', () => {
    const seedState = {
      deadGlobCounters: {
        e2e: {
          [draftSpec]: {
            'apps/web/src/pages/draft/**': 0,
            'lambdas/OLD-removed-glob/**': 9,
          },
        },
        integration: {},
      },
    };
    const observed = new Map([
      [draftSpec, new Set(['apps/web/src/pages/draft/Board.tsx'])],
    ]);
    const r = detectDeadGlobs(observed, MAPS, seedState, 3);
    const counters = r.nextState.deadGlobCounters.e2e[draftSpec];
    assert.ok(!('lambdas/OLD-removed-glob/**' in counters));
  });
});

describe('auditCoverage + rendering', () => {
  it('produces findings and renderers do not throw', () => {
    const fragments = [
      {
        specs: {
          'apps/web-e2e/src/tests/draft-functionality.spec.ts': [
            'apps/web/src/pages/draft/Board.tsx',
            'apps/web/src/pages/UNMAPPED/X.tsx',
          ],
        },
      },
    ];
    const result = auditCoverage({
      fragments,
      maps: MAPS,
      prevState: null,
      k: 3,
    });
    assert.equal(result.observedSpecCount, 1);
    assert.equal(result.underSelection.length, 1);
    const md = renderReport(result, { k: 3 });
    const discord = renderDiscord(result, { k: 3 });
    assert.match(md, /Under-selection/);
    assert.match(discord, /Under-selection/);
    assert.ok(discord.length < 4096);
  });

  it('reports a clean bill when everything is mapped', () => {
    const fragments = [
      {
        specs: {
          'apps/web-e2e/src/tests/about-page.spec.ts': [
            'apps/web/src/pages/about/Index.tsx',
          ],
        },
      },
    ];
    const result = auditCoverage({
      fragments,
      maps: MAPS,
      prevState: null,
      k: 3,
    });
    assert.equal(result.underSelection.length, 0);
    assert.match(renderReport(result, { k: 3 }), /None/);
  });
});
