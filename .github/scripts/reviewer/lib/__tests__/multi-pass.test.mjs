import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMultiPass } from '../multi-pass.mjs';
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
    ]);
    const { passes } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(passes.length, 3);
    assert.strictEqual(passes[0].passName, 'correctness');
    assert.strictEqual(passes[1].passName, 'security');
    assert.strictEqual(passes[2].passName, 'contract');
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
    ]);
    const { usage } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(usage.inputTokens, 600);
    assert.strictEqual(usage.cachedInputTokens, 60);
    assert.strictEqual(usage.outputTokens, 180);
    assert.ok(Math.abs(usage.costUsd - 0.006) < 1e-9);
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
    assert.strictEqual(seenPrompts.length, 3);
    for (const p of seenPrompts) {
      assert.ok(
        p.startsWith('base-user\n\n---\n\n**Review focus for this pass**:'),
      );
    }
    assert.match(seenPrompts[0], /correctness/);
    assert.match(seenPrompts[1], /security/);
    assert.match(seenPrompts[2], /contract/);
  });

  it('returns zeroed usage when no pass provides usage', async () => {
    const provider = makeProvider([
      { text: 'a', usage: undefined },
      { text: 'b', usage: undefined },
      { text: 'c', usage: undefined },
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
    ]);
    const costCap = new CostCap({ limitUsd: 10 });
    await runMultiPass(provider, 'sys', 'user', { costCap });
    assert.ok(Math.abs(costCap.totals.costUsd - 0.006) < 1e-9);
    assert.strictEqual(costCap.totals.inputTokens, 60);
  });

  it('is backward compatible — runs all three passes when no costCap is passed', async () => {
    const provider = makeProvider([
      { text: 'a', usage: null },
      { text: 'b', usage: null },
      { text: 'c', usage: null },
    ]);
    const { passes } = await runMultiPass(provider, 'sys', 'user');
    assert.strictEqual(passes.length, 3);
  });
});
