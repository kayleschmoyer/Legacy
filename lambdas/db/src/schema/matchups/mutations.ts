/**
 * Matchups domain — mutation fields
 */

import {
  createAllMatchupsForLeague,
  type GenericDatabase,
  populateMatchupPlayersAndSeasons,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, eq, inArray, isNull, not } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import {
  AdvanceLeagueWeekResponse,
  CreateMatchupInput,
  Matchup,
  MatchupPlayer,
  MatchupStatus,
} from './types';
import { builder, Context } from '../builder';
import { verifyCommissionerAccess } from '../authorization';
import { MatchupService } from '../../services/matchup-service';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

export { createAllMatchupsForLeague };

// Mutation: createMatchup
builder.mutationField('createMatchup', (t) =>
  t.field({
    type: Matchup,
    args: {
      input: t.arg({ type: CreateMatchupInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Only admins and league commissioners/GMs may create matchups
      if (!context.user.isAdmin) {
        await verifyCommissionerAccess(
          context.db,
          args.input.leagueId,
          context.user.id,
        );
      }

      // Get league configuration for defaults
      const league = await context.db
        .select({
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
          pitcherStartsPerMatchup: PublicSchema.leagues.pitcherStartsPerMatchup,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.input.leagueId))
        .limit(1);

      if (!league[0]) {
        throw new Error('League not found');
      }

      const gamesPerMatchup =
        args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;
      const pitcherStartsPerMatchup = league[0].pitcherStartsPerMatchup ?? 1;

      // Insert the matchup
      const results = await context.db
        .insert(PublicSchema.matchups)
        .values({
          leagueId: args.input.leagueId,
          weekNumber: args.input.weekNumber,
          team1Id: args.input.team1Id ?? null,
          team2Id: args.input.team2Id ?? null,
          gamesPerMatchup,
          pitcherStartsPerMatchup,
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
        throw AuthenticationError();
      }

      // Score updates are performed by the scoring system (admin / system requests only)
      if (!context.isSystemRequest && !context.user.isAdmin) {
        throw new Error(
          'Only admins or the scoring system may update matchup scores',
        );
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
        throw AuthenticationError();
      }

      // Status transitions are controlled by the system or admins only
      if (!context.isSystemRequest && !context.user.isAdmin) {
        throw new Error(
          'Only admins or the scoring system may update matchup status',
        );
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
    throw AuthenticationError();
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
    throw ForbiddenError('Not a member of this league');
  }

  const isCommissioner =
    memberResult[0].permissionLevel === 'commissioner' ||
    memberResult[0].permissionLevel === 'general_manager' ||
    memberResult[0].permissionLevel === 'assistant_manager';

  if (!isCommissioner && memberResult[0].teamId !== matchupPlayer.teamId) {
    throw ForbiddenError('You can only modify your own team roster');
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

      // Fetch the target player to find their matchup+team context
      const [targetPlayer] = await db
        .select({
          matchupId: PublicSchema.matchupPlayers.matchupId,
          teamId: PublicSchema.matchupPlayers.teamId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(eq(PublicSchema.matchupPlayers.id, args.matchupPlayerId))
        .limit(1);

      if (!targetPlayer) {
        throw new Error('Matchup player not found');
      }

      // If assigning to a slot, evict any existing occupant first so only one
      // player can occupy a given slot at a time.
      if (args.positionId != null) {
        await db
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: null })
          .where(
            and(
              eq(PublicSchema.matchupPlayers.matchupId, targetPlayer.matchupId),
              eq(PublicSchema.matchupPlayers.teamId, targetPlayer.teamId),
              eq(PublicSchema.matchupPlayers.positionId, args.positionId),
              not(eq(PublicSchema.matchupPlayers.id, args.matchupPlayerId)),
            ),
          );
      }

      // Update the position and mark as manually edited to protect from
      // future roster-tab propagation overwriting this intentional choice.
      const updated = await db
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: args.positionId ?? null, manuallyEdited: true })
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
        throw AuthenticationError();
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

        // Assign new positions and mark both as manually edited so future
        // roster-tab propagation does not overwrite these intentional choices.
        const updatedA = await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: positionIdA ?? null, manuallyEdited: true })
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
          .set({ positionId: positionIdB ?? null, manuallyEdited: true })
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

// populateMatchupPlayersAndSeasons and createAllMatchupsForLeague are now
// implemented in @legacy-sports/db-client (lib/db-client/src/lib/matchup-utils.ts)
// and re-exported above.

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
        pitcherStartsPerMatchup: PublicSchema.leagues.pitcherStartsPerMatchup,
        schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    const league = leagueResult[0];
    if (!league) throw new Error('League not found');

    const gamesPerMatchup = league.gamesPerMatchup ?? 5;
    const pitcherStartsPerMatchup = league.pitcherStartsPerMatchup ?? 1;

    // Generate the full schedule for the total number of weeks so the
    // round-robin cycle continues seamlessly from the existing schedule.
    // Only insert matchups for weeks beyond what already exists.
    const scheduleResult = await MatchupService.generateSchedule(db, {
      leagueId,
      numberOfWeeks: newTotal,
      strategyType: league.schedulingStrategy ?? 'round-robin',
    });

    const newMatchups = scheduleResult.matchups.filter(
      (m) => m.weekNumber > highestWeek,
    );

    if (newMatchups.length === 0) {
      return { added: 0, removed: 0 };
    }

    const insertedMatchups = await db
      .insert(PublicSchema.matchups)
      .values(
        newMatchups.map((matchup) => ({
          leagueId,
          weekNumber: matchup.weekNumber,
          team1Id: matchup.team1Id,
          team2Id: matchup.team2Id,
          gamesPerMatchup,
          pitcherStartsPerMatchup,
          status: 'scheduled' as const,
          team1Score: null,
          team2Score: null,
          startTime: null,
          endTime: null,
        })),
      )
      .returning({
        id: PublicSchema.matchups.id,
        weekNumber: PublicSchema.matchups.weekNumber,
        team1Id: PublicSchema.matchups.team1Id,
        team2Id: PublicSchema.matchups.team2Id,
      });

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
      await db
        .delete(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
            inArray(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              removableWeeks,
            ),
          ),
        );

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
        throw AuthenticationError();
      }

      const leagueId = args.leagueId;

      // Verify user is commissioner, GM, or admin
      if (!context.user.isAdmin) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      // If matchups already exist (e.g. auto-created on draft completion),
      // return them instead of throwing — makes this mutation idempotent so
      // commissioners can safely call it even after the draft processor has
      // already created matchups (LS-2952).
      const existingMatchupsCheck = await context.db
        .select({ id: PublicSchema.matchups.id })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, leagueId))
        .limit(1);

      if (existingMatchupsCheck.length > 0) {
        // Fetch the league to check whether creation completed fully.
        // A fully-completed run sets both currentMatchup (FK to the active
        // matchup) and currentWeek. If BOTH are NULL the previous run was
        // aborted mid-way and the schedule is in partial-init state. Note:
        // currentMatchup alone can be NULL in a finished season (normal); the
        // partial-init guard therefore requires BOTH to be NULL.
        const [leagueRow] = await context.db
          .select({
            currentMatchup: PublicSchema.leagues.currentMatchup,
            currentWeek: PublicSchema.leagues.currentWeek,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (
          leagueRow?.currentMatchup == null &&
          leagueRow?.currentWeek == null
        ) {
          // Partial initialization: matchups were inserted (e.g. by the
          // commissioner-pick auto-creation path) but the final league-update
          // step never ran (e.g. because an exception was swallowed in the
          // try/catch around createAllMatchupsForLeague). The repair guard
          // requires BOTH fields to be NULL — currentMatchup alone can be NULL
          // in a finished season (autoAdvanceMatchups clears it after the final
          // week), so we must not mistake that for partial init.
          //
          // Additionally, guard against false-positive on a no-playoff completed
          // season where autoAdvanceMatchups also clears currentWeek (LS-3827).
          // In a finished season ALL matchups are 'completed'; in partial-init
          // they are 'scheduled' (game selection never ran); in a corrupted
          // in-progress league some are 'scheduled'/'in_progress'. Checking for
          // the absence of any active (scheduled/in_progress) matchup is the
          // tightest predicate: it only matches the all-completed finished state.
          const [activeMatchup] = await context.db
            .select({ id: PublicSchema.matchups.id })
            .from(PublicSchema.matchups)
            .where(
              and(
                eq(PublicSchema.matchups.leagueId, leagueId),
                inArray(PublicSchema.matchups.status, [
                  'scheduled',
                  'in_progress',
                ]),
              ),
            )
            .limit(1);

          if (!activeMatchup) {
            // No active matchups — all are completed.  This is a finished
            // no-playoff season (autoAdvanceMatchups cleared both pointers —
            // LS-3827). Skip repair; return existing matchups as-is.
            LOGGER.info(
              'createAllMatchups: all matchups completed and league pointers both NULL — finished season, skipping repair',
              { leagueId },
            );
            const allMatchups = await context.db
              .select()
              .from(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.leagueId, leagueId));
            return { matchups: allMatchups, currentMatchupId: null };
          }

          // Active matchups exist but both league pointers are NULL — this is
          // either a partial-init or a corrupted in-progress league. Proceed
          // with repair attempt (week-1 activation) and log a warning.
          LOGGER.warn(
            'createAllMatchups: matchups exist but league currentMatchup/currentWeek are both NULL — attempting repair',
            { leagueId, leagueRow },
          );

          // Step 1: locate week-1 matchup — order by id ascending for a stable,
          // deterministic result even if multiple week-1 rows exist.
          const [week1Matchup] = await context.db
            .select({ id: PublicSchema.matchups.id })
            .from(PublicSchema.matchups)
            .where(
              and(
                eq(PublicSchema.matchups.leagueId, leagueId),
                eq(PublicSchema.matchups.weekNumber, 1),
              ),
            )
            .orderBy(asc(PublicSchema.matchups.id))
            .limit(1);

          const repairedMatchupId = week1Matchup?.id ?? null;

          if (repairedMatchupId == null) {
            // Matchups exist but none are for week 1 — genuinely unexpected.
            LOGGER.error(
              'createAllMatchups: matchups exist but no week-1 matchup found — cannot repair',
              { leagueId },
            );
            throw new GraphQLError(
              'Matchup schedule is in an inconsistent state and could not be repaired automatically. Please contact support.',
              { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
            );
          }

          // Step 2: activate all week-1 matchups to in_progress.  If the
          // interrupted run failed before the activation step, matchups are
          // still 'scheduled' and autoAdvanceMatchups would skip them forever.
          const week1Rows = await context.db
            .select({ id: PublicSchema.matchups.id })
            .from(PublicSchema.matchups)
            .where(
              and(
                eq(PublicSchema.matchups.leagueId, leagueId),
                eq(PublicSchema.matchups.weekNumber, 1),
              ),
            );
          const week1Ids = week1Rows.map((m) => m.id);
          if (week1Ids.length > 0) {
            await context.db
              .update(PublicSchema.matchups)
              .set({ status: 'in_progress' })
              .where(inArray(PublicSchema.matchups.id, week1Ids));
          }

          // Step 3: update league row only when still in partial-init state —
          // conditional WHERE prevents clobbering a concurrent successful init.
          await context.db
            .update(PublicSchema.leagues)
            .set({
              currentMatchup: repairedMatchupId,
              currentWeek: 1,
              weekAdvanceStatus: 'idle',
            })
            .where(
              and(
                eq(PublicSchema.leagues.id, leagueId),
                and(
                  isNull(PublicSchema.leagues.currentMatchup),
                  isNull(PublicSchema.leagues.currentWeek),
                ),
              ),
            );

          LOGGER.info(
            'createAllMatchups: repaired partial initialization — league currentMatchup and currentWeek updated',
            { leagueId, repairedMatchupId, week1Ids },
          );

          const allMatchups = await context.db
            .select()
            .from(PublicSchema.matchups)
            .where(eq(PublicSchema.matchups.leagueId, leagueId));

          return {
            matchups: allMatchups,
            currentMatchupId: repairedMatchupId,
          };
        }

        LOGGER.info(
          'createAllMatchups: matchups already exist and league is fully initialized, returning existing matchups',
          { leagueId },
        );

        const allMatchups = await context.db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.leagueId, leagueId));

        return {
          matchups: allMatchups,
          currentMatchupId: leagueRow.currentMatchup,
        };
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

// Mutation: adminRegenerateLeagueSchedule
// Admin-only: deletes all future 'scheduled' matchups for a league and
// regenerates them using the current (correct) scheduling algorithm.
// Use this to fix leagues whose schedule was created with the old buggy
// algorithm (e.g. LS-2307: team plays another team 5x in a 10-week season).
builder.mutationField('adminRegenerateLeagueSchedule', (t) =>
  t.field({
    type: AdvanceLeagueWeekResponse,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      if (!context.user.isAdmin) {
        throw ForbiddenError('Admin access required');
      }

      const { leagueId } = args;

      // 1. Load league config
      const leagueResult = await context.db
        .select({
          totalMatchups: PublicSchema.leagues.totalMatchups,
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          pitcherStartsPerMatchup: PublicSchema.leagues.pitcherStartsPerMatchup,
          schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!leagueResult[0]) {
        throw new Error(`League ${leagueId} not found`);
      }

      const league = leagueResult[0];
      const totalMatchups = league.totalMatchups ?? 10;
      const gamesPerMatchup = league.gamesPerMatchup ?? 5;
      const pitcherStartsPerMatchup = league.pitcherStartsPerMatchup ?? 1;
      const strategyType = league.schedulingStrategy ?? 'round-robin';

      // 2. Find the last week that has already started or finished
      const activeMatchups = await context.db
        .select({ weekNumber: PublicSchema.matchups.weekNumber })
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, leagueId),
            inArray(PublicSchema.matchups.status, ['in_progress', 'completed']),
          ),
        );

      const lastActiveWeek = activeMatchups.reduce(
        (max, m) => Math.max(max, m.weekNumber ?? 0),
        0,
      );

      // 3. Delete future 'scheduled' matchups
      await context.db
        .delete(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, leagueId),
            eq(PublicSchema.matchups.status, 'scheduled'),
          ),
        );

      LOGGER.info(
        '[adminRegenerateLeagueSchedule] Deleted scheduled matchups',
        {
          leagueId,
          lastActiveWeek,
          totalMatchups,
        },
      );

      // 4. Regenerate future weeks only
      const futureWeeks = totalMatchups - lastActiveWeek;
      if (futureWeeks <= 0) {
        LOGGER.info(
          '[adminRegenerateLeagueSchedule] No future weeks to regenerate',
          {
            leagueId,
            lastActiveWeek,
            totalMatchups,
          },
        );
        const allMatchups = await context.db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.leagueId, leagueId));
        const inProgressMatchup = allMatchups.find(
          (m) => m.status === 'in_progress',
        );
        return {
          matchups: allMatchups,
          currentMatchupId: inProgressMatchup?.id ?? null,
        };
      }

      const scheduleResult = await MatchupService.generateSchedule(context.db, {
        leagueId,
        numberOfWeeks: futureWeeks,
        strategyType,
      });

      // 5. Insert new matchups with week numbers offset by lastActiveWeek
      const insertedMatchups: Array<{
        id: number;
        weekNumber: number;
        team1Id: number | null;
        team2Id: number | null;
      }> = [];

      for (const matchup of scheduleResult.matchups) {
        const result = await context.db
          .insert(PublicSchema.matchups)
          .values({
            leagueId,
            weekNumber: lastActiveWeek + matchup.weekNumber,
            team1Id: matchup.team1Id,
            team2Id: matchup.team2Id,
            gamesPerMatchup,
            pitcherStartsPerMatchup,
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

      // 6. Populate matchup_players for the new matchups
      await populateMatchupPlayersAndSeasons(
        context.db,
        leagueId,
        insertedMatchups,
        gamesPerMatchup,
      );

      LOGGER.info('[adminRegenerateLeagueSchedule] Regenerated schedule', {
        leagueId,
        lastActiveWeek,
        futureWeeks,
        inserted: insertedMatchups.length,
      });

      // 7. Return updated matchup list
      const allMatchups = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, leagueId));

      const inProgressMatchup = allMatchups.find(
        (m) => m.status === 'in_progress',
      );

      return {
        matchups: allMatchups,
        currentMatchupId: inProgressMatchup?.id ?? null,
      };
    },
  }),
);
