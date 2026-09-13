/**
 * Unit + integration tests for the graph-derived e2e surface map generator
 * (LS-9661). Two layers:
 *
 *   1. Mini-repo fixture (fixtures/mini/) — exercises alias resolution,
 *      demand-driven barrel narrowing, route extraction (literal / template /
 *      const / POM / loop fallback), route matching, and determinism on a
 *      tree small enough to assert exact membership.
 *   2. Real repo — the generator must map EVERY hermetic spec on disk (this
 *      is the presence guarantee that repoints the old hand-map presence
 *      lint at the generator, AC6) and finish well inside the 60-second AC1
 *      budget.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL,
  buildClosure,
  createResolver,
  derive,
  extractImports,
  extractRoutes,
  extractRouteLiterals,
  loadPathAliases,
  parseJsonc,
  parseRouteTable,
  resolveComponentSpecifiers,
  resolveSpecifier,
  routeMatches,
  RUN_ALL_CORE,
  WILDCARD_SEGMENT,
} from '../derive-surface-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MINI = path.join(HERE, 'fixtures/mini');
const REPO_ROOT = path.resolve(HERE, '../../../..');

describe('parseJsonc', () => {
  it('tolerates line comments and trailing commas without corrupting glob strings', () => {
    const parsed = parseJsonc(
      '{\n  // comment\n  "paths": { "@x/*": ["src/*"], },\n}',
    );
    assert.deepEqual(parsed.paths['@x/*'], ['src/*']);
  });
});

describe('extractImports', () => {
  it('captures named, default, namespace, side-effect and dynamic imports', () => {
    const r = extractImports(
      `import Def, { a, b as c } from './x';\n` +
        `import * as ns from './y';\n` +
        `import './side';\n` +
        `const p = import('./dyn');\n`,
    );
    const bySpec = Object.fromEntries(
      r.imports.map((i) => [i.specifier, i.names]),
    );
    assert.deepEqual(new Set(bySpec['./x']), new Set(['default', 'a', 'b']));
    assert.deepEqual(bySpec['./y'], [ALL]);
    assert.deepEqual(bySpec['./side'], [ALL]);
    assert.deepEqual(r.dynamic, ['./dyn']);
  });

  it('skips type-only imports and type re-exports (erased at runtime)', () => {
    const r = extractImports(
      `import type { T } from './types';\nexport type { U } from './more-types';\n`,
    );
    assert.equal(r.imports.length, 0);
    assert.equal(r.reexports.length, 0);
  });

  it('parses re-export tables with renames and wildcards, and detects pure barrels', () => {
    const r = extractImports(
      `export { A, B as C } from './ab';\nexport * from './wild';\n`,
    );
    assert.equal(r.isPureBarrel, true);
    const named = r.reexports.find((x) => x.specifier === './ab');
    assert.deepEqual(
      named.pairs ??
        named.names.map((from, i) => ({ from, to: named.exported[i] })),
      [
        { from: 'A', to: 'A' },
        { from: 'B', to: 'C' },
      ],
    );
    const wild = r.reexports.find((x) => x.specifier === './wild');
    assert.equal(wild.names, null);
  });

  it('marks modules with local code as non-barrels', () => {
    const r = extractImports(`export { A } from './a';\nexport const x = 1;\n`);
    assert.equal(r.isPureBarrel, false);
  });
});

describe('resolveSpecifier', () => {
  const aliases = loadPathAliases(MINI);

  it('resolves relative imports with extension and index probing', () => {
    assert.equal(
      resolveSpecifier('./app/app', 'apps/web/src/main.tsx', aliases, MINI),
      'apps/web/src/app/app.tsx',
    );
  });

  it('resolves exact and wildcard tsconfig aliases', () => {
    assert.equal(
      resolveSpecifier('@mini/lib', 'apps/web/src/app/app.tsx', aliases, MINI),
      'lib/mini-lib/src/index.ts',
    );
    assert.equal(
      resolveSpecifier(
        '@mini/lib/button',
        'apps/web/src/app/app.tsx',
        aliases,
        MINI,
      ),
      'lib/mini-lib/src/button.ts',
    );
  });

  it('returns null for bare externals and node_modules-targeted aliases', () => {
    assert.equal(
      resolveSpecifier('react', 'apps/web/src/main.tsx', aliases, MINI),
      null,
    );
    assert.equal(
      resolveSpecifier(
        '@external/thing',
        'apps/web/src/main.tsx',
        aliases,
        MINI,
      ),
      null,
    );
  });
});

describe('buildClosure (demand-driven narrowing)', () => {
  const aliases = loadPathAliases(MINI);

  it('demanding one name from a pure barrel also pulls sibling re-export subtrees (LS-9689)', () => {
    // A prior version of buildClosure narrowed to just the matching
    // re-export edge here, on the theory that `Button` staying unused meant
    // `DraftWidget`'s subtree stayed unloaded. Real ESM module linking always
    // resolves every `export … from` statement in a loaded module regardless
    // of which name a downstream consumer wants — the LS-9689 shadow audit's
    // dominant under-selection cause was exactly this gap between the two.
    const moduleOf = createResolver(MINI, aliases);
    const closure = buildClosure(
      [['lib/mini-lib/src/index.ts', 'Button']],
      moduleOf,
      { followDynamic: true },
    );
    assert.ok(closure.has('lib/mini-lib/src/button.ts'));
    assert.ok(closure.has('lib/mini-lib/src/shared.ts'));
    assert.ok(closure.has('lib/mini-lib/src/draft-widget.ts'));
    assert.ok(closure.has('lib/mini-lib/src/draft-internals.ts'));
  });

  it('demanding a LOCAL name from a mixed barrel still pulls its re-export targets (LS-10056)', () => {
    // A MIXED barrel has local code AND `export … from` statements. LS-9689
    // gated the "re-exports always evaluate" rule on `isPureBarrel`, so
    // demanding a locally-declared name here matched no re-export pair and
    // the re-export targets were never queued at all. Real ESM linking
    // evaluates them regardless of which name the consumer wants.
    //
    // This is the exact shape of lib/logging/src/index.ts (a local `LOGGER`
    // const next to a re-exported platform stub): the repo-wide
    // `import { LOGGER } from '@legacy-sports/logging'` idiom left the stub
    // as the only module in the instrumented web bundle that no derived
    // spec set accounted for.
    const moduleOf = createResolver(MINI, aliases);
    const closure = buildClosure(
      [['lib/mini-logging/src/index.ts', 'LOGGER']],
      moduleOf,
      { followDynamic: true },
    );
    assert.ok(
      closure.has('lib/mini-logging/src/factories.ts'),
      'the local name must still reach the import edge that defines it',
    );
    assert.ok(
      closure.has('lib/mini-logging/src/device-file-stub.ts'),
      're-export targets of a mixed barrel must be reached even when the demanded name is local',
    );
  });

  it('a non-barrel module still narrows its own import edges to the demanded name', () => {
    // Precision is preserved where it's actually safe: a module with LOCAL
    // CODE (not a pure re-export barrel) only activates the import edges its
    // own imports carry — a direct, non-barrel import of one file is not
    // affected by this ticket's fix.
    const moduleOf = createResolver(MINI, aliases);
    const closure = buildClosure(
      ['apps/web/src/pages/draft/DraftPage.tsx'],
      moduleOf,
      { followDynamic: false },
    );
    assert.ok(closure.has('apps/web/src/pages/draft/draft-helper.ts'));
  });

  it('an ALL demand on a barrel pulls everything it re-exports', () => {
    const moduleOf = createResolver(MINI, aliases);
    const closure = buildClosure(['lib/mini-lib/src/index.ts'], moduleOf, {
      followDynamic: true,
    });
    assert.ok(closure.has('lib/mini-lib/src/draft-internals.ts'));
    assert.ok(closure.has('lib/mini-lib/src/shared.ts'));
  });

  it('follows dynamic imports only when asked', () => {
    const moduleOf = createResolver(MINI, aliases);
    const withDyn = buildClosure(
      ['apps/web/src/pages/draft/DraftPage.tsx'],
      moduleOf,
      { followDynamic: true },
    );
    const withoutDyn = buildClosure(
      ['apps/web/src/pages/draft/DraftPage.tsx'],
      moduleOf,
      { followDynamic: false },
    );
    assert.ok(withDyn.has('apps/web/src/pages/draft/draft-lazy-panel.ts'));
    assert.ok(!withoutDyn.has('apps/web/src/pages/draft/draft-lazy-panel.ts'));
  });
});

describe('extractRoutes', () => {
  it('captures string and template literals on page/driver receivers', () => {
    const r = extractRoutes(
      "await page.goto('/about');\nawait this.driver.goto(`/league/${id}/draft`);",
    );
    assert.deepEqual(
      r.routes,
      [`/league/${WILDCARD_SEGMENT}/draft`, '/about'].sort(),
    );
    assert.deepEqual(r.unresolved, []);
  });

  it('resolves same-file const identifiers', () => {
    const r = extractRoutes("const URL = '/about';\nawait page.goto(URL);");
    assert.deepEqual(r.routes, ['/about']);
  });

  it('ignores POM-object goto calls (data args, not routes)', () => {
    const r = extractRoutes('await waiversPage.goto(LEAGUE_ID);');
    assert.deepEqual(r.routes, []);
    assert.deepEqual(r.unresolved, []);
  });

  it('skips method declarations and enclosing-parameter identifiers', () => {
    const r = extractRoutes(
      'async goto(leagueId: number): Promise<void> {\n  await this.page.goto(leagueId);\n}',
    );
    assert.deepEqual(r.routes, []);
    assert.deepEqual(r.unresolved, []);
  });

  it('skips default-value method declarations with no type annotation (LS-9994)', () => {
    // players.page.ts's own `goto(query = '')` matched the bare-goto call
    // shape and, lacking a `:` type annotation, fell through the
    // declaration guard as an unresolved `query` identifier — propagating
    // a warning to every spec that imports the page object (~100 specs).
    const r = extractRoutes(
      "async goto(query = ''): Promise<void> {\n  await this.driver.open(`/players?sport=nfl${query}`);\n}",
    );
    assert.deepEqual(r.routes, []);
    assert.deepEqual(r.unresolved, []);
  });

  it('reports genuinely unresolvable goto arguments', () => {
    const r = extractRoutes('await page.goto(someUrlFromNowhere);');
    assert.deepEqual(r.unresolved, ['someUrlFromNowhere']);
  });

  it('harvests open() literals as weak routes only', () => {
    const r = extractRoutes(
      "await this.open('/league/1/roster', 'main');\nawait this.open(mystery);",
    );
    assert.deepEqual(r.weakRoutes, ['/league/1/roster']);
    assert.deepEqual(r.unresolved, []);
  });

  it('ignores http(s) URLs and non-route strings', () => {
    const r = extractRoutes(
      "await page.goto('https://example.com/x');\nawait page.goto('about:blank');",
    );
    assert.deepEqual(r.routes, []);
  });

  it('ignores goto()/open() text inside a test/describe title (LS-9689)', () => {
    const r = extractRoutes(
      "test('page.goto(commissionerUrl) detects Season Active', async ({ page }) => {\n" +
        "  await page.goto('/baseball/league/1/commissioner');\n" +
        '});',
    );
    assert.deepEqual(r.routes, ['/baseball/league/1/commissioner']);
    assert.deepEqual(r.unresolved, []);
  });

  it('ignores goto()/open() text inside a line comment (LS-9689)', () => {
    const r = extractRoutes(
      '// goto(commissionerUrl) always finds it.\n' +
        "await page.goto('/baseball/league/1/commissioner');",
    );
    assert.deepEqual(r.routes, ['/baseball/league/1/commissioner']);
    assert.deepEqual(r.unresolved, []);
  });

  it('does not treat "://" inside a line comment as a call', () => {
    const r = extractRoutes(
      "// see https://example.com/docs for details\nawait page.goto('/about');",
    );
    assert.deepEqual(r.routes, ['/about']);
    assert.deepEqual(r.unresolved, []);
  });
});

describe('extractRouteLiterals', () => {
  it('collects route-looking literals and wildcards template holes', () => {
    const lits = extractRouteLiterals(
      "const a = ['/about', `/league/${id}/draft`, 'not-a-route', '//cdn.example'];",
    );
    assert.ok(lits.includes('/about'));
    assert.ok(lits.includes(`/league/${WILDCARD_SEGMENT}/draft`));
    assert.ok(!lits.some((l) => l.startsWith('//')));
  });
});

describe('routeMatches', () => {
  it('matches exact, param, and template-hole segments', () => {
    assert.ok(routeMatches('/about', '/about'));
    assert.ok(routeMatches('/league/:id/draft', '/league/7/draft'));
    assert.ok(
      routeMatches('/league/:id/draft', `/league/${WILDCARD_SEGMENT}/draft`),
    );
    assert.ok(!routeMatches('/league/:id/draft', '/league/7'));
    assert.ok(!routeMatches('/about', '/aboutx'));
  });

  it('supports catch-all patterns', () => {
    assert.ok(routeMatches('*', '/anything/at/all'));
  });

  it('strips query and hash from visited paths', () => {
    assert.ok(routeMatches('/about', '/about?tab=1#top'));
  });
});

describe('parseRouteTable + resolveComponentSpecifiers', () => {
  const appSource = [
    "import { Eager } from '../pages/eager/EagerPage';",
    "const LazyPage = lazyWithRetry(() => import('../pages/lazy/LazyPage'));",
    'function LocalWrapper() {',
    '  return <LazyPage />;',
    '}',
    '<Routes>',
    '  <Route path="/eager" element={<Eager />} />',
    '  <Route path="/lazy" element={<LocalWrapper />} />',
    '  <Route path="/gone" element={<Navigate to="/" replace />} />',
    '</Routes>',
  ].join('\n');

  it('maps route patterns to element identifiers and resolves through local wrappers', () => {
    const table = parseRouteTable(appSource);
    const byPattern = Object.fromEntries(
      table.routes.map((r) => [r.pattern, r.components]),
    );
    assert.ok(byPattern['/eager'].includes('Eager'));
    assert.deepEqual(resolveComponentSpecifiers('Eager', table), [
      '../pages/eager/EagerPage',
    ]);
    // Local-wrapper body capture is bounded by the NEXT top-level declaration,
    // so a wrapper that is the last declaration conservatively over-collects —
    // membership (not exact equality) is the contract.
    assert.ok(
      resolveComponentSpecifiers('LocalWrapper', table).includes(
        '../pages/lazy/LazyPage',
      ),
    );
    // Navigate is external — resolves to nothing rather than exploding.
    assert.deepEqual(resolveComponentSpecifiers('Navigate', table), []);
  });
});

describe('derive() on the mini fixture repo', () => {
  const { manifest, stats } = derive({ repoRoot: MINI });

  it('maps every spec on disk', () => {
    assert.deepEqual(Object.keys(manifest.specs).sort(), [
      'apps/web-e2e/src/tests/about.spec.ts',
      'apps/web-e2e/src/tests/draft.spec.ts',
      'apps/web-e2e/src/tests/loop.spec.ts',
      'apps/web-e2e/src/tests/redirect.spec.ts',
    ]);
  });

  it('a spec that only visits a pure <Navigate> redirect route reaches the destination page (LS-9994)', () => {
    // /home renders <Navigate to="/" replace /> and nothing else.
    // resolveComponentSpecifiers('Navigate', …) always returns [] (it's a
    // react-router-dom export), so without redirect-following /home's own
    // route entry would carry zero files and a spec that only ever visits
    // it would never reach "/"'s real destination (HomeScreen -> AboutTeaser
    // -> AboutPage) — the faq-page.spec.ts residual finding in real life.
    const redirect = manifest.specs['apps/web-e2e/src/tests/redirect.spec.ts'];
    assert.ok(redirect.includes('apps/web/src/pages/about/AboutPage.tsx'));
  });

  it('emits the hand-maintained runAllWhenChanged core', () => {
    assert.deepEqual(manifest.runAllWhenChanged, RUN_ALL_CORE);
  });

  it('every spec reaches itself and the app shell', () => {
    for (const [spec, files] of Object.entries(manifest.specs)) {
      assert.ok(files.includes(spec), `${spec} must include itself`);
      assert.ok(
        files.includes('apps/web/src/main.tsx'),
        `${spec} must include the app shell entry`,
      );
    }
  });

  it('a spec reaches its own page plus every sibling a shared barrel it touches re-exports (LS-9689)', () => {
    // AboutPage imports Button from the SAME pure barrel (@mini/lib) that
    // also re-exports DraftWidget — real ESM module linking loads
    // draft-widget.ts (and its own import, draft-internals.ts) the moment
    // the barrel is loaded for Button, regardless of whether AboutPage ever
    // references DraftWidget. Previously this function narrowed to just the
    // Button edge, which is exactly the assumption the LS-9689 shadow audit
    // showed was producing real under-selection. What stays precise: the
    // DraftPage MODULE itself (as opposed to files re-exported alongside it
    // from a shared barrel) is still untouched — about.spec.ts never reaches
    // DraftPage.tsx, because nothing in its own closure imports it.
    const about = manifest.specs['apps/web-e2e/src/tests/about.spec.ts'];
    assert.ok(about.includes('apps/web/src/pages/about/AboutPage.tsx'));
    assert.ok(about.includes('lib/mini-lib/src/button.ts'));
    assert.ok(
      about.includes('lib/mini-lib/src/draft-internals.ts'),
      'about spec must reach draft internals through the shared barrel',
    );
    assert.ok(!about.includes('apps/web/src/pages/draft/DraftPage.tsx'));
  });

  it('a POM-navigated spec reaches the routed page closure incl. lazy chunks', () => {
    const draft = manifest.specs['apps/web-e2e/src/tests/draft.spec.ts'];
    assert.ok(draft.includes('apps/web-e2e/src/pages/draft.pom.ts'));
    assert.ok(draft.includes('apps/web/src/pages/draft/DraftPage.tsx'));
    assert.ok(draft.includes('apps/web/src/pages/draft/draft-helper.ts'));
    assert.ok(draft.includes('apps/web/src/pages/draft/draft-lazy-panel.ts'));
    assert.ok(draft.includes('lib/mini-lib/src/draft-internals.ts'));
  });

  it('loop-variable gotos fall back to closure route literals, not everything', () => {
    const loop = manifest.specs['apps/web-e2e/src/tests/loop.spec.ts'];
    assert.ok(loop.includes('apps/web/src/pages/about/AboutPage.tsx'));
    assert.ok(loop.includes('apps/web/src/pages/draft/DraftPage.tsx'));
    assert.ok(
      stats.warnings.some((w) => w.includes('loop.spec.ts')),
      'fallback must be surfaced as a warning',
    );
  });

  it('is deterministic', () => {
    const second = derive({ repoRoot: MINI });
    assert.deepEqual(second.manifest, manifest);
  });
});

describe('derive() on the real repo (presence guarantee + AC1 budget)', () => {
  it('maps every hermetic spec on disk in under 60 seconds', () => {
    const started = Date.now();
    const { manifest } = derive({ repoRoot: REPO_ROOT });
    const elapsedMs = Date.now() - started;

    const specsDir = path.join(REPO_ROOT, 'apps/web-e2e/src/tests');
    const onDisk = readdirSync(specsDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.spec.ts'))
      .map((f) => `apps/web-e2e/src/tests/${f.split(path.sep).join('/')}`)
      .sort();

    assert.deepEqual(
      Object.keys(manifest.specs).sort(),
      onDisk,
      'derived manifest must cover exactly the specs on disk',
    );
    for (const [spec, files] of Object.entries(manifest.specs)) {
      assert.ok(files.length > 0, `${spec} has an empty reachable set`);
      assert.ok(files.includes(spec), `${spec} must include itself`);
    }
    assert.ok(
      elapsedMs < 60_000,
      `derivation took ${elapsedMs}ms — AC1 requires <60s`,
    );
  });
});
