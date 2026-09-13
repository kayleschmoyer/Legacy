import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, DEFAULT_DELAYS, RATE_LIMIT_DELAYS } from '../retry.mjs';
import { createResumeState } from '../multi-pass.mjs';
import { classifyHttpError } from '../providers/gemini.mjs';

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
      // First wait should be at least ceil(45 * 1000) = 45000 (jitter only adds)
      assert.ok(
        waits[0] >= 45_000 && waits[0] <= 45_000 * 1.3,
        `expected waits[0] in [45000, 58500], got ${waits[0]}`,
      );
      // Second wait: base is max(90000, 45000) = 90000, plus jitter
      assert.ok(
        waits[1] >= 90_000 && waits[1] <= 90_000 * 1.3,
        `expected waits[1] in [90000, 117000], got ${waits[1]}`,
      );
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
      assert.ok(
        waits[0] >= 30_000 && waits[0] <= 30_000 * 1.3,
        `expected waits[0] in [30000, 39000], got ${waits[0]}`,
      );
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });

  it('adds jitter on top of the base delay so concurrent retries do not land in lockstep', async () => {
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
            throw new Error('transient');
          }, [1000, 1000, 1000, 1000, 1000]),
        { message: 'transient' },
      );
      // With 5 identical base delays, jitter should produce at least one
      // wait that differs from the base — a flat sequence would mean no
      // jitter was applied at all.
      assert.ok(
        waits.some((w) => w !== 1000),
        `expected some jittered wait among ${JSON.stringify(waits)}`,
      );
      for (const w of waits) {
        assert.ok(w >= 1000 && w <= 1300, `wait ${w} outside [1000, 1300]`);
      }
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

// ---------------------------------------------------------------------------
// LS-9812: end-to-end guard that a real billing-class 429 skips the ladder.
// The generic retryable=false case is covered above; this pins the wiring
// between classifyHttpError and withRetry so a future change that marks
// billing retryable again cannot pass silently. The observed cost of getting
// this wrong was ~6 minutes of runner time per attempt (36s/92s/304s) on a
// ladder that fails identically every time.
// ---------------------------------------------------------------------------

describe('withRetry + Gemini 429 classification (LS-9812)', () => {
  const billingBody = JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Your prepayment credits are depleted.',
    },
  });
  // No "Please retry in Xs" hint: withRetry honours that hint via
  // Math.max(delay, retryAfterMs), which would make this test sleep for real.
  // The hint's own handling is covered by the jitter/backoff tests above.
  const throttleBody = JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message:
        "Quota exceeded for quota metric 'GenerateRequestsPerMinutePerProjectPerModel'.",
    },
  });

  it('makes exactly one attempt for a depleted-credits 429', async () => {
    let calls = 0;
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      await assert.rejects(
        () =>
          withRetry(async () => {
            calls++;
            throw classifyHttpError(429, billingBody);
          }, [0, 0, 0]),
        (err) => err.kind === 'billing',
      );
    } finally {
      process.stderr.write = origWrite;
    }
    assert.strictEqual(calls, 1, 'billing 429 must not enter the retry ladder');
  });

  it('exhausts the extended rate-limit ladder for a throttle 429, ignoring the default delays (LS-9983)', async () => {
    let calls = 0;
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              calls++;
              throw classifyHttpError(429, throttleBody);
            },
            // The default ladder has three entries; a throttle must use the
            // longer RATE_LIMIT_DELAYS ladder instead of this one.
            [0, 0, 0],
            { rateLimitDelays: [0, 0, 0, 0, 0] },
          ),
        (err) => err.kind === 'rate-limit',
      );
    } finally {
      process.stderr.write = origWrite;
    }
    assert.strictEqual(calls, 6, '1 initial + 5 rate-limit retries');
  });

  it('uses the real RATE_LIMIT_DELAYS ladder by default and it outlasts the default ladder', () => {
    const defaultTotal = DEFAULT_DELAYS.reduce((a, b) => a + b, 0);
    const rateLimitTotal = RATE_LIMIT_DELAYS.reduce((a, b) => a + b, 0);
    assert.ok(
      rateLimitTotal > defaultTotal,
      `rate-limit ladder (${rateLimitTotal}ms) must outlast the default (${defaultTotal}ms)`,
    );
    assert.ok(
      RATE_LIMIT_DELAYS.length > DEFAULT_DELAYS.length,
      'rate-limit ladder must allow more attempts than the default',
    );
  });
});

describe('withRetry retry budget (LS-9983)', () => {
  const throttle = () =>
    Object.assign(new Error('429 per-minute quota'), {
      kind: 'rate-limit',
      retryable: true,
    });

  function silenceStderr() {
    const orig = process.stderr.write;
    process.stderr.write = () => true;
    return () => {
      process.stderr.write = orig;
    };
  }

  it('stops the ladder early when the next wait would run past the deadline', async () => {
    let calls = 0;
    const restore = silenceStderr();
    try {
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              calls++;
              throw throttle();
            },
            undefined,
            {
              // Already past the deadline: no wait can fit.
              deadlineMs: Date.now() - 1,
              rateLimitDelays: [60_000, 60_000, 60_000],
            },
          ),
        (err) => err.kind === 'rate-limit' && err.budgetExhausted === true,
      );
    } finally {
      restore();
    }
    assert.strictEqual(
      calls,
      1,
      'must not sleep past the deadline — one attempt, then give up so a terminal status can be written',
    );
  });

  it('marks the thrown error with budgetExhausted only when the deadline stopped it', async () => {
    const restore = silenceStderr();
    try {
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              throw throttle();
            },
            undefined,
            { rateLimitDelays: [0, 0] },
          ),
        (err) => err.budgetExhausted === undefined,
      );
    } finally {
      restore();
    }
  });

  it('reports each wait through onWait so the caller can publish a queued status', async () => {
    const waits = [];
    const restore = silenceStderr();
    try {
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              throw throttle();
            },
            undefined,
            {
              rateLimitDelays: [0, 0],
              onWait: (info) => waits.push(info),
            },
          ),
        (err) => err.kind === 'rate-limit',
      );
    } finally {
      restore();
    }
    assert.strictEqual(waits.length, 2, 'one onWait per sleep');
    assert.deepStrictEqual(
      waits.map((w) => w.attempt),
      [1, 2],
    );
    assert.strictEqual(waits[0].kind, 'rate-limit');
    assert.strictEqual(
      waits[0].maxAttempts,
      3,
      'maxAttempts counts the initial attempt plus the ladder',
    );
  });

  it('does not let an onWait failure break the retry ladder', async () => {
    let calls = 0;
    const restore = silenceStderr();
    try {
      const result = await withRetry(
        async () => {
          calls++;
          if (calls < 2) throw throttle();
          return 'recovered';
        },
        undefined,
        {
          rateLimitDelays: [0, 0],
          onWait: () => {
            throw new Error('status write failed');
          },
        },
      );
      assert.strictEqual(result, 'recovered');
    } finally {
      restore();
    }
    assert.strictEqual(calls, 2);
  });

  it('leaves non-rate-limit errors on the default ladder and the default jitter', async () => {
    let calls = 0;
    const restore = silenceStderr();
    try {
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              calls++;
              throw new Error('generic transient');
            },
            [0, 0],
            { rateLimitDelays: [0, 0, 0, 0, 0, 0, 0] },
          ),
        { message: 'generic transient' },
      );
    } finally {
      restore();
    }
    assert.strictEqual(
      calls,
      3,
      'a non-throttle error must not borrow the long rate-limit ladder',
    );
  });
});

describe('rate-limit contention simulation (LS-9983 AC3)', () => {
  /**
   * Discrete-event scheduler over a virtual clock. `sleep` parks a caller
   * until the clock reaches its wake time; `run` repeatedly flushes the
   * microtask queue and then jumps the clock to the earliest parked waiter.
   * This lets a whole fleet of reviewers contend for one shared quota
   * concurrently, in milliseconds of real time, using withRetry's real
   * backoff arithmetic.
   */
  function makeScheduler() {
    let now = 0;
    const parked = [];
    return {
      now: () => now,
      sleep: (ms) =>
        new Promise((resolve) => {
          parked.push({ at: now + ms, resolve });
        }),
      async run(promise) {
        // Capture the outcome rather than re-throwing inside the tracker, so
        // there is never a floating rejected promise while the clock advances.
        let outcome = null;
        const tracked = promise.then(
          (value) => {
            outcome = { ok: true, value };
          },
          (error) => {
            outcome = { ok: false, error };
          },
        );
        for (;;) {
          await new Promise((r) => setImmediate(r));
          if (outcome || parked.length === 0) break;
          parked.sort((a, b) => a.at - b.at);
          const next = parked.shift();
          now = Math.max(now, next.at);
          next.resolve();
        }
        await tracked;
        if (!outcome.ok) throw outcome.error;
        return outcome.value;
      },
    };
  }

  /**
   * The provider's per-minute quota: at most `limit` successful calls per
   * rolling window, the rest throw a typed rate-limit error.
   */
  function makeQuota({ limit, windowMs, clock }) {
    let windowStart = 0;
    let used = 0;
    return {
      take() {
        const now = clock.now();
        if (now - windowStart >= windowMs) {
          windowStart = now;
          used = 0;
        }
        if (used >= limit) {
          throw Object.assign(new Error('429 per-minute quota exceeded'), {
            kind: 'rate-limit',
            retryable: true,
          });
        }
        used++;
      },
    };
  }

  const QUOTA_PER_MINUTE = 10;
  const WINDOW_MS = 60_000;
  const REVIEWERS = 20;
  const PASSES = 4;

  function silenceStderr() {
    const orig = process.stderr.write;
    process.stderr.write = () => true;
    return () => {
      process.stderr.write = orig;
    };
  }

  /**
   * Run `REVIEWERS` reviewers concurrently against one quota and report how
   * many ended terminally (i.e. would carry review-bot-degraded).
   *
   * @param {{ ladder: readonly number[], resume: boolean }} opts
   */
  async function runBurst({ ladder, resume }) {
    const scheduler = makeScheduler();
    const quota = makeQuota({
      limit: QUOTA_PER_MINUTE,
      windowMs: WINDOW_MS,
      clock: scheduler,
    });

    const reviewers = Array.from({ length: REVIEWERS }, () => {
      const resumeState = createResumeState();
      return withRetry(
        async () => {
          // With resume, only the passes not yet banked consume quota on a
          // retry; without it, every attempt re-spends all four.
          const banked = resume ? resumeState.passes : [];
          let done = banked.length;
          while (done < PASSES) {
            quota.take();
            done++;
            if (resume) {
              resumeState.passes.push({ passName: `p${done}`, text: '' });
            }
          }
        },
        undefined,
        { rateLimitDelays: ladder, sleep: scheduler.sleep },
      ).then(
        () => null,
        (err) => err,
      );
    });

    const results = await scheduler.run(Promise.all(reviewers));
    return {
      stranded: results.filter(Boolean).length,
      elapsedMs: scheduler.now(),
    };
  }

  it('drains a burst of 20 concurrent reviewers with none left on review-bot-degraded', async () => {
    const restore = silenceStderr();
    let outcome;
    try {
      outcome = await runBurst({ ladder: RATE_LIMIT_DELAYS, resume: true });
    } finally {
      restore();
    }
    assert.strictEqual(
      outcome.stranded,
      0,
      `no reviewer may end degraded purely from contention (stranded ${outcome.stranded}/${REVIEWERS} after ${Math.round(outcome.elapsedMs / 60_000)}m)`,
    );
  });

  it('control: the pre-fix ladder without resume strands reviewers under the same burst', async () => {
    const restore = silenceStderr();
    let outcome;
    try {
      outcome = await runBurst({ ladder: DEFAULT_DELAYS, resume: false });
    } finally {
      restore();
    }
    assert.ok(
      outcome.stranded > 0,
      'control must strand at least one reviewer, otherwise the test above proves nothing',
    );
  });
});
