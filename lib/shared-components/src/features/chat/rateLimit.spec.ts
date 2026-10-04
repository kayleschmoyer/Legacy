import { CombinedGraphQLErrors } from '@apollo/client';

import { isRateLimitedError } from './rateLimit';

function graphQLError(code: string): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Too many attempts. Please try again later.',
        extensions: { code },
      },
    ],
  });
}

describe('isRateLimitedError (LS-10468)', () => {
  it('returns true for a RATE_LIMITED GraphQL error', () => {
    expect(isRateLimitedError(graphQLError('RATE_LIMITED'))).toBe(true);
  });

  it('returns false for any other GraphQL error code', () => {
    expect(isRateLimitedError(graphQLError('INTERNAL_SERVER_ERROR'))).toBe(
      false,
    );
  });

  it('returns false for a non-GraphQL error', () => {
    expect(isRateLimitedError(new Error('Failed to fetch'))).toBe(false);
  });
});
