// Per-provider default caps. Anthropic: $3/MTok input → $5 ≈ 1.67M tokens.
// Gemini: $0.30/MTok input → $0.50 ≈ 1.67M tokens (10x cheaper, so $5 is unreachable).
const PROVIDER_DEFAULT_CAPS_USD = new Map([
  ['anthropic', 5],
  ['gemini', 0.5],
]);
const DEFAULT_CAP_USD = 5; // fallback for subscription/unknown providers

// Per-provider pricing (approximate, used for pre-call estimation only).
// Actual costs come from provider usage fields and are authoritative.
const ANTHROPIC_INPUT_COST_PER_TOK = 3 / 1_000_000; // $3/MTok
const ANTHROPIC_OUTPUT_COST_PER_TOK = 15 / 1_000_000; // $15/MTok
// gemini-2.5-flash paid-tier rates. Free tier bills $0; estimate stays
// conservative since billing can be enabled at any time.
const GEMINI_INPUT_COST_PER_TOK = 0.3 / 1_000_000;
const GEMINI_OUTPUT_COST_PER_TOK = 2.5 / 1_000_000;
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * @typedef {import('./providers/provider.mjs').ProviderUsage} ProviderUsage
 */

export class CostCapExceededError extends Error {
  /**
   * @param {number} cumulative - Cumulative cost that would be reached
   * @param {number} cap        - Configured cap in USD
   */
  constructor(cumulative, cap) {
    super(
      `PR review budget exceeded: $${cumulative.toFixed(4)} cumulative cost exceeds $${cap.toFixed(2)} cap`,
    );
    this.name = 'CostCapExceededError';
    this.retryable = false;
    this.cumulative = cumulative;
    this.cap = cap;
  }
}

/**
 * Tracks cumulative LLM cost for a single PR review run and enforces a hard cap.
 *
 * Typical usage:
 * ```js
 * const cap = new CostCap({ prNumber: 42 });
 * const estimate = cap.estimateCost(systemPrompt.length + userPrompt.length, provider);
 * cap.checkBefore(estimate);                 // throws if this call would exceed
 * const { text, usage } = await provider.review(...);
 * cap.add(usage);                            // accumulate actual cost
 * cap.checkAfter();                          // throws if already exceeded
 * ```
 */
export class CostCap {
  /**
   * @param {object} [opts]
   * @param {number} [opts.limitUsd]     - Hard cap in USD (default: provider-aware or REVIEWER_COST_CAP_USD env)
   * @param {string} [opts.provider]     - 'anthropic' | 'gemini' | other — selects per-provider default cap
   * @param {string} [opts.githubToken]  - GitHub token for posting cap-exceeded comments
   * @param {number} [opts.prNumber]     - PR number for posting cap-exceeded comments/labels
   * @param {string} [opts.repo]         - owner/repo slug for GitHub API calls
   */
  constructor({ limitUsd, provider, githubToken, prNumber, repo } = {}) {
    const envCap = Number(process.env.REVIEWER_COST_CAP_USD);
    const providerDefault =
      PROVIDER_DEFAULT_CAPS_USD.get(provider) ?? DEFAULT_CAP_USD;
    this.limitUsd =
      limitUsd ??
      (Number.isFinite(envCap) && envCap > 0 ? envCap : providerDefault);

    this.githubToken = githubToken ?? process.env.GITHUB_TOKEN ?? '';
    this.prNumber = prNumber;
    this.repo = repo ?? process.env.GITHUB_REPOSITORY ?? '';

    this._costUsd = 0;
    this._inputTokens = 0;
    this._cachedInputTokens = 0;
    this._outputTokens = 0;
  }

  /**
   * Accumulate cost and token counts from a completed provider call.
   * @param {ProviderUsage} usage
   */
  add(usage) {
    if (!usage) return;
    this._costUsd += usage.costUsd ?? 0;
    this._inputTokens += usage.inputTokens ?? 0;
    this._cachedInputTokens += usage.cachedInputTokens ?? 0;
    this._outputTokens += usage.outputTokens ?? 0;
  }

  /**
   * Rough cost estimate for an upcoming call, based on prompt character count.
   * Uses chars/4 ≈ tokens with provider-specific pricing. Returns 0 for
   * subscription-based providers (Copilot, GitHub Models).
   *
   * @param {number} promptChars - Total character count of system + user prompts
   * @param {string} [provider]  - Provider name ('gemini', 'anthropic', …) or a
   *   model ID like 'gemini-2.5-flash-lite'. Model IDs whose prefix matches a known
   *   provider (e.g. 'gemini-*') are normalised to their provider key automatically.
   * @returns {number} Estimated cost in USD
   */
  estimateCost(promptChars, provider = 'anthropic') {
    // Normalise model IDs to provider keys so callers can pass either
    // providerName ('gemini') or a specific model ID ('gemini-2.5-flash-lite').
    const key =
      typeof provider === 'string' && /^gemini-/i.test(provider)
        ? 'gemini'
        : provider;
    let inputRate;
    let outputRate;
    if (key === 'anthropic') {
      inputRate = ANTHROPIC_INPUT_COST_PER_TOK;
      outputRate = ANTHROPIC_OUTPUT_COST_PER_TOK;
    } else if (key === 'gemini') {
      inputRate = GEMINI_INPUT_COST_PER_TOK;
      outputRate = GEMINI_OUTPUT_COST_PER_TOK;
    } else {
      return 0;
    }
    const estimatedInputTokens = Math.ceil(
      promptChars / CHARS_PER_TOKEN_ESTIMATE,
    );
    // Assume ~10% output relative to input for a conservative estimate
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.1);
    return (
      estimatedInputTokens * inputRate + estimatedOutputTokens * outputRate
    );
  }

  /**
   * Throws CostCapExceededError if cumulative cost + estimatedCostUsd would exceed the cap.
   * No-ops when estimatedCostUsd is 0 (e.g. Copilot).
   *
   * @param {number} estimatedCostUsd
   */
  checkBefore(estimatedCostUsd = 0) {
    if (estimatedCostUsd === 0) return;
    const projected = this._costUsd + estimatedCostUsd;
    if (projected > this.limitUsd) {
      throw new CostCapExceededError(projected, this.limitUsd);
    }
  }

  /**
   * Throws CostCapExceededError if cumulative cost already exceeds the cap.
   * Call after accumulating usage from a completed provider call.
   */
  checkAfter() {
    if (this._costUsd > this.limitUsd) {
      throw new CostCapExceededError(this._costUsd, this.limitUsd);
    }
  }

  /** Current cumulative totals. */
  get totals() {
    return {
      inputTokens: this._inputTokens,
      cachedInputTokens: this._cachedInputTokens,
      outputTokens: this._outputTokens,
      costUsd: this._costUsd,
    };
  }
}
