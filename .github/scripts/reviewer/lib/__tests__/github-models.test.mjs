import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubModelsProvider } from '../providers/github-models.mjs';

const PRESERVED_ENV_KEYS = [
  'GITHUB_MODELS_TOKEN',
  'GH_MODELS_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'REVIEWER_MODEL',
  'GITHUB_MODELS_ENDPOINT',
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
    return handler({ url, init });
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

describe('GitHubModelsProvider', () => {
  describe('constructor', () => {
    it('throws when no auth token is available in env or opts', () => {
      assert.throws(() => new GitHubModelsProvider(), /no auth token/);
    });

    it('falls back through GITHUB_MODELS_TOKEN → GITHUB_TOKEN → GH_TOKEN', () => {
      process.env.GH_TOKEN = 'gh-token';
      assert.strictEqual(new GitHubModelsProvider().token, 'gh-token');
      process.env.GITHUB_TOKEN = 'gha-token';
      assert.strictEqual(new GitHubModelsProvider().token, 'gha-token');
      process.env.GITHUB_MODELS_TOKEN = 'models-token';
      assert.strictEqual(new GitHubModelsProvider().token, 'models-token');
    });

    it('exposes documented defaults when env is empty', () => {
      const p = new GitHubModelsProvider({ token: 'stub' });
      assert.strictEqual(
        p.endpoint,
        'https://models.github.ai/inference/chat/completions',
      );
      assert.strictEqual(p.model, 'openai/gpt-4o-mini');
      assert.strictEqual(p.timeoutMs, 8 * 60 * 1000);
      assert.strictEqual(p.maxTokens, 4096);
      assert.strictEqual(p.temperature, 0.2);
    });

    it('honors REVIEWER_MODEL and GITHUB_MODELS_ENDPOINT env overrides', () => {
      process.env.REVIEWER_MODEL = 'meta/Llama-3.3-70B-Instruct';
      process.env.GITHUB_MODELS_ENDPOINT = 'https://example.test/v1/chat';
      const p = new GitHubModelsProvider({ token: 'stub' });
      assert.strictEqual(p.model, 'meta/Llama-3.3-70B-Instruct');
      assert.strictEqual(p.endpoint, 'https://example.test/v1/chat');
    });
  });

  describe('review', () => {
    it('returns the assistant text and maps usage fields', async () => {
      const p = new GitHubModelsProvider({ token: 'stub' });
      const calls = stubFetch(() =>
        jsonResponse({
          choices: [{ message: { content: 'review text' } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 25,
            prompt_tokens_details: { cached_tokens: 30 },
          },
        }),
      );

      const result = await p.review({ system: 'sys', user: 'usr' });

      assert.strictEqual(result.text, 'review text');
      assert.deepStrictEqual(result.usage, {
        inputTokens: 100,
        cachedInputTokens: 30,
        outputTokens: 25,
        costUsd: 0,
      });

      const body = JSON.parse(calls[0].init.body);
      assert.strictEqual(body.model, 'openai/gpt-4o-mini');
      assert.deepStrictEqual(body.messages, [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ]);
      assert.strictEqual(body.response_format, undefined);
      assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer stub');
    });

    it('zero-defaults usage fields when the API omits usage', async () => {
      const p = new GitHubModelsProvider({ token: 'stub' });
      stubFetch(() =>
        jsonResponse({ choices: [{ message: { content: 'hi' } }] }),
      );
      const { usage } = await p.review({ system: '', user: '' });
      assert.deepStrictEqual(usage, {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });
    });

    it('throws on non-2xx with status and truncated body', async () => {
      const p = new GitHubModelsProvider({ token: 'stub' });
      stubFetch(() => ({
        ok: false,
        status: 401,
        async text() {
          return 'unauthorized';
        },
      }));
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        /GitHub Models API error 401: unauthorized/,
      );
    });

    it('throws when the response has no assistant content', async () => {
      const p = new GitHubModelsProvider({ token: 'stub' });
      stubFetch(() => jsonResponse({ choices: [] }));
      await assert.rejects(
        () => p.review({ system: 's', user: 'u' }),
        /returned no content/,
      );
    });

    it('throws a clean timeout error when fetch is aborted', async () => {
      const p = new GitHubModelsProvider({ token: 'stub', timeoutMs: 5 });
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
        /GitHubModelsProvider timed out after 5ms/,
      );
    });
  });
});
