/**
 * Unit tests for keeper-designation eligibility helpers (LS-8673).
 *
 * Covers the pure-logic pieces of designateKeeper/undesignateKeeper:
 * - isDraftLive: which league draftStatus values lock designations
 * - isRookiePlayer: the totalGames === 0 rookie-exemption signal
 * - previewKeeperCost: round-penalty fallback + auction-budget null preview
 */

import { isDraftLive, isRookiePlayer, previewKeeperCost } from './helpers';

describe('isDraftLive (LS-8673)', () => {
  it('is not live for not-started', () => {
    expect(isDraftLive('not-started')).toBe(false);
  });

  it('is not live for queued (scheduled but not yet started)', () => {
    expect(isDraftLive('queued')).toBe(false);
  });

  it('is live for in-progress', () => {
    expect(isDraftLive('in-progress')).toBe(true);
  });

  it('is live for paused', () => {
    expect(isDraftLive('paused')).toBe(true);
  });

  it('is live for completed', () => {
    expect(isDraftLive('completed')).toBe(true);
  });

  it('is not live for null/undefined', () => {
    expect(isDraftLive(null)).toBe(false);
    expect(isDraftLive(undefined)).toBe(false);
  });
});

describe('isRookiePlayer (LS-8673)', () => {
  it('is a rookie when totalGames is 0', () => {
    expect(isRookiePlayer(0)).toBe(true);
  });

  it('is a rookie when totalGames is null/undefined', () => {
    expect(isRookiePlayer(null)).toBe(true);
    expect(isRookiePlayer(undefined)).toBe(true);
  });

  it('is not a rookie once totalGames is positive', () => {
    expect(isRookiePlayer(1)).toBe(false);
    expect(isRookiePlayer(500)).toBe(false);
  });
});

describe('previewKeeperCost (LS-8673)', () => {
  it('round-penalty: uses the carried-forward draftRound when present', () => {
    expect(
      previewKeeperCost({
        costModel: 'round-penalty',
        draftRound: 7,
        maxRosterSize: 25,
      }),
    ).toEqual({ previewCostRound: 7, previewCostAmount: null });
  });

  it('round-penalty: falls back to the last round (maxRosterSize) when undrafted', () => {
    expect(
      previewKeeperCost({
        costModel: 'round-penalty',
        draftRound: null,
        maxRosterSize: 25,
      }),
    ).toEqual({ previewCostRound: 25, previewCostAmount: null });
  });

  it('auction-budget: never fabricates a preview amount', () => {
    expect(
      previewKeeperCost({
        costModel: 'auction-budget',
        draftRound: 7,
        maxRosterSize: 25,
      }),
    ).toEqual({ previewCostRound: null, previewCostAmount: null });
  });
});
