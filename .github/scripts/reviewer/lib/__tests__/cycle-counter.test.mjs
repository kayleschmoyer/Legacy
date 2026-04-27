import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCycle,
  isEscalationRequired,
  REVIEWER_BOT_LOGINS,
  MAX_CYCLE,
} from '../cycle-counter.mjs';

describe('computeCycle', () => {
  it('returns 1 when there are no prior reviews', () => {
    assert.strictEqual(computeCycle([]), 1);
  });

  it('returns 2 after one prior bot review', () => {
    const reviews = [{ userLogin: 'code-reviewer-bot[bot]' }];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('returns 3 after two prior bot reviews', () => {
    const reviews = [
      { userLogin: 'code-reviewer-bot[bot]' },
      { userLogin: 'code-reviewer-bot[bot]' },
    ];
    assert.strictEqual(computeCycle(reviews), 3);
  });

  it('ignores non-bot reviews when counting', () => {
    const reviews = [
      { userLogin: 'human-reviewer' },
      { userLogin: 'another-human' },
      { userLogin: 'some-other-bot[bot]' },
      { userLogin: 'code-reviewer-bot[bot]' },
    ];
    // Only one bot review matches REVIEWER_BOT_LOGINS → cycle 2
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('handles reviews with null userLogin gracefully', () => {
    const reviews = [
      { userLogin: null },
      { userLogin: 'code-reviewer-bot[bot]' },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('accepts a custom botLogins set for testing', () => {
    const customLogins = new Set(['my-test-bot[bot]']);
    const reviews = [
      { userLogin: 'my-test-bot[bot]' },
      { userLogin: 'code-reviewer-bot[bot]' }, // not in customLogins
    ];
    assert.strictEqual(computeCycle(reviews, customLogins), 2);
  });

  it('is not affected by the order of reviews in the list', () => {
    const reviews = [
      { userLogin: 'human' },
      { userLogin: 'code-reviewer-bot[bot]' },
      { userLogin: 'another-human' },
      { userLogin: 'code-reviewer-bot[bot]' },
    ];
    assert.strictEqual(computeCycle(reviews), 3);
  });
});

describe('isEscalationRequired', () => {
  it('returns false for cycle 1', () => {
    assert.strictEqual(isEscalationRequired(1), false);
  });

  it('returns false for cycle 2', () => {
    assert.strictEqual(isEscalationRequired(2), false);
  });

  it('returns false for cycle 3 (MAX_CYCLE)', () => {
    assert.strictEqual(isEscalationRequired(3), false);
  });

  it('returns true for cycle 4 (first cycle that exceeds MAX_CYCLE)', () => {
    assert.strictEqual(isEscalationRequired(4), true);
  });

  it('returns true for higher cycles', () => {
    assert.strictEqual(isEscalationRequired(10), true);
  });
});

describe('REVIEWER_BOT_LOGINS', () => {
  it('includes code-reviewer-bot[bot]', () => {
    assert.ok(REVIEWER_BOT_LOGINS.has('code-reviewer-bot[bot]'));
  });
});

describe('MAX_CYCLE', () => {
  it('is 3', () => {
    assert.strictEqual(MAX_CYCLE, 3);
  });
});
