/**
 * Unit tests for the sticky-comment markdown rendering helpers (render.js).
 *
 * Run via: node --test .github/scripts/ci-failure-capture/__tests__/render.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { statusHeading, markStale, shortSha } = require(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../render.js'),
);

describe('statusHeading — commit SHA disambiguation (LS-8403)', () => {
  it('includes the short commit SHA when one is provided', () => {
    const heading = statusHeading(
      'CI Pipeline',
      'fail',
      '1 check failed',
      '151f2fecb1234567890abcdef1234567890abcd',
    );
    assert.equal(
      heading,
      '### CI Pipeline — ❌ 1 check failed (commit 151f2fe)',
    );
  });

  it('omits the commit suffix entirely when no SHA is provided', () => {
    const heading = statusHeading('CI Pipeline', 'fail', '1 check failed');
    assert.equal(heading, '### CI Pipeline — ❌ 1 check failed');
    assert.doesNotMatch(heading, /commit/);
  });

  it('omits the commit suffix when the SHA is an empty string', () => {
    const heading = statusHeading('CI Pipeline', 'fail', '1 check failed', '');
    assert.doesNotMatch(heading, /commit/);
  });

  it('shows the SHA on a passing heading too', () => {
    const heading = statusHeading(
      'CI Pipeline',
      'pass',
      undefined,
      'ae0afea1234567890abcdef1234567890abcdef',
    );
    assert.equal(heading, '### CI Pipeline — ✅ passed (commit ae0afea)');
  });

  it('two updates for different commits produce visibly different headings', () => {
    const stale = statusHeading(
      'CI Pipeline',
      'fail',
      '1 check failed',
      'ae0afea1234567890abcdef1234567890abcdef',
    );
    const current = statusHeading(
      'CI Pipeline',
      'fail',
      '1 check failed',
      '151f2fecb1234567890abcdef1234567890abcd',
    );
    assert.notEqual(stale, current);
  });
});

describe('shortSha', () => {
  it('truncates to 7 characters, matching GitHub short-SHA convention', () => {
    assert.equal(
      shortSha('151f2fecb1234567890abcdef1234567890abcd'),
      '151f2fe',
    );
  });
});

describe('markStale (LS-10100 — superseded-commit staleness marker)', () => {
  const OLD = 'c20e4850000000000000000000000000000000';
  const NEW = 'e26ffc50000000000000000000000000000000';

  it('leaves an up-to-date section untouched', () => {
    const content = statusHeading('CI Pipeline', 'pass', undefined, OLD);
    assert.equal(markStale(content, OLD), content);
  });

  it('flags a section whose heading names a commit the head has moved past', () => {
    const content = statusHeading('CI Pipeline', 'fail', '1 check failed', OLD);
    const result = markStale(content, NEW);
    assert.match(result, /Superseded/);
    assert.match(result, new RegExp('`' + shortSha(OLD) + '`'));
    assert.match(result, new RegExp('`' + shortSha(NEW) + '`'));
    // Original heading line survives verbatim alongside the note.
    assert.match(
      result,
      new RegExp(content.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')),
    );
  });

  it('is idempotent — reapplying against the same head does not stack notes', () => {
    const content = statusHeading('CI Pipeline', 'fail', '1 check failed', OLD);
    const once = markStale(content, NEW);
    const twice = markStale(once, NEW);
    assert.equal(once, twice);
    assert.equal((twice.match(/Superseded/g) || []).length, 1);
  });

  it('clears a previously-stale note once the section catches up to the new head', () => {
    const staleContent = statusHeading(
      'CI Pipeline',
      'fail',
      '1 check failed',
      OLD,
    );
    const stale = markStale(staleContent, NEW);
    assert.match(stale, /Superseded/);

    // The section is rewritten by its own producer for the new head — its
    // heading now names NEW, so re-checking against NEW clears the note.
    const fresh = statusHeading('CI Pipeline', 'pass', undefined, NEW);
    assert.doesNotMatch(markStale(fresh, NEW), /Superseded/);
  });

  it('passes through content with no per-commit heading unchanged', () => {
    assert.equal(markStale('no heading here', NEW), 'no heading here');
  });

  it('passes through unchanged when no current head is known', () => {
    const content = statusHeading('CI Pipeline', 'fail', '1 check failed', OLD);
    assert.equal(markStale(content, ''), content);
    assert.equal(markStale(content, undefined), content);
  });
});
