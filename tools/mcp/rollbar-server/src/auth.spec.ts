import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  ROLLBAR_READ_TOKEN_ENV,
  ROLLBAR_READ_TOKEN_SECRET_NAME_ENV,
  _resetRollbarTokenCacheForTests,
  getRollbarToken,
  tryGetRollbarToken,
} from './auth';

describe('auth', () => {
  const originalEnv = process.env[ROLLBAR_READ_TOKEN_ENV];
  const originalSecretName = process.env[ROLLBAR_READ_TOKEN_SECRET_NAME_ENV];
  const sendSpy = jest.spyOn(SecretsManagerClient.prototype, 'send');

  function restore(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  beforeEach(() => {
    _resetRollbarTokenCacheForTests();
    delete process.env[ROLLBAR_READ_TOKEN_ENV];
    delete process.env[ROLLBAR_READ_TOKEN_SECRET_NAME_ENV];
    sendSpy.mockReset();
  });

  afterAll(() => {
    restore(ROLLBAR_READ_TOKEN_ENV, originalEnv);
    restore(ROLLBAR_READ_TOKEN_SECRET_NAME_ENV, originalSecretName);
    sendSpy.mockRestore();
  });

  it('getRollbarToken returns the env var token when set', async () => {
    process.env[ROLLBAR_READ_TOKEN_ENV] = 'env-token';
    await expect(getRollbarToken()).resolves.toBe('env-token');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('getRollbarToken fetches from Secrets Manager when only the secret name is set', async () => {
    process.env[ROLLBAR_READ_TOKEN_SECRET_NAME_ENV] = 'dev/rollbar-read-token';
    sendSpy.mockResolvedValue({ SecretString: 'sm-token  ' } as never);

    await expect(getRollbarToken()).resolves.toBe('sm-token');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0][0];
    expect(call).toBeInstanceOf(GetSecretValueCommand);
    expect((call as GetSecretValueCommand).input.SecretId).toBe(
      'dev/rollbar-read-token',
    );
  });

  it('getRollbarToken caches the resolved token across calls', async () => {
    process.env[ROLLBAR_READ_TOKEN_SECRET_NAME_ENV] = 'dev/rollbar-read-token';
    sendSpy.mockResolvedValue({ SecretString: 'sm-token' } as never);

    await getRollbarToken();
    await getRollbarToken();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('getRollbarToken throws an actionable error when neither source is configured', async () => {
    await expect(getRollbarToken()).rejects.toThrow(
      /ROLLBAR_READ_ACCESS_TOKEN/,
    );
    await expect(getRollbarToken()).rejects.toThrow(
      /ROLLBAR_READ_TOKEN_SECRET_NAME/,
    );
  });

  it('getRollbarToken rejects when Secrets Manager returns an empty SecretString', async () => {
    process.env[ROLLBAR_READ_TOKEN_SECRET_NAME_ENV] = 'dev/rollbar-read-token';
    sendSpy.mockResolvedValue({ SecretString: '   ' } as never);

    await expect(getRollbarToken()).rejects.toThrow(/empty SecretString/);
  });

  it('tryGetRollbarToken returns null when unset and the token when set', async () => {
    await expect(tryGetRollbarToken()).resolves.toBeNull();

    _resetRollbarTokenCacheForTests();
    process.env[ROLLBAR_READ_TOKEN_ENV] = 'tok';
    await expect(tryGetRollbarToken()).resolves.toBe('tok');
  });

  it('tryGetRollbarToken treats an empty env var as unconfigured', async () => {
    process.env[ROLLBAR_READ_TOKEN_ENV] = '';
    await expect(tryGetRollbarToken()).resolves.toBeNull();
  });
});
