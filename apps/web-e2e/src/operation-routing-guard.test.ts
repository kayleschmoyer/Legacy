/**
 * LS-9794 / LS-9866: operation-routing ambiguity invariant.
 *
 * Hermetic specs route mocked GraphQL responses by testing the request for an
 * operation name. The correct form is exact equality on the extracted name:
 *
 *   const op = extractOperationName(route).toLowerCase();
 *   if (op === 'getleaguebyid') { ... }
 *
 * The suite used to route by substring instead
 * (`postData.includes('getleague')`, `op.includes('league')`). Substring
 * routing is silently wrong whenever the tested substring is contained in
 * more than one real operation name: the first matching branch wins and
 * fulfills the route with another operation's response shape. That RESOLVES
 * rather than errors, so the spec either fails somewhere unrelated or passes
 * vacuously (LS-9413, flagged HIGH on PR #7097).
 *
 * The failure is latent — it only bites when operation names collide. Adding
 * a query named so that an existing tested substring is contained in it is a
 * routine change that nobody would think to check against hundreds of
 * substring tests. This test converts that from a burn-down into an
 * invariant: it cross-references every tested substring against the operation
 * names declared in `lib/graphql/src/**\/*.graphql` and fails when one matches
 * more than one operation.
 *
 * KNOWN_AMBIGUOUS was the burn-down baseline and is now empty (LS-9866), so
 * this test fails on ANY ambiguous site. Adding an entry is never the fix;
 * migrate the site to exact `extractOperationName(route)` equality instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

/**
 * Sites whose tested substring matches more than one real operation name
 * today. Format: `<spec basename>::<tested substring, lowercased>`.
 *
 * EMPTY, and it stays empty: LS-9866 finished the LS-9794 burn-down, so every
 * routing site in the suite uses exact `extractOperationName(route)` equality
 * and the ESLint ban in `apps/web-e2e/eslint.config.mjs` now runs with no
 * grandfather list. The assertions below are a plain invariant rather than a
 * ratchet — any ambiguous site is a new one.
 *
 * DO NOT ADD ENTRIES. Adding one is never the fix; migrate the site instead.
 */
const KNOWN_AMBIGUOUS: readonly string[] = [];

/** Identifiers that hold a GraphQL operation name (or the raw request body). */
const OPERATION_RECEIVERS = ['postData', 'opName', 'operationName', 'op'];

// The receiver must be a bare identifier, never a property access: a leading
// `.` is excluded so `req.operationName?.includes('League')` — an assertion
// over captured requests, not route dispatch — is not mistaken for routing.
// This matches the ESLint rule's semantics exactly; `no-restricted-properties`
// only fires when the object is an Identifier.
const ROUTING_CALL = new RegExp(
  `(?:^|[^A-Za-z0-9_$.])(${OPERATION_RECEIVERS.join('|')})` +
    String.raw`\??(?:\(\))?\.includes\(\s*'([^']*)'\s*\)`,
  'g',
);

/** This file's own basename — it contains the patterns it scans for. */
const SELF = 'operation-routing-guard.test.ts';

function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (
      existsSync(join(dir, 'apps', 'web-e2e')) &&
      existsSync(join(dir, 'lib', 'graphql'))
    ) {
      return dir;
    }
    const parent = resolve(dir, '..');
    assert.notEqual(parent, dir, 'could not locate the workspace root');
    dir = parent;
  }
}

function filesUnder(root: string, extension: string): string[] {
  return readdirSync(root, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => join(root, entry));
}

/** Every operation name declared in the repo's GraphQL documents. */
function declaredOperationNames(repoRoot: string): string[] {
  const names = new Set<string>();
  for (const file of filesUnder(
    join(repoRoot, 'lib', 'graphql', 'src'),
    '.graphql',
  )) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /^[ \t]*(?:query|mutation|subscription)[ \t]+([A-Za-z0-9_]+)/gm,
    )) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

interface RoutingSite {
  readonly file: string;
  readonly base: string;
  readonly line: number;
  readonly needle: string;
  /**
   * True for the `postData.includes('"getleague"')` idiom, which embeds the
   * JSON string delimiters. That makes the match quote-delimited, so it can
   * only hit an operation named exactly `GetLeague` — it is never ambiguous.
   * (It is a different hazard: 24 of the 27 `getleague` sites are this form
   * and no `GetLeague` operation exists, so those branches never fire at all.
   * Dead branches are tracked separately from ambiguity.)
   */
  readonly quoteDelimited: boolean;
  readonly key: string;
}

/** Every substring-routing site in the e2e suite. */
function routingSites(repoRoot: string): RoutingSite[] {
  const sites: RoutingSite[] = [];
  const srcRoot = join(repoRoot, 'apps', 'web-e2e', 'src');
  for (const file of filesUnder(srcRoot, '.ts')) {
    const base = basename(file);
    if (base === SELF) continue;
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        // Skip comments. Migrated files routinely quote the old
        // `postData.includes('...')` form to explain what was replaced and
        // why — documenting the pattern must not read as using it.
        const trimmed = line.trimStart();
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*')
        ) {
          return;
        }
        for (const match of line.matchAll(ROUTING_CALL)) {
          const raw = match[2];
          const quoteDelimited =
            raw.length > 1 && raw.startsWith('"') && raw.endsWith('"');
          const needle = (
            quoteDelimited ? raw.slice(1, -1) : raw
          ).toLowerCase();
          sites.push({
            file: file
              .slice(repoRoot.length + 1)
              .split(sep)
              .join('/'),
            base,
            line: index + 1,
            needle,
            quoteDelimited,
            key: `${base}::${needle}`,
          });
        }
      });
  }
  return sites;
}

void test('LS-9794: no tested substring matches more than one GraphQL operation', () => {
  const repoRoot = findRepoRoot();
  const operations = declaredOperationNames(repoRoot);
  assert.ok(
    operations.length > 100,
    `expected to find the repo's GraphQL operations, found ${operations.length}`,
  );

  const sites = routingSites(repoRoot);
  const collisionsFor = (needle: string): string[] =>
    operations.filter((op) => op.toLowerCase().includes(needle));

  const baseline = new Set(KNOWN_AMBIGUOUS);
  const ambiguous = sites.filter(
    (site) => !site.quoteDelimited && collisionsFor(site.needle).length > 1,
  );

  // 1. No ambiguous site outside the baseline. This is what fires when a new
  //    .graphql operation collides with an existing tested substring, or when
  //    a new substring-routing site is added.
  const unexpected = ambiguous.filter((site) => !baseline.has(site.key));
  const describe = (site: RoutingSite): string => {
    const hits = collisionsFor(site.needle);
    return (
      `  ${site.file}:${site.line} — '${site.needle}' matches ${hits.length} operations: ` +
      `${hits.slice(0, 6).join(', ')}${hits.length > 6 ? ', …' : ''}`
    );
  };
  assert.deepEqual(
    unexpected.map(describe),
    [],
    'Substring operation routing matches more than one real GraphQL operation. ' +
      'The first matching branch wins and fulfills the route with the wrong ' +
      'response shape. Migrate the site to exact equality:\n' +
      "  const op = extractOperationName(route).toLowerCase();\n  if (op === '<operation>') { ... }\n" +
      'Do NOT add it to KNOWN_AMBIGUOUS — that list only shrinks (LS-9794).\n' +
      unexpected.map(describe).join('\n'),
  );

  // 2. Ratchet: a baseline entry that is no longer ambiguous must be deleted,
  //    so the list cannot silently stop shrinking.
  const stillAmbiguous = new Set(ambiguous.map((site) => site.key));
  const stale = [...baseline].filter((key) => !stillAmbiguous.has(key)).sort();
  assert.deepEqual(
    stale,
    [],
    'These KNOWN_AMBIGUOUS entries are no longer ambiguous — delete them from ' +
      `the list (LS-9794 burn-down ratchet):\n${stale.map((k) => `  ${k}`).join('\n')}`,
  );
});
