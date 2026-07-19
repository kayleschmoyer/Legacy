import { GraphQLError } from 'graphql';
import { MatchupLockedError } from './graphql-errors';

describe('MatchupLockedError', () => {
  it('returns a GraphQLError with code MATCHUP_LOCKED and the given status in extensions', () => {
    const error = MatchupLockedError('in_progress');

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.extensions).toMatchObject({
      code: 'MATCHUP_LOCKED',
      status: 'in_progress',
    });
  });

  it('includes the status in the default message so different lock reasons are distinguishable', () => {
    expect(MatchupLockedError('completed').message).toContain('completed');
    expect(MatchupLockedError('cancelled').message).toContain('cancelled');
    expect(MatchupLockedError('in_progress').message).not.toBe(
      MatchupLockedError('completed').message,
    );
  });

  it('allows overriding the message while keeping the status extension', () => {
    const error = MatchupLockedError('cancelled', 'custom message');

    expect(error.message).toBe('custom message');
    expect(error.extensions).toMatchObject({
      code: 'MATCHUP_LOCKED',
      status: 'cancelled',
    });
  });
});
