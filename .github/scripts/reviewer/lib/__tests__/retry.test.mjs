import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../retry.mjs';

describe('withRetry', () => {
  it('returns the result immediately when fn succeeds on first attempt', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    }, []);
    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 1);
  });

  it('retries and succeeds on a later attempt', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'recovered';
    }, [0, 0]);
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(calls, 3);
  });

  it('throws after all retries are exhausted', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(async () => {
          calls++;
          throw new Error('persistent');
        }, [0, 0, 0]),
      { message: 'persistent' },
    );
    assert.strictEqual(calls, 4); // 1 initial + 3 retries
  });

  it('re-throws the last error, not the first', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(async () => {
          calls++;
          throw new Error(`attempt ${calls}`);
        }, [0]),
      { message: 'attempt 2' },
    );
  });

  it('does not retry when delays array is empty', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(async () => {
          calls++;
          throw new Error('fail');
        }, []),
      { message: 'fail' },
    );
    assert.strictEqual(calls, 1);
  });

  it('skips retries when an error is marked retryable=false', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(async () => {
          calls++;
          const err = new Error('terminal');
          err.retryable = false;
          throw err;
        }, [0, 0, 0]),
      { message: 'terminal' },
    );
    assert.strictEqual(calls, 1, 'fail-fast: only one attempt');
  });

  it('uses retryAfterSeconds as a lower bound when greater than the fixed delay', async () => {
    const waits = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms) => {
      waits.push(ms);
      return realSetTimeout(fn, 0);
    };
    try {
      let calls = 0;
      await assert.rejects(
        () =>
          withRetry(async () => {
            calls++;
            const err = new Error('rate-limited');
            err.retryable = true;
            err.retryAfterSeconds = 45; // > default 30s first delay
            throw err;
          }, [30_000, 90_000]),
        { message: 'rate-limited' },
      );
      assert.strictEqual(calls, 3);
      // First wait should be ceil(45 * 1000) = 45000, not 30000
      assert.strictEqual(waits[0], 45_000);
      // Second wait: max(90000, 45000) = 90000
      assert.strictEqual(waits[1], 90_000);
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });

  it('uses the fixed delay when retryAfterSeconds is smaller', async () => {
    const waits = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms) => {
      waits.push(ms);
      return realSetTimeout(fn, 0);
    };
    try {
      await assert.rejects(
        () =>
          withRetry(async () => {
            const err = new Error('rate-limited');
            err.retryable = true;
            err.retryAfterSeconds = 5; // < default 30s first delay
            throw err;
          }, [30_000]),
        { message: 'rate-limited' },
      );
      assert.strictEqual(waits[0], 30_000);
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });

  it('still retries when retryable is undefined or true', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(async () => {
          calls++;
          const err = new Error('soft');
          err.retryable = true;
          throw err;
        }, [0, 0]),
      { message: 'soft' },
    );
    assert.strictEqual(calls, 3);
  });
});
