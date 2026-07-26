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
  MAX_PR_BODY_CHARS,
  MAX_GLOBS_PER_SPEC,
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

  it('does not emit an omission note when everything fits', () => {
    const body = renderPrBody(
      {
        e2e: [
          {
            spec: 'apps/web-e2e/src/tests/billing.spec.ts',
            onboarded: false,
            added: ['apps/web/src/pages/billing/**'],
          },
        ],
        integration: [],
      },
      { runUrl: 'https://github.com/x/y/actions/runs/1' },
    );
    assert.doesNotMatch(body, /omitted/i);
    assert.doesNotMatch(body, /truncated/i);
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

  it('leads with exactly one jira-link marker declaring primary: none (LS-8338)', () => {
    // The PR carries the no-jira label but Jira Link Check also requires the
    // body to declare the marker — without it, assertion 1 in
    // jira-link-check.mjs fails every night.
    const body = renderPrBody({ e2e: [], integration: [] }, {});
    assert.match(body, /^<!-- jira-link\nprimary: none\n-->\n/);
    const markers = [...body.matchAll(/<!--\s*jira-link\b/gi)];
    assert.equal(markers.length, 1);
  });
});

describe('renderPrBody size cap (LS-7908)', () => {
  // GitHub's createPullRequest rejects bodies over 65,536 chars; the first
  // audit's backlog (103 specs / 2578 globs) rendered far past it and the bot
  // PR could never be opened.
  const RUN_URL = 'https://github.com/x/y/actions/runs/27253240347';

  /** A synthetic backlog summary with realistically long spec/glob paths. */
  const bigSummary = (specCount, globsPerSpec) => ({
    e2e: Array.from({ length: specCount }, (_, i) => ({
      spec: `apps/web-e2e/src/tests/some/deeply/nested/area-${String(i).padStart(4, '0')}.spec.ts`,
      onboarded: i % 3 === 0,
      added: Array.from(
        { length: globsPerSpec },
        (_, j) =>
          `apps/web/src/pages/some/deeply/nested/area-${i}/widget-${j}/**`,
      ),
    })),
    integration: [],
  });

  it('stays under the hard ceiling (and GitHub limit) on a huge backlog', () => {
    const body = renderPrBody(bigSummary(400, 30), { runUrl: RUN_URL });
    assert.ok(
      body.length <= MAX_PR_BODY_CHARS,
      `body is ${body.length} chars, ceiling is ${MAX_PR_BODY_CHARS}`,
    );
    assert.ok(body.length < 65536);
    // The contract footer must survive capping.
    assert.match(body, /additive-only/i);
    assert.match(body, /Never auto-merged/i);
    assert.match(body, /Review notes/);
    // The remainder is summarised with a pointer to the run.
    assert.match(body, /omitted/i);
    assert.match(body, /actions\/runs\/27253240347/);
  });

  it('respects a custom maxChars budget', () => {
    const body = renderPrBody(bigSummary(50, 10), {
      runUrl: RUN_URL,
      maxChars: 5000,
    });
    assert.ok(body.length <= 5000, `body is ${body.length} chars`);
    assert.match(body, /Review notes/);
  });

  it('accounts for every spec: listed + omitted equals the total', () => {
    const summary = bigSummary(40, 8);
    const body = renderPrBody(summary, { runUrl: RUN_URL, maxChars: 6000 });
    // Match spec entry bullets only (the footer also has `- **…**` bullets).
    const listed = (body.match(/^- \*\*apps\//gm) ?? []).length;
    const note = body.match(
      /\*\*(\d+) more spec\(s\) \((\d+) glob\(s\)\) omitted\*\*/,
    );
    assert.ok(note, 'expected an omission note');
    const omittedSpecs = Number(note[1]);
    const omittedGlobs = Number(note[2]);
    assert.equal(listed + omittedSpecs, 40);
    // Entries are dropped strictly from the tail, so the omitted glob count is
    // the sum over the unlisted suffix.
    const expectedGlobs = summary.e2e
      .slice(listed)
      .reduce((n, c) => n + c.added.length, 0);
    assert.equal(omittedGlobs, expectedGlobs);
  });

  it('caps the globs listed per spec and notes the elision', () => {
    const body = renderPrBody(
      {
        e2e: [
          {
            spec: 'apps/web-e2e/src/tests/wide.spec.ts',
            onboarded: false,
            added: Array.from(
              { length: MAX_GLOBS_PER_SPEC + 5 },
              (_, j) => `apps/web/src/pages/area-${j}/**`,
            ),
          },
        ],
        integration: [],
      },
      { runUrl: RUN_URL },
    );
    const globLines = (body.match(/^ {4}- `\+ /gm) ?? []).length;
    assert.equal(globLines, MAX_GLOBS_PER_SPEC);
    assert.match(body, /plus 5 more glob\(s\)/);
  });

  it('keeps the blank line between the listing and the footer rule', () => {
    // Without it, `---` directly under a text line parses as a setext heading
    // instead of a thematic break.
    const body = renderPrBody({ e2e: [], integration: [] }, {});
    assert.match(body, /\n\n---\n/);
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
