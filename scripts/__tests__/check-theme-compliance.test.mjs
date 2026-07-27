/**
 * Tests for the line classifier in scripts/check-theme-compliance.mjs (LS-8519).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-theme-compliance.test.mjs
 *
 * These pin the classifier's edge cases: comment lines never count (so doc
 * references like "// mirrors #C5A55A" are safe), 3/4-digit hex only counts
 * when quote-adjacent (so prose issue references like "#6112" don't), and the
 * $blue/theme="blue" bans match both JSX and object-literal forms.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  classifyLine,
  stripComments,
  CLASSES,
} from '../check-theme-compliance.mjs';

// --- stripComments ----------------------------------------------------------

test('stripComments: full-line and trailing comments are removed', () => {
  assert.equal(stripComments('// mirrors #C5A55A from colors.ts'), '');
  assert.equal(stripComments(' * gold accent #C5A55A'), '');
  assert.equal(
    stripComments("color: '$brandGold', // was #C5A55A"),
    "color: '$brandGold', ",
  );
});

// --- rawHex -----------------------------------------------------------------

test('rawHex: 6- and 8-digit hex literals count', () => {
  assert.deepEqual(classifyLine("backgroundColor: '#0A0F1A',"), ['rawHex']);
  assert.deepEqual(classifyLine('color="#F8FAFC80"'), ['rawHex']);
});

test('rawHex: short hex counts only when quoted', () => {
  assert.deepEqual(classifyLine("color: '#fff',"), ['rawHex']);
  assert.deepEqual(classifyLine('// see PR #6112 and issue #123'), []);
  assert.deepEqual(classifyLine("label: 'shipped in #6112'"), []);
});

test('rawHex: comment-only hex references do not count', () => {
  assert.deepEqual(classifyLine('// mirror apps/web colors.ts #C5A55A'), []);
});

// --- rawRgba ----------------------------------------------------------------

test('rawRgba: rgb() and rgba() literals count', () => {
  assert.deepEqual(classifyLine("shadowColor: 'rgba(8, 12, 20, 0.6)',"), [
    'rawRgba',
  ]);
  assert.deepEqual(classifyLine("border: '1px solid rgb(47, 59, 83)'"), [
    'rawRgba',
  ]);
});

test('rawRgba: withAlpha() helper calls do not count', () => {
  assert.deepEqual(
    classifyLine('borderColor={withAlpha(BRAND_NAVY, 0.5)}'),
    [],
  );
});

// --- blueToken --------------------------------------------------------------

test('blueToken: $blue1–$blue12 tokens count in any string position', () => {
  assert.deepEqual(classifyLine('backgroundColor="$blue9"'), ['blueToken']);
  assert.deepEqual(classifyLine("return { bg: '$blue3', text: '$blue11' };"), [
    'blueToken',
  ]);
});

test('blueToken: brand tokens do not count', () => {
  assert.deepEqual(classifyLine('backgroundColor="$brandNavyLight"'), []);
});

// --- themeBlue --------------------------------------------------------------

test('themeBlue: JSX prop and object-literal forms count', () => {
  assert.deepEqual(classifyLine('<Button theme="blue" />'), ['themeBlue']);
  assert.deepEqual(classifyLine("theme: 'blue',"), ['themeBlue']);
});

test('themeBlue: other themes do not count', () => {
  assert.deepEqual(classifyLine('<Theme name="dark">'), []);
});

// --- multi-class lines ------------------------------------------------------

test('one line can carry multiple violation classes', () => {
  assert.deepEqual(
    classifyLine("bg: isActive ? '$blue9' : '#16223A',").sort(),
    ['blueToken', 'rawHex'].sort(),
  );
});

test('CLASSES enumerates all classifier outputs', () => {
  assert.deepEqual(
    CLASSES.slice().sort(),
    ['blueToken', 'rawHex', 'rawRgba', 'themeBlue', 'brandRedeclare'].sort(),
  );
});

// --- brandRedeclare (LS-8526) ------------------------------------------------

test('brandRedeclare: local BRAND_* hex re-declarations count outside the canonical files', () => {
  assert.deepEqual(
    classifyLine("const BRAND_NAVY = '#1B3A5C';", 'apps/app/src/foo.tsx'),
    ['rawHex', 'brandRedeclare'],
  );
  assert.deepEqual(
    classifyLine(
      "export const BRAND_GOLD_LIGHT = '#D4BB78';",
      'lib/shared-components/src/features/draft/Foo.tsx',
    ),
    ['rawHex', 'brandRedeclare'],
  );
});

test('brandRedeclare: the two canonical re-export shims are exempt', () => {
  assert.deepEqual(
    classifyLine(
      "export const BRAND_NAVY = '#1B3A5C';",
      'apps/web/src/constants/colors.ts',
    ),
    ['rawHex'],
  );
  assert.deepEqual(
    classifyLine(
      "export const BRAND_GOLD = '#C5A55A';",
      'lib/shared-components/src/utils/colors.ts',
    ),
    ['rawHex'],
  );
});

test('brandRedeclare: no file path (unknown context) still flags the pattern', () => {
  assert.deepEqual(classifyLine("const BRAND_NAVY = '#1B3A5C';"), [
    'rawHex',
    'brandRedeclare',
  ]);
});

test('brandRedeclare: non-BRAND_* consts do not count', () => {
  assert.deepEqual(
    classifyLine("const TEXT_MUTED = '#9CAAC5';", 'apps/app/src/foo.tsx'),
    ['rawHex'],
  );
});
