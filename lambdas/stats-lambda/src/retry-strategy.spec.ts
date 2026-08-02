import { isRateLimitError, isRetryableError } from './retry-strategy';

describe('isRetryableError', () => {
  it('returns false for non-Error values', () => {
    expect(isRetryableError('boom')).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('treats HTTP 429 and 529 as retryable', () => {
    expect(
      isRetryableError(new Error('Request failed with status code 429')),
    ).toBe(true);
    expect(
      isRetryableError(new Error('Request failed with status code 529')),
    ).toBe(true);
  });

  it('treats any 5xx server error as retryable, including 500', () => {
    expect(
      isRetryableError(new Error('Request failed with status code 500')),
    ).toBe(true);
    expect(
      isRetryableError(new Error('Request failed with status code 502')),
    ).toBe(true);
    expect(
      isRetryableError(new Error('Request failed with status code 503')),
    ).toBe(true);
    expect(
      isRetryableError(new Error('Request failed with status code 504')),
    ).toBe(true);
    expect(
      isRetryableError(new Error('Request failed with status code 524')),
    ).toBe(true);
  });

  it('treats generic timeout messages as retryable', () => {
    expect(isRetryableError(new Error('request timeout'))).toBe(true);
    expect(isRetryableError(new Error('request timed out'))).toBe(true);
  });

  it('does not treat other 4xx errors as retryable', () => {
    expect(
      isRetryableError(new Error('Request failed with status code 400')),
    ).toBe(false);
    expect(
      isRetryableError(new Error('Request failed with status code 404')),
    ).toBe(false);
  });
});

describe('isRateLimitError', () => {
  it('is true only for 429/529, not other 5xx errors', () => {
    expect(
      isRateLimitError(new Error('Request failed with status code 429')),
    ).toBe(true);
    expect(
      isRateLimitError(new Error('Request failed with status code 529')),
    ).toBe(true);
    expect(
      isRateLimitError(new Error('Request failed with status code 500')),
    ).toBe(false);
  });
});
