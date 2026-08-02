/**
 * Resolver-level entitlement tests for the Matchup.winProbability field
 * (LS-5907).
 *
 * Win probability used to be computed entirely client-side from un-gated
 * GraphQL data, letting any free user bypass the cosmetic-only PremiumGate.
 * `resolveMatchupWinProbability` is gated server-side as defense-in-depth,
 * mirroring the Matchup.recap / ENTITLEMENTS.ai_matchup_recap pattern: an
 * unauthenticated or free-tier caller gets `null` instead of the computed
 * probability (vs. throwing, so the parent `matchup` query stays intact).
 *
 * Gate order in the resolver:
 *   1. Completed matchup or missing a team → null (before any auth/entitlement work).
 *   2. No authenticated user → null.
 *   3. Lacks matchup_projections entitlement → null (no DB loads happen).
 *   4. Entitled → proceeds to load matchup players and compute.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/analytics', () => ({
  calculateMatchupWinProbability: jest.fn(() => ({
    team1WinProbability: 0.5,
    team2WinProbability: 0.5,
    tiesProbability: 0,
    team1ProjectedScore: 10,
    team2ProjectedScore: 10,
    simulationCount: 5000,
  })),
}));

const hasEntitlement = jest.fn();
jest.mock('../authorization', () => ({ hasEntitlement }));

jest.mock('../entitlements', () => ({
  ENTITLEMENTS: { matchup_projections: 'matchup_projections' },
}));

const loadLeagueScoringConfig = jest.fn();
jest.mock('../scoring', () => ({
  loadLeagueScoringConfig: (...args: unknown[]): unknown =>
    loadLeagueScoringConfig(...args),
}));

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: { matchupPlayers: { matchupId: 'matchupId' } },
}));

jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));

// The Pothos builder is only touched at the module's top level to declare
// MatchupWinProbabilityType — stub it so importing the module doesn't
// require the full schema graph.
jest.mock('../builder', () => ({
  builder: {
    objectRef: () => ({ implement: jest.fn() }),
  },
}));

import { resolveMatchupWinProbability } from './winProbability';
import type { Context } from '../builder';

function resolve(
  matchup: Parameters<typeof resolveMatchupWinProbability>[0],
  ctx: ReturnType<typeof makeContext>,
): ReturnType<typeof resolveMatchupWinProbability> {
  return resolveMatchupWinProbability(matchup, ctx as unknown as Context);
}

const SCHEDULED = {
  id: 1,
  leagueId: 5,
  weekNumber: 3,
  team1Id: 101,
  team2Id: 102,
  status: 'scheduled',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 1,
};

function makeContext(
  user: unknown,
  matchupPlayers: Array<{
    id: number;
    playerId: number;
    teamId: number;
    positionId: number | null;
  }> = [],
) {
  const positionLoad = jest.fn().mockResolvedValue({ positionType: 'OF' });
  const gamesLoad = jest.fn().mockResolvedValue([]);
  const seasonLoad = jest.fn().mockResolvedValue(null);
  return {
    user,
    loaders: {
      leaguePositionById: { load: positionLoad },
      matchupPlayerGames: { load: gamesLoad },
      leagueWeekPlayerSeasons: { load: seasonLoad },
      seasonBatting: { load: jest.fn().mockResolvedValue(null) },
      seasonPitching: { load: jest.fn().mockResolvedValue(null) },
      seasonFielding: { load: jest.fn().mockResolvedValue(null) },
      gameBatting: { load: jest.fn().mockResolvedValue(null) },
      gamePitching: { load: jest.fn().mockResolvedValue(null) },
      gameFielding: { load: jest.fn().mockResolvedValue(null) },
    },
    db: {
      select: () => ({
        from: () => ({ where: () => Promise.resolve(matchupPlayers) }),
      }),
    },
  };
}

describe('resolveMatchupWinProbability — entitlement gate', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
    loadLeagueScoringConfig.mockReset();
    loadLeagueScoringConfig.mockResolvedValue({ multiplierGroups: [] });
  });

  it('returns null for completed matchups without checking entitlement', async () => {
    const ctx = makeContext({ id: 1 });
    await expect(
      resolve({ ...SCHEDULED, status: 'completed' }, ctx),
    ).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null when either team is missing without checking entitlement', async () => {
    const ctx = makeContext({ id: 1 });
    await expect(
      resolve({ ...SCHEDULED, team2Id: null }, ctx),
    ).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for unauthenticated callers', async () => {
    const ctx = makeContext(null);
    await expect(resolve(SCHEDULED, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for free-tier callers and never loads matchup players', async () => {
    hasEntitlement.mockResolvedValue(false);
    const ctx = makeContext({ id: 7 });
    const selectSpy = jest.spyOn(ctx.db, 'select');

    await expect(resolve(SCHEDULED, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'matchup_projections');
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('returns null for entitled callers when the matchup has no players', async () => {
    hasEntitlement.mockResolvedValue(true);
    const ctx = makeContext({ id: 7 }, []);

    await expect(resolve(SCHEDULED, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'matchup_projections');
  });

  it('computes and returns win probability for entitled callers with rostered players', async () => {
    hasEntitlement.mockResolvedValue(true);
    const ctx = makeContext({ id: 7 }, [
      { id: 1, playerId: 11, teamId: 101, positionId: 1 },
      { id: 2, playerId: 12, teamId: 102, positionId: 1 },
    ]);
    // Give both players actual game scoring so team totals aren't both zero.
    ctx.loaders.matchupPlayerGames.load.mockResolvedValue([
      { gameIdentifier: 'g1' },
    ]);
    ctx.loaders.leagueWeekPlayerSeasons.load.mockResolvedValue(2025);
    ctx.loaders.gameBatting.load.mockResolvedValue({ hr: 1 });

    const result = await resolve(SCHEDULED, ctx);

    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'matchup_projections');
    expect(result).toEqual({
      team1WinProbability: 0.5,
      team2WinProbability: 0.5,
      tiesProbability: 0,
      team1ProjectedScore: 10,
      team2ProjectedScore: 10,
      simulationCount: 5000,
    });
  });
});
