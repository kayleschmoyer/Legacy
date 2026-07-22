import { GraphQLError } from 'graphql';
import { MatchupLockedError, RateLimitedError } from './graphql-errors';

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

describe('RateLimitedError', () => {
  it('returns a GraphQLError with code RATE_LIMITED', () => {
    const error = RateLimitedError();

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.extensions).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('never leaks remaining-attempt counts or reset timing in the default message', () => {
    // BTD-003 / LS-8587: any number or time-based hint here would help an
    // attacker calibrate further probing, defeating the point of the limit.
    const { message } = RateLimitedError();

    expect(message).not.toMatch(/\d/);
  });
});
