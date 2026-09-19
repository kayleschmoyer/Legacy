/**
 * Live-skip guard for the dual-mode suite, `src/tests/shared/` (LS-10217).
 *
 * The `shared-live` project in `playwright.integration.config.ts` takes ALL
 * of `src/tests/shared/` as its `testDir` — there is no `testIgnore` — so
 * every `*.dual.spec.ts` runs against the live backend. A `LiveTestData` verb
 * that cannot be satisfied live throws a `*_LIVE_UNSUPPORTED_REASON` (see
 * `fixtures/test-data.ts`), which is correct, but it means any test calling
 * that verb must skip itself on live:
 *
 *     test.skip(
 *       testData.mode === 'live',
 *       'footballLineup() has no live implementation (LS-9655) — see ' +
 *         'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
 *     );
 *
 * Five football-lineup tests shipped with only a header comment claiming they
 * were "NOT registered on shared-live" and failed every nightly shard. This
 * scan derives the live-unsupported verbs from `LiveTestData` itself — no
 * hand-kept list to drift — and fails if a test body calls one without that
 * skip (naming the reason constant) ahead of the call.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DATA_FILE = path.resolve(__dirname, 'fixtures', 'test-data.ts');
const SHARED_DIR = path.resolve(__dirname, 'tests', 'shared');

/** Strips block and line comments so doc prose mentioning a verb is ignored. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Maps each `LiveTestData` method whose body throws a
 * `*_LIVE_UNSUPPORTED_REASON` to that constant's name.
 */
function liveUnsupportedVerbs(testDataSource: string): Map<string, string> {
  const start = testDataSource.indexOf('export class LiveTestData');
  assert.notEqual(start, -1, 'LiveTestData class not found in test-data.ts');
  const end = testDataSource.indexOf('\n}\n', start);
  const classBody = testDataSource.slice(start, end === -1 ? undefined : end);

  const verbs = new Map<string, string>();
  const method =
    /^ {2}(?:async )?(\w+)\([^)]*\)[^{\n]*\{\n([\s\S]*?)^ {2}\}$/gm;
  for (const [, name, body] of classBody.matchAll(method)) {
    const thrown = body.match(
      /throw new Error\((\w+_LIVE_UNSUPPORTED_REASON)\)/,
    );
    if (thrown) verbs.set(name, thrown[1]);
  }
  return verbs;
}

/**
 * Call sites of a live-unsupported verb that are not preceded, within their
 * own test body, by `test.skip(testData.mode === 'live', …)` naming the
 * verb's reason constant. A call outside any `test(...)` body (e.g. in a
 * `beforeEach`) is always reported.
 */
function unguardedCalls(
  specSource: string,
  verbs: ReadonlyMap<string, string>,
): string[] {
  const code = stripComments(specSource);
  const testStarts = [...code.matchAll(/\btest\(\s*['"`]/g)].map(
    (m) => m.index,
  );
  const hits: string[] = [];
  for (const call of code.matchAll(/testData\.(\w+)\(/g)) {
    const reason = verbs.get(call[1]);
    if (!reason) continue;
    const enclosing = testStarts.filter((i) => i < call.index).pop();
    const preamble =
      enclosing === undefined ? '' : code.slice(enclosing, call.index);
    const skip = preamble.match(
      /test\.skip\(\s*testData\.mode\s*===\s*'live'\s*,([\s\S]*?)\);/,
    );
    if (!skip || !skip[1].includes(reason)) {
      hits.push(`testData.${call[1]}() needs a live skip citing ${reason}`);
    }
  }
  return hits;
}

void test('every live-unsupported TestData verb is skipped on shared-live', () => {
  const verbs = liveUnsupportedVerbs(fs.readFileSync(TEST_DATA_FILE, 'utf-8'));
  // Sanity floor: if parsing breaks, the guard must fail rather than vacuously pass.
  assert.ok(
    verbs.has('footballLineup') && verbs.has('seasonRenewalDialog'),
    `LiveTestData parse found only: ${[...verbs.keys()].join(', ') || '(none)'}`,
  );

  const hits = fs
    .readdirSync(SHARED_DIR, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith('.dual.spec.ts'))
    .sort()
    .flatMap((entry) =>
      unguardedCalls(
        fs.readFileSync(path.join(SHARED_DIR, entry), 'utf-8'),
        verbs,
      ).map((hit) => `${entry}: ${hit}`),
    );

  assert.deepEqual(
    hits,
    [],
    'The shared-live project runs every spec under src/tests/shared/, so a ' +
      'test calling a verb LiveTestData deliberately throws for must skip ' +
      "itself first: test.skip(testData.mode === 'live', '… <REASON_CONSTANT> …'). " +
      `A header comment is not enough (LS-10217):\n${hits.join('\n')}`,
  );
});

void test('negative control: the scan flags an unskipped call and passes a skipped one', () => {
  const verbs = new Map([
    ['footballLineup', 'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON'],
  ]);
  const unskipped = [
    '/** testData.footballLineup() in a comment is ignored */',
    "test('a', async ({ testData }) => {",
    '  await testData.footballLineup();',
    '});',
  ].join('\n');
  const skipped = [
    "test('a', async ({ testData }) => {",
    "  test.skip(testData.mode === 'live', 'see FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON');",
    '  await testData.footballLineup();',
    '});',
    "test('b', async ({ testData }) => {",
    '  await testData.footballLineup();',
    '});',
  ].join('\n');

  assert.equal(unguardedCalls(unskipped, verbs).length, 1);
  // Test 'a' is guarded; test 'b' does not inherit the previous test's skip.
  assert.equal(unguardedCalls(skipped, verbs).length, 1);
  assert.deepEqual(unguardedCalls(skipped.split("test('b'")[0], verbs), []);
});
