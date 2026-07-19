/**
 * Tests for the Web Rollbar implementation's checkIgnore noise filters.
 * Focus: the "Failed to fetch dynamically imported module" filter added for
 * LS-8472, verified alongside the existing filters it sits next to.
 */

const rollbarInstanceMock = {
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

const RollbarCtorMock = jest.fn(() => rollbarInstanceMock);

jest.mock('rollbar', () => RollbarCtorMock);

jest.mock('@legacy-sports/app-config/web', () => ({
  config: {
    rollbarToken: 'test-token',
    commitSha: 'abc123',
    appVersion: '1.0.0',
    rollbarCaptureRate: undefined,
  },
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

import { rollbar } from './rollbar.web';

describe('WebRollbarImplementation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkIgnore', () => {
    type CheckIgnore = (isUncaught: boolean, args: unknown[]) => boolean;

    function getCheckIgnore(): CheckIgnore {
      rollbar.init({ accessToken: 'direct-token-value', environment: 'test' });
      const calls = RollbarCtorMock.mock.calls as unknown[][];
      const ctorArg = calls[calls.length - 1][0] as {
        checkIgnore?: CheckIgnore;
      };
      expect(typeof ctorArg.checkIgnore).toBe('function');
      return ctorArg.checkIgnore as CheckIgnore;
    }

    it('drops stale-chunk dynamic import failures (LS-8472)', () => {
      const checkIgnore = getCheckIgnore();

      const chunkLoadError = new Error(
        'Failed to fetch dynamically imported module: https://legacy-fantasy.com/assets/LeagueCreatePage-BslVpGfN.js',
      );
      expect(checkIgnore(false, [chunkLoadError])).toBe(true);
    });

    it('still reports unrelated TypeErrors', () => {
      const checkIgnore = getCheckIgnore();

      const realError = new TypeError(
        "Cannot read properties of undefined (reading 'foo')",
      );
      expect(checkIgnore(false, [realError])).toBe(false);
    });

    it('drops AbortError, WebSocket noise, and Failed to fetch (existing filters)', () => {
      const checkIgnore = getCheckIgnore();

      const abortError = Object.assign(
        new Error('The user aborted a request'),
        {
          name: 'AbortError',
        },
      );
      expect(checkIgnore(false, [abortError])).toBe(true);

      expect(checkIgnore(false, [new Error('Failed to fetch')])).toBe(true);
      expect(checkIgnore(false, [new Error('WebSocket error')])).toBe(true);
      expect(checkIgnore(false, [new Error('WebSocket closed')])).toBe(true);
    });
  });
});
