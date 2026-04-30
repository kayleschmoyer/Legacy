import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CostCap, CostCapExceededError } from '../cost-cap.mjs';

describe('CostCapExceededError', () => {
  it('carries cumulative and cap values', () => {
    const err = new CostCapExceededError(6.5, 5);
    assert.strictEqual(err.name, 'CostCapExceededError');
    assert.strictEqual(err.cumulative, 6.5);
    assert.strictEqual(err.cap, 5);
    assert.ok(err instanceof Error);
  });

  it('has retryable=false so withRetry short-circuits immediately', () => {
    const err = new CostCapExceededError(6, 5);
    assert.strictEqual(err.retryable, false);
  });
});

describe('CostCap.checkBefore', () => {
  it('throws when estimated cost would exceed the cap', () => {
    const cap = new CostCap({ limitUsd: 1 });
    assert.throws(() => cap.checkBefore(2), { name: 'CostCapExceededError' });
  });

  it('throws when accumulated + estimated exceeds cap', () => {
    const cap = new CostCap({ limitUsd: 5 });
    cap.add({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 4,
    });
    assert.throws(() => cap.checkBefore(2), { name: 'CostCapExceededError' });
  });

  it('no-ops when estimatedCostUsd is 0 (subscription providers)', () => {
    const cap = new CostCap({ limitUsd: 0.001 });
    assert.doesNotThrow(() => cap.checkBefore(0));
  });

  it('no-ops when estimate is under the remaining budget', () => {
    const cap = new CostCap({ limitUsd: 10 });
    assert.doesNotThrow(() => cap.checkBefore(5));
  });
});

describe('CostCap.checkAfter', () => {
  it('throws when accumulated cost exceeds the cap', () => {
    const cap = new CostCap({ limitUsd: 1 });
    cap.add({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 2,
    });
    assert.throws(() => cap.checkAfter(), { name: 'CostCapExceededError' });
  });

  it('no-ops when accumulated cost is under the cap', () => {
    const cap = new CostCap({ limitUsd: 5 });
    cap.add({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 3,
    });
    assert.doesNotThrow(() => cap.checkAfter());
  });

  it('no-ops when no cost has been accumulated', () => {
    const cap = new CostCap({ limitUsd: 5 });
    assert.doesNotThrow(() => cap.checkAfter());
  });
});

describe('CostCap.add', () => {
  it('accumulates cost and token counts from multiple calls', () => {
    const cap = new CostCap({ limitUsd: 10 });
    cap.add({
      inputTokens: 100,
      cachedInputTokens: 5,
      outputTokens: 50,
      costUsd: 1,
    });
    cap.add({
      inputTokens: 200,
      cachedInputTokens: 10,
      outputTokens: 100,
      costUsd: 2,
    });
    assert.deepEqual(cap.totals, {
      inputTokens: 300,
      cachedInputTokens: 15,
      outputTokens: 150,
      costUsd: 3,
    });
  });

  it('handles null and undefined usage without throwing', () => {
    const cap = new CostCap({ limitUsd: 5 });
    cap.add(null);
    cap.add(undefined);
    assert.deepEqual(cap.totals, {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });
});

describe('CostCap.estimateCost', () => {
  it('returns 0 for subscription providers (github-models, copilot-cli)', () => {
    const cap = new CostCap({ limitUsd: 5 });
    assert.strictEqual(cap.estimateCost(100_000, 'github-models'), 0);
    assert.strictEqual(cap.estimateCost(100_000, 'copilot-cli'), 0);
  });

  it('returns a positive estimate for anthropic', () => {
    const cap = new CostCap({ limitUsd: 5 });
    const estimate = cap.estimateCost(40_000, 'anthropic');
    assert.ok(estimate > 0, `expected positive estimate, got ${estimate}`);
  });

  it('returns a positive estimate for gemini', () => {
    const cap = new CostCap({ limitUsd: 5 });
    const estimate = cap.estimateCost(40_000, 'gemini');
    assert.ok(estimate > 0, `expected positive estimate, got ${estimate}`);
  });

  it('scales with prompt size', () => {
    const cap = new CostCap({ limitUsd: 100 });
    const small = cap.estimateCost(1_000, 'anthropic');
    const large = cap.estimateCost(100_000, 'anthropic');
    assert.ok(large > small, 'larger prompt should cost more');
  });

  it('gemini estimate is significantly lower than anthropic for same input', () => {
    const cap = new CostCap();
    const anthropicEst = cap.estimateCost(1_000_000, 'anthropic');
    const geminiEst = cap.estimateCost(1_000_000, 'gemini');
    assert.ok(
      geminiEst < anthropicEst / 5,
      'gemini should cost much less than anthropic for same input',
    );
  });
});

describe('CostCap constructor', () => {
  it('reads cap from REVIEWER_COST_CAP_USD env var', () => {
    const saved = process.env.REVIEWER_COST_CAP_USD;
    try {
      process.env.REVIEWER_COST_CAP_USD = '3';
      const cap = new CostCap({});
      assert.strictEqual(cap.limitUsd, 3);
    } finally {
      if (saved === undefined) delete process.env.REVIEWER_COST_CAP_USD;
      else process.env.REVIEWER_COST_CAP_USD = saved;
    }
  });

  it('uses DEFAULT_CAP_USD ($5) when env var is absent', () => {
    const saved = process.env.REVIEWER_COST_CAP_USD;
    delete process.env.REVIEWER_COST_CAP_USD;
    const cap = new CostCap({});
    if (saved !== undefined) process.env.REVIEWER_COST_CAP_USD = saved;
    assert.strictEqual(cap.limitUsd, 5);
  });

  it('explicit limitUsd overrides env var', () => {
    const saved = process.env.REVIEWER_COST_CAP_USD;
    try {
      process.env.REVIEWER_COST_CAP_USD = '3';
      const cap = new CostCap({ limitUsd: 10 });
      assert.strictEqual(cap.limitUsd, 10);
    } finally {
      if (saved === undefined) delete process.env.REVIEWER_COST_CAP_USD;
      else process.env.REVIEWER_COST_CAP_USD = saved;
    }
  });
});

describe('CostCap — provider-aware default cap', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.REVIEWER_COST_CAP_USD;
    delete process.env.REVIEWER_COST_CAP_USD;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.REVIEWER_COST_CAP_USD;
    } else {
      process.env.REVIEWER_COST_CAP_USD = savedEnv;
    }
  });

  it('uses $5 default for anthropic provider', () => {
    const cap = new CostCap({ provider: 'anthropic' });
    assert.strictEqual(cap.limitUsd, 5);
  });

  it('uses $0.50 default for gemini provider', () => {
    const cap = new CostCap({ provider: 'gemini' });
    assert.strictEqual(cap.limitUsd, 0.5);
  });

  it('falls back to $5 for unknown provider', () => {
    const cap = new CostCap({ provider: 'github-models' });
    assert.strictEqual(cap.limitUsd, 5);
  });

  it('explicit limitUsd overrides provider default', () => {
    const cap = new CostCap({ provider: 'gemini', limitUsd: 2 });
    assert.strictEqual(cap.limitUsd, 2);
  });

  it('REVIEWER_COST_CAP_USD env overrides provider default', () => {
    process.env.REVIEWER_COST_CAP_USD = '1.25';
    const cap = new CostCap({ provider: 'gemini' });
    assert.strictEqual(cap.limitUsd, 1.25);
  });

  it('ignores zero REVIEWER_COST_CAP_USD and falls back to provider default', () => {
    process.env.REVIEWER_COST_CAP_USD = '0';
    const cap = new CostCap({ provider: 'gemini' });
    assert.strictEqual(cap.limitUsd, 0.5);
  });
});

describe('CostCap — gemini cap is reachable at realistic thresholds', () => {
  it('$0.50 gemini cap triggers well below 5M input chars', () => {
    const cap = new CostCap({ provider: 'gemini' });
    // Break-even: ~3.64M chars. Use 4M chars to confirm cap triggers.
    // 4M chars / 4 = 1M tokens * $0.30/MTok = $0.30 input
    // + 100K output tokens * $2.50/MTok = $0.25 → total $0.55 > $0.50
    const estimate = cap.estimateCost(4_000_000, 'gemini');
    assert.ok(
      estimate > cap.limitUsd,
      `$${estimate.toFixed(4)} should exceed $${cap.limitUsd} gemini cap at 4M chars`,
    );
  });

  it('$5 anthropic cap does not trigger at 4M input chars', () => {
    const cap = new CostCap({ provider: 'anthropic' });
    // 4M chars / 4 = 1M tokens * $3/MTok = $3 input
    // + 100K output tokens * $15/MTok = $1.50 → total $4.50 < $5
    const estimate = cap.estimateCost(4_000_000, 'anthropic');
    assert.ok(
      estimate < cap.limitUsd,
      `$${estimate.toFixed(4)} should not exceed $${cap.limitUsd} anthropic cap at 4M chars`,
    );
  });
});
