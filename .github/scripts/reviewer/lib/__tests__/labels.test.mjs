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

  it('preserves bot:ready-for-review when preserveReadyLabel is true', () => {
    const calls = [];
    const removeLabel = (_prNumber, label) => {
      calls.push(label);
    };
    cleanupOperationalLabels(5, { preserveReadyLabel: true, removeLabel });
    assert.deepStrictEqual(calls, ['review-bot-degraded']);
  });

  it('still removes bot:ready-for-review when preserveReadyLabel is false', () => {
    const calls = [];
    const removeLabel = (_prNumber, label) => {
      calls.push(label);
    };
    cleanupOperationalLabels(5, { preserveReadyLabel: false, removeLabel });
    assert.deepStrictEqual(calls, [
      'bot:ready-for-review',
      'review-bot-degraded',
    ]);
  });

  it('preserveReadyLabel and except can both be set without conflict', () => {
    const calls = [];
    const removeLabel = (_prNumber, label) => {
      calls.push(label);
    };
    cleanupOperationalLabels(5, {
      except: 'review-bot-degraded',
      preserveReadyLabel: true,
      removeLabel,
    });
    assert.deepStrictEqual(calls, []);
  });
});

// Regression guard for LS-4678. The terminal-verdict cleanup in index.mjs
// must pass `preserveReadyLabel: true` unconditionally — including on
// APPROVED — so post-approval pushes re-trigger Reviewer (W1) instead of
// stalling at the bot-review ruleset gate on the new HEAD SHA. A future edit
// that reintroduces `verdict !== 'APPROVED'` (or any conditional) would
// silently re-open the stall; this static-source check catches that in
// review-script tests rather than as a runtime regression on a real PR.
describe('reviewer terminal cleanup (LS-4678)', () => {
  it('passes preserveReadyLabel: true at the verdict-cleanup call site', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const indexPath = join(here, '..', '..', 'index.mjs');
    const src = await readFile(indexPath, 'utf8');

    // The cleanup call inside the terminal-verdict block (after postRealReview)
    // must use `preserveReadyLabel: true`. We anchor the regex to the comment
    // referencing LS-4678 to avoid coupling to surrounding line numbers.
    const pattern =
      /LS-4678[\s\S]{0,500}?cleanupOperationalLabels\([^)]*?preserveReadyLabel:\s*true/m;
    assert.match(
      src,
      pattern,
      'Terminal-verdict cleanup in index.mjs must pass preserveReadyLabel: true (LS-4678).',
    );

    // And the old conditional form must not be reintroduced.
    assert.doesNotMatch(
      src,
      /preserveReadyLabel:\s*verdict\s*!==\s*'APPROVED'/,
      'Old conditional `preserveReadyLabel: verdict !== "APPROVED"` reintroduced — see LS-4678.',
    );
  });
});
