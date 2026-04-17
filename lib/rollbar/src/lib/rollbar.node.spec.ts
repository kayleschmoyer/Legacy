/**
 * Tests for the Node Rollbar implementation's init paths and env config.
 * Focus: the access-token / secret-name / neither branching added in LS-2790.
 */

const rollbarInstanceMock = {
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

const RollbarCtorMock = jest.fn(() => rollbarInstanceMock);

jest.mock('rollbar', () => RollbarCtorMock);

const retrieveSecretParameterValueMock = jest.fn();
jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: retrieveSecretParameterValueMock,
}));

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  debug: jest.fn(),
  addDestination: jest.fn(),
  removeDestination: jest.fn(),
};
jest.mock('@legacy-sports/logging', () => ({ LOGGER: loggerMock }));

import { rollbar } from './rollbar.node';

// Typed view of the singleton's private state for test-only reset.
type RollbarPrivateState = {
  rollbar: unknown;
  breadcrumbs: unknown[];
  rollbarDestination: unknown;
};
const rollbarPrivate = rollbar as unknown as RollbarPrivateState;

describe('NodeRollbarImplementation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rollbarPrivate.rollbar = null;
    rollbarPrivate.breadcrumbs = [];
    rollbarPrivate.rollbarDestination = null;
  });

  describe('init', () => {
    it('initializes synchronously when accessToken is provided', () => {
      rollbar.init({
        accessToken: 'direct-token-value',
        environment: 'test',
      });

      expect(RollbarCtorMock).toHaveBeenCalledTimes(1);
      expect(RollbarCtorMock).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'direct-token-value' }),
      );
      expect(retrieveSecretParameterValueMock).not.toHaveBeenCalled();
    });

    it('fetches from Secrets Manager when only accessTokenSecretName is provided', async () => {
      retrieveSecretParameterValueMock.mockResolvedValueOnce(
        'fetched-token-value',
      );

      rollbar.init({
        accessToken: '',
        accessTokenSecretName: 'dev/rollbar-access-token',
        environment: 'test',
      });

      // init returns synchronously; the fetch happens in a fire-and-forget promise.
      // Flush microtasks so the async init completes before assertions.
      await new Promise((resolve) => setImmediate(resolve));

      expect(retrieveSecretParameterValueMock).toHaveBeenCalledWith(
        'dev/rollbar-access-token',
      );
      expect(RollbarCtorMock).toHaveBeenCalledTimes(1);
      expect(RollbarCtorMock).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'fetched-token-value' }),
      );
    });

    it('logs and does not initialize when Secrets Manager fetch fails', async () => {
      const fetchError = new Error('SecretsManagerAccessDenied');
      retrieveSecretParameterValueMock.mockRejectedValueOnce(fetchError);

      rollbar.init({
        accessToken: '',
        accessTokenSecretName: 'dev/rollbar-access-token',
        environment: 'test',
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(RollbarCtorMock).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalledWith(
        'Failed to fetch Rollbar access token from Secrets Manager',
        fetchError,
        { secretName: 'dev/rollbar-access-token' },
      );
    });

    it('warns and does nothing when neither accessToken nor accessTokenSecretName is set', () => {
      rollbar.init({ accessToken: '', environment: 'test' });

      expect(RollbarCtorMock).not.toHaveBeenCalled();
      expect(retrieveSecretParameterValueMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Rollbar not initialized: no access token or secret name provided',
      );
    });
  });

  describe('getRollbarConfigFromEnv', () => {
    const originalEnv = process.env;
    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env['ROLLBAR_ACCESS_TOKEN'];
      delete process.env['ROLLBAR_ACCESS_TOKEN_SECRET_NAME'];
      delete process.env['ROLLBAR_ENVIRONMENT'];
      delete process.env['NODE_ENV'];
      delete process.env['ROLLBAR_RELEASE'];
      delete process.env['APP_VERSION'];
      delete process.env['COMMIT_SHA'];
      delete process.env['ROLLBAR_VERBOSE'];
    });
    afterAll(() => {
      process.env = originalEnv;
    });

    it('returns config with accessToken when ROLLBAR_ACCESS_TOKEN is set', () => {
      process.env['ROLLBAR_ACCESS_TOKEN'] = 'env-token';
      process.env['ROLLBAR_ENVIRONMENT'] = 'staging';

      const config = rollbar.getRollbarConfigFromEnv();

      expect(config).not.toBeNull();
      expect(config?.accessToken).toBe('env-token');
      expect(config?.accessTokenSecretName).toBeUndefined();
      expect(config?.environment).toBe('staging');
    });

    it('returns config with accessTokenSecretName when only ROLLBAR_ACCESS_TOKEN_SECRET_NAME is set', () => {
      process.env['ROLLBAR_ACCESS_TOKEN_SECRET_NAME'] =
        'prod/rollbar-access-token';
      process.env['ROLLBAR_ENVIRONMENT'] = 'prod';

      const config = rollbar.getRollbarConfigFromEnv();

      expect(config).not.toBeNull();
      expect(config?.accessToken).toBe('');
      expect(config?.accessTokenSecretName).toBe('prod/rollbar-access-token');
      expect(config?.environment).toBe('prod');
    });

    it('returns null and warns when neither token env var is set', () => {
      const config = rollbar.getRollbarConfigFromEnv();

      expect(config).toBeNull();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Neither ROLLBAR_ACCESS_TOKEN nor ROLLBAR_ACCESS_TOKEN_SECRET_NAME set, Rollbar will not be initialized',
      );
    });
  });
});
