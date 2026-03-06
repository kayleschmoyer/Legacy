import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray } from 'drizzle-orm';

interface QueryMatchupPlayersArgs {
  matchupId: number;
}

export async function queryMatchupPlayers(
  args: QueryMatchupPlayersArgs,
): Promise<void> {
  const { matchupId } = args;

  LOGGER.info(`🔍 Querying matchup players for matchup ID: ${matchupId}`);

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    // Get the matchup details first
    const matchup = await db
      .select()
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, matchupId))
      .limit(1);

    if (matchup.length === 0) {
      LOGGER.error(`❌ No matchup found with ID ${matchupId}`);
      return;
    }

    LOGGER.info(`✅ Found matchup:`, {
      id: matchup[0].id,
      weekNumber: matchup[0].weekNumber,
      leagueId: matchup[0].leagueId,
      team1Id: matchup[0].team1Id,
      team2Id: matchup[0].team2Id,
      status: matchup[0].status,
    });

    const teamIds = [matchup[0].team1Id, matchup[0].team2Id].filter(
      (id): id is number => typeof id === 'number',
    );

    const playerTeamPairs = teamIds.length
      ? await db
          .select({
            playerId: PublicSchema.teamMembers.playerId,
            teamId: PublicSchema.teamMembers.teamId,
          })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.leagueId, matchup[0].leagueId),
              inArray(PublicSchema.teamMembers.teamId, teamIds),
            ),
          )
      : [];

    const playerTeamMap = new Map(
      playerTeamPairs.map((pair) => [pair.playerId, pair.teamId]),
    );

    // Get the matchup players
    const players = await db
      .select({
        id: PublicSchema.matchupPlayers.id,
        matchupId: PublicSchema.matchupPlayers.matchupId,
        playerId: PublicSchema.matchupPlayers.playerId,
        teamId: PublicSchema.matchupPlayers.teamId,
        firstName: PublicSchema.players.firstName,
        lastName: PublicSchema.players.lastName,
      })
      .from(PublicSchema.matchupPlayers)
      .leftJoin(
        PublicSchema.players,
        eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
      )
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

    if (players.length === 0) {
      LOGGER.error(
        `❌ No matchup players found - auto-population may have failed`,
      );
      return;
    }

    const playersWithTeams = players.map((player) => ({
      ...player,
      teamId: playerTeamMap.get(player.playerId),
    }));

    LOGGER.info(`\n✅ Found ${players.length} matchup players!\n`);

    // Group by team
    const team1Players = playersWithTeams.filter(
      (p) => p.teamId === matchup[0].team1Id,
    );
    const team2Players = playersWithTeams.filter(
      (p) => p.teamId === matchup[0].team2Id,
    );

    console.log(
      `📊 Team ${matchup[0].team1Id} - ${team1Players.length} players:`,
    );
    team1Players.forEach((p) => {
      console.log(`  • ${p.firstName} ${p.lastName} (ID: ${p.playerId})`);
    });

    console.log(
      `\n📊 Team ${matchup[0].team2Id} - ${team2Players.length} players:`,
    );
    team2Players.forEach((p) => {
      console.log(`  • ${p.firstName} ${p.lastName} (ID: ${p.playerId})`);
    });

    console.log('\n✅ Auto-population verification complete!');
  });
}
