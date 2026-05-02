import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONAL_LABELS, cleanupOperationalLabels } from '../labels.mjs';

describe('OPERATIONAL_LABELS', () => {
  it('contains exactly the labels that every terminal state must clear', () => {
    assert.deepStrictEqual(
      [...OPERATIONAL_LABELS],
      ['bot:ready-for-review', 'review-bot-degraded'],
    );
  });

  it('is frozen so callers cannot mutate the shared list', () => {
    assert.ok(Object.isFrozen(OPERATIONAL_LABELS));
  });
});

describe('cleanupOperationalLabels', () => {
  it('calls removeLabel once per operational label in declaration order', () => {
    const calls = [];
    const removeLabel = (prNumber, label) => {
      calls.push([prNumber, label]);
    };
    cleanupOperationalLabels(42, { removeLabel });
    assert.deepStrictEqual(calls, [
      [42, 'bot:ready-for-review'],
      [42, 'review-bot-degraded'],
    ]);
  });

  it('skips the `except` label so a just-applied terminal label survives', () => {
    const calls = [];
    const removeLabel = (_prNumber, label) => {
      calls.push(label);
    };
    cleanupOperationalLabels(7, {
      except: 'review-bot-degraded',
      removeLabel,
    });
    assert.deepStrictEqual(calls, ['bot:ready-for-review']);
  });

  it('skips only the matching label — others still cycle when `except` is set', () => {
    const calls = [];
    const removeLabel = (_prNumber, label) => {
      calls.push(label);
    };
    cleanupOperationalLabels(1, {
      except: 'bot:ready-for-review',
      removeLabel,
    });
    assert.deepStrictEqual(calls, ['review-bot-degraded']);
  });

  it('continues to subsequent labels when one removal throws', () => {
    const calls = [];
    const removeLabel = (_prNumber, label) => {
      calls.push(label);
      if (label === 'bot:ready-for-review') {
        throw new Error('boom');
      }
    };
    const origWrite = process.stderr.write;
    const stderr = [];
    process.stderr.write = (chunk) => {
      stderr.push(String(chunk));
      return true;
    };
    try {
      assert.doesNotThrow(() => cleanupOperationalLabels(99, { removeLabel }));
    } finally {
      process.stderr.write = origWrite;
    }
    assert.deepStrictEqual(calls, [
      'bot:ready-for-review',
      'review-bot-degraded',
    ]);
    assert.ok(
      stderr.some((line) =>
        line.includes("Failed to remove label 'bot:ready-for-review'"),
      ),
      'expected stderr to record the failure for the first label',
    );
  });

  it('handles non-Error throwables without crashing', () => {
    const removeLabel = () => {
      throw 'string-error';
    };
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      assert.doesNotThrow(() => cleanupOperationalLabels(1, { removeLabel }));
    } finally {
      process.stderr.write = origWrite;
    }
  });
});
