/**
 * Tests for the GitHub-slug anchor validation in scripts/lint-skills.js
 * (LS-10133).
 *
 * Run via: node --test scripts/__tests__/lint-skills.test.mjs
 *
 * Check 3 ("relative markdown links must resolve on disk") used to strip
 * the #fragment before testing existence, so a link to a real file but a
 * nonexistent heading passed silently — two live dangling anchors shipped
 * this way undetected (docs/dev-process/agentic-workflow.md ->
 * workflow-overview/SKILL.md, and docs/design/RECONCILIATION-LS-9005.md ->
 * design-sync/references/phase1-cloud-sync.md), both repaired in LS-9982's
 * PR (#7977) without the lint catching either.
 *
 * These tests pin: the GitHub slug algorithm (including the
 * non-collapsing-whitespace quirk that produces double hyphens, and code
 * spans/parens/em-dashes in headings), heading de-duplication, explicit
 * `<a id=...>` anchors, and negative controls proving a genuinely dangling
 * fragment is still flagged (as a warning — see the check-8 comment in
 * lint-skills.js for why it's staged as a warning, not an error, given the
 * pre-existing backlog the first real run against this corpus surfaced).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  githubSlug,
  headingPlainText,
  collectAnchors,
  checkMarkdownLinks,
} = require(resolve(__dirname, '..', 'lint-skills.js'));

const repoRoot = resolve(__dirname, '..', '..');
const fixturesDir = join(__dirname, 'fixtures', 'lint-skills');
const targetFixture = join(fixturesDir, 'target.md');
// Not a real file on disk — only used so relative-path resolution in the
// fixtures below is anchored at fixturesDir.
const sourceFixture = join(fixturesDir, 'source.md');

// --- githubSlug ---------------------------------------------------------

test('githubSlug: lowercases and hyphenates plain text', () => {
  assert.equal(githubSlug('Real Heading'), 'real-heading');
});

test('githubSlug: strips parens and dots around a ticket/file reference', () => {
  assert.equal(
    githubSlug('pc-test OOM on memory-constrained machines (LS-8666)'),
    'pc-test-oom-on-memory-constrained-machines-ls-8666',
  );
});

test('githubSlug: does NOT collapse whitespace runs — removing punctuation between two spaces leaves a double hyphen', () => {
  // The real anchor linked from .agents/skills/mobile-qa/SKILL.md and
  // .agents/skills/architecture/FILE-MAP.md today — ground truth for how
  // GitHub actually renders this, not a guess.
  assert.equal(
    githubSlug('Cross-Platform Suite Roles (ADR-0015 / ADR-0016)'),
    'cross-platform-suite-roles-adr-0015--adr-0016',
  );
});

// --- headingPlainText ----------------------------------------------------

test('headingPlainText: strips inline code backticks but keeps the content', () => {
  assert.equal(
    headingPlainText('404s from `ci_get_playwright_report` may be a gap'),
    '404s from ci_get_playwright_report may be a gap',
  );
});

test('headingPlainText: strips markdown link brackets, keeps link text', () => {
  assert.equal(
    headingPlainText('See [the spine](./spine.md) for order'),
    'See the spine for order',
  );
});

test('headingPlainText: strips bold/italic emphasis markers', () => {
  assert.equal(headingPlainText('**Critical Rules**'), 'Critical Rules');
});

// --- collectAnchors --------------------------------------------------------

test('collectAnchors: resolves a plain heading', () => {
  const anchors = collectAnchors(readFileSync(targetFixture, 'utf8'));
  assert.ok(anchors.has('real-heading'));
});

test('collectAnchors: de-duplicates repeated headings with a -1 suffix, GitHub-style', () => {
  const anchors = collectAnchors(readFileSync(targetFixture, 'utf8'));
  assert.ok(anchors.has('repeated-heading'));
  assert.ok(anchors.has('repeated-heading-1'));
});

test('collectAnchors: resolves a heading with a code span + parenthetical', () => {
  const anchors = collectAnchors(readFileSync(targetFixture, 'utf8'));
  assert.ok(anchors.has('pc-test-oom-on-memory-constrained-machines-ls-8666'));
});

test('collectAnchors: resolves an explicit <a id=...> anchor that is not a heading', () => {
  const anchors = collectAnchors(readFileSync(targetFixture, 'utf8'));
  assert.ok(anchors.has('explicit-html-anchor'));
});

test('collectAnchors: negative control — a heading that was never written does not resolve', () => {
  const anchors = collectAnchors(readFileSync(targetFixture, 'utf8'));
  assert.equal(anchors.has('totally-made-up-heading-xyz'), false);
});

// --- checkMarkdownLinks ----------------------------------------------------

test('checkMarkdownLinks: a link with a resolving path and a resolving fragment produces no findings', () => {
  const errors = [];
  const warnings = [];
  checkMarkdownLinks(
    sourceFixture,
    '[ok](target.md#real-heading)',
    'source.md',
    errors,
    warnings,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('checkMarkdownLinks: negative control — a resolving path but a dangling fragment is a WARNING, not an error', () => {
  const errors = [];
  const warnings = [];
  checkMarkdownLinks(
    sourceFixture,
    '[bad anchor](target.md#totally-made-up-heading-xyz)',
    'source.md',
    errors,
    warnings,
  );
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].msg, /dangling anchor/);
  assert.match(warnings[0].msg, /totally-made-up-heading-xyz/);
});

test('checkMarkdownLinks: negative control — a nonexistent target path is still an ERROR (existing behavior, unchanged)', () => {
  const errors = [];
  const warnings = [];
  checkMarkdownLinks(
    sourceFixture,
    '[missing](does-not-exist.md)',
    'source.md',
    errors,
    warnings,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].msg, /broken link/);
  assert.deepEqual(warnings, []);
});

test('checkMarkdownLinks: onlySkillsTargets skips a broken link outside .agents/skills/', () => {
  const errors = [];
  const warnings = [];
  checkMarkdownLinks(
    sourceFixture,
    '[missing](does-not-exist.md)',
    'source.md',
    errors,
    warnings,
    { onlySkillsTargets: true },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('checkMarkdownLinks: onlySkillsTargets still checks a link that resolves into .agents/skills/', () => {
  const errors = [];
  const warnings = [];
  checkMarkdownLinks(
    sourceFixture,
    '[skill link](/.agents/skills/skill-authoring/SKILL.md#totally-made-up-heading-xyz)',
    'source.md',
    errors,
    warnings,
    { onlySkillsTargets: true },
  );
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].msg, /dangling anchor/);
});

// --- Regression pin: the two LS-9982-repaired anchors stay resolved -------

test('regression: docs/design/RECONCILIATION-LS-9005.md -> design-sync/references/phase1-cloud-sync.md#per-design-ticket-description-template still resolves (LS-9982 fix)', () => {
  const target = join(
    repoRoot,
    '.agents',
    'skills',
    'design-sync',
    'references',
    'phase1-cloud-sync.md',
  );
  const anchors = collectAnchors(readFileSync(target, 'utf8'));
  assert.ok(anchors.has('per-design-ticket-description-template'));
});
