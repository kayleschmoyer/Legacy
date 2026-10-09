/**
 * Unit tests for rate-limit-retry.js (LS-10296).
 *
 * Covers:
 *  - isRateLimitError matches primary/secondary 403s and 429, not other errors.
 *  - withRateLimitRetry retries with exponential backoff, rethrows non-rate-limit
 *    errors immediately, and rethrows the last rate-limit error once exhausted.
 *  - ensureRateLimitHeadroom waits (capped) only when headroom is thin and is
 *    best-effort when the rate-limit lookup itself fails.
 *  - postCommitStatusResilient posts on the happy path, recovers from a transient
 *    403, and on exhaustion calls core.setFailed with the explicit rerun message
 *    instead of throwing; non-rate-limit errors still propagate.
 *
 * Run via: node --test .github/scripts/__tests__/rate-limit-retry.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isRateLimitError,
  withRateLimitRetry,
  ensureRateLimitHeadroom,
  postCommitStatusResilient,
} = require('../rate-limit-retry.js');

const rateLimit403 = () =>
  Object.assign(new Error('API rate limit exceeded for installation'), {
    status: 403,
  });

function makeCore() {
  const calls = { warning: [], setFailed: [] };
  return {
    calls,
    warning: (m) => calls.warning.push(m),
    setFailed: (m) => calls.setFailed.push(m),
  };
}

function makeSleep() {
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
  };
  return { waits, sleep };
}

const headroom = (remaining, resetSec) => ({
  rest: {
    rateLimit: {
      get: async () => ({
        data: { resources: { core: { remaining, reset: resetSec } } },
      }),
    },
  },
});

describe('isRateLimitError', () => {
  it('matches primary 403, secondary 403 and 429', () => {
    assert.equal(isRateLimitError(rateLimit403()), true);
    assert.equal(
      isRateLimitError(
        Object.assign(new Error('You have exceeded a secondary rate limit'), {
          status: 403,
        }),
      ),
      true,
    );
    assert.equal(
      isRateLimitError(Object.assign(new Error('slow down'), { status: 429 })),
      true,
    );
  });

  it('does not match other errors', () => {
    assert.equal(
      isRateLimitError(Object.assign(new Error('Forbidden'), { status: 403 })),
      false,
    );
    assert.equal(
      isRateLimitError(Object.assign(new Error('rate limit'), { status: 500 })),
      false,
    );
    assert.equal(isRateLimitError(new Error('boom')), false);
    assert.equal(isRateLimitError(undefined), false);
  });
});

describe('withRateLimitRetry', () => {
  it('retries with exponential backoff then succeeds', async () => {
    const { waits, sleep } = makeSleep();
    let n = 0;
    const result = await withRateLimitRetry(
      async () => {
        if (++n < 3) throw rateLimit403();
        return 'ok';
      },
      { sleep, baseDelayMs: 100, core: makeCore() },
    );
    assert.equal(result, 'ok');
    assert.deepEqual(waits, [100, 200]);
  });

  it('rethrows non-rate-limit errors without retrying', async () => {
    const { waits, sleep } = makeSleep();
    let n = 0;
    await assert.rejects(
      withRateLimitRetry(
        async () => {
          n++;
          throw new Error('boom');
        },
        { sleep },
      ),
      /boom/,
    );
    assert.equal(n, 1);
    assert.deepEqual(waits, []);
  });

  it('rethrows the rate-limit error after exhausting attempts', async () => {
    const { sleep } = makeSleep();
    let n = 0;
    await assert.rejects(
      withRateLimitRetry(
        async () => {
          n++;
          throw rateLimit403();
        },
        { sleep, attempts: 3 },
      ),
      /rate limit exceeded/,
    );
    assert.equal(n, 3);
  });
});

describe('ensureRateLimitHeadroom', () => {
  it('does not wait when headroom is healthy', async () => {
    const { waits, sleep } = makeSleep();
    await ensureRateLimitHeadroom({
      github: headroom(4000, 0),
      core: makeCore(),
      sleep,
    });
    assert.deepEqual(waits, []);
  });

  it('waits until reset, capped at maxWaitMs, when headroom is thin', async () => {
    const { waits, sleep } = makeSleep();
    const now = () => 1_000_000;
    await ensureRateLimitHeadroom({
      github: headroom(0, 1_030),
      core: makeCore(),
      sleep,
      now,
    });
    assert.deepEqual(waits, [30_000]);
    waits.length = 0;
    await ensureRateLimitHeadroom({
      github: headroom(0, 9_999),
      core: makeCore(),
      sleep,
      now,
    });
    assert.deepEqual(waits, [60_000]);
  });

  it('is best-effort when the lookup fails', async () => {
    const { waits, sleep } = makeSleep();
    const core = makeCore();
    const github = {
      rest: {
        rateLimit: {
          get: async () => {
            throw new Error('nope');
          },
        },
      },
    };
    await ensureRateLimitHeadroom({ github, core, sleep });
    assert.deepEqual(waits, []);
    assert.equal(core.calls.warning.length, 1);
  });
});

describe('postCommitStatusResilient', () => {
  const params = {
    owner: 'o',
    repo: 'r',
    sha: 'abc',
    state: 'success',
    context: 'No Merge Conflicts',
    description: 'ok',
  };

  function makeGithub(createCommitStatus) {
    return {
      rest: { ...headroom(4000, 0).rest, repos: { createCommitStatus } },
    };
  }

  it('posts the status on the happy path', async () => {
    const core = makeCore();
    const posted = [];
    const github = makeGithub(async (p) => {
      posted.push(p);
    });
    assert.equal(
      await postCommitStatusResilient({
        github,
        core,
        params,
        sleep: makeSleep().sleep,
      }),
      true,
    );
    assert.deepEqual(posted, [params]);
    assert.deepEqual(core.calls.setFailed, []);
  });

  it('recovers from a transient rate-limit 403', async () => {
    const core = makeCore();
    let n = 0;
    const github = makeGithub(async () => {
      if (++n === 1) throw rateLimit403();
    });
    assert.equal(
      await postCommitStatusResilient({
        github,
        core,
        params,
        sleep: makeSleep().sleep,
      }),
      true,
    );
    assert.equal(n, 2);
    assert.deepEqual(core.calls.setFailed, []);
  });

  it('fails explicitly (no throw) once rate limit is exhausted', async () => {
    const core = makeCore();
    const github = makeGithub(async () => {
      throw rateLimit403();
    });
    assert.equal(
      await postCommitStatusResilient({
        github,
        core,
        params,
        sleep: makeSleep().sleep,
      }),
      false,
    );
    assert.equal(core.calls.setFailed.length, 1);
    assert.match(core.calls.setFailed[0], /No Merge Conflicts/);
    assert.match(core.calls.setFailed[0], /transient, rerun this job/);
  });

  it('propagates non-rate-limit errors', async () => {
    const core = makeCore();
    const github = makeGithub(async () => {
      throw Object.assign(new Error('Bad credentials'), { status: 401 });
    });
    await assert.rejects(
      postCommitStatusResilient({
        github,
        core,
        params,
        sleep: makeSleep().sleep,
      }),
      /Bad credentials/,
    );
    assert.deepEqual(core.calls.setFailed, []);
  });
});
