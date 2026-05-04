/**
 * Fallback provider factory for sustained LLM outages.
 *
 * When the primary model (gemini-2.5-flash) returns 503 UNAVAILABLE and
 * exhausts all withRetry attempts, the orchestrator calls this to get a
 * GeminiProvider configured with a lower-tier model that draws from a
 * separate capacity pool. Default: gemini-2.5-flash-lite (overrideable via
 * REVIEWER_FALLBACK_MODEL env / the repo variable of the same name).
 *
 * Only `transient` (5xx) errors warrant a fallback — auth, quota,
 * context-too-large, and rate-limit are not capacity issues that a different
 * model would recover from.
 */

/**
 * Return a GeminiProvider configured with the fallback model, or null if
 * a fallback is not applicable for this error / provider combination.
 *
 * @param {unknown} err               - The error that exhausted primary retries
 * @param {string}  providerName      - Active provider name (e.g. 'gemini')
 * @returns {Promise<import('./providers/gemini.mjs').GeminiProvider|null>}
 */
export async function createFallbackProvider(err, providerName) {
  if (providerName !== 'gemini') return null;
  if (err?.kind !== 'transient') return null;
  const fallbackModel =
    process.env.REVIEWER_FALLBACK_MODEL ?? 'gemini-2.5-flash-lite';
  const primaryModel = process.env.REVIEWER_MODEL ?? 'gemini-2.5-flash';
  if (fallbackModel === primaryModel) return null;
  const { GeminiProvider } = await import('./providers/gemini.mjs');
  return new GeminiProvider({ model: fallbackModel });
}
