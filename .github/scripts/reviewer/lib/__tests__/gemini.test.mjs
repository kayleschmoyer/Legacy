import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GeminiProvider,
  GeminiError,
  classifyHttpError,
} from '../providers/gemini.mjs';

const PRESERVED_ENV_KEYS = [
  'GEMINI_CODE_REVIEW_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'REVIEWER_MODEL',
  'GEMINI_API_ENDPOINT',
  'REVIEWER_TIMEOUT_MS',
];

const originalEnv = {};
let originalFetch;

before(() => {
  for (const key of PRESERVED_ENV_KEYS) originalEnv[key] = process.env[key];
  originalFetch = global.fetch;
});

after(() => {
  for (const key of PRESERVED_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
});

beforeEach(() => {
  for (const key of PRESERVED_ENV_KEYS) delete process.env[key];
  global.fetch = originalFetch;
});

function stubFetch(handler) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler({ url, init, callIndex: calls.length - 1 });
  };
  return calls;
}

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function rawResponse(rawText, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(rawText);
    },
    async text() {
      return rawText;
    },
  };
}

function buildSuccessfulGenerateResponse({
  args = { summary: 's', findings: [], verdict: 'APPROVED' },
  promptTokenCount = 100,
  cachedContentTokenCount = 0,
  candidatesTokenCount = 25,
} = {}) {
  return jsonResponse({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [{ functionCall: { name: 'submit_review', args } }],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount,
      cachedContentTokenCount,
      candidatesTokenCount,
    },
  });
}

describe('GeminiProvider', () => {
  describe('constructor', () => {
    it('throws when no API key is available', () => {
      assert.throws(() => new GeminiProvider(), /no API key/);
    });

    it('falls back through GEMINI_CODE_REVIEW_API_KEY → GEMINI_API_KEY → GOOGLE_API_KEY', () => {
      process.env.GOOGLE_API_KEY = 'goog';
      assert.strictEqual(new GeminiProvider().apiKey, 'goog');
      process.env.GEMINI_API_KEY = 'gem';
      assert.strictEqual(new GeminiProvider().apiKey, 'gem');
      process.env.GEMINI_CODE_REVIEW_API_KEY = 'review';
      assert.strictEqual(new GeminiProvider().apiKey, 'review');
    });

    it('exposes documented defaults when env is empty', () => {
      const p = new GeminiProvider({ apiKey: 'stub' });
      assert.strictEqual(p.model, 'gemini-2.5-flash');
      assert.strictEqual(
        p.endpoint,
        'https://generativelanguage.googleapis.com/v1beta',
      );
      assert.strictEqual(p.timeoutMs, 8 * 60 * 1000);
      assert.strictEqual(p.maxTokens, 8192);
      assert.strictEqual(p.temperature, 0.2);
      assert.strictEqual(p.useExplicitCache, true);
    });

    it('honors REVIEWER_MODEL and GEMINI_API_ENDPOINT env overrides', () => {
      process.env.REVIEWER_MODEL = 'gemini-2.5-pro';
      process.env.GEMINI_API_ENDPOINT = 'https://example.test/v1';
      const p = new GeminiProvider({ apiKey: 'stub' });
      assert.strictEqual(p.model, 'gemini-2.5-pro');
      assert.strictEqual(p.endpoint, 'https://example.test/v1');
    });
  });

  describe('review (success)', () => {
    it('returns the function-call args as JSON text and maps usage', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        buildSuccessfulGenerateResponse({
          args: { summary: 'good', findings: [], verdict: 'APPROVED' },
          promptTokenCount: 200,
          cachedContentTokenCount: 50,
          candidatesTokenCount: 30,
        }),
      );

      const result = await p.review({ system: 's', user: 'u' });

      assert.strictEqual(
        result.text,
        JSON.stringify({ summary: 'good', findings: [], verdict: 'APPROVED' }),
      );
      assert.deepStrictEqual(result.usage, {
        inputTokens: 200,
        cachedInputTokens: 50,
        outputTokens: 30,
        // billable input = 200 - 50 = 150
        // 150 * 0.30/M + 50 * 0.075/M + 30 * 2.5/M
        costUsd:
          (150 * 0.3) / 1_000_000 +
          (50 * 0.075) / 1_000_000 +
          (30 * 2.5) / 1_000_000,
      });
    });

    it('embeds the apiKey as a query param and posts the tool config', async () => {
      const p = new GeminiProvider({
        apiKey: 'secret-key',
        useExplicitCache: false,
      });
      const calls = stubFetch(() => buildSuccessfulGenerateResponse());

      await p.review({ system: 'sys', user: 'usr' });

      assert.match(calls[0].url, /\?key=secret-key$/);
      const body = JSON.parse(calls[0].init.body);
      assert.deepStrictEqual(body.systemInstruction, {
        parts: [{ text: 'sys' }],
      });
      assert.deepStrictEqual(body.contents, [
        { role: 'user', parts: [{ text: 'usr' }] },
      ]);
      assert.strictEqual(body.toolConfig.functionCallingConfig.mode, 'ANY');
      assert.deepStrictEqual(
        body.toolConfig.functionCallingConfig.allowedFunctionNames,
        ['submit_review'],
      );
    });

    it('creates a cachedContents resource holding the systemInstruction and tool config (no synthetic turns)', async () => {
      const p = new GeminiProvider({ apiKey: 'stub' });
      const largeSystem = 'x'.repeat(8000); // ~2000 tokens, above 1024 minimum
      const calls = stubFetch(({ url }) => {
        if (url.includes('cachedContents')) {
          return jsonResponse({ name: 'cachedContents/abc123' });
        }
        return buildSuccessfulGenerateResponse();
      });

      await p.review({ system: largeSystem, user: 'usr' });

      assert.strictEqual(calls.length, 2);
      assert.match(calls[0].url, /cachedContents/);
      const cacheBody = JSON.parse(calls[0].init.body);
      assert.strictEqual(cacheBody.model, 'models/gemini-2.5-flash');
      assert.deepStrictEqual(cacheBody.systemInstruction, {
        parts: [{ text: largeSystem }],
      });
      // No synthetic "READY" turn or any other contents — the cached prefix
      // must be exactly the system instruction so it doesn't bias real review
      // calls that prepend it.
      assert.strictEqual(
        cacheBody.contents,
        undefined,
        'cache should not include synthetic contents',
      );
      // Tool schema lives on the cache because the API rejects requests that
      // set `tools`/`toolConfig` alongside `cachedContent`.
      assert.strictEqual(
        cacheBody.tools[0].functionDeclarations[0].name,
        'submit_review',
      );
      assert.strictEqual(
        cacheBody.toolConfig.functionCallingConfig.mode,
        'ANY',
      );
      assert.deepStrictEqual(
        cacheBody.toolConfig.functionCallingConfig.allowedFunctionNames,
        ['submit_review'],
      );

      const generateBody = JSON.parse(calls[1].init.body);
      assert.strictEqual(generateBody.cachedContent, 'cachedContents/abc123');
      assert.strictEqual(generateBody.systemInstruction, undefined);
      // Regression: setting `tools`/`toolConfig` together with `cachedContent`
      // triggers `400 INVALID_ARGUMENT` from the Gemini API. They must be
      // absent on the per-call request when the cache is in use (LS-3964).
      assert.strictEqual(generateBody.tools, undefined);
      assert.strictEqual(generateBody.toolConfig, undefined);
    });

    it('skips explicit caching for small system prompts', async () => {
      const p = new GeminiProvider({ apiKey: 'stub' });
      const smallSystem = 'x'.repeat(200); // ~50 tokens, below minimum
      const calls = stubFetch(() => buildSuccessfulGenerateResponse());

      await p.review({ system: smallSystem, user: 'usr' });

      assert.strictEqual(calls.length, 1, 'should not call cachedContents');
      assert.match(calls[0].url, /:generateContent/);
    });

    it('reuses the same cache resource across multiple review calls within a workflow run', async () => {
      const p = new GeminiProvider({ apiKey: 'stub' });
      const largeSystem = 'x'.repeat(8000);
      let cacheCreates = 0;
      const calls = stubFetch(({ url }) => {
        if (url.includes('cachedContents')) {
          cacheCreates++;
          return jsonResponse({ name: 'cachedContents/abc123' });
        }
        return buildSuccessfulGenerateResponse();
      });

      await p.review({ system: largeSystem, user: 'pass-1' });
      await p.review({ system: largeSystem, user: 'pass-2' });
      await p.review({ system: largeSystem, user: 'pass-3' });

      assert.strictEqual(cacheCreates, 1, 'cache created once for 3 passes');
      assert.strictEqual(calls.length, 4); // 1 cache + 3 generate
    });

    it('emits findings using the canonical title/body schema (passes parseFindingsFromText filter)', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      const args = {
        summary: 'Two issues found',
        findings: [
          {
            severity: 'high',
            file: 'src/auth.ts',
            line: 42,
            title: 'SQL injection via unescaped input',
            body: 'Use a parameterised query instead of string interpolation.',
          },
          {
            severity: 'medium',
            file: 'src/util.ts',
            line: 10,
            title: 'Off-by-one in loop bound',
            body: 'Loop condition should be `i < arr.length`, currently uses `i <= arr.length`.',
          },
        ],
        verdict: 'REQUEST_CHANGES',
      };
      stubFetch(() => buildSuccessfulGenerateResponse({ args }));

      const result = await p.review({ system: 's', user: 'u' });

      // Round-trip through parseFindingsFromText — confirms the emitted
      // shape is what the rest of the reviewer pipeline expects.
      const { parseFindingsFromText } = await import('../findings.mjs');
      const parsed = parseFindingsFromText(result.text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.findings.length, 2);
      assert.strictEqual(
        parsed.findings[0].title,
        'SQL injection via unescaped input',
      );
      assert.strictEqual(
        parsed.findings[0].body,
        'Use a parameterised query instead of string interpolation.',
      );
      assert.strictEqual(parsed.findings[1].severity, 'medium');
    });

    it('disables explicit caching for the rest of the process when free-tier storage quota=0', async () => {
      const p = new GeminiProvider({ apiKey: 'stub' });
      const largeSystem = 'x'.repeat(8000);
      let cacheAttempts = 0;
      const calls = stubFetch(({ url }) => {
        if (url.includes('cachedContents')) {
          cacheAttempts++;
          return rawResponse(
            JSON.stringify({
              error: {
                code: 429,
                status: 'RESOURCE_EXHAUSTED',
                message:
                  'TotalCachedContentStorageTokensPerModelFreeTier limit exceeded for model gemini-2.5-flash: limit=0, requested=1854',
              },
            }),
            { status: 429 },
          );
        }
        return buildSuccessfulGenerateResponse();
      });

      await p.review({ system: largeSystem, user: 'pass-1' });
      await p.review({ system: largeSystem, user: 'pass-2' });
      await p.review({ system: largeSystem, user: 'pass-3' });

      assert.strictEqual(
        cacheAttempts,
        1,
        'should not retry cache create after free-tier quota=0 signal',
      );
      // 1 failed cache create + 3 generate calls (each falling back to inline)
      assert.strictEqual(calls.length, 4);
      assert.strictEqual(p._explicitCacheDisabled, true);
    });

    it('falls back to inline system prompt when cache create fails', async () => {
      const p = new GeminiProvider({ apiKey: 'stub' });
      const largeSystem = 'x'.repeat(8000);
      const calls = stubFetch(({ url }) => {
        if (url.includes('cachedContents')) {
          return rawResponse(
            JSON.stringify({
              error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad' },
            }),
            { status: 400 },
          );
        }
        return buildSuccessfulGenerateResponse();
      });

      const result = await p.review({ system: largeSystem, user: 'usr' });

      assert.strictEqual(typeof result.text, 'string');
      const generateBody = JSON.parse(calls[1].init.body);
      assert.strictEqual(generateBody.cachedContent, undefined);
      assert.deepStrictEqual(generateBody.systemInstruction, {
        parts: [{ text: largeSystem }],
      });
    });

    it('round-trips through parseFindingsFromText when file and line are omitted (MALFORMED_FUNCTION_CALL fix)', async () => {
      // Gemini may omit file/line rather than emitting null when they are not
      // required (LS-3962). parseFindingsFromText accepts missing fields and
      // normalizes them to null so the Finding contract is preserved.
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      const args = {
        summary: 'One issue, no location',
        findings: [
          {
            severity: 'high',
            title: 'Missing input validation',
            body: 'Sanitise before use.',
          },
        ],
        verdict: 'REQUEST_CHANGES',
      };
      stubFetch(() => buildSuccessfulGenerateResponse({ args }));

      const result = await p.review({ system: 's', user: 'u' });

      const { parseFindingsFromText } = await import('../findings.mjs');
      const parsed = parseFindingsFromText(result.text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.findings.length, 1);
      assert.strictEqual(parsed.findings[0].title, 'Missing input validation');
      assert.strictEqual(parsed.findings[0].file, null);
      assert.strictEqual(parsed.findings[0].line, null);
    });

    it('logs raw args shape to stderr on every successful review (LS-3966)', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      const stderrLines = [];
      const origWrite = process.stderr.write;
      process.stderr.write = (msg) => {
        stderrLines.push(typeof msg === 'string' ? msg : String(msg));
        return true;
      };
      try {
        const args = {
          summary: 'Two issues',
          findings: [
            { severity: 'high', title: 'T1', body: 'Body one.' },
            { severity: 'low', title: 'T2', body: 'Body two.' },
          ],
          verdict: 'REQUEST_CHANGES',
        };
        stubFetch(() => buildSuccessfulGenerateResponse({ args }));
        await p.review({ system: 's', user: 'u' });
      } finally {
        process.stderr.write = origWrite;
      }
      const logLine = stderrLines.find((l) => l.includes('Gemini raw args:'));
      assert.ok(logLine, 'raw args log line must be emitted');
      assert.ok(
        logLine.includes('findingsCount=2'),
        'log must include findings count',
      );
    });

    it('unwraps double-encoded JSON string args (LS-3966 proto Struct edge case)', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      const stderrLines = [];
      const origWrite = process.stderr.write;
      process.stderr.write = (msg) => {
        stderrLines.push(typeof msg === 'string' ? msg : String(msg));
        return true;
      };
      try {
        const actualArgs = {
          summary: 'Null check issue',
          findings: [
            {
              severity: 'high',
              title: 'Missing null check',
              body: 'Add null guard before accessing nested property.',
            },
          ],
          verdict: 'REQUEST_CHANGES',
        };
        // Simulate args arriving as a JSON string (double-encoded) rather than
        // a structured object — can occur with certain Gemini proto-JSON codecs.
        const doubleEncodedArgs = JSON.stringify(actualArgs);
        stubFetch(() =>
          jsonResponse({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'submit_review',
                        args: doubleEncodedArgs,
                      },
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 100,
              cachedContentTokenCount: 0,
              candidatesTokenCount: 25,
            },
          }),
        );

        const result = await p.review({ system: 's', user: 'u' });

        const { parseFindingsFromText } = await import('../findings.mjs');
        const parsed = parseFindingsFromText(result.text);
        assert.strictEqual(
          parsed.ok,
          true,
          'parseFindingsFromText must succeed',
        );
        assert.strictEqual(parsed.findings.length, 1);
        assert.strictEqual(parsed.findings[0].title, 'Missing null check');
      } finally {
        process.stderr.write = origWrite;
      }
      assert.ok(
        stderrLines.some((l) => l.includes('double-encoded')),
        'must log the double-encoded detection',
      );
    });

    it('normalizes missing findings key to empty array (gemini-2.5-flash thinking model omission)', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        buildSuccessfulGenerateResponse({
          // Gemini 2.5 Flash may omit 'findings' despite it being required
          args: { summary: 'Looks good', verdict: 'APPROVED' },
        }),
      );

      const result = await p.review({ system: 's', user: 'u' });
      const parsed = JSON.parse(result.text);

      assert.deepStrictEqual(parsed.findings, []);
      assert.strictEqual(parsed.verdict, 'APPROVED');
      assert.strictEqual(parsed.summary, 'Looks good');
    });
  });

  describe('review (errors)', () => {
    it('throws GeminiError(kind=auth, retryable=false) on 401', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        rawResponse(
          JSON.stringify({
            error: {
              code: 401,
              status: 'UNAUTHENTICATED',
              message: 'API key invalid',
            },
          }),
          { status: 401 },
        ),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.ok(err instanceof GeminiError);
          assert.strictEqual(err.kind, 'auth');
          assert.strictEqual(err.retryable, false);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=quota, retryable=false) on 429 with PerDay quota', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        rawResponse(
          JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message:
                "Quota exceeded for quota metric 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' and limit 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' of service 'generativelanguage.googleapis.com' for consumer 'project_number:123'.",
            },
          }),
          { status: 429 },
        ),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'quota');
          assert.strictEqual(err.retryable, false);
          return true;
        },
      );
    });

    it('classifies 429 as quota when the quotaId in details indicates PerDay (not just message regex)', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        rawResponse(
          JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Resource exhausted.',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [
                    { quotaMetric: 'GenerateRequestsPerDayPerProjectPerModel' },
                  ],
                },
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason: 'RATE_LIMIT_EXCEEDED',
                  quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
                },
              ],
            },
          }),
          { status: 429 },
        ),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'quota');
          assert.strictEqual(err.retryable, false);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=transient, retryable=true) when finishReason=MAX_TOKENS (output truncation, not input too large)', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        jsonResponse({
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: { parts: [{ text: 'truncated...' }] },
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 4096 },
        }),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          // MAX_TOKENS means the output hit maxOutputTokens, NOT that the
          // input exceeded the context window. Must be retryable so the
          // pipeline takes another shot.
          assert.strictEqual(err.kind, 'transient');
          assert.strictEqual(err.retryable, true);
          assert.match(err.message, /MAX_TOKENS/);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=transient, retryable=true) when finishReason=MALFORMED_FUNCTION_CALL (LS-3974)', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        jsonResponse({
          candidates: [
            {
              finishReason: 'MALFORMED_FUNCTION_CALL',
              content: { parts: [] },
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
        }),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          // MALFORMED_FUNCTION_CALL is intermittent — a retry typically
          // recovers. Must be classified as transient (retryable=true) so
          // withRetry takes another shot rather than failing fast.
          assert.ok(err instanceof GeminiError);
          assert.strictEqual(err.kind, 'transient');
          assert.strictEqual(err.retryable, true);
          assert.match(err.message, /MALFORMED_FUNCTION_CALL/);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=invalid-request, retryable=false) for non-MAX_TOKENS bad finishReasons', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        jsonResponse({
          candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0 },
        }),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'invalid-request');
          assert.strictEqual(err.retryable, false);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=rate-limit, retryable=true) on 429 without daily marker', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        rawResponse(
          JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Resource exhausted. Please retry in 12.5s.',
            },
          }),
          { status: 429 },
        ),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'rate-limit');
          assert.strictEqual(err.retryable, true);
          assert.strictEqual(err.retryAfterSeconds, 12.5);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=transient, retryable=true) on 503', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() => rawResponse('Service Unavailable', { status: 503 }));
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'transient');
          assert.strictEqual(err.retryable, true);
          assert.strictEqual(err.status, 503);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=context-too-large) when 400 mentions token size', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        rawResponse(
          JSON.stringify({
            error: {
              code: 400,
              status: 'INVALID_ARGUMENT',
              message: 'Input is too long: token count exceeds limit',
            },
          }),
          { status: 400 },
        ),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'context-too-large');
          assert.strictEqual(err.retryable, false);
          return true;
        },
      );
    });

    it('throws GeminiError(kind=unknown) when response has no candidates', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() => jsonResponse({ candidates: [] }));
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.strictEqual(err.kind, 'unknown');
          return true;
        },
      );
    });

    it('throws GeminiError(kind=unknown) when candidate has no submit_review tool call', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        useExplicitCache: false,
      });
      stubFetch(() =>
        jsonResponse({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: 'hello' }] },
            },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        }),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        /did not invoke submit_review/,
      );
    });

    it('throws a clean timeout error when fetch is aborted', async () => {
      const p = new GeminiProvider({
        apiKey: 'stub',
        timeoutMs: 5,
        useExplicitCache: false,
      });
      stubFetch(
        ({ init }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      );
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        /GeminiProvider timed out after 5ms/,
      );
    });
  });

  describe('MALFORMED_FUNCTION_CALL free-form fallback (LS-4109)', () => {
    function buildMalformedResponse() {
      return jsonResponse({
        candidates: [
          { finishReason: 'MALFORMED_FUNCTION_CALL', content: { parts: [] } },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
      });
    }

    function buildFreeFormResponse(text) {
      return jsonResponse({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text }] },
          },
        ],
        usageMetadata: {
          promptTokenCount: 200,
          cachedContentTokenCount: 0,
          candidatesTokenCount: 50,
        },
      });
    }

    it('increments _consecutiveMalformedCount on each MALFORMED_FUNCTION_CALL', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(() => buildMalformedResponse());

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 1);

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 2);
    });

    it('switches to free-form mode after MALFORMED_FREEFORM_THRESHOLD consecutive failures', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      const calls = stubFetch(({ callIndex }) => {
        // First two calls: MALFORMED_FUNCTION_CALL
        if (callIndex < 2) return buildMalformedResponse();
        // Third call: free-form text response (no functionCall part)
        return buildFreeFormResponse('{"findings":[]}');
      });

      // Two MALFORMED failures
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      // Third call should use free-form mode
      const result = await p.review({ system: 's', user: 'u' });

      assert.strictEqual(result.text, '{"findings":[]}');

      // Free-form request must NOT include toolConfig or tools
      const freeFormBody = JSON.parse(calls[2].init.body);
      assert.strictEqual(freeFormBody.toolConfig, undefined);
      assert.strictEqual(freeFormBody.tools, undefined);
      // System instruction must be sent inline
      assert.deepStrictEqual(freeFormBody.systemInstruction, {
        parts: [{ text: 's' }],
      });
      // Free-form must use FREE_FORM_MAX_TOKENS (16384), not the tool-call
      // default (8192) — ensures future refactors don't regress to truncation.
      assert.strictEqual(
        freeFormBody.generationConfig.maxOutputTokens,
        16384,
      );
    });

    it('free-form request bypasses cachedContent even when cache is available', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: true });
      const largeSystem = 'x'.repeat(8000);
      const calls = stubFetch(({ url, callIndex }) => {
        if (url.includes('cachedContents'))
          return jsonResponse({ name: 'cachedContents/xyz' });
        // First two generate calls: MALFORMED
        if (callIndex <= 2) return buildMalformedResponse();
        // Third generate call: free-form
        return buildFreeFormResponse('{"findings":[]}');
      });

      // Two MALFORMED failures before the free-form fallback; the cache may be reused in memory.
      await assert.rejects(() => p.review({ system: largeSystem, user: 'u' }));
      await assert.rejects(() => p.review({ system: largeSystem, user: 'u' }));

      // Free-form call — must NOT use cachedContent
      await p.review({ system: largeSystem, user: 'u' });

      const freeFormBody = JSON.parse(calls[calls.length - 1].init.body);
      assert.strictEqual(freeFormBody.cachedContent, undefined);
      assert.strictEqual(freeFormBody.toolConfig, undefined);
    });

    it('resets counter to zero after a successful tool-call response', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex === 0) return buildMalformedResponse();
        return buildSuccessfulGenerateResponse();
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 1);

      await p.review({ system: 's', user: 'u' });
      assert.strictEqual(p._consecutiveMalformedCount, 0);
    });

    it('resets counter to zero on any non-MALFORMED_FUNCTION_CALL finish reason', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex === 0) return buildMalformedResponse();
        return jsonResponse({
          candidates: [
            { finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'x' }] } },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 },
        });
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 1);

      // MAX_TOKENS is a non-MALFORMED outcome — counter resets even though it throws
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 0);
    });

    it('resets counter to zero on STOP with no submit_review tool call', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex === 0) return buildMalformedResponse();
        // STOP but no functionCall — "did not invoke submit_review"
        return jsonResponse({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: 'some prose' }] },
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        });
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 1);

      // STOP(no tool) is not a MALFORMED — counter resets so the next
      // MALFORMED starts a fresh streak
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      assert.strictEqual(p._consecutiveMalformedCount, 0);
    });

    it('free-form response returns raw model text; parseFindingsFromText strips fences', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      // Trigger threshold
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return buildFreeFormResponse(
          '```json\n{"findings":[{"severity":"high","title":"T","body":"B","file":null,"line":null}]}\n```',
        );
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      const result = await p.review({ system: 's', user: 'u' });

      // parseFindingsFromText is the authoritative fence-stripping/parsing function
      const { parseFindingsFromText } = await import('../findings.mjs');
      const parsed = parseFindingsFromText(result.text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.findings.length, 1);
      assert.strictEqual(parsed.findings[0].title, 'T');
    });

    it('free-form response extracts ```json block when response has a prose preamble', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return buildFreeFormResponse(
          'Here is my review:\n```json\n{"findings":[]}\n```',
        );
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      const result = await p.review({ system: 's', user: 'u' });

      const { parseFindingsFromText } = await import('../findings.mjs');
      const parsed = parseFindingsFromText(result.text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.findings.length, 0);
    });

    it('free-form response preserves triple-backticks inside valid JSON string values', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      const bodyWithFence = 'Use this snippet:\n```js\nconsole.log("hi");\n```';

      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return buildFreeFormResponse(
          JSON.stringify({
            findings: [
              {
                severity: 'high',
                title: 'T',
                body: bodyWithFence,
                file: null,
                line: null,
              },
            ],
          }),
        );
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      const result = await p.review({ system: 's', user: 'u' });

      const { parseFindingsFromText } = await import('../findings.mjs');
      const parsed = parseFindingsFromText(result.text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.findings.length, 1);
      assert.strictEqual(parsed.findings[0].body, bodyWithFence);
    });

    it('free-form response extracts ```json block even when a non-JSON fence precedes it', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      // Response has a ```js snippet first, then the actual ```json payload.
      const preambleWithNonJsonFence =
        'Here is an example:\n```js\nconsole.log("hi");\n```\n\nAnd the findings:\n```json\n{"findings":[]}\n```';
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return buildFreeFormResponse(preambleWithNonJsonFence);
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      const result = await p.review({ system: 's', user: 'u' });
      const { parseFindingsFromText } = await import('../findings.mjs');
      const parsed = parseFindingsFromText(result.text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.findings.length, 0);
    });

    it('free-form response maps usage metadata correctly', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return jsonResponse({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"findings":[]}' }] },
            },
          ],
          usageMetadata: {
            promptTokenCount: 300,
            cachedContentTokenCount: 0,
            candidatesTokenCount: 40,
          },
        });
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      const result = await p.review({ system: 's', user: 'u' });

      assert.strictEqual(result.usage.inputTokens, 300);
      assert.strictEqual(result.usage.outputTokens, 40);
    });

    it('free-form mode throws GeminiError(retryable=true) when MAX_TOKENS in free-form', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      // Force into free-form mode first
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return jsonResponse({
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: { parts: [{ text: 'trun' }] },
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        });
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.ok(err instanceof GeminiError);
          assert.strictEqual(err.retryable, true);
          assert.match(err.message, /MAX_TOKENS.*free-form/);
          return true;
        },
      );
    });

    it('free-form mode throws GeminiError(retryable=true) when MALFORMED_FUNCTION_CALL occurs in free-form', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return jsonResponse({
          candidates: [
            {
              finishReason: 'MALFORMED_FUNCTION_CALL',
              content: { parts: [] },
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
        });
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        (err) => {
          assert.ok(err instanceof GeminiError);
          assert.strictEqual(err.retryable, true);
          assert.match(err.message, /MALFORMED_FUNCTION_CALL.*free-form/);
          return true;
        },
      );
    });

    it('free-form mode throws GeminiError(kind=unknown, retryable=true) when no text part returned', async () => {
      const p = new GeminiProvider({ apiKey: 'stub', useExplicitCache: false });
      stubFetch(({ callIndex }) => {
        if (callIndex < 2) return buildMalformedResponse();
        return jsonResponse({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ functionCall: { name: 'x', args: {} } }] },
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
        });
      });

      await assert.rejects(() => p.review({ system: 's', user: 'u' }));
      await assert.rejects(() => p.review({ system: 's', user: 'u' }));

      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        /no text part in free-form mode/,
      );
    });
  });

  describe('classifyHttpError', () => {
    it('treats 403 as auth (not rate-limit)', () => {
      const err = classifyHttpError(403, '{"error":{"message":"Forbidden"}}');
      assert.strictEqual(err.kind, 'auth');
      assert.strictEqual(err.retryable, false);
    });

    it('treats unparseable body as the appropriate kind by status alone', () => {
      const err = classifyHttpError(500, 'not json');
      assert.strictEqual(err.kind, 'transient');
      assert.strictEqual(err.retryable, true);
    });

    it('falls through to invalid-request for 422', () => {
      const err = classifyHttpError(422, '{}');
      assert.strictEqual(err.kind, 'invalid-request');
      assert.strictEqual(err.retryable, false);
    });
  });
});
