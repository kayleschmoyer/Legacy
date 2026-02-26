/**
 * Matchups domain — mutation fields
 */

import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { isNegroLeague } from '@legacy-sports/utils';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import {
  AdvanceLeagueWeekResponse,
  CreateMatchupInput,
  Matchup,
  MatchupPlayer,
  MatchupStatus,
} from './types';
import { builder, Context } from '../builder';
import { selectSeasonsForPlayers } from '../../services/season-selector';
import { MatchupService } from '../../services/matchup-service';

// Mutation: createMatchup
builder.mutationField('createMatchup', (t) =>
  t.field({
    type: Matchup,
    args: {
      input: t.arg({ type: CreateMatchupInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Get league configuration for defaults
      const league = await context.db
        .select({
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
          spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.input.leagueId))
        .limit(1);

      if (!league[0]) {
        throw new Error('League not found');
      }

      const gamesPerMatchup =
        args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;
      const spStartsPerMatchup = league[0].spStartsPerMatchup ?? 1;

      // Insert the matchup
      const results = await context.db
        .insert(PublicSchema.matchups)
        .values({
          leagueId: args.input.leagueId,
          weekNumber: args.input.weekNumber,
          team1Id: args.input.team1Id ?? null,
          team2Id: args.input.team2Id ?? null,
          gamesPerMatchup,
          spStartsPerMatchup,
          startTime: args.input.startTime ?? null,
          endTime: args.input.endTime ?? null,
          status: 'scheduled',
        })
        .returning();

      return results[0];
    },
  }),
);

// Mutation: updateMatchupScore
builder.mutationField('updateMatchupScore', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      team1Score: t.arg.float({ required: false }),
      team2Score: t.arg.float({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const updateData: { team1Score?: string; team2Score?: string } = {};

      if (args.team1Score !== null && args.team1Score !== undefined) {
        updateData.team1Score = args.team1Score.toString();
      }
      if (args.team2Score !== null && args.team2Score !== undefined) {
        updateData.team2Score = args.team2Score.toString();
      }

      const results = await context.db
        .update(PublicSchema.matchups)
        .set(updateData)
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .returning();

      if (!results[0]) {
        throw new Error('Matchup not found');
      }

      return results[0];
    },
  }),
);

// Mutation: updateMatchupStatus
builder.mutationField('updateMatchupStatus', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      status: t.arg({ type: MatchupStatus, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const results = await context.db
        .update(PublicSchema.matchups)
        .set({ status: args.status })
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .returning();

      if (!results[0]) {
        throw new Error('Matchup not found');
      }

      return results[0];
    },
  }),
);

// ── Matchup Roster Mutations ───────────────────────────────────────────────

/**
 * Helper: Verify that the calling user owns the team in this matchup.
 * Returns the matchup row so callers can check status.
 */
async function verifyMatchupTeamOwnership(
  context: Context,
  matchupPlayerId: number,
): Promise<{
  matchupPlayer: {
    id: number;
    matchupId: number;
    playerId: number;
    teamId: number;
    positionId: number | null;
  };
  matchup: {
    id: number;
    leagueId: number;
    weekNumber: number;
    status: string;
  };
}> {
  if (!context.user) {
    throw new Error('Authentication required');
  }

  // Get the matchup player
  const mpResult = await context.db
    .select({
      id: PublicSchema.matchupPlayers.id,
      matchupId: PublicSchema.matchupPlayers.matchupId,
      playerId: PublicSchema.matchupPlayers.playerId,
      teamId: PublicSchema.matchupPlayers.teamId,
      positionId: PublicSchema.matchupPlayers.positionId,
    })
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerId))
    .limit(1);

  if (mpResult.length === 0) {
    throw new Error('Matchup player not found');
  }

  const matchupPlayer = mpResult[0];

  // Get the matchup
  const matchupResult = await context.db
    .select({
      id: PublicSchema.matchups.id,
      leagueId: PublicSchema.matchups.leagueId,
      weekNumber: PublicSchema.matchups.weekNumber,
      status: PublicSchema.matchups.status,
    })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupPlayer.matchupId))
    .limit(1);

  if (matchupResult.length === 0) {
    throw new Error('Matchup not found');
  }

  const matchup = matchupResult[0];

  // Verify the user owns this team via league_members
  const memberResult = await context.db
    .select({
      teamId: PublicSchema.leagueMembers.teamId,
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, matchup.leagueId),
        eq(PublicSchema.leagueMembers.userId, context.user.id),
      ),
    )
    .limit(1);

  if (memberResult.length === 0) {
    throw new Error('Not a member of this league');
  }

  const isCommissioner =
    memberResult[0].permissionLevel === 'commissioner' ||
    memberResult[0].permissionLevel === 'general_manager' ||
    memberResult[0].permissionLevel === 'assistant_manager';

  if (!isCommissioner && memberResult[0].teamId !== matchupPlayer.teamId) {
    throw new Error('You can only modify your own team roster');
  }

  return { matchupPlayer, matchup };
}

// Mutation: updateMatchupPlayerPosition
// Allows changing a player's position within a matchup before it starts
builder.mutationField('updateMatchupPlayerPosition', (t) =>
  t.field({
    type: MatchupPlayer,
    args: {
      matchupPlayerId: t.arg.int({ required: true }),
      positionId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      const { matchup } = await verifyMatchupTeamOwnership(
        context,
        args.matchupPlayerId,
      );

      // Only allow edits when matchup is scheduled (not yet locked)
      if (matchup.status !== 'scheduled') {
        throw new Error(
          'Cannot modify roster after the matchup has started or completed',
        );
      }

      const db = context.db;

      // Update the position
      const updated = await db
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: args.positionId ?? null })
        .where(eq(PublicSchema.matchupPlayers.id, args.matchupPlayerId))
        .returning({
          id: PublicSchema.matchupPlayers.id,
          matchupId: PublicSchema.matchupPlayers.matchupId,
          playerId: PublicSchema.matchupPlayers.playerId,
          teamId: PublicSchema.matchupPlayers.teamId,
          positionId: PublicSchema.matchupPlayers.positionId,
        });

      if (updated.length === 0) {
        throw new Error('Failed to update matchup player position');
      }

      // Resolve season for response
      const seasonsResult = await db
        .select({
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              matchup.weekNumber,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.playerId,
              updated[0].playerId,
            ),
          ),
        )
        .limit(1);

      return {
        ...updated[0],
        positionId: updated[0].positionId ?? null,
        season: seasonsResult[0]?.season ?? null,
      };
    },
  }),
);

// Mutation: swapMatchupPlayerPositions
// Atomically swaps two matchup players' positions within the same matchup
builder.mutationField('swapMatchupPlayerPositions', (t) =>
  t.field({
    type: [MatchupPlayer],
    args: {
      matchupPlayerIdA: t.arg.int({ required: true }),
      positionIdA: t.arg.int({ required: false }),
      matchupPlayerIdB: t.arg.int({ required: true }),
      positionIdB: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { matchupPlayerIdA, positionIdA, matchupPlayerIdB, positionIdB } =
        args;

      // Verify ownership of both players
      const { matchup: matchupA } = await verifyMatchupTeamOwnership(
        context,
        matchupPlayerIdA,
      );
      const { matchup: matchupB } = await verifyMatchupTeamOwnership(
        context,
        matchupPlayerIdB,
      );

      if (matchupA.id !== matchupB.id) {
        throw new Error('Both players must be in the same matchup');
      }

      if (matchupA.status !== 'scheduled') {
        throw new Error(
          'Cannot modify roster after the matchup has started or completed',
        );
      }

      const db = context.db;

      // Perform atom swap in a transaction
      const results = await db.transaction(async (tx) => {
        // Clear both positions first to avoid unique constraint violations
        await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: null })
          .where(
            inArray(PublicSchema.matchupPlayers.id, [
              matchupPlayerIdA,
              matchupPlayerIdB,
            ]),
          );

        // Assign new positions
        const updatedA = await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: positionIdA ?? null })
          .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdA))
          .returning({
            id: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            playerId: PublicSchema.matchupPlayers.playerId,
            teamId: PublicSchema.matchupPlayers.teamId,
            positionId: PublicSchema.matchupPlayers.positionId,
          });

        const updatedB = await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: positionIdB ?? null })
          .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdB))
          .returning({
            id: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            playerId: PublicSchema.matchupPlayers.playerId,
            teamId: PublicSchema.matchupPlayers.teamId,
            positionId: PublicSchema.matchupPlayers.positionId,
          });

        if (updatedA.length === 0 || updatedB.length === 0) {
          throw new Error('Failed to swap matchup player positions');
        }

        return [updatedA[0], updatedB[0]];
      });

      // Resolve seasons for response
      const seasonsResults = await db
        .select({
          playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(
              PublicSchema.leagueWeekPlayerSeasons.leagueId,
              matchupA.leagueId,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              matchupA.weekNumber,
            ),
            inArray(PublicSchema.leagueWeekPlayerSeasons.playerId, [
              results[0].playerId,
              results[1].playerId,
            ]),
          ),
        );

      const seasonMap = new Map(
        seasonsResults.map((s) => [s.playerId, s.season]),
      );

      return results.map((r) => ({
        ...r,
        positionId: r.positionId ?? null,
        season: seasonMap.get(r.playerId) ?? null,
      }));
    },
  }),
);

// ── Create All Matchups ────────────────────────────────────────────────────

/**
 * Populate matchup_players and assign seasons for a set of matchups.
 *
 * For each matchup in a given week:
 * 1. Copies team_members into matchup_players (with their positions)
 * 2. Assigns random historical seasons per player per week
 */
async function populateMatchupPlayersAndSeasons(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
  matchupRows: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
  }>,
  gamesPerMatchup: number,
): Promise<void> {
  // Group matchups by week
  const matchupsByWeek = new Map<number, typeof matchupRows>();
  for (const m of matchupRows) {
    if (!matchupsByWeek.has(m.weekNumber)) {
      matchupsByWeek.set(m.weekNumber, []);
    }
    const weekList = matchupsByWeek.get(m.weekNumber);
    if (weekList) weekList.push(m);
  }

  // Get all teams and their members for the league
  const allTeamMembers = await db
    .select({
      teamId: PublicSchema.teamMembers.teamId,
      playerId: PublicSchema.teamMembers.playerId,
      positionId: PublicSchema.teamMembers.positionId,
    })
    .from(PublicSchema.teamMembers)
    .where(eq(PublicSchema.teamMembers.leagueId, leagueId));

  // Build team → players map
  const teamPlayersMap = new Map<
    number,
    Array<{ playerId: number; positionId: number | null }>
  >();
  for (const tm of allTeamMembers) {
    if (!tm.teamId) continue;
    if (!teamPlayersMap.has(tm.teamId)) {
      teamPlayersMap.set(tm.teamId, []);
    }
    const teamList = teamPlayersMap.get(tm.teamId);
    if (teamList)
      teamList.push({
        playerId: tm.playerId,
        positionId: tm.positionId,
      });
  }

  // Collect all player IDs for season queries
  const allPlayerIds = Array.from(
    new Set(allTeamMembers.map((tm) => tm.playerId)),
  );

  if (allPlayerIds.length === 0) return;

  // Fetch all season stats upfront (shared across all weeks)
  const minGames = gamesPerMatchup * 2;
  const [allBattingSeasons, allPitchingSeasons, allFieldingSeasons] =
    await Promise.all([
      db
        .select({
          playerId: PublicSchema.seasonBatting.playerId,
          season: PublicSchema.seasonBatting.season,
          g: PublicSchema.seasonBatting.g,
          lgId: PublicSchema.seasonBatting.lgId,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            inArray(PublicSchema.seasonBatting.playerId, allPlayerIds),
            isNotNull(PublicSchema.seasonBatting.g),
          ),
        )
        .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
      db
        .select({
          playerId: PublicSchema.seasonPitching.playerId,
          season: PublicSchema.seasonPitching.season,
          g: PublicSchema.seasonPitching.g,
          lgId: PublicSchema.seasonPitching.lgId,
        })
        .from(PublicSchema.seasonPitching)
        .where(
          and(
            inArray(PublicSchema.seasonPitching.playerId, allPlayerIds),
            isNotNull(PublicSchema.seasonPitching.g),
          ),
        )
        .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
      db
        .select({
          playerId: PublicSchema.seasonFielding.playerId,
          season: PublicSchema.seasonFielding.season,
          g: PublicSchema.seasonFielding.g,
          lgId: PublicSchema.seasonFielding.lgId,
        })
        .from(PublicSchema.seasonFielding)
        .where(
          and(
            inArray(PublicSchema.seasonFielding.playerId, allPlayerIds),
            isNotNull(PublicSchema.seasonFielding.g),
          ),
        )
        .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
    ]);

  // Process each week
  const sortedWeeks = Array.from(matchupsByWeek.keys()).sort((a, b) => a - b);

  for (const weekNumber of sortedWeeks) {
    const weekMatchups = matchupsByWeek.get(weekNumber) ?? [];

    // Insert matchup_players for each matchup in this week
    for (const matchup of weekMatchups) {
      const playersToInsert: Array<{
        matchupId: number;
        playerId: number;
        teamId: number;
        positionId: number | null;
      }> = [];

      for (const teamId of [matchup.team1Id, matchup.team2Id]) {
        if (!teamId) continue;
        const players = teamPlayersMap.get(teamId) ?? [];
        for (const p of players) {
          playersToInsert.push({
            matchupId: matchup.id,
            playerId: p.playerId,
            teamId,
            positionId: p.positionId,
          });
        }
      }

      if (playersToInsert.length > 0) {
        await db.insert(PublicSchema.matchupPlayers).values(playersToInsert);
      }
    }

    // Assign seasons for this week's players
    const weekPlayerIds = new Set<number>();
    for (const matchup of weekMatchups) {
      for (const teamId of [matchup.team1Id, matchup.team2Id]) {
        if (!teamId) continue;
        const players = teamPlayersMap.get(teamId) ?? [];
        for (const p of players) {
          weekPlayerIds.add(p.playerId);
        }
      }
    }

    const playerIdsForWeek = Array.from(weekPlayerIds);
    if (playerIdsForWeek.length === 0) continue;

    const selectionResult = selectSeasonsForPlayers(
      playerIdsForWeek,
      allBattingSeasons,
      allPitchingSeasons,
      allFieldingSeasons,
      minGames,
      leagueId,
      weekNumber,
    );

    if (selectionResult.selections.length > 0) {
      await db
        .insert(PublicSchema.leagueWeekPlayerSeasons)
        .values(selectionResult.selections);
    }

    if (selectionResult.skippedPlayers.length > 0) {
      LOGGER.warn('Some players could not be assigned seasons', {
        leagueId,
        weekNumber,
        skippedCount: selectionResult.skippedPlayers.length,
      });
    }
  }
}

/**
 * Create all matchups for a league at once.
 *
 * Uses the scheduling library to generate a full round-robin schedule,
 * inserts all matchups, populates matchup_players, and assigns seasons.
 * Sets the league's currentMatchup to the first week 1 matchup.
 *
 * Exported for use by draft completion flow.
 */
export async function createAllMatchupsForLeague(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
): Promise<{ matchupCount: number; currentMatchupId: number | null }> {
  // 1. Get league configuration
  const leagueResult = await db
    .select({
      id: PublicSchema.leagues.id,
      totalMatchups: PublicSchema.leagues.totalMatchups,
      gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
      spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
      schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  if (!leagueResult[0]) {
    throw new Error('League not found');
  }

  const league = leagueResult[0];
  const totalMatchups = league.totalMatchups ?? 10;
  const gamesPerMatchup = league.gamesPerMatchup ?? 5;
  const spStartsPerMatchup = league.spStartsPerMatchup ?? 1;
  const strategyType = league.schedulingStrategy ?? 'round-robin';

  // 2. Generate the schedule using the scheduling library
  const scheduleResult = await MatchupService.generateSchedule(db, {
    leagueId,
    numberOfWeeks: totalMatchups,
    strategyType,
  });

  if (scheduleResult.matchups.length === 0) {
    LOGGER.warn('No matchups generated', {
      leagueId,
      totalMatchups,
      warnings: scheduleResult.warnings,
    });
    return { matchupCount: 0, currentMatchupId: null };
  }

  // 3. Insert all matchups
  const insertedMatchups: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
  }> = [];

  for (const matchup of scheduleResult.matchups) {
    const result = await db
      .insert(PublicSchema.matchups)
      .values({
        leagueId,
        weekNumber: matchup.weekNumber,
        team1Id: matchup.team1Id,
        team2Id: matchup.team2Id,
        gamesPerMatchup,
        spStartsPerMatchup,
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
        startTime: null,
        endTime: null,
      })
      .returning({
        id: PublicSchema.matchups.id,
        weekNumber: PublicSchema.matchups.weekNumber,
        team1Id: PublicSchema.matchups.team1Id,
        team2Id: PublicSchema.matchups.team2Id,
      });

    insertedMatchups.push(result[0]);
  }

  // 4. Populate matchup_players and assign seasons
  await populateMatchupPlayersAndSeasons(
    db,
    leagueId,
    insertedMatchups,
    gamesPerMatchup,
  );

  // 5. Set currentMatchup to the first week-1 matchup
  const week1Matchup = insertedMatchups.find((m) => m.weekNumber === 1);
  const currentMatchupId = week1Matchup?.id ?? insertedMatchups[0]?.id ?? null;

  await db
    .update(PublicSchema.leagues)
    .set({
      currentMatchup: currentMatchupId ?? undefined,
      weekAdvanceStatus: 'success',
    })
    .where(eq(PublicSchema.leagues.id, leagueId));

  LOGGER.info('Created all matchups for league', {
    leagueId,
    totalMatchups,
    matchupCount: insertedMatchups.length,
    currentMatchupId,
  });

  return { matchupCount: insertedMatchups.length, currentMatchupId };
}

/**
 * Adjust the number of matchups when totalMatchups setting changes.
 *
 * If the new total is higher, creates additional weeks using the scheduling library.
 * If the new total is lower, removes 'scheduled' matchups starting from the highest weeks.
 * Refuses to remove completed or in-progress matchups.
 */
export async function adjustMatchupsForNewTotal(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
  newTotal: number,
): Promise<{ added: number; removed: number }> {
  // Get all existing matchups grouped by week
  const existingMatchups = await db
    .select({
      id: PublicSchema.matchups.id,
      weekNumber: PublicSchema.matchups.weekNumber,
      status: PublicSchema.matchups.status,
    })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.leagueId, leagueId));

  const highestWeek = existingMatchups.reduce(
    (max, m) => Math.max(max, m.weekNumber ?? 0),
    0,
  );

  if (highestWeek === 0 && existingMatchups.length === 0) {
    // No matchups exist yet — nothing to adjust
    return { added: 0, removed: 0 };
  }

  if (newTotal === highestWeek) {
    return { added: 0, removed: 0 };
  }

  if (newTotal > highestWeek) {
    // Need to add more weeks
    const weeksToAdd = newTotal - highestWeek;

    // Get league config
    const leagueResult = await db
      .select({
        gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
        spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
        schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    const league = leagueResult[0];
    if (!league) throw new Error('League not found');

    const gamesPerMatchup = league.gamesPerMatchup ?? 5;
    const spStartsPerMatchup = league.spStartsPerMatchup ?? 1;

    // Generate schedule for the additional weeks
    const scheduleResult = await MatchupService.generateSchedule(db, {
      leagueId,
      numberOfWeeks: weeksToAdd,
      strategyType: league.schedulingStrategy ?? 'round-robin',
    });

    // Remap week numbers: generated schedule starts at 1, we need highestWeek+1
    const insertedMatchups: Array<{
      id: number;
      weekNumber: number;
      team1Id: number | null;
      team2Id: number | null;
    }> = [];

    for (const matchup of scheduleResult.matchups) {
      const actualWeek = highestWeek + matchup.weekNumber;
      const result = await db
        .insert(PublicSchema.matchups)
        .values({
          leagueId,
          weekNumber: actualWeek,
          team1Id: matchup.team1Id,
          team2Id: matchup.team2Id,
          gamesPerMatchup,
          spStartsPerMatchup,
          status: 'scheduled',
          team1Score: null,
          team2Score: null,
          startTime: null,
          endTime: null,
        })
        .returning({
          id: PublicSchema.matchups.id,
          weekNumber: PublicSchema.matchups.weekNumber,
          team1Id: PublicSchema.matchups.team1Id,
          team2Id: PublicSchema.matchups.team2Id,
        });

      insertedMatchups.push(result[0]);
    }

    // Populate matchup_players and seasons for the new weeks
    if (insertedMatchups.length > 0) {
      await populateMatchupPlayersAndSeasons(
        db,
        leagueId,
        insertedMatchups,
        gamesPerMatchup,
      );
    }

    LOGGER.info('Added matchup weeks', {
      leagueId,
      weeksAdded: weeksToAdd,
      matchupsAdded: insertedMatchups.length,
    });

    return { added: insertedMatchups.length, removed: 0 };
  } else {
    // Need to remove weeks from the top
    // Only remove 'scheduled' matchups — refuse to delete completed/in-progress

    // Find weeks that can be removed (only scheduled, from highest down)
    const removableWeeks: number[] = [];
    for (let w = highestWeek; w > newTotal; w--) {
      const weekMatchups = existingMatchups.filter((m) => m.weekNumber === w);
      const allScheduled = weekMatchups.every((m) => m.status === 'scheduled');

      if (!allScheduled) {
        LOGGER.warn('Cannot remove week with non-scheduled matchups', {
          leagueId,
          weekNumber: w,
        });
        break; // Stop removing — can't skip completed weeks
      }
      removableWeeks.push(w);
    }

    if (removableWeeks.length === 0) {
      return { added: 0, removed: 0 };
    }

    // Delete matchup_players for these matchups first
    const matchupIdsToRemove = existingMatchups
      .filter((m) => removableWeeks.includes(m.weekNumber ?? 0))
      .map((m) => m.id);

    if (matchupIdsToRemove.length > 0) {
      // Delete matchup_players
      await db
        .delete(PublicSchema.matchupPlayers)
        .where(
          inArray(PublicSchema.matchupPlayers.matchupId, matchupIdsToRemove),
        );

      // Delete league_week_player_seasons for these weeks
      for (const weekNum of removableWeeks) {
        await db
          .delete(PublicSchema.leagueWeekPlayerSeasons)
          .where(
            and(
              eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
              eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNum),
            ),
          );
      }

      // Delete the matchups
      await db
        .delete(PublicSchema.matchups)
        .where(inArray(PublicSchema.matchups.id, matchupIdsToRemove));
    }

    LOGGER.info('Removed matchup weeks', {
      leagueId,
      weeksRemoved: removableWeeks.length,
      matchupsRemoved: matchupIdsToRemove.length,
    });

    return { added: 0, removed: matchupIdsToRemove.length };
  }
}

// Mutation: createAllMatchups
// Creates all matchups for a league at once based on the totalMatchups setting.
// Typically called when the draft completes, but can be invoked manually by commissioner.
builder.mutationField('createAllMatchups', (t) =>
  t.field({
    type: AdvanceLeagueWeekResponse,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const leagueId = args.leagueId;

      // Verify user is owner or commissioner
      const membership = await context.db
        .select({
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error('You are not a member of this league');
      }

      // Verify no matchups exist already
      const existingMatchups = await context.db
        .select({ id: PublicSchema.matchups.id })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, leagueId))
        .limit(1);

      if (existingMatchups.length > 0) {
        throw new Error(
          'Matchups already exist for this league. Use advanceLeagueWeek or adjust settings instead.',
        );
      }

      const result = await createAllMatchupsForLeague(context.db, leagueId);

      // Fetch created matchups for return
      const createdMatchups = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, leagueId));

      return {
        matchups: createdMatchups,
        currentMatchupId: result.currentMatchupId,
      };
    },
  }),
);
