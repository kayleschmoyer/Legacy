import { CLIENT_FACING_CODES } from './graphql-error-codes';

describe('CLIENT_FACING_CODES', () => {
  it.each([
    'GRAPHQL_VALIDATION_FAILED',
    'GRAPHQL_PARSE_FAILED',
    'BAD_USER_INPUT',
    'BAD_REQUEST',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'PREMIUM_REQUIRED',
    'GAME_UNAVAILABLE',
    'PERSISTED_QUERY_NOT_FOUND',
    'PERSISTED_QUERY_NOT_SUPPORTED',
  ])('classifies %s as client-facing', (code) => {
    expect(CLIENT_FACING_CODES.has(code)).toBe(true);
  });

  it('does not classify INTERNAL_SERVER_ERROR as client-facing', () => {
    expect(CLIENT_FACING_CODES.has('INTERNAL_SERVER_ERROR')).toBe(false);
  });
});
