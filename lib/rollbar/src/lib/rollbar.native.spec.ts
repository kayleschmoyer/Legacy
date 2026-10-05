/**
 * Tests for the React Native Rollbar implementation's client-side
 * de-duplication, added for LS-8764 (this platform had none, unlike Node's
 * LS-8343 protection, and could freely exhaust Rollbar's `maxItems` budget).
 */

const rollbarInstanceMock = {
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

const RollbarCtorMock = jest.fn(() => rollbarInstanceMock);

jest.mock('rollbar', () => RollbarCtorMock);

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

import { rewriteHermesFrameFilenames, rollbar } from './rollbar.native';

describe('ReactNativeRollbarImplementation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('captureError de-duplication (LS-8764)', () => {
    let nowSpy: jest.SpyInstance<number, []>;
    let currentNow: number;

    beforeEach(() => {
      currentNow = 1_000_000;
      nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentNow);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('reports the first occurrence but suppresses identical items within the window', () => {
      rollbar.init({ accessToken: 'direct-token-value', environment: 'test' });

      const makeErr = () =>
        new Error('Max reconnection attempts reached — giving up');
      rollbar.captureError(makeErr());
      rollbar.captureError(makeErr());
      rollbar.captureError(makeErr());

      expect(rollbarInstanceMock.error).toHaveBeenCalledTimes(1);
    });

    it('reports again once the window elapses and attaches the suppressed count', () => {
      rollbar.init({
        accessToken: 'direct-token-value',
        environment: 'test',
        dedupeWindowMs: 60_000,
      });

      const makeErr = () => new Error('flood');
      rollbar.captureError(makeErr()); // reported
      rollbar.captureError(makeErr()); // suppressed
      rollbar.captureError(makeErr()); // suppressed

      currentNow += 60_000; // advance past the window

      rollbar.captureError(makeErr()); // reported again, with suppressed count

      expect(rollbarInstanceMock.error).toHaveBeenCalledTimes(2);
      const secondCallPayload = (
        rollbarInstanceMock.error.mock.calls as unknown[][]
      )[1][1] as { suppressedSinceLastReport?: number };
      expect(secondCallPayload.suppressedSinceLastReport).toBe(2);
    });

    it('reports distinct fingerprints independently', () => {
      rollbar.init({ accessToken: 'direct-token-value', environment: 'test' });

      rollbar.captureError(new Error('alpha'));
      rollbar.captureError(new Error('beta'));
      // Same message, different severity is a distinct fingerprint.
      rollbar.captureError(new Error('alpha'), undefined, 'warning');

      expect(rollbarInstanceMock.error).toHaveBeenCalledTimes(2);
      expect(rollbarInstanceMock.warning).toHaveBeenCalledTimes(1);
    });

    it('sends every item when de-duplication is disabled (dedupeWindowMs: 0)', () => {
      rollbar.init({
        accessToken: 'direct-token-value',
        environment: 'test',
        dedupeWindowMs: 0,
      });

      rollbar.captureError(new Error('same'));
      rollbar.captureError(new Error('same'));
      rollbar.captureError(new Error('same'));

      expect(rollbarInstanceMock.error).toHaveBeenCalledTimes(3);
    });
  });
  describe('release tagging and sourcemaps (LS-9249)', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('prefers the commit SHA over the shared package version', () => {
      process.env = {
        ...originalEnv,
        EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN: 'token',
        EXPO_PUBLIC_APP_VERSION: '0.0.1',
        EXPO_PUBLIC_COMMIT_SHA: 'abc1234',
      };
      expect(rollbar.getRollbarConfigFromEnv()?.release).toBe('abc1234');
    });

    it('falls back to the package version without a commit SHA', () => {
      process.env = {
        ...originalEnv,
        EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN: 'token',
        EXPO_PUBLIC_APP_VERSION: '0.0.1',
        EXPO_PUBLIC_COMMIT_SHA: '',
      };
      expect(rollbar.getRollbarConfigFromEnv()?.release).toBe('0.0.1');
    });

    it('enables sourcemaps keyed to the release', () => {
      rollbar.init({
        accessToken: 'token',
        environment: 'test',
        release: 'abc1234',
      });
      const calls = RollbarCtorMock.mock.calls as unknown as [
        { payload: unknown },
      ][];
      const [options] = calls[calls.length - 1];
      expect(options.payload).toMatchObject({
        code_version: 'abc1234',
        client: {
          javascript: { source_map_enabled: true, code_version: 'abc1234' },
        },
      });
    });

    it('rewrites Hermes frame filenames to the uploaded minified_url', () => {
      const payload = {
        body: {
          trace: {
            frames: [
              { filename: 'address at index.android.bundle' },
              { filename: 'node_modules/foo.js' },
            ],
          },
          trace_chain: [{ frames: [{ filename: 'address at main.jsbundle' }] }],
        },
      };
      rewriteHermesFrameFilenames(payload);
      expect(payload.body.trace.frames.map((f) => f.filename)).toEqual([
        'app://android/index.android.bundle',
        'node_modules/foo.js',
      ]);
      expect(payload.body.trace_chain[0].frames[0].filename).toBe(
        'app://ios/main.jsbundle',
      );
    });
  });
});
