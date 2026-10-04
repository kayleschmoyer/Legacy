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
    'DRAFT_START_FAILED',
    'SCOREBOARD_FETCH_FAILED',
    'POSITION_INELIGIBLE',
    'ROSTER_OVER_LIMIT',
    'RATE_LIMITED',
  ])('classifies %s as client-facing', (code) => {
    expect(CLIENT_FACING_CODES.has(code)).toBe(true);
  });

  it('does not classify INTERNAL_SERVER_ERROR as client-facing', () => {
    expect(CLIENT_FACING_CODES.has('INTERNAL_SERVER_ERROR')).toBe(false);
  });
});
