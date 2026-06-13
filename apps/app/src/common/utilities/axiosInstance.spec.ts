import axios, { AxiosError, AxiosHeaders } from 'axios';
import { axiosInstance } from './axiosInstance';

// Declare standalone jest.fn() variables before jest.mock() factories.
// The factory closures capture these by reference, so they are properly
// initialized as jest.Mock instances by the time any test runs.
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockCaptureError = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    warn: (...args: unknown[]): unknown => mockLoggerWarn(...args),
    error: (...args: unknown[]): unknown => mockLoggerError(...args),
  },
}));

jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: (...args: unknown[]): unknown => mockCaptureError(...args),
}));

// Access the registered error handler without going through a real HTTP call.
type ResponseInterceptorManager = {
  handlers: Array<{
    fulfilled: ((r: unknown) => unknown) | null;
    rejected: ((e: unknown) => unknown) | null;
  }>;
};

function getErrorHandler(): (error: unknown) => unknown {
  const manager = axiosInstance.interceptors
    .response as unknown as ResponseInterceptorManager;
  const handler = manager.handlers[0];
  if (!handler?.rejected)
    throw new Error('No response error handler registered');
  return handler.rejected;
}

// A URL carrying a credential in its query string — used to prove the
// interceptor scrubs config.url before anything reaches LOGGER or Rollbar.
const URL_WITH_CREDENTIAL = 'https://api.example.com/users?token=secret123';

function makeAxiosError(status?: number): AxiosError {
  const config = {
    headers: new AxiosHeaders(),
    url: URL_WITH_CREDENTIAL,
  };
  const err = new AxiosError(
    'request failed',
    status ? 'ERR_BAD_REQUEST' : 'ERR_NETWORK',
    config,
  );
  if (status) {
    err.response = {
      status,
      data: null,
      headers: {},
      config,
      statusText: String(status),
    };
  }
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('axiosInstance response interceptor', () => {
  it('rejects with the original AxiosError', async () => {
    const err = makeAxiosError(404);
    await expect(getErrorHandler()(err)).rejects.toBe(err);
  });

  describe('network errors (no response)', () => {
    it('logs at warn level with the error instance and code context', async () => {
      const err = makeAxiosError();
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'axiosInstance: network error',
        err,
        expect.objectContaining({ code: err.code }),
      );
    });

    it('does not include url in warn context (credential safety)', async () => {
      const err = makeAxiosError();
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      const firstCall = mockLoggerWarn.mock.calls[0] as unknown[] | undefined;
      const warnContext = firstCall?.[2] as Record<string, unknown> | undefined;
      expect(warnContext).not.toHaveProperty('url');
    });

    it('does not capture to Rollbar', async () => {
      await expect(getErrorHandler()(makeAxiosError())).rejects.toBeDefined();
      expect(mockCaptureError).not.toHaveBeenCalled();
    });

    it('does not call LOGGER.error', async () => {
      await expect(getErrorHandler()(makeAxiosError())).rejects.toBeDefined();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });

  describe('4xx HTTP errors', () => {
    it('logs the original AxiosError at error level with status context', async () => {
      const err = makeAxiosError(401);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(mockLoggerError).toHaveBeenCalledWith(
        'axiosInstance: request failed',
        err,
        expect.objectContaining({ status: 401 }),
      );
    });

    it('does not capture to Rollbar', async () => {
      await expect(
        getErrorHandler()(makeAxiosError(400)),
      ).rejects.toBeDefined();
      expect(mockCaptureError).not.toHaveBeenCalled();
    });
  });

  describe('5xx HTTP errors', () => {
    it('logs the original AxiosError at error level with status context', async () => {
      const err = makeAxiosError(500);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(mockLoggerError).toHaveBeenCalledWith(
        'axiosInstance: request failed',
        err,
        expect.objectContaining({ status: 500 }),
      );
    });

    it('captures to Rollbar', async () => {
      const err = makeAxiosError(503);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(mockCaptureError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ context: 'axiosInstance' }),
      );
    });
  });

  describe('unexpected non-Axios errors', () => {
    it('logs an Error instance at error level', async () => {
      const err = new Error('unexpected');
      await expect(getErrorHandler()(err)).rejects.toBe(err);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'axiosInstance: unexpected error',
        err,
      );
    });

    it('captures an Error instance to Rollbar', async () => {
      const err = new Error('unexpected');
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(mockCaptureError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ context: 'axiosInstance' }),
      );
    });

    it('wraps a non-Error value in an Error before logging and capturing', async () => {
      const raw = 'something went wrong';
      await expect(getErrorHandler()(raw)).rejects.toBeInstanceOf(Error);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'axiosInstance: unexpected error',
        expect.any(Error),
      );
      expect(mockCaptureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ context: 'axiosInstance' }),
      );
    });

    it('does not call LOGGER.warn for unexpected errors', async () => {
      await expect(getErrorHandler()(new Error('x'))).rejects.toBeDefined();
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('credential scrubbing (config.url)', () => {
    it('scrubs the url before logging a network error', async () => {
      const err = makeAxiosError();
      expect(err.config?.url).toBe(URL_WITH_CREDENTIAL);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      // The error passed to LOGGER.warn must already have a scrubbed url.
      expect(err.config?.url).toBeUndefined();
      const warnCall = mockLoggerWarn.mock.calls[0] as unknown[] | undefined;
      const loggedErr = warnCall?.[1] as AxiosError | undefined;
      expect(loggedErr?.config?.url).toBeUndefined();
    });

    it('scrubs the url before logging a 4xx error', async () => {
      const err = makeAxiosError(401);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(err.config?.url).toBeUndefined();
      const errorCall = mockLoggerError.mock.calls[0] as unknown[] | undefined;
      const loggedErr = errorCall?.[1] as AxiosError | undefined;
      expect(loggedErr?.config?.url).toBeUndefined();
    });

    it('scrubs the url before logging and capturing a 5xx error', async () => {
      const err = makeAxiosError(500);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(err.config?.url).toBeUndefined();
      const capturedCall = mockCaptureError.mock.calls[0] as
        | unknown[]
        | undefined;
      const capturedErr = capturedCall?.[0] as AxiosError | undefined;
      expect(capturedErr?.config?.url).toBeUndefined();
    });
  });

  describe('axios.isAxiosError type guard', () => {
    it('routes an AxiosError without response as a network error (no LOGGER.error)', async () => {
      const err = makeAxiosError();
      expect(axios.isAxiosError(err)).toBe(true);
      await expect(getErrorHandler()(err)).rejects.toBeDefined();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });
});
