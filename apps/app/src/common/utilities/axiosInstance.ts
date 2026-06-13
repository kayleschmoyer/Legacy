import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/native';

export const axiosInstance = axios.create({
  timeout: 15000,
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      // Scrub the URL from config up front so query-param credentials (tokens,
      // API keys) are never passed to LOGGER or Rollbar — the AxiosError object
      // itself carries error.config.url regardless of the context we pass.
      // Applies to every branch below (network, 4xx, 5xx).
      if (error.config) error.config.url = undefined;
      if (!error.response) {
        // Network errors (no connectivity, timeout, CORS) are expected transient
        // failures — log at warn level without capturing to Rollbar.
        LOGGER.warn('axiosInstance: network error', error, {
          code: error.code,
        });
      } else {
        const status = error.response.status;
        LOGGER.error('axiosInstance: request failed', error, { status });
        // Capture server errors (5xx) to Rollbar; 4xx are expected client errors
        // (auth failures, validation) that do not need Rollbar noise.
        if (status >= 500) {
          captureError(error, { context: 'axiosInstance' });
        }
      }
      // AxiosError extends Error — satisfies @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject(error);
    }
    const errorObj = error instanceof Error ? error : new Error(String(error));
    LOGGER.error('axiosInstance: unexpected error', errorObj);
    captureError(errorObj, { context: 'axiosInstance' });
    return Promise.reject(errorObj);
  },
);
