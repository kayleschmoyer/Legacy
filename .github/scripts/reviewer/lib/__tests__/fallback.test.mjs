import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFallbackProvider } from '../fallback.mjs';

const PRESERVED_ENV_KEYS = [
  'REVIEWER_FALLBACK_MODEL',
  'REVIEWER_MODEL',
  'GEMINI_CODE_REVIEW_API_KEY',
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
  process.env.GEMINI_CODE_REVIEW_API_KEY = 'test-key';
  global.fetch = originalFetch;
});

const transientErr = { kind: 'transient', retryable: true };
const authErr = { kind: 'auth', retryable: false };
const quotaErr = { kind: 'quota', retryable: false };
const rateLimitErr = { kind: 'rate-limit', retryable: true };
const contextErr = { kind: 'context-too-large', retryable: false };

describe('createFallbackProvider', () => {
  it('returns a GeminiProvider for transient gemini errors', async () => {
    const p = await createFallbackProvider(transientErr, 'gemini');
    assert.ok(p !== null, 'expected a provider');
    assert.strictEqual(p.model, 'gemini-2.5-flash-lite');
  });

  it('uses REVIEWER_FALLBACK_MODEL env var when set', async () => {
    process.env.REVIEWER_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
    const p = await createFallbackProvider(transientErr, 'gemini');
    assert.ok(p !== null);
    assert.strictEqual(p.model, 'gemini-2.5-flash-lite');
  });

  it('returns null for auth errors', async () => {
    const p = await createFallbackProvider(authErr, 'gemini');
    assert.strictEqual(p, null);
  });

  it('returns null for quota errors', async () => {
    const p = await createFallbackProvider(quotaErr, 'gemini');
    assert.strictEqual(p, null);
  });

  it('returns null for rate-limit errors (not a capacity issue a different model fixes)', async () => {
    const p = await createFallbackProvider(rateLimitErr, 'gemini');
    assert.strictEqual(p, null);
  });

  it('returns null for context-too-large errors', async () => {
    const p = await createFallbackProvider(contextErr, 'gemini');
    assert.strictEqual(p, null);
  });

  it('returns null for non-gemini providers', async () => {
    const p = await createFallbackProvider(transientErr, 'anthropic');
    assert.strictEqual(p, null);
  });

  it('returns null when fallback model equals primary model', async () => {
    process.env.REVIEWER_MODEL = 'gemini-2.5-flash';
    process.env.REVIEWER_FALLBACK_MODEL = 'gemini-2.5-flash';
    const p = await createFallbackProvider(transientErr, 'gemini');
    assert.strictEqual(p, null);
  });
});
