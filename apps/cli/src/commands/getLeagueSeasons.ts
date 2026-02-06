import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { eq, inArray, sql } from 'drizzle-orm';

interface HandleGetLeagueSeasonsArgs {
  leagueId: number;
}

export const handleGetLeagueSeasons = async (
  args: HandleGetLeagueSeasonsArgs,
) => {
  const leagueId = args.leagueId;

  await runWithPublicClient(getDbOptions(), async (db) => {
    LOGGER.info(`\n=== Available Seasons for League ${leagueId} ===\n`);

    // Get league details
    const leagues = await db
      .select()
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    if (leagues.length === 0) {
      LOGGER.error(`❌ League ${leagueId} not found!`);
      return;
    }

    const league = leagues[0];
    LOGGER.info(`League: ${league.name}`);

    // Get player IDs from matchups in this league
    const matchups = await db
      .select({ id: PublicSchema.matchups.id })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.leagueId, leagueId));

    if (matchups.length === 0) {
      LOGGER.warn('❌ No matchups in league!');
      return;
    }

    const matchupIds = matchups.map((m) => m.id);
    const matchupPlayers = await db
      .select({ playerId: PublicSchema.matchupPlayers.playerId })
      .from(PublicSchema.matchupPlayers)
      .where(inArray(PublicSchema.matchupPlayers.matchupId, matchupIds));

    const playerIds = [...new Set(matchupPlayers.map((mp) => mp.playerId))];
    LOGGER.info(`Players in league: ${playerIds.length}`);

    if (playerIds.length === 0) {
      LOGGER.warn('❌ No players in league!');
      return;
    }

    // Get seasons with stats for these players
    const seasonStats = await db
      .select({
        season: PublicSchema.seasonBatting.season,
        playerCount:
          sql<number>`count(distinct ${PublicSchema.seasonBatting.playerId})`.as(
            'player_count',
          ),
        totalGames: sql<number>`sum(${PublicSchema.seasonBatting.g})`.as(
          'total_games',
        ),
      })
      .from(PublicSchema.seasonBatting)
      .where(inArray(PublicSchema.seasonBatting.playerId, playerIds))
      .groupBy(PublicSchema.seasonBatting.season)
      .orderBy(sql`${PublicSchema.seasonBatting.season} desc`)
      .limit(10);

    LOGGER.info(`\nAvailable Seasons (with batting stats):`);
    seasonStats.forEach((stat) => {
      LOGGER.info(
        `  ${stat.season}: ${stat.playerCount} players, ${stat.totalGames} total games`,
      );
    });

    if (seasonStats.length > 0) {
      LOGGER.info(`\n✅ Recommended season: ${seasonStats[0].season}`);
    }
  });
};
