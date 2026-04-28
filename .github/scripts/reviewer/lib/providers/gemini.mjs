/**
 * GeminiProvider — LLMProvider implementation using the Google Gemini REST API
 * (Generative Language API at generativelanguage.googleapis.com).
 *
 * Endpoint:  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Auth:      ?key=<API_KEY> query parameter (no Bearer header)
 * Models:    gemini-2.5-flash (default), gemini-2.5-flash-lite, gemini-2.5-pro
 *
 * Caching strategy
 * ----------------
 * Uses Gemini's explicit `cachedContents` API to cache the system prompt across
 * all calls within a workflow run. The system prompt (reviewer-rules.md +
 * persona + severity rubric) is ~2000 tokens and stable across every PR,
 * meeting the 1024-token cachedContents minimum.
 *
 * The user prompt (diff + expanded context + per-pass focus) is sent fresh per
 * call. Across the three multi-pass calls within a single PR review, the long
 * shared prefix (system + diff + context, only differing by the trailing focus
 * marker) is automatically discounted by Gemini's *implicit* caching at 75%
 * off — this gives near-identical economics to caching the full prompt
 * explicitly without requiring a per-PR cache lifecycle.
 *
 * Free vs. paid tier
 * ------------------
 * Free-tier rate limits for gemini-2.5-flash are 10 RPM / 250 RPD / 250K TPM.
 * Multi-pass = 3 calls per non-trivial PR, so a busy day can exhaust the daily
 * 250 RPD cap. The provider returns typed errors so the orchestrator can
 * surface specific failures (rate limit, daily quota, auth, context size) to
 * the PR author rather than posting a generic infrastructure error.
 */

import { createHash } from 'node:crypto';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_CACHE_TTL_SECONDS = 600; // 10 min — covers a multi-pass review with margin
const MIN_CACHE_TOKENS = 1024;
const ERROR_BODY_SNIPPET_CHARS = 500;

// Pricing per million tokens (USD) on the paid tier. Free tier bills nothing
// but we still attribute estimated cost for telemetry/cost-cap consistency.
const PRICING = {
  'gemini-2.5-flash': {
    input: 0.3,
    output: 2.5,
    cacheRead: 0.075,
    cacheStoragePerHour: 1.0,
  },
  'gemini-2.5-flash-lite': {
    input: 0.1,
    output: 0.4,
    cacheRead: 0.025,
    cacheStoragePerHour: 0.25,
  },
  'gemini-2.5-pro': {
    input: 1.25,
    output: 10.0,
    cacheRead: 0.31,
    cacheStoragePerHour: 4.5,
  },
};

/**
 * Typed error categories for Gemini API failures. The orchestrator inspects
 * `kind` to decide whether to retry, fail fast, and which author-facing
 * message to post.
 *
 * - `auth`              → API key missing/invalid/revoked. Maintainer issue, never retry.
 * - `rate-limit`        → Per-minute RPM cap hit. Retry after Retry-After hint.
 * - `quota`             → Per-day RPD or token quota exhausted. Don't retry — won't recover today.
 * - `invalid-request`   → Malformed request (400). Don't retry.
 * - `context-too-large` → Input exceeds model context window. Don't retry — PR too big.
 * - `transient`         → 5xx / network errors. Retry.
 * - `unknown`           → Anything we couldn't categorize. Retry conservatively.
 */
export class GeminiError extends Error {
  /**
   * @param {string} message
   * @param {object} opts
   * @param {string} opts.kind
   * @param {boolean} [opts.retryable]
   * @param {number}  [opts.status]
   * @param {string}  [opts.raw]
   * @param {number}  [opts.retryAfterSeconds]
   */
  constructor(
    message,
    { kind, retryable = false, status, raw, retryAfterSeconds },
  ) {
    super(message);
    this.name = 'GeminiError';
    this.kind = kind;
    this.retryable = retryable;
    this.status = status;
    this.raw = raw;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Tool definition for structured review output. Forced via `tool_config` so
 * the model must emit a function call rather than free-form text.
 *
 * The per-finding shape MUST match the canonical schema enforced by
 * `parseFindingsFromText` in `lib/findings.mjs` — `severity`, `file`, `line`,
 * `title`, `body`. Findings missing `title` or `body` are silently dropped
 * by the parser's filter, so any drift from this shape produces an empty
 * findings array (and a spurious APPROVED verdict).
 *
 * The system prompt (`prompts/system.mjs`) instructs the model to emit
 * `{"findings":[{"severity":"high","title":"...","body":"..."}]}`, so this
 * tool schema mirrors that contract.
 */
const REVIEW_TOOL = {
  name: 'submit_review',
  description:
    'Submit a structured PR code review with findings and a verdict.',
  parameters: {
    type: 'OBJECT',
    properties: {
      summary: {
        type: 'STRING',
        description: 'One-to-two sentence overall review summary.',
      },
      findings: {
        type: 'ARRAY',
        description:
          'Individual review findings. Empty array means no issues found.',
        items: {
          type: 'OBJECT',
          properties: {
            severity: {
              type: 'STRING',
              enum: ['critical', 'high', 'medium', 'low', 'trivia'],
            },
            file: {
              type: 'STRING',
              nullable: true,
              description:
                'Path of the affected file. Must be a non-empty string or null — never omit, never use an empty string.',
            },
            line: {
              type: 'INTEGER',
              nullable: true,
              description:
                'Line number in the new file. Must be an integer ≥ 1 or null — never omit.',
            },
            title: {
              type: 'STRING',
              description: 'Short one-line summary (under 80 characters).',
            },
            body: {
              type: 'STRING',
              description:
                'Detailed explanation with a concrete fix suggestion.',
            },
          },
          // file and line are required-but-nullable so the model cannot omit
          // them; parseFindingsFromText filters undefined as malformed.
          required: ['severity', 'file', 'line', 'title', 'body'],
        },
      },
      verdict: {
        type: 'STRING',
        enum: ['APPROVED', 'REQUEST_CHANGES'],
        description:
          'APPROVED when no critical/high findings; REQUEST_CHANGES otherwise.',
      },
    },
    required: ['summary', 'findings', 'verdict'],
  },
};

function computeCostUsd(usageMetadata, model) {
  const p = PRICING[model];
  if (!p) return 0;
  const m = (n) => (n ?? 0) / 1_000_000;
  const promptTokens = usageMetadata.promptTokenCount ?? 0;
  const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
  const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
  const billableInputTokens = Math.max(0, promptTokens - cachedTokens);
  return (
    m(billableInputTokens) * p.input +
    m(cachedTokens) * p.cacheRead +
    m(outputTokens) * p.output
  );
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

export class GeminiProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.apiKey]      - Gemini API key (default: GEMINI_CODE_REVIEW_API_KEY || GEMINI_API_KEY || GOOGLE_API_KEY)
   * @param {string} [opts.model]       - Model id (default: REVIEWER_MODEL env or 'gemini-2.5-flash')
   * @param {string} [opts.endpoint]    - API base URL (default: GEMINI_API_ENDPOINT env or canonical URL)
   * @param {number} [opts.timeoutMs]   - Request timeout (default: REVIEWER_TIMEOUT_MS env or 8 min)
   * @param {number} [opts.maxTokens]   - Max output tokens (default: 4096)
   * @param {number} [opts.temperature] - Sampling temperature (default: 0.2)
   * @param {boolean} [opts.useExplicitCache] - Enable cachedContents API (default: true)
   */
  constructor({
    apiKey,
    model,
    endpoint,
    timeoutMs,
    maxTokens,
    temperature,
    useExplicitCache,
  } = {}) {
    this.apiKey =
      apiKey ??
      process.env.GEMINI_CODE_REVIEW_API_KEY ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        'GeminiProvider: no API key (set GEMINI_CODE_REVIEW_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY)',
      );
    }
    this.model = model ?? process.env.REVIEWER_MODEL ?? DEFAULT_MODEL;
    this.endpoint =
      endpoint ?? process.env.GEMINI_API_ENDPOINT ?? DEFAULT_API_BASE;

    const envTimeout = Number(process.env.REVIEWER_TIMEOUT_MS);
    this.timeoutMs =
      timeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0
        ? envTimeout
        : DEFAULT_TIMEOUT_MS);
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = temperature ?? DEFAULT_TEMPERATURE;
    this.useExplicitCache = useExplicitCache ?? true;

    // System-prompt cache: hash(system) → { name, expiresAt }.
    // Keyed by hash so a workflow run that reviews multiple PRs with the same
    // system prompt reuses one cache resource.
    this._systemCacheByHash = new Map();
    // Sticky flag flipped to true the first time a cache create returns
    // 429 with `TotalCachedContentStorageTokens limit=0` (the free-tier
    // signal that explicit caching isn't available on this account). Once
    // set, every subsequent call skips the cache attempt entirely.
    this._explicitCacheDisabled = false;
  }

  /**
   * @param {object} params
   * @param {string} params.system
   * @param {string} params.user
   * @returns {Promise<import('./provider.mjs').ReviewResult>}
   */
  async review({ system, user }) {
    const cachedContentName = this.useExplicitCache
      ? await this._getOrCreateSystemCache(system)
      : null;

    return await this._generateContent({
      system: cachedContentName ? null : system,
      user,
      cachedContentName,
    });
  }

  async _getOrCreateSystemCache(system) {
    if (this._explicitCacheDisabled) return null;

    const estimatedTokens = Math.ceil(system.length / 4);
    if (estimatedTokens < MIN_CACHE_TOKENS) {
      return null;
    }

    const key = sha256Hex(system);
    const existing = this._systemCacheByHash.get(key);
    if (existing && existing.expiresAt > Date.now() + 30_000) {
      return existing.name;
    }

    try {
      // Cache only the systemInstruction; omit `contents` so the cache prefix
      // is exactly the system prompt with no synthetic conversation turns.
      // Adding a fake "Acknowledge…READY" user/model pair would prepend an
      // unrelated turn to every real review call and bias the model.
      const url = `${this.endpoint}/cachedContents?key=${encodeURIComponent(this.apiKey)}`;
      const body = {
        model: `models/${this.model}`,
        systemInstruction: { parts: [{ text: system }] },
        ttl: `${DEFAULT_CACHE_TTL_SECONDS}s`,
      };
      const response = await this._fetchJson(url, body);
      const name = response.name;
      if (!name) {
        process.stderr.write(
          '[reviewer] Gemini cache create returned no name; falling back to inline system prompt\n',
        );
        return null;
      }
      this._systemCacheByHash.set(key, {
        name,
        expiresAt: Date.now() + DEFAULT_CACHE_TTL_SECONDS * 1000,
      });
      return name;
    } catch (err) {
      // Caching is best-effort. If the API rejects it, fall back to inline.
      // Free-tier accounts have a hard `TotalCachedContentStorageTokens` quota
      // of 0 — every cache create returns 429. Detect that specific signal and
      // disable explicit caching for the rest of this process so subsequent
      // calls don't burn an extra RPM-quota request per pass attempting it.
      const msg = err instanceof Error ? err.message : String(err);
      const isFreeTierStorageZero =
        /TotalCachedContentStorageTokens/i.test(msg) &&
        /limit\s*=?\s*0\b/i.test(msg);
      if (isFreeTierStorageZero) {
        this._explicitCacheDisabled = true;
        process.stderr.write(
          '[reviewer] Gemini explicit cache unavailable on this account (free-tier storage quota=0); disabling explicit cache for the rest of this process. Implicit caching still applies automatically.\n',
        );
      } else {
        process.stderr.write(
          `[reviewer] Gemini cache create failed (continuing without cache): ${msg}\n`,
        );
      }
      return null;
    }
  }

  async _generateContent({ system, user, cachedContentName }) {
    const url = `${this.endpoint}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
      },
      tools: [{ functionDeclarations: [REVIEW_TOOL] }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['submit_review'],
        },
      },
    };
    if (cachedContentName) {
      body.cachedContent = cachedContentName;
    } else if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const data = await this._fetchJson(url, body);

    const candidate = data?.candidates?.[0];
    if (!candidate) {
      throw new GeminiError('Gemini API returned no candidates', {
        kind: 'unknown',
        retryable: true,
        raw: JSON.stringify(data).slice(0, ERROR_BODY_SNIPPET_CHARS),
      });
    }
    const finishReason = candidate.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      // MAX_TOKENS in Gemini means the response was truncated because it hit
      // `maxOutputTokens` (output cap), NOT that the input exceeded the
      // model's context window. The truncated output is almost always a
      // partial function-call with malformed JSON, so retrying with a higher
      // output cap can recover. We classify as `transient` (retryable=true)
      // so withRetry takes another shot; a persistent failure still falls
      // through to the generic infra-error path. Other non-STOP reasons
      // (SAFETY, RECITATION, OTHER) are non-retryable invalid requests.
      const kind =
        finishReason === 'MAX_TOKENS' ? 'transient' : 'invalid-request';
      const retryable = finishReason === 'MAX_TOKENS';
      throw new GeminiError(
        `Gemini API stopped with finishReason=${finishReason}`,
        {
          kind,
          retryable,
          raw: JSON.stringify(candidate).slice(0, ERROR_BODY_SNIPPET_CHARS),
        },
      );
    }

    const parts = candidate.content?.parts ?? [];
    const fnCall = parts.find((p) => p.functionCall?.name === 'submit_review');
    if (!fnCall) {
      throw new GeminiError('Gemini API did not invoke submit_review tool', {
        kind: 'unknown',
        retryable: true,
        raw: JSON.stringify(parts).slice(0, ERROR_BODY_SNIPPET_CHARS),
      });
    }

    const usageMeta = data.usageMetadata ?? {};
    const usage = {
      inputTokens: usageMeta.promptTokenCount ?? 0,
      cachedInputTokens: usageMeta.cachedContentTokenCount ?? 0,
      outputTokens: usageMeta.candidatesTokenCount ?? 0,
      costUsd: computeCostUsd(usageMeta, this.model),
    };

    return {
      text: JSON.stringify(fnCall.functionCall.args ?? {}),
      usage,
    };
  }

  async _fetchJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new GeminiError(
          `GeminiProvider timed out after ${this.timeoutMs}ms`,
          { kind: 'transient', retryable: true },
        );
      }
      throw new GeminiError(
        `GeminiProvider fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        { kind: 'transient', retryable: true },
      );
    }
    clearTimeout(timer);

    const rawText = await response.text().catch(() => '');
    if (!response.ok) {
      throw classifyHttpError(response.status, rawText);
    }
    try {
      return JSON.parse(rawText);
    } catch (err) {
      throw new GeminiError(
        `Gemini API returned non-JSON: ${rawText.slice(0, ERROR_BODY_SNIPPET_CHARS)}`,
        { kind: 'unknown', retryable: true, status: response.status },
      );
    }
  }
}

/**
 * Map an HTTP error response to a typed GeminiError. Recognizes Google's
 * standard error envelope:
 *   { error: { code, message, status, details: [{ '@type', reason, ... }] } }
 *
 * The `status` and `reason` fields are how Google distinguishes RPM (rate
 * limit) from RPD (daily quota) — both surface as HTTP 429.
 *
 * @param {number} httpStatus
 * @param {string} rawBody
 * @returns {GeminiError}
 */
export function classifyHttpError(httpStatus, rawBody) {
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (_) {
    parsed = null;
  }
  const errObj = parsed?.error ?? {};
  const apiStatus = errObj.status ?? '';
  const apiMessage = errObj.message ?? '';

  const snippet = rawBody.slice(0, ERROR_BODY_SNIPPET_CHARS);
  const baseMessage = `Gemini API error ${httpStatus}${apiStatus ? ` (${apiStatus})` : ''}: ${apiMessage || snippet}`;

  if (httpStatus === 401 || httpStatus === 403) {
    return new GeminiError(baseMessage, {
      kind: 'auth',
      retryable: false,
      status: httpStatus,
      raw: snippet,
    });
  }

  if (httpStatus === 429) {
    // Google's quota errors put the metric name in two places:
    //   1. error.details[].quotaId / quotaMetric (structured, preferred)
    //   2. error.message (free-form, used as fallback)
    // The metric name encodes the window: "GenerateRequestsPerDay…" vs
    // "GenerateRequestsPerMinute…" — we treat PerDay as terminal (won't
    // recover today) and PerMinute as retryable (recovers in seconds).
    const quotaIds = (errObj.details ?? [])
      .flatMap((d) => [d?.quotaId, d?.quotaMetric])
      .filter(Boolean)
      .join(',');
    const detailHaystack = `${quotaIds} ${apiMessage}`;
    const isDaily =
      /per[\s_-]*day/i.test(detailHaystack) ||
      /perday/i.test(detailHaystack) ||
      /requestsperdayperprojectpermodel/i.test(detailHaystack);
    const retryAfterMatch = /retry in ([\d.]+)s/i.exec(apiMessage);
    const retryAfterSeconds = retryAfterMatch
      ? Number(retryAfterMatch[1])
      : undefined;
    return new GeminiError(baseMessage, {
      kind: isDaily ? 'quota' : 'rate-limit',
      retryable: !isDaily,
      status: httpStatus,
      raw: snippet,
      retryAfterSeconds,
    });
  }

  if (httpStatus === 400) {
    const isContextTooLarge =
      /context|token|too\s*long|too\s*large/i.test(apiMessage) ||
      /input.*too.*large/i.test(apiMessage);
    return new GeminiError(baseMessage, {
      kind: isContextTooLarge ? 'context-too-large' : 'invalid-request',
      retryable: false,
      status: httpStatus,
      raw: snippet,
    });
  }

  if (httpStatus >= 500 && httpStatus < 600) {
    return new GeminiError(baseMessage, {
      kind: 'transient',
      retryable: true,
      status: httpStatus,
      raw: snippet,
    });
  }

  // 404, 409, 422, etc. — treat as non-retryable invalid request by default,
  // with the raw body preserved for telemetry.
  return new GeminiError(baseMessage, {
    kind: 'invalid-request',
    retryable: false,
    status: httpStatus,
    raw: snippet,
  });
}
