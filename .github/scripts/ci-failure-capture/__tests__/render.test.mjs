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
const { statusHeading, shortSha } = require(
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
