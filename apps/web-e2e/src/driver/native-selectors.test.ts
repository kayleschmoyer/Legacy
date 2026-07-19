/**
 * Unit tests for the native selector-vocabulary translation (ADR-0016).
 *
 * Pure, hermetic node:test cases — no emulator, no WebdriverIO session. They
 * pin the testID→accessibility-id / role→a11y-tree mapping that every migrated
 * page object depends on, so a silent regression in the vocabulary translation
 * fails here in `pc-test` rather than on a device days later. Run via the
 * web-e2e `test` target (`tsx --test apps/web-e2e/src/**\/*.test.ts`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_KEYCODES,
  androidKeycode,
  escapeUiaString,
  labelSelector,
  placeholderSelector,
  roleSelector,
  testIdPrefixSelector,
  testIdSelector,
  textSelector,
} from './native-selectors';

// ---------------------------------------------------------------------------
// escapeUiaString
// ---------------------------------------------------------------------------

void test('escapeUiaString: escapes backslashes and double quotes only', () => {
  assert.equal(escapeUiaString('plain'), 'plain');
  assert.equal(escapeUiaString('say "hi"'), 'say \\"hi\\"');
  assert.equal(escapeUiaString('a\\b'), 'a\\\\b');
});

// ---------------------------------------------------------------------------
// testId / testIdPrefix
// ---------------------------------------------------------------------------

void test('testIdSelector: maps testID to the accessibility-id shorthand', () => {
  assert.equal(testIdSelector('draft-board'), '~draft-board');
});

void test('testIdPrefixSelector: maps a prefix to descriptionStartsWith', () => {
  assert.equal(
    testIdPrefixSelector('player-row-'),
    'android=new UiSelector().descriptionStartsWith("player-row-")',
  );
});

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

void test('textSelector: substring by default, exact when requested', () => {
  assert.equal(
    textSelector('Aaron'),
    'android=new UiSelector().textContains("Aaron")',
  );
  assert.equal(
    textSelector('Aaron Judge', { exact: true }),
    'android=new UiSelector().text("Aaron Judge")',
  );
});

void test('textSelector: RegExp maps to textMatches on the source', () => {
  assert.equal(
    textSelector(/draft.*now/i),
    'android=new UiSelector().textMatches("draft.*now")',
  );
});

// ---------------------------------------------------------------------------
// label
// ---------------------------------------------------------------------------

void test('labelSelector: exact string uses the accessibility-id shorthand', () => {
  assert.equal(labelSelector('Search', { exact: true }), '~Search');
});

void test('labelSelector: substring string uses descriptionContains', () => {
  assert.equal(
    labelSelector('Search'),
    'android=new UiSelector().descriptionContains("Search")',
  );
});

void test('labelSelector: RegExp uses descriptionMatches', () => {
  assert.equal(
    labelSelector(/search/i),
    'android=new UiSelector().descriptionMatches("search")',
  );
});

// ---------------------------------------------------------------------------
// placeholder
// ---------------------------------------------------------------------------

void test('placeholderSelector: string matches text OR content-desc via XPath', () => {
  assert.equal(
    placeholderSelector('Search players'),
    '//android.widget.EditText[contains(@text, "Search players") or contains(@content-desc, "Search players")]',
  );
});

void test('placeholderSelector: embedded quote falls back to concat()', () => {
  const selector = placeholderSelector('a"b');
  assert.ok(
    selector.includes('concat('),
    `expected concat() fallback for quoted literal, got: ${selector}`,
  );
});

void test('placeholderSelector: RegExp falls back to textMatches', () => {
  assert.equal(
    placeholderSelector(/search.*player/i),
    'android=new UiSelector().textMatches("search.*player")',
  );
});

// ---------------------------------------------------------------------------
// role
// ---------------------------------------------------------------------------

void test('roleSelector: known role maps to widget class + name', () => {
  assert.equal(
    roleSelector('button', { name: /draft.*now/i }),
    'android=new UiSelector().className("android.widget.Button").descriptionMatches("draft.*now")',
  );
});

void test('roleSelector: exact string name uses description()', () => {
  assert.equal(
    roleSelector('button', { name: 'Submit', exact: true }),
    'android=new UiSelector().className("android.widget.Button").description("Submit")',
  );
});

void test('roleSelector: unknown role matches by name alone (no class constraint)', () => {
  assert.equal(
    roleSelector('group', { name: 'Roster' }),
    'android=new UiSelector().descriptionContains("Roster")',
  );
});

void test('roleSelector: alert role maps to a text view', () => {
  assert.equal(
    roleSelector('alert'),
    'android=new UiSelector().className("android.widget.TextView")',
  );
});

// ---------------------------------------------------------------------------
// keycodes
// ---------------------------------------------------------------------------

void test('androidKeycode: resolves portable keys', () => {
  assert.equal(androidKeycode('Enter'), 66);
  assert.equal(androidKeycode('Escape'), 111);
  assert.equal(androidKeycode('ArrowDown'), ANDROID_KEYCODES.ArrowDown);
});

void test('androidKeycode: throws with guidance for an unmapped key', () => {
  assert.throws(() => androidKeycode('F13'), /no portable Android keycode/);
});
