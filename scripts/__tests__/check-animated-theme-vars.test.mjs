/**
 * Tests for scripts/check-animated-theme-vars.mjs (LS-8554, epic LS-8518).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-animated-theme-vars.test.mjs
 *
 * The check is ELEMENT-scoped: an animated component whose OWN colour props
 * contain var(--token) crashes at runtime, but a var(--token) on a child of an
 * animated component — or on any non-animated element — is perfectly fine. The
 * false-positive cases below are the whole reason this is an AST walk and not
 * a grep; a file-level search flags ~12 innocent sites in this repo.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { scanSource, ANIMATION_PROPS } from '../check-animated-theme-vars.mjs';

const scan = (src) => scanSource('Test.tsx', src);

// --- true positives ---------------------------------------------------------

test('flags var(--token) in a style prop on an animated component', () => {
  // The exact shape that broke /admin in PR #6194 (LS-8528).
  const found = scan(`
    export const A = () => (
      <YStack
        animation="quick"
        style={{
          background: 'var(--surfacePanel)',
          borderColor: open ? 'var(--outlineStrong)' : 'var(--outlineSubtle)',
        }}
      />
    );
  `);
  assert.equal(found.length, 1);
  assert.equal(found[0].tag, 'YStack');
  assert.equal(found[0].hits.length, 3);
  assert.ok(found[0].hits.every((h) => h.prop === 'style'));
});

test('flags var(--token) in hoverStyle on an animated component', () => {
  const found = scan(`
    export const A = () => (
      <XStack animation="quick" hoverStyle={{ backgroundColor: 'var(--color4)' }} />
    );
  `);
  assert.equal(found.length, 1);
  assert.equal(found[0].hits[0].prop, 'hoverStyle');
  assert.equal(found[0].hits[0].value, 'var(--color4)');
});

test('flags var(--token) in a direct colour prop on an animated component', () => {
  const found = scan(`
    export const A = () => (
      <YStack animation="quick" backgroundColor="var(--surfaceCard)" />
    );
  `);
  assert.equal(found.length, 1);
  assert.equal(found[0].hits[0].prop, 'backgroundColor');
});

test('flags a var(--token) inside a template literal (e.g. a gradient)', () => {
  const found = scan(`
    export const A = () => (
      <YStack
        animation="quick"
        style={{ background: \`linear-gradient(180deg, var(--brandNavy), transparent)\` }}
      />
    );
  `);
  assert.equal(found.length, 1);
});

test('animateOnly also marks a component as animated', () => {
  const found = scan(`
    export const A = () => (
      <YStack animateOnly={['transform']} borderColor="var(--outlineSubtle)" />
    );
  `);
  assert.equal(found.length, 1);
  assert.ok(ANIMATION_PROPS.has('animateOnly'));
});

test('reports the element line number and every offending element', () => {
  const found = scan(`
    <YStack animation="quick" color="var(--a)" />
    <XStack animation="quick" color="var(--b)" />
  `);
  assert.equal(found.length, 2);
  assert.ok(found[0].line < found[1].line);
});

// --- false positives that MUST NOT be flagged -------------------------------

test('does NOT flag a var(--token) on a CHILD of an animated component', () => {
  // The real shape at LeagueDetailPage.tsx — the icon is a child, so the
  // animation driver never interpolates its colour.
  const found = scan(`
    export const A = () => (
      <YStack animation="quick" backgroundColor="$surfaceCard">
        <Check size={14} color="var(--green10)" />
      </YStack>
    );
  `);
  assert.equal(found.length, 0);
});

test('does NOT flag var(--token) on a non-animated component', () => {
  const found = scan(`
    export const A = () => (
      <YStack style={{ background: 'var(--surfaceCard)' }} />
    );
  `);
  assert.equal(found.length, 0);
});

test('does NOT flag $token props on an animated component (the fix)', () => {
  const found = scan(`
    export const A = () => (
      <YStack
        animation="quick"
        backgroundColor="$surfacePanel"
        borderColor={open ? '$outlineStrong' : '$outlineSubtle'}
        hoverStyle={{ backgroundColor: '$color4' }}
      />
    );
  `);
  assert.equal(found.length, 0);
});

test('does NOT flag non-colour props that merely animate', () => {
  const found = scan(`
    export const A = () => (
      <YStack animation="quick" enterStyle={{ opacity: 0, y: -20 }} />
    );
  `);
  assert.equal(found.length, 0);
});

test('does NOT flag a plain DOM element using var(--token)', () => {
  const found = scan(`
    export const A = () => <h1 style={{ color: 'var(--textOnAccent)' }}>Hi</h1>;
  `);
  assert.equal(found.length, 0);
});

// --- broad mode -------------------------------------------------------------

test('broad mode catches a var(--token) in a prop outside the allowlist', () => {
  const src = `
    export const A = () => (
      <YStack animation="quick" someExoticColorProp="var(--brandGold)" />
    );
  `;
  assert.equal(scan(src).length, 0, 'strict mode ignores unlisted props');
  assert.equal(
    scanSource('Test.tsx', src, { broad: true }).length,
    1,
    'broad mode flags it',
  );
});
