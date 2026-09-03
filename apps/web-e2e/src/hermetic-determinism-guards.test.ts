/**
 * Determinism guards for the HERMETIC spec suite, `src/tests/` (LS-9793).
 *
 * The sibling guard in `integration/determinism-guards.test.ts` (LS-7845)
 * covers only `src/integration/tests/`, so the hermetic suite — which holds
 * the largest concentration of `networkidle` waits in the repo — had no
 * file-scan backstop at all.
 *
 * Why a file scan when ESLint already bans the antipattern: the LS-4456 and
 * LS-9660 selectors match the *syntax* of a call site, so they only fire on a
 * literal at the call. `apps/web-e2e/src/pages/players.page.ts` took the value
 * as a PARAMETER instead —
 *
 *     async gotoDetail(playerId: number, waitUntil = 'load') {
 *       await page.waitForLoadState(waitUntil);   // Identifier, not Literal
 *     }
 *
 * — so neither rule fired on the page object NOR on the 191 specs calling
 * `playersPage.gotoDetail(1, <the banned string>)`. A ban the largest cluster
 * of call sites routes around is not enforcing its invariant. This scan is
 * blind to syntax: it looks for the token itself, so no future signature
 * change can reopen the hole.
 *
 * Relationship to the ESLint grandfather list: `eslint.config.mjs` exempts a
 * union of pre-existing offenders (`ls9660GrandfatheredSpecFiles`) from the
 * LS-9660 rules. {@link BURN_DOWN_ALLOWLIST} below is the strict
 * `networkidle`-only subset of that list — the files LS-9676 still has to
 * clean up. It is a RATCHET, not an escape hatch:
 *
 *   - a file NOT on the list may not contain the token at all; and
 *   - a file ON the list must still contain it, so an entry cannot outlive
 *     the violation it documents.
 *
 * Add nothing here. Fix the wait instead: gate on a stable test id
 * (`expectOpen()`, `expectNotLoading()`), `waitForResponse(operationName)`,
 * or an auto-retrying assertion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TESTS_DIR = path.resolve(__dirname, 'tests');

/**
 * Matched as a RegExp rather than a string literal on purpose: the LS-9793
 * ESLint rule bans the bare token as a call argument everywhere under `src/`,
 * and this guard is not exempt from its own rule.
 */
const BANNED_WAIT = /networkidle/;

/**
 * Hermetic specs that still contain the banned wait, pending the LS-9676
 * burn-down. Every entry is also on `ls9660GrandfatheredSpecFiles` in
 * `apps/web-e2e/eslint.config.mjs`; each one uses the token directly
 * (`page.waitForLoadState(...)` / a `waitUntil:` option), which the existing
 * LS-9660 selectors already describe — none is a parameter pass-through.
 *
 * DELETE an entry as its file is cleaned up. Do not add.
 */
const BURN_DOWN_ALLOWLIST: readonly string[] = [
  'admin-jwt-decoder.spec.ts',
  'baseball-ui.spec.ts',
  'commissioner-audit-delete.spec.ts',
  'commissioner-draft-status.spec.ts',
  'disclosure-game.spec.ts',
  'draft-functionality.spec.ts',
  'draft-graphql-integration.spec.ts',
  'football-hub.spec.ts',
  'form-a11y.spec.ts',
  'loading-state-a11y.spec.ts',
  'mid-draft-trades.spec.ts',
  'pre-draft-lobby-trades.spec.ts',
  'tab-navigation-a11y.spec.ts',
  'twenty-questions.spec.ts',
];

/** Every `.ts` file under `src/tests/`, recursively (includes `shared/`). */
function specFiles(): string[] {
  return fs
    .readdirSync(TESTS_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => path.join(TESTS_DIR, entry))
    .sort();
}

/**
 * Lines that reference `pattern` in CODE. Pure comment lines (`//…`, `*…`,
 * `/*…`) are skipped so a doc comment explaining why the antipattern was
 * removed — as several player-detail specs now carry — does not trip the
 * guard.
 */
function codeHits(file: string, pattern: RegExp): string[] {
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .flatMap((line, i) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      ) {
        return [];
      }
      return pattern.test(line) ? [`${path.basename(file)}:${i + 1}`] : [];
    });
}

void test('no networkidle waits in hermetic specs outside the LS-9676 burn-down list', () => {
  const allowed = new Set(BURN_DOWN_ALLOWLIST);
  const hits = specFiles()
    .filter((file) => !allowed.has(path.basename(file)))
    .flatMap((file) => codeHits(file, BANNED_WAIT));

  assert.deepEqual(
    hits,
    [],
    'networkidle never settles reliably with Apollo polling and WebSocket ' +
      'heartbeats, and under 4-worker CI load it can stall past the entire ' +
      'expect budget (LS-9457). This includes passing it THROUGH a page-object ' +
      'parameter such as playersPage.gotoDetail(id, …) — the ESLint selectors ' +
      'only see a literal at the call site, which is the hole LS-9793 closed. ' +
      `Gate on a stable test id instead:\n${hits.join('\n')}`,
  );
});

void test('LS-9676 burn-down allowlist has no stale entries', () => {
  const present = new Set(
    specFiles()
      .filter((file) => codeHits(file, BANNED_WAIT).length > 0)
      .map((file) => path.basename(file)),
  );
  const stale = BURN_DOWN_ALLOWLIST.filter((name) => !present.has(name));

  assert.deepEqual(
    stale,
    [],
    'These files are clean — delete them from BURN_DOWN_ALLOWLIST (and from ' +
      '`ls9660GrandfatheredSpecFiles` in apps/web-e2e/eslint.config.mjs if ' +
      `they are clean of the positional-locator rules too):\n${stale.join('\n')}`,
  );
});
