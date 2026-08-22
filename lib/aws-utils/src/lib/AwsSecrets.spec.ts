const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  // The client is constructed at AwsSecrets module scope, which runs before
  // this file's `const` bindings initialize — so `send` has to reach mockSend
  // lazily, at call time, rather than capturing it in the factory.
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: (...args: unknown[]) =>
      mockSend(...args) as Promise<{ SecretString?: string }>,
  })),
  GetSecretValueCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

import {
  invalidateSecretCache,
  prefetchSecret,
  retrieveSecretParameterValue,
} from './AwsSecrets';

describe('retrieveSecretParameterValue — module-scope caching (LS-9530)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateSecretCache();
    delete process.env.SECRET_CACHE_TTL_MS;
    mockSend.mockResolvedValue({ SecretString: 'shhh' });
  });

  afterEach(() => {
    delete process.env.SECRET_CACHE_TTL_MS;
  });

  it('reads Secrets Manager once and serves later reads from cache', async () => {
    await expect(retrieveSecretParameterValue('db-creds')).resolves.toBe(
      'shhh',
    );
    await expect(retrieveSecretParameterValue('db-creds')).resolves.toBe(
      'shhh',
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight read between concurrent callers', async () => {
    const [a, b] = await Promise.all([
      retrieveSecretParameterValue('jwt'),
      retrieveSecretParameterValue('jwt'),
    ]);

    expect(a).toBe('shhh');
    expect(b).toBe('shhh');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('caches per secret name', async () => {
    await retrieveSecretParameterValue('jwt');
    await retrieveSecretParameterValue('cookie');

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('re-reads once the TTL has elapsed so rotation is picked up', async () => {
    process.env.SECRET_CACHE_TTL_MS = '50';
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await retrieveSecretParameterValue('rotating');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Still inside the TTL.
    nowSpy.mockReturnValue(1_040);
    await retrieveSecretParameterValue('rotating');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // TTL elapsed — the rotated value must be fetched.
    mockSend.mockResolvedValue({ SecretString: 'rotated' });
    nowSpy.mockReturnValue(1_100);
    await expect(retrieveSecretParameterValue('rotating')).resolves.toBe(
      'rotated',
    );
    expect(mockSend).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it('bypasses the cache entirely when the TTL is 0', async () => {
    process.env.SECRET_CACHE_TTL_MS = '0';

    await retrieveSecretParameterValue('jwt');
    await retrieveSecretParameterValue('jwt');

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed read', async () => {
    mockSend.mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(retrieveSecretParameterValue('jwt')).rejects.toThrow(
      'AccessDenied',
    );

    mockSend.mockResolvedValue({ SecretString: 'shhh' });
    await expect(retrieveSecretParameterValue('jwt')).resolves.toBe('shhh');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('throws when the secret has no SecretString', async () => {
    mockSend.mockResolvedValue({});

    await expect(retrieveSecretParameterValue('empty')).rejects.toThrow(
      'empty is undefined!',
    );
  });

  it('invalidateSecretCache evicts a single name', async () => {
    await retrieveSecretParameterValue('jwt');
    await retrieveSecretParameterValue('cookie');
    expect(mockSend).toHaveBeenCalledTimes(2);

    invalidateSecretCache('jwt');

    await retrieveSecretParameterValue('cookie');
    expect(mockSend).toHaveBeenCalledTimes(2);

    await retrieveSecretParameterValue('jwt');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('invalidateSecretCache with no argument clears everything', async () => {
    await retrieveSecretParameterValue('jwt');
    await retrieveSecretParameterValue('cookie');
    expect(mockSend).toHaveBeenCalledTimes(2);

    invalidateSecretCache();

    await retrieveSecretParameterValue('jwt');
    await retrieveSecretParameterValue('cookie');
    expect(mockSend).toHaveBeenCalledTimes(4);
  });
});

describe('prefetchSecret (LS-9530)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateSecretCache();
    mockSend.mockResolvedValue({ SecretString: 'shhh' });
  });

  it('warms the cache so a later read costs no round trip', async () => {
    prefetchSecret('jwt');
    await expect(retrieveSecretParameterValue('jwt')).resolves.toBe('shhh');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('swallows failures rather than rejecting', async () => {
    mockSend.mockRejectedValue(new Error('boom'));

    expect(() => prefetchSecret('jwt')).not.toThrow();
    await Promise.resolve();
  });
});
