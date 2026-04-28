import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_CAP_USD = 5;

// Anthropic claude-sonnet pricing (approximate, used for pre-call estimation only).
// Actual costs come from provider usage fields and are authoritative.
const ANTHROPIC_INPUT_COST_PER_TOK = 3 / 1_000_000; // $3/MTok
const ANTHROPIC_OUTPUT_COST_PER_TOK = 15 / 1_000_000; // $15/MTok
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
   * @param {number} [opts.limitUsd]     - Hard cap in USD (default: REVIEWER_COST_CAP_USD env or $5)
   * @param {string} [opts.githubToken]  - GitHub token for posting cap-exceeded comments
   * @param {number} [opts.prNumber]     - PR number for posting cap-exceeded comments/labels
   * @param {string} [opts.repo]         - owner/repo slug for GitHub API calls
   */
  constructor({ limitUsd, githubToken, prNumber, repo } = {}) {
    const envCap = Number(process.env.REVIEWER_COST_CAP_USD);
    this.limitUsd =
      limitUsd ??
      (Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_CAP_USD);

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
   * Uses chars/4 ≈ tokens with Anthropic pricing. Returns 0 for any non-Anthropic
   * provider (Copilot uses a subscription, GitHub Models is included with the GitHub plan).
   *
   * @param {number} promptChars - Total character count of system + user prompts
   * @param {string} [provider]  - 'anthropic' | 'copilot-cli' | 'github-models'
   * @returns {number} Estimated cost in USD
   */
  estimateCost(promptChars, provider = 'anthropic') {
    if (provider !== 'anthropic') return 0;
    const estimatedInputTokens = Math.ceil(
      promptChars / CHARS_PER_TOKEN_ESTIMATE,
    );
    // Assume ~10% output relative to input for a conservative estimate
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.1);
    return (
      estimatedInputTokens * ANTHROPIC_INPUT_COST_PER_TOK +
      estimatedOutputTokens * ANTHROPIC_OUTPUT_COST_PER_TOK
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

  /**
   * Post a cap-exceeded comment on the PR and apply the needs-human-review label.
   * Best-effort: errors are swallowed so the main flow can exit cleanly.
   *
   * @returns {Promise<void>}
   */
  async handleExceeded() {
    if (!this.prNumber || !this.repo || !this.githubToken) return;

    const ghEnv = { ...process.env, GH_TOKEN: this.githubToken };

    await Promise.allSettled([
      execFileAsync(
        'gh',
        [
          'pr',
          'comment',
          String(this.prNumber),
          '--body',
          'PR exceeds automated review budget. Manual review required.',
          '--repo',
          this.repo,
        ],
        { env: ghEnv },
      ),
      execFileAsync(
        'gh',
        [
          'pr',
          'edit',
          String(this.prNumber),
          '--add-label',
          'needs-human-review',
          '--repo',
          this.repo,
        ],
        { env: ghEnv },
      ),
    ]);
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
