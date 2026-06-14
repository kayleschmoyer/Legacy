/**
 * Unit tests for pick-time-limit validation (LS-7966).
 *
 * Covers the boundary conditions for `pickTimeLimitSeconds` on the
 * `createLeagueAndTeams` mutation resolver: values below 30 or above
 * 172800 must be rejected; null/undefined and valid values must pass
 * through silently.
 */

import { GraphQLError } from 'graphql';
import { validatePickTimeLimitSeconds } from './mutations';

describe('validatePickTimeLimitSeconds (LS-7966)', () => {
  it('passes for null (DB default applies)', () => {
    expect(() => validatePickTimeLimitSeconds(null)).not.toThrow();
  });

  it('passes for undefined (DB default applies)', () => {
    expect(() => validatePickTimeLimitSeconds(undefined)).not.toThrow();
  });

  it('passes for the minimum valid value (30 s)', () => {
    expect(() => validatePickTimeLimitSeconds(30)).not.toThrow();
  });

  it('passes for the default value (120 s)', () => {
    expect(() => validatePickTimeLimitSeconds(120)).not.toThrow();
  });

  it('passes for the maximum valid value (172800 s / 48 h)', () => {
    expect(() => validatePickTimeLimitSeconds(172800)).not.toThrow();
  });

  it('throws for a value below the minimum (29 s)', () => {
    expect(() => validatePickTimeLimitSeconds(29)).toThrow(GraphQLError);
    expect(() => validatePickTimeLimitSeconds(29)).toThrow(
      'Pick time limit must be between 30 and 172800 seconds',
    );
  });

  it('throws for zero', () => {
    expect(() => validatePickTimeLimitSeconds(0)).toThrow(GraphQLError);
  });

  it('throws for a value above the maximum (172801 s)', () => {
    expect(() => validatePickTimeLimitSeconds(172801)).toThrow(GraphQLError);
    expect(() => validatePickTimeLimitSeconds(172801)).toThrow(
      'Pick time limit must be between 30 and 172800 seconds',
    );
  });
});
