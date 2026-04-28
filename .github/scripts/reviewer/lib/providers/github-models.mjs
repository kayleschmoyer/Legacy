/**
 * GitHubModelsProvider — LLMProvider implementation using the GitHub Models
 * REST inference endpoint (OpenAI-compatible chat-completions wire format).
 *
 * Endpoint:  POST https://models.github.ai/inference/chat/completions
 * Auth:      Authorization: Bearer <token>
 *            The Actions GITHUB_TOKEN works when the workflow grants
 *            permissions: { models: read }. A fine-grained PAT with
 *            models:read also works.
 * Model:     `{publisher}/{model_name}` form, e.g. `openai/gpt-4o-mini`,
 *            `meta/Llama-3.3-70B-Instruct`, `microsoft/Phi-4`.
 */

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.2;
const ERROR_BODY_SNIPPET_CHARS = 500;

export class GitHubModelsProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.token]       - Auth token (default: GITHUB_MODELS_TOKEN || GH_MODELS_TOKEN || GITHUB_TOKEN || GH_TOKEN)
   * @param {string} [opts.model]       - Model id (default: REVIEWER_MODEL env or 'openai/gpt-4o-mini')
   * @param {string} [opts.endpoint]    - Override endpoint URL (default: GITHUB_MODELS_ENDPOINT env or canonical URL)
   * @param {number} [opts.timeoutMs]   - Request timeout (default: REVIEWER_TIMEOUT_MS env or 8 min)
   * @param {number} [opts.maxTokens]   - Max output tokens (default: 4096)
   * @param {number} [opts.temperature] - Sampling temperature (default: 0.2)
   */
  constructor({
    token,
    model,
    endpoint,
    timeoutMs,
    maxTokens,
    temperature,
  } = {}) {
    this.token =
      token ??
      process.env.GITHUB_MODELS_TOKEN ??
      process.env.GH_MODELS_TOKEN ??
      process.env.GITHUB_TOKEN ??
      process.env.GH_TOKEN;
    if (!this.token) {
      throw new Error(
        'GitHubModelsProvider: no auth token (set GITHUB_MODELS_TOKEN or grant `models: read` permission to GITHUB_TOKEN; fine-grained PATs use the `models:read` scope)',
      );
    }
    this.model = model ?? process.env.REVIEWER_MODEL ?? DEFAULT_MODEL;
    this.endpoint =
      endpoint ?? process.env.GITHUB_MODELS_ENDPOINT ?? DEFAULT_ENDPOINT;

    const envTimeout = Number(process.env.REVIEWER_TIMEOUT_MS);
    this.timeoutMs =
      timeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0
        ? envTimeout
        : DEFAULT_TIMEOUT_MS);
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = temperature ?? DEFAULT_TEMPERATURE;
  }

  /**
   * @param {object} params
   * @param {string} params.system
   * @param {string} params.user
   * @returns {Promise<import('./provider.mjs').ReviewResult>}
   */
  async review({ system, user }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        }),
      });
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new Error(
          `GitHubModelsProvider timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new Error(
        `GitHubModelsProvider fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `GitHub Models API error ${response.status}: ${body.slice(0, ERROR_BODY_SNIPPET_CHARS)}`,
      );
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error(
        `GitHub Models API returned no content: ${JSON.stringify(data).slice(0, ERROR_BODY_SNIPPET_CHARS)}`,
      );
    }

    const usage = data.usage ?? {};
    return {
      text,
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        costUsd: 0,
      },
    };
  }
}
