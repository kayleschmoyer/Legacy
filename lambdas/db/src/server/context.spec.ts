/**
 * LS-4392 — getJwtSecret()/getSystemApiKey() must retry after a rejected
 * Secrets Manager call instead of caching the rejection for the rest of the
 * Lambda container's lifetime.
 *
 * Root cause: a transient Secrets Manager throttle/timeout during cold start
 * rejected the memoized promise, and every subsequent request in that warm
 * container reused the same rejected promise — silently producing
 * `context.user = null` (indistinguishable from a bad JWT) until the
 * container recycled. `getDb()` in lib/db-client already guards against this
 * exact failure mode (PR #3845 / LS-4402); this test locks in the same fix
 * applied here to the JWT secret and system API key promise caches.
 */

const mockRetrieveSecretParameterValue = jest.fn();

jest.doMock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: mockRetrieveSecretParameterValue,
}));

describe('getJwtSecret', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockRetrieveSecretParameterValue.mockReset();
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: '',
      JWT_SECRET_NAME: 'test/jwt-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('retries Secrets Manager after a transient rejection instead of caching the failure', async () => {
    mockRetrieveSecretParameterValue
      .mockRejectedValueOnce(new Error('ThrottlingException'))
      .mockResolvedValueOnce('real-jwt-secret');

    const { getJwtSecret } = await import('./context');

    await expect(getJwtSecret()).rejects.toThrow('ThrottlingException');

    // A second call on the same warm container must retry, not reuse the
    // permanently-rejected cached promise.
    await expect(getJwtSecret()).resolves.toBe('real-jwt-secret');
    expect(mockRetrieveSecretParameterValue).toHaveBeenCalledTimes(2);
  });

  it('caches a successful resolution across calls (no redundant Secrets Manager calls)', async () => {
    mockRetrieveSecretParameterValue.mockResolvedValueOnce('real-jwt-secret');

    const { getJwtSecret } = await import('./context');

    await expect(getJwtSecret()).resolves.toBe('real-jwt-secret');
    await expect(getJwtSecret()).resolves.toBe('real-jwt-secret');
    expect(mockRetrieveSecretParameterValue).toHaveBeenCalledTimes(1);
  });
});

describe('getSystemApiKey', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockRetrieveSecretParameterValue.mockReset();
    process.env = {
      ...ORIGINAL_ENV,
      SYSTEM_API_KEY: '',
      SYSTEM_API_KEY_SECRET_NAME: 'test/system-api-key',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('retries Secrets Manager after a transient rejection instead of caching the failure', async () => {
    mockRetrieveSecretParameterValue
      .mockRejectedValueOnce(new Error('ThrottlingException'))
      .mockResolvedValueOnce('real-system-api-key');

    const { getSystemApiKey } = await import('./context');

    await expect(getSystemApiKey()).rejects.toThrow('ThrottlingException');
    await expect(getSystemApiKey()).resolves.toBe('real-system-api-key');
    expect(mockRetrieveSecretParameterValue).toHaveBeenCalledTimes(2);
  });
});

export {};
