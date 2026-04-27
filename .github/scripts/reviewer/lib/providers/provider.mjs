/**
 * @interface LLMProvider
 *
 * Contract for all LLM review providers used by the bot-review system.
 * Each provider encapsulates how to call a specific model/service and
 * returns the model's review text along with token/cost accounting.
 */

/**
 * @typedef {object} ProviderUsage
 * @property {number} inputTokens         - Total input tokens consumed
 * @property {number} cachedInputTokens   - Tokens served from prompt cache (0 for Copilot)
 * @property {number} outputTokens        - Total output tokens produced
 * @property {number} costUsd             - Cost in USD (0 when provider has no per-token billing)
 */

/**
 * @typedef {object} ReviewResult
 * @property {string}        text  - The model's raw review text
 * @property {ProviderUsage} usage - Token and cost accounting for this call
 */

/**
 * Review a pull request diff using a language model.
 *
 * @function review
 * @memberof LLMProvider
 * @param {object} params
 * @param {string} params.system - System prompt (reviewer persona, instructions, context)
 * @param {string} params.user   - User prompt (the diff / content to review)
 * @returns {Promise<ReviewResult>} The model's review text and usage accounting
 * @throws {Error} If the provider call fails or returns a non-zero exit code
 */
