/**
 * Unit tests for roster slots validation (LS-6145).
 *
 * Covers `validateRosterSlots` on the `createLeagueAndTeams` mutation
 * resolver: valid per-slot configs pass through with zero-count entries
 * dropped; invalid position types, negative/non-integer counts, or counts
 * exceeding the sport's max roster size are rejected.
 */

import { GraphQLError } from 'graphql';
import { validateRosterSlots } from './mutations';

const MAX_COUNT = 25; // football's ROSTER_RANGE_BY_SPORT.max, used as a stand-in bound

describe('validateRosterSlots (LS-6145)', () => {
  it('returns undefined for null (caller falls back to sport default)', () => {
    expect(validateRosterSlots(null, MAX_COUNT)).toBeUndefined();
  });

  it('returns undefined for undefined (caller falls back to sport default)', () => {
    expect(validateRosterSlots(undefined, MAX_COUNT)).toBeUndefined();
  });

  it('returns an empty array unchanged', () => {
    expect(validateRosterSlots([], MAX_COUNT)).toEqual([]);
  });

  it('passes through a valid football roster config', () => {
    const input = [
      { positionType: 'QB', count: 1 },
      { positionType: 'RB', count: 4 },
      { positionType: 'WR', count: 0 },
      { positionType: 'TE', count: 1 },
      { positionType: 'FLEX', count: 1 },
      { positionType: 'K', count: 1 },
      { positionType: 'DST', count: 1 },
    ];
    expect(validateRosterSlots(input, MAX_COUNT)).toEqual([
      { positionType: 'QB', count: 1 },
      { positionType: 'RB', count: 4 },
      { positionType: 'TE', count: 1 },
      { positionType: 'FLEX', count: 1 },
      { positionType: 'K', count: 1 },
      { positionType: 'DST', count: 1 },
    ]);
  });

  it('drops zero-count entries (e.g. a slot the user decremented to 0)', () => {
    expect(
      validateRosterSlots(
        [
          { positionType: 'QB', count: 1 },
          { positionType: 'WR', count: 0 },
        ],
        MAX_COUNT,
      ),
    ).toEqual([{ positionType: 'QB', count: 1 }]);
  });

  it('passes through IDP position slots', () => {
    const input = [
      { positionType: 'DL', count: 2 },
      { positionType: 'LB', count: 2 },
      { positionType: 'DB', count: 2 },
    ];
    expect(validateRosterSlots(input, MAX_COUNT)).toEqual(input);
  });

  it('rejects the fictional DP (IDP Flex) slot even though the DB enum retains it (LS-8996)', () => {
    expect(() =>
      validateRosterSlots([{ positionType: 'DP', count: 1 }], MAX_COUNT),
    ).toThrow(GraphQLError);
    expect(() =>
      validateRosterSlots([{ positionType: 'DP', count: 1 }], MAX_COUNT),
    ).toThrow('Invalid roster slot position "DP"');
  });

  it('accepts a count exactly at maxCount', () => {
    expect(
      validateRosterSlots(
        [{ positionType: 'RB', count: MAX_COUNT }],
        MAX_COUNT,
      ),
    ).toEqual([{ positionType: 'RB', count: MAX_COUNT }]);
  });

  it('throws for an unrecognized position slot', () => {
    expect(() =>
      validateRosterSlots([{ positionType: 'BN', count: 6 }], MAX_COUNT),
    ).toThrow(GraphQLError);
    expect(() =>
      validateRosterSlots([{ positionType: 'BN', count: 6 }], MAX_COUNT),
    ).toThrow('Invalid roster slot position "BN"');
  });

  it('throws for a garbage position slot', () => {
    expect(() =>
      validateRosterSlots(
        [{ positionType: 'NOT_A_POSITION', count: 1 }],
        MAX_COUNT,
      ),
    ).toThrow(GraphQLError);
  });

  it('throws for a negative count', () => {
    expect(() =>
      validateRosterSlots([{ positionType: 'RB', count: -1 }], MAX_COUNT),
    ).toThrow(GraphQLError);
    expect(() =>
      validateRosterSlots([{ positionType: 'RB', count: -1 }], MAX_COUNT),
    ).toThrow('must be a non-negative integer');
  });

  it('throws for a non-integer count', () => {
    expect(() =>
      validateRosterSlots([{ positionType: 'RB', count: 1.5 }], MAX_COUNT),
    ).toThrow(GraphQLError);
  });

  it('throws for a count exceeding maxCount (guards against absurd client-supplied values)', () => {
    expect(() =>
      validateRosterSlots(
        [{ positionType: 'RB', count: 999_999_999 }],
        MAX_COUNT,
      ),
    ).toThrow(GraphQLError);
    expect(() =>
      validateRosterSlots(
        [{ positionType: 'RB', count: MAX_COUNT + 1 }],
        MAX_COUNT,
      ),
    ).toThrow(`no greater than ${MAX_COUNT}`);
  });
});
