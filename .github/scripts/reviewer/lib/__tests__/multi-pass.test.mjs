import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMultiPass, createResumeState } from '../multi-pass.mjs';
import { CostCap } from '../cost-cap.mjs';

function makeProvider(results) {
  let call = 0;
  return {
    review: async () => results[call++],
  };
}

describe('runMultiPass', () => {
  it('returns passes array with one entry per review pass', async () => {
    const provider = makeProvider([
      { text: 'correctness output', usage: null },
      { text: 'security output', usage: null },
      { text: 'contract output', usage: null },
      { text: 'docs output', usage: null },
    ]);
    const { passes } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(passes.length, 4);
    assert.strictEqual(passes[0].passName, 'correctness');
    assert.strictEqual(passes[1].passName, 'security');
    assert.strictEqual(passes[2].passName, 'contract');
    assert.strictEqual(passes[3].passName, 'docs');
    assert.strictEqual(passes[0].text, 'correctness output');
  });

  it('aggregates usage across all passes', async () => {
    const provider = makeProvider([
      {
        text: 'a',
        usage: {
          inputTokens: 100,
          cachedInputTokens: 10,
          outputTokens: 50,
          costUsd: 0.001,
        },
      },
      {
        text: 'b',
        usage: {
          inputTokens: 200,
          cachedInputTokens: 20,
          outputTokens: 60,
          costUsd: 0.002,
        },
      },
      {
        text: 'c',
        usage: {
          inputTokens: 300,
          cachedInputTokens: 30,
          outputTokens: 70,
          costUsd: 0.003,
        },
      },
      {
        text: 'd',
        usage: {
          inputTokens: 400,
          cachedInputTokens: 40,
          outputTokens: 80,
          costUsd: 0.004,
        },
      },
    ]);
    const { usage } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(usage.inputTokens, 1000);
    assert.strictEqual(usage.cachedInputTokens, 100);
    assert.strictEqual(usage.outputTokens, 260);
    assert.ok(Math.abs(usage.costUsd - 0.01) < 1e-9);
  });

  it('handles passes with null usage without throwing', async () => {
    const provider = makeProvider([
      { text: 'a', usage: null },
      {
        text: 'b',
        usage: {
          inputTokens: 50,
          cachedInputTokens: 0,
          outputTokens: 25,
          costUsd: 0.0005,
        },
      },
      { text: 'c', usage: null },
      { text: 'd', usage: null },
    ]);
    const { usage } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(usage.inputTokens, 50);
    assert.strictEqual(usage.outputTokens, 25);
  });

  it('appends the focus instruction to user prompt for each pass', async () => {
    const seenPrompts = [];
    const provider = {
      review: async ({ user }) => {
        seenPrompts.push(user);
        return { text: 'ok', usage: null };
      },
    };
    await runMultiPass(provider, 'sys', 'base-user');
    assert.strictEqual(seenPrompts.length, 4);
    for (const p of seenPrompts) {
      assert.ok(
        p.startsWith('base-user\n\n---\n\n**Review focus for this pass**:'),
      );
    }
    assert.match(seenPrompts[0], /correctness/);
    assert.match(seenPrompts[1], /security/);
    assert.match(seenPrompts[2], /contract/);
    assert.match(seenPrompts[3], /docs/);
  });

  it('returns zeroed usage when no pass provides usage', async () => {
    const provider = makeProvider([
      { text: 'a', usage: undefined },
      { text: 'b', usage: undefined },
      { text: 'c', usage: undefined },
      { text: 'd', usage: undefined },
    ]);
    const { usage } = await runMultiPass(provider, 'sys', 'user');
    assert.deepEqual(usage, {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });
});

describe('runMultiPass with cost cap', () => {
  it('throws CostCapExceededError when accumulated cost exceeds cap after a pass', async () => {
    const provider = makeProvider([
      {
        text: 'a',
        usage: {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          costUsd: 4,
        },
      },
      {
        text: 'b',
        usage: {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          costUsd: 4,
        },
      },
    ]);
    const costCap = new CostCap({ limitUsd: 5 });
    await assert.rejects(
      () => runMultiPass(provider, 'sys', 'user', { costCap }),
      { name: 'CostCapExceededError' },
    );
  });

  it('accumulates cost in the costCap instance across all passes', async () => {
    const provider = makeProvider([
      {
        text: 'a',
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 5,
          costUsd: 0.001,
        },
      },
      {
        text: 'b',
        usage: {
          inputTokens: 20,
          cachedInputTokens: 0,
          outputTokens: 10,
          costUsd: 0.002,
        },
      },
      {
        text: 'c',
        usage: {
          inputTokens: 30,
          cachedInputTokens: 0,
          outputTokens: 15,
          costUsd: 0.003,
        },
      },
      { text: 'd', usage: null },
    ]);
    const costCap = new CostCap({ limitUsd: 10 });
    await runMultiPass(provider, 'sys', 'user', { costCap });
    assert.ok(Math.abs(costCap.totals.costUsd - 0.006) < 1e-9);
    assert.strictEqual(costCap.totals.inputTokens, 60);
  });

  it('runs all four passes when no costCap is passed', async () => {
    const provider = makeProvider([
      { text: 'a', usage: null },
      { text: 'b', usage: null },
      { text: 'c', usage: null },
      { text: 'd', usage: null },
    ]);
    const { passes } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(passes.length, 4);
  });
});

describe('runMultiPass resume (LS-9983)', () => {
  /**
   * Provider that throws on the Nth call (1-indexed) and otherwise returns a
   * body naming the call index, so a test can tell re-spent calls apart from
   * fresh ones.
   */
  function makeFlakyProvider(throwOnCall) {
    const seen = [];
    return {
      calls: seen,
      review: async ({ user }) => {
        seen.push(user);
        if (seen.length === throwOnCall) {
          throw Object.assign(new Error('429 per-minute quota'), {
            kind: 'rate-limit',
            retryable: true,
          });
        }
        return { text: `out-${seen.length}`, usage: null };
      },
    };
  }

  it('does not re-spend completed passes when a later pass throws', async () => {
    const provider = makeFlakyProvider(4);
    const resumeState = createResumeState();

    await assert.rejects(
      () => runMultiPass(provider, 'sys', 'user', { resumeState }),
      (err) => err.kind === 'rate-limit',
    );
    assert.strictEqual(provider.calls.length, 4, 'three ok, one throttled');
    assert.strictEqual(resumeState.passes.length, 3, 'three passes banked');

    // Second attempt: only the outstanding pass may consume quota.
    const { passes } = await runMultiPass(provider, 'sys', 'user', {
      resumeState,
    });
    assert.strictEqual(
      provider.calls.length,
      5,
      'retry must issue exactly one more request, not four',
    );
    assert.deepStrictEqual(
      passes.map((p) => p.passName),
      ['correctness', 'security', 'contract', 'docs'],
      'resumed run still returns all four passes in order',
    );
  });

  it('accumulates usage across a resumed run instead of losing the earlier passes', async () => {
    const usage = {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
      costUsd: 0.001,
    };
    let call = 0;
    const provider = {
      review: async () => {
        call++;
        if (call === 3) {
          throw Object.assign(new Error('429'), {
            kind: 'rate-limit',
            retryable: true,
          });
        }
        return { text: 't', usage };
      },
    };
    const resumeState = createResumeState();
    await assert.rejects(() =>
      runMultiPass(provider, 'sys', 'user', { resumeState }),
    );
    const result = await runMultiPass(provider, 'sys', 'user', { resumeState });
    assert.strictEqual(
      result.usage.inputTokens,
      40,
      'usage from the pre-throttle passes must survive the retry',
    );
    assert.strictEqual(result.passes.length, 4);
  });

  it('is unchanged when no resumeState is passed', async () => {
    const provider = makeFlakyProvider(0);
    const { passes } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(passes.length, 4);
    assert.strictEqual(provider.calls.length, 4);
  });
});
