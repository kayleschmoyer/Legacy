/**
 * Matchup.winProbability — server-side Monte Carlo win probability.
 *
 * LS-5907: win probability used to be computed entirely client-side
 * (MatchupWinProbabilityPanel.tsx) from un-gated GraphQL data — any free
 * user could read the network responses and call
 * `calculateMatchupWinProbability` themselves from devtools, bypassing the
 * cosmetic-only PremiumGate. This resolver ports that aggregation
 * server-side and gates it behind ENTITLEMENTS.matchup_projections
 * (mirroring the Matchup.recap / ENTITLEMENTS.ai_matchup_recap pattern),
 * returning null for unauthenticated or non-entitled callers.
 */

import DataLoader from 'dataloader';
import { LOGGER } from '@legacy-sports/logging';
import {
  applyMultiplierGroups,
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import { builder, type Context } from '../builder';
import { hasEntitlement } from '../authorization';
import { ENTITLEMENTS } from '../entitlements';
import { loadLeagueScoringConfig } from '../scoring';

export const MatchupWinProbabilityType = builder.objectRef<{
  team1WinProbability: number;
  team2WinProbability: number;
  tiesProbability: number;
  team1ProjectedScore: number;
  team2ProjectedScore: number;
  simulationCount: number;
}>('MatchupWinProbability');

MatchupWinProbabilityType.implement({
  description:
    'Server-computed Monte Carlo win probability for a scheduled or in-progress matchup. Gated by ENTITLEMENTS.matchup_projections.',
  fields: (t) => ({
    team1WinProbability: t.exposeFloat('team1WinProbability', {
      nullable: false,
    }),
    team2WinProbability: t.exposeFloat('team2WinProbability', {
      nullable: false,
    }),
    tiesProbability: t.exposeFloat('tiesProbability', { nullable: false }),
    team1ProjectedScore: t.exposeFloat('team1ProjectedScore', {
      nullable: false,
    }),
    team2ProjectedScore: t.exposeFloat('team2ProjectedScore', {
      nullable: false,
    }),
    simulationCount: t.exposeInt('simulationCount', { nullable: false }),
  }),
});

interface MatchupForWinProbability {
  id: number;
  leagueId: number;
  weekNumber: number;
  team1Id: number | null;
  team2Id: number | null;
  status: string;
  gamesPerMatchup: number | null;
  pitcherStartsPerMatchup: number | null;
}

/**
 * Request-scoped league scoring config, keyed off the per-request Context
 * object (LS-10307). Lives here rather than in `createLoaders()` because
 * `loadLeagueScoringConfig` is in `../scoring`, which imports the builder —
 * pulling it into the dataloaders barrel would create an import cycle.
 */
const scoringConfigLoaders = new WeakMap<
  Context,
  DataLoader<number, Awaited<ReturnType<typeof loadLeagueScoringConfig>>>
>();

function scoringConfigLoaderFor(context: Context) {
  let loader = scoringConfigLoaders.get(context);
  if (!loader) {
    // Per-key errors, so one league's failure never rejects the others.
    loader = new DataLoader((leagueIds) =>
      Promise.all(
        leagueIds.map((id) =>
          loadLeagueScoringConfig(id).catch((err: unknown) =>
            err instanceof Error ? err : new Error(String(err)),
          ),
        ),
      ),
    );
    scoringConfigLoaders.set(context, loader);
  }
  return loader;
}

function numberOfGamesForPlayer(
  matchup: MatchupForWinProbability,
  positionType: string | null | undefined,
): number {
  const gamesPerMatchup = matchup.gamesPerMatchup ?? 0;
  if (positionType === 'SP' && matchup.pitcherStartsPerMatchup != null) {
    return matchup.pitcherStartsPerMatchup;
  }
  return gamesPerMatchup;
}

export async function resolveMatchupWinProbability(
  matchup: MatchupForWinProbability,
  context: Context,
) {
  // Only meaningful for matchups still to be decided, same as the client panel.
  if (matchup.status === 'completed' || !matchup.team1Id || !matchup.team2Id) {
    return null;
  }

  // Defense-in-depth behind the UI PremiumGate: unauthenticated or free-tier
  // callers get null rather than the computed probability (LS-5907).
  if (!context.user) return null;
  if (!(await hasEntitlement(context, ENTITLEMENTS.matchup_projections))) {
    return null;
  }

  try {
    // This resolver is hit once per unresolved matchup in a league
    // (GetMatchupsForLeague), so everything it reads goes through
    // request-scoped loaders: per-matchup rows batch into one query, and
    // per-league scoring config loads once. Direct per-matchup reads here
    // exhausted the Lambda's connection pool and nulled this field for the
    // whole league (LS-10038, LS-10307).
    const matchupPlayers = await context.loaders.matchupPlayersByMatchupId.load(
      matchup.id,
    );

    if (matchupPlayers.length === 0) return null;

    const scoringConfig = await scoringConfigLoaderFor(context).load(
      matchup.leagueId,
    );
    const scoringSettings = applyMultiplierGroups(
      scoringConfig.multiplierGroups,
    );

    const team1Id = matchup.team1Id;
    const team2Id = matchup.team2Id;
    let team1Total = 0;
    let team2Total = 0;

    await Promise.all(
      matchupPlayers.map(async (mp) => {
        // Benched players (no position slot) don't contribute.
        if (mp.positionId === null) return;

        const position = await context.loaders.leaguePositionById.load(
          mp.positionId,
        );
        const totalGames = numberOfGamesForPlayer(
          matchup,
          position?.positionType,
        );

        const games = await context.loaders.matchupPlayerGames.load(mp.id);
        const selectedGames = games.filter(
          (game) => game.gameIdentifier !== null,
        );
        const remaining = Math.max(0, totalGames - selectedGames.length);

        const seasonKey = `${matchup.leagueId}-${matchup.weekNumber}-${mp.playerId}`;
        const season =
          await context.loaders.leagueWeekPlayerSeasons.load(seasonKey);

        // Actual points from already-selected games.
        let actual = 0;
        if (season !== null) {
          await Promise.all(
            selectedGames.map(async (game) => {
              if (!game.gameIdentifier) return;
              const statKey = `${mp.playerId}-${season}-${game.gameIdentifier}`;
              const [batting, pitching, fielding] = await Promise.all([
                context.loaders.gameBatting.load(statKey),
                context.loaders.gamePitching.load(statKey),
                context.loaders.gameFielding.load(statKey),
              ]);
              actual +=
                computeScoring(batting, scoringSettings.batting) +
                computeScoring(pitching, scoringSettings.pitching) +
                computeScoring(fielding, scoringSettings.fielding);
            }),
          );
        }

        // Projected points for remaining games, from season-average rates.
        let projected = 0;
        if (remaining > 0 && season !== null) {
          const statsKey = `${mp.playerId}-${season}`;
          const [seasonBatting, seasonPitching, seasonFielding] =
            await Promise.all([
              context.loaders.seasonBatting.load(statsKey),
              context.loaders.seasonPitching.load(statsKey),
              context.loaders.seasonFielding.load(statsKey),
            ]);

          const seasonStats: SeasonStats = {
            playerId: mp.playerId,
            season,
            battingStats: seasonBatting ?? undefined,
            pitchingStats: seasonPitching ?? undefined,
            fieldingStats: seasonFielding ?? undefined,
          };

          try {
            const proj = calculateMatchupProjection(
              seasonStats,
              scoringSettings,
            );
            projected = proj.totalPerGame * remaining;
          } catch (err) {
            LOGGER.warn(
              '[Matchup.winProbability] Failed to project remaining games (non-fatal)',
              { matchupId: matchup.id, playerId: mp.playerId, err },
            );
          }
        }

        const playerTotal = actual + projected;
        if (mp.teamId === team1Id) {
          team1Total += playerTotal;
        } else if (mp.teamId === team2Id) {
          team2Total += playerTotal;
        }
      }),
    );

    if (team1Total === 0 && team2Total === 0) return null;

    const { calculateMatchupWinProbability } =
      await import('@legacy-sports/analytics');
    return calculateMatchupWinProbability(team1Total, team2Total);
  } catch (err) {
    LOGGER.error(
      '[Matchup.winProbability] Failed to compute win probability',
      err instanceof Error ? err : new Error(String(err)),
      { matchupId: matchup.id },
    );
    return null;
  }
}
