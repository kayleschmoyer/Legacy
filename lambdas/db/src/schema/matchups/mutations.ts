/**
 * Matchups domain — mutation fields
 */

import {
  createAllMatchupsForLeague,
  type FootballMatchupPlayerGameStats,
  type GenericDatabase,
  getMatchupFootballPlayerGameStats,
  populateMatchupPlayersAndSeasons,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  ALLOWED_POSITIONS_BY_SPORT,
  ENTITLEMENTS,
  optimizeLineup,
} from '@legacy-sports/utils';
import { and, asc, eq, inArray, isNull, not, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import {
  AdvanceLeagueWeekResponse,
  CreateMatchupInput,
  Matchup,
  MatchupPlayer,
  MatchupStatus,
} from './types';
import { getFootballPlayerSeasonAverage } from './football-season-projection';
import { getFootballScoringSettingsForLeague } from './football-scoring-settings';
import { computeFootballGamePoints } from './matchupScores';
import { builder, Context } from '../builder';
import {
  checkAdminInDb,
  requireAdmin,
  requireEntitlement,
  verifyCommissionerAccess,
  verifyLeagueMembership,
} from '../authorization';
import { MatchupService } from '../../services/matchup-service';
import { writeAuditLog } from '../commissioner-tools';
import {
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  MatchupLockedError,
  NotFoundError,
  UserInputError,
} from '../graphql-errors';

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
      if (!(await checkAdminInDb(context))) {
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

/**
 * Propagate a system-driven matchup score write over WebSocket (LS-6396).
 *
 * Previously the only WS signal for a score change was `MATCHUP_STATS_COMPLETE`,
 * fired once at batch completion — so a single-player stat correction (e.g. a
 * TD reversal re-scored outside the batch) left web clients showing the stale
 * score for up to 30+s until the next batch tick. Firing this on every
 * system-context `updateMatchupScore` write closes that gap. Exported
 * standalone (rather than inlined in the resolver) so the notification
 * gating can be unit-tested without the surrounding Pothos resolver plumbing.
 */
function parseMatchupScore(
  score: string | null,
  matchupId: number,
): number | null {
  if (score == null) {
    return null;
  }
  const parsed = Number(score);
  if (Number.isNaN(parsed)) {
    LOGGER.warn(
      'Encountered non-numeric matchup score string, sending null instead',
      { score, matchupId },
    );
    return null;
  }
  return parsed;
}

export async function publishMatchupScoreUpdated(
  context: Context,
  matchup: {
    id: number;
    leagueId: number;
    team1Score: string | null;
    team2Score: string | null;
  },
): Promise<void> {
  if (!context.isSystemRequest || !context.notificationService) {
    return;
  }

  try {
    await context.notificationService.notifyMatchupScoreUpdated(
      matchup.id,
      matchup.leagueId,
      parseMatchupScore(matchup.team1Score, matchup.id),
      parseMatchupScore(matchup.team2Score, matchup.id),
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    LOGGER.warn(
      'Failed to send matchup score updated WS notification (non-fatal)',
      error,
      { matchupId: matchup.id },
    );
  }
}

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
      if (!context.isSystemRequest && !(await checkAdminInDb(context))) {
        throw ForbiddenError(
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

      const matchup = results[0];

      await publishMatchupScoreUpdated(context, matchup);

      return matchup;
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
      if (!context.isSystemRequest && !(await checkAdminInDb(context))) {
        throw ForbiddenError(
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
 *
 * Exported (LS-5897) only so the `isCommissionerBypass`/audit-log behavior
 * can be exercised directly by `commissioner-bypass-audit.db.spec.ts` —
 * mirrors the existing `performMatchupPlayerPositionSwap` export in this
 * file. This function was module-private before LS-5897 with no callers
 * outside this file, so exporting it and adding `isCommissionerBypass` to
 * its return shape has no impact on existing consumers — there are none.
 */
export async function verifyMatchupTeamOwnership(
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
  /**
   * True when the caller does not own `matchupPlayer.teamId` and is only
   * permitted to edit it via the commissioner/GM/assistant_manager bypass
   * (LS-5897 / BMD-027). Callers use this to audit-log and notify the
   * affected team owner on writes that go through this path.
   */
  isCommissionerBypass: boolean;
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

  const isCommissionerBypass =
    isCommissioner && memberResult[0].teamId !== matchupPlayer.teamId;

  return { matchupPlayer, matchup, isCommissionerBypass };
}

/**
 * Audit-log and notify the affected team's GM when a commissioner/GM/
 * assistant_manager edits a roster slot on a team they don't own
 * (LS-5897 / BMD-027). Never throws — failures are logged and swallowed so
 * the underlying roster edit, which has already succeeded, is not rolled
 * back by a notification/audit failure.
 */
export async function auditAndNotifyCommissionerBypass(
  context: Context,
  params: {
    leagueId: number;
    targetTeamId: number;
    matchupPlayerId: number;
    playerId: number;
    before: { positionId: number | null };
    after: { positionId: number | null };
  },
): Promise<void> {
  if (!context.user) return;

  const { leagueId, targetTeamId, matchupPlayerId, playerId, before, after } =
    params;

  await writeAuditLog(context.db, {
    leagueId,
    userId: context.user.id,
    action: 'lineup_modified_by_admin',
    targetType: 'matchup_player',
    targetId: matchupPlayerId,
    details: { targetTeamId, playerId, before, after },
  });

  LOGGER.info('Commissioner bypass: modified roster slot on another team', {
    leagueId,
    targetTeamId,
    matchupPlayerId,
    playerId,
    commissionerId: context.user.id,
  });

  if (!context.notificationPublisher) return;

  try {
    const owners = await context.db
      .select({ userId: PublicSchema.leagueMembers.userId })
      .from(PublicSchema.leagueMembers)
      .where(
        and(
          eq(PublicSchema.leagueMembers.leagueId, leagueId),
          eq(PublicSchema.leagueMembers.teamId, targetTeamId),
          eq(PublicSchema.leagueMembers.permissionLevel, 'general_manager'),
        ),
      );

    const ownerUserIds = owners
      .map((o) => o.userId)
      .filter((userId) => userId !== context.user?.id);

    if (ownerUserIds.length > 0) {
      await context.notificationPublisher.publishToMany(ownerUserIds, {
        notificationType: 'LINEUP_MODIFIED_BY_ADMIN',
        title: 'Roster Edited by League Manager',
        body: 'A league manager modified your roster.',
        data: { leagueId, targetTeamId, matchupPlayerId, playerId },
      });
    }
  } catch (pushErr) {
    const error =
      pushErr instanceof Error ? pushErr : new Error(String(pushErr));
    LOGGER.warn(
      'Failed to send commissioner-bypass roster edit notification (non-fatal)',
      error,
      { leagueId, targetTeamId, matchupPlayerId },
    );
  }
}

/**
 * Atomically evict any existing occupant of `positionId` and assign it to
 * `matchupPlayerId`, so a slot can never end up with two occupants.
 *
 * Runs the eviction and the assignment inside a single transaction — two
 * concurrent calls targeting the same slot used to run as two independent,
 * unsynchronized statements each, which let both callers evict each other's
 * write and then both succeed in claiming the slot (LS-6377). Wrapping both
 * statements in one transaction, combined with the partial unique index
 * `matchup_players_unique_slot_idx` (LS-8412), guarantees that at most one of
 * two racing transactions can commit; the loser surfaces as a unique
 * constraint violation that the caller translates into a `ConflictError`.
 *
 * The same transaction also takes `SELECT ... FOR UPDATE` on the matchup row
 * and re-checks `status === 'scheduled'` before writing, so a concurrent
 * `updateMatchupStatus` (which locks the same row) either serializes behind
 * this edit or is observed here and the edit is rejected — a status flip
 * landing between the caller's read and this write can no longer let an edit
 * persist after lock (LS-6371 / FMD-014).
 *
 * Exported standalone (rather than inlined in the resolver) so it can be
 * exercised directly against a real Postgres instance in integration tests.
 */
export async function performMatchupPlayerPositionUpdate(
  db: GenericDatabase<typeof PublicSchema>,
  params: {
    matchupId: number;
    teamId: number;
    matchupPlayerId: number;
    positionId: number | null;
  },
): Promise<{
  id: number;
  matchupId: number;
  playerId: number;
  teamId: number;
  positionId: number | null;
}> {
  const { matchupId, teamId, matchupPlayerId, positionId } = params;

  return db.transaction(async (tx) => {
    // Surface lock waits as errors rather than silent hangs.
    await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

    const [lockedMatchup] = await tx
      .select({ status: PublicSchema.matchups.status })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, matchupId))
      .limit(1)
      .for('update');

    if (!lockedMatchup) {
      throw NotFoundError('Matchup not found');
    }

    // Only allow edits when matchup is scheduled (not yet locked)
    if (lockedMatchup.status !== 'scheduled') {
      throw MatchupLockedError(lockedMatchup.status);
    }

    // If assigning to a slot, evict any existing occupant first so only one
    // player can occupy a given slot at a time.
    if (positionId != null) {
      await tx
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: null })
        .where(
          and(
            eq(PublicSchema.matchupPlayers.matchupId, matchupId),
            eq(PublicSchema.matchupPlayers.teamId, teamId),
            eq(PublicSchema.matchupPlayers.positionId, positionId),
            not(eq(PublicSchema.matchupPlayers.id, matchupPlayerId)),
          ),
        );
    }

    // Update the position and mark as manually edited to protect from
    // future roster-tab propagation overwriting this intentional choice.
    const updated = await tx
      .update(PublicSchema.matchupPlayers)
      .set({ positionId: positionId ?? null, manuallyEdited: true })
      .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerId))
      .returning({
        id: PublicSchema.matchupPlayers.id,
        matchupId: PublicSchema.matchupPlayers.matchupId,
        playerId: PublicSchema.matchupPlayers.playerId,
        teamId: PublicSchema.matchupPlayers.teamId,
        positionId: PublicSchema.matchupPlayers.positionId,
      });

    if (updated.length === 0) {
      throw NotFoundError(
        `Failed to update matchup player position: matchup player ${matchupPlayerId} no longer exists`,
      );
    }

    return updated[0];
  });
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
      const { matchup, matchupPlayer, isCommissionerBypass } =
        await verifyMatchupTeamOwnership(context, args.matchupPlayerId);

      const db = context.db;

      // Fetch the target player to find their matchup+team context. The
      // authoritative matchup-status recheck happens inside
      // performMatchupPlayerPositionUpdate's transaction, under a row lock
      // (LS-6371) — not here, since this read isn't synchronized with a
      // concurrent updateMatchupStatus.
      const [targetPlayer] = await db
        .select({
          matchupId: PublicSchema.matchupPlayers.matchupId,
          teamId: PublicSchema.matchupPlayers.teamId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(eq(PublicSchema.matchupPlayers.id, args.matchupPlayerId))
        .limit(1);

      if (!targetPlayer) {
        throw NotFoundError('Matchup player not found');
      }

      let updated: {
        id: number;
        matchupId: number;
        playerId: number;
        teamId: number;
        positionId: number | null;
      };
      try {
        updated = await performMatchupPlayerPositionUpdate(db, {
          matchupId: targetPlayer.matchupId,
          teamId: targetPlayer.teamId,
          matchupPlayerId: args.matchupPlayerId,
          positionId: args.positionId ?? null,
        });
      } catch (error: unknown) {
        // drizzle-orm wraps the raw pg driver error in a DrizzleQueryError,
        // moving the Postgres error code/constraint onto `.cause` instead of
        // the top-level error — check both so this works regardless of
        // whether the driver error arrives wrapped or bare.
        const errorCause = (error as { cause?: unknown } | undefined)?.cause;
        const cause = errorCause ?? error;
        const pgError = cause as { code?: string; constraint?: string };
        if (
          pgError.code === '23505' &&
          pgError.constraint === 'matchup_players_unique_slot_idx'
        ) {
          throw ConflictError(
            'That slot was just filled by another update. Please refresh and try again.',
          );
        }
        throw error;
      }

      if (isCommissionerBypass) {
        await auditAndNotifyCommissionerBypass(context, {
          leagueId: matchup.leagueId,
          targetTeamId: matchupPlayer.teamId,
          matchupPlayerId: updated.id,
          playerId: updated.playerId,
          before: { positionId: matchupPlayer.positionId },
          after: { positionId: updated.positionId ?? null },
        });
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
            eq(PublicSchema.leagueWeekPlayerSeasons.playerId, updated.playerId),
          ),
        )
        .limit(1);

      return {
        ...updated,
        positionId: updated.positionId ?? null,
        season: seasonsResult[0]?.season ?? null,
      };
    },
  }),
);

/**
 * Atomically swap two matchup players' positions within the same matchup.
 *
 * Clears both rows first, then evicts any third row that may still hold one
 * of the target slots (e.g. left behind by a concurrent roster-tab sync)
 * before assigning the new positions — otherwise the assignment can collide
 * with the `matchup_players_unique_slot_idx` partial unique index (LS-8412).
 *
 * Exported standalone (rather than inlined in the resolver) so it can be
 * exercised directly against a real Postgres instance in integration tests.
 */
export async function performMatchupPlayerPositionSwap(
  db: GenericDatabase<typeof PublicSchema>,
  params: {
    matchupIdA: number;
    teamIdA: number;
    matchupPlayerIdA: number;
    positionIdA: number | null;
    matchupIdB: number;
    teamIdB: number;
    matchupPlayerIdB: number;
    positionIdB: number | null;
  },
): Promise<
  Array<{
    id: number;
    matchupId: number;
    playerId: number;
    teamId: number;
    positionId: number | null;
  }>
> {
  const {
    matchupIdA,
    teamIdA,
    matchupPlayerIdA,
    positionIdA,
    matchupIdB,
    teamIdB,
    matchupPlayerIdB,
    positionIdB,
  } = params;

  return db.transaction(async (tx) => {
    // Surface lock waits as errors rather than silent hangs.
    await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

    // Re-lock and re-check the matchup status inside the transaction so a
    // concurrent updateMatchupStatus (which also locks the row) serializes
    // against us — otherwise a status flip landing between the resolver's
    // ownership check and this write lets a post-lock swap persist
    // (LS-6371 / FMD-014). Both players are already verified to share the
    // same matchup, so a single lock covers the pair.
    const [lockedMatchup] = await tx
      .select({ status: PublicSchema.matchups.status })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, matchupIdA))
      .limit(1)
      .for('update');

    if (!lockedMatchup) {
      throw NotFoundError('Matchup not found');
    }
    if (lockedMatchup.status !== 'scheduled') {
      throw MatchupLockedError(lockedMatchup.status);
    }

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

    // A third row (e.g. from a concurrent roster-tab sync) may still hold
    // one of the target slots even though it isn't part of this swap —
    // evict it first so the assignments below can't collide with
    // matchup_players_unique_slot_idx (LS-8412).
    if (positionIdA != null) {
      await tx
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: null })
        .where(
          and(
            eq(PublicSchema.matchupPlayers.matchupId, matchupIdA),
            eq(PublicSchema.matchupPlayers.teamId, teamIdA),
            eq(PublicSchema.matchupPlayers.positionId, positionIdA),
            not(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdA)),
            not(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdB)),
          ),
        );
    }
    if (positionIdB != null) {
      await tx
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: null })
        .where(
          and(
            eq(PublicSchema.matchupPlayers.matchupId, matchupIdB),
            eq(PublicSchema.matchupPlayers.teamId, teamIdB),
            eq(PublicSchema.matchupPlayers.positionId, positionIdB),
            not(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdA)),
            not(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdB)),
          ),
        );
    }

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
      throw NotFoundError(
        `Failed to swap matchup player positions: matchup player ${
          updatedA.length === 0 ? matchupPlayerIdA : matchupPlayerIdB
        } no longer exists`,
      );
    }

    return [updatedA[0], updatedB[0]];
  });
}

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
      const {
        matchup: matchupA,
        matchupPlayer: playerA,
        isCommissionerBypass: isBypassA,
      } = await verifyMatchupTeamOwnership(context, matchupPlayerIdA);
      const {
        matchup: matchupB,
        matchupPlayer: playerB,
        isCommissionerBypass: isBypassB,
      } = await verifyMatchupTeamOwnership(context, matchupPlayerIdB);

      if (matchupA.id !== matchupB.id) {
        throw UserInputError('Both players must be in the same matchup');
      }

      // Fast-fail path only — performMatchupPlayerPositionSwap re-checks
      // status under a row lock inside its transaction and is the
      // authoritative guard, so this uses the same MatchupLockedError type
      // for a consistent API contract (LS-6371 review).
      if (matchupA.status !== 'scheduled') {
        throw MatchupLockedError(matchupA.status);
      }

      const db = context.db;

      const results = await performMatchupPlayerPositionSwap(db, {
        matchupIdA: matchupA.id,
        teamIdA: playerA.teamId,
        matchupPlayerIdA,
        positionIdA: positionIdA ?? null,
        matchupIdB: matchupB.id,
        teamIdB: playerB.teamId,
        matchupPlayerIdB,
        positionIdB: positionIdB ?? null,
      });

      if (isBypassA) {
        await auditAndNotifyCommissionerBypass(context, {
          leagueId: matchupA.leagueId,
          targetTeamId: playerA.teamId,
          matchupPlayerId: results[0].id,
          playerId: results[0].playerId,
          before: { positionId: playerA.positionId },
          after: { positionId: results[0].positionId ?? null },
        });
      }
      if (isBypassB) {
        await auditAndNotifyCommissionerBypass(context, {
          leagueId: matchupB.leagueId,
          targetTeamId: playerB.teamId,
          matchupPlayerId: results[1].id,
          playerId: results[1].playerId,
          before: { positionId: playerB.positionId },
          after: { positionId: results[1].positionId ?? null },
        });
      }

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

/**
 * Determine each rostered player's projected fantasy points for the matchup
 * week: actual points if any of their games this week have already been
 * scored, otherwise their season-average points per game (LS-6364 model).
 * Mirrors `resolveFootballMatchupScores`'s per-player projection, but for
 * every rostered player on the team (bench included), keyed by the player's
 * real position rather than their current (possibly bench/FLEX) slot — the
 * lineup optimizer needs a position-accurate score to compare players who
 * aren't currently starting.
 */
async function getFootballProjectedPointsByPlayerId(
  context: Context,
  matchupId: number,
  leagueId: number,
  weekNumber: number,
  roster: Array<{ id: number; playerId: number }>,
): Promise<Map<number, number>> {
  const db = context.db;
  const playerIds = roster.map((r) => r.playerId);

  const [playerDetailRows, seasonRows, gameStats, scoringSettings] =
    await Promise.all([
      db
        .select({
          id: PublicSchema.players.id,
          position: PublicSchema.players.position,
          isDst: PublicSchema.players.isDst,
        })
        .from(PublicSchema.players)
        .where(inArray(PublicSchema.players.id, playerIds)),
      db
        .select({
          playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
            eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
            inArray(PublicSchema.leagueWeekPlayerSeasons.playerId, playerIds),
          ),
        ),
      getMatchupFootballPlayerGameStats(db, matchupId),
      getFootballScoringSettingsForLeague(db, leagueId),
    ]);

  const playerDetailMap = new Map(playerDetailRows.map((p) => [p.id, p]));
  const seasonMap = new Map(seasonRows.map((s) => [s.playerId, s.season]));

  const gameStatsByMatchupPlayerId = new Map<
    number,
    FootballMatchupPlayerGameStats[]
  >();
  for (const stat of gameStats) {
    const list = gameStatsByMatchupPlayerId.get(stat.matchupPlayerId) ?? [];
    list.push(stat);
    gameStatsByMatchupPlayerId.set(stat.matchupPlayerId, list);
  }

  const projectedPointsByPlayerId = new Map<number, number>();

  await Promise.all(
    roster.map(async (row) => {
      const detail = playerDetailMap.get(row.playerId);
      const season = seasonMap.get(row.playerId);
      if (!detail || season == null) {
        projectedPointsByPlayerId.set(row.playerId, 0);
        return;
      }

      const posType = detail.position ?? '';
      // No 'DP' variant here (unlike matchupScores.ts's slot-based posType
      // check) — `players.position` is the strict playerPosition enum, whose
      // IDP values are only 'DL' | 'LB' | 'DB'.
      const isIdp = posType === 'DL' || posType === 'LB' || posType === 'DB';

      const played = gameStatsByMatchupPlayerId.get(row.id) ?? [];
      if (played.length > 0) {
        const total = played.reduce(
          (sum, g) =>
            sum +
            computeFootballGamePoints(
              g,
              detail.isDst,
              isIdp,
              scoringSettings,
              posType,
            ),
          0,
        );
        projectedPointsByPlayerId.set(row.playerId, total);
        return;
      }

      const average = await getFootballPlayerSeasonAverage(
        db,
        row.playerId,
        season,
        detail.isDst,
        isIdp,
        scoringSettings,
        posType,
      );
      projectedPointsByPlayerId.set(row.playerId, average);
    }),
  );

  return projectedPointsByPlayerId;
}

/**
 * Solves the assignment problem for a team's roster (via `optimizeLineup`)
 * and applies the result: clears every current slot first, then assigns the
 * new positions, mirroring `performMatchupPlayerPositionSwap`'s
 * clear-then-assign pattern so the bulk reassignment can never collide with
 * `matchup_players_unique_slot_idx`.
 *
 * Exported standalone (rather than inlined in the resolver) so the
 * assignment + write behavior can be exercised directly against a real
 * Postgres instance in integration tests, mirroring the existing
 * `performMatchupPlayerPositionSwap` precedent in this file.
 */
export async function computeAndApplyOptimalLineup(
  db: GenericDatabase<typeof PublicSchema>,
  params: {
    roster: Array<{ id: number; playerId: number }>;
    leaguePositions: Array<{ id: number; positionType: string }>;
    optimizerPlayers: Array<{
      id: number;
      points: number;
      eligibleStatPositions: readonly string[];
    }>;
  },
): Promise<
  Array<{
    id: number;
    matchupId: number;
    playerId: number;
    teamId: number;
    positionId: number | null;
  }>
> {
  const { roster, leaguePositions, optimizerPlayers } = params;

  const assignment = optimizeLineup(
    optimizerPlayers,
    leaguePositions,
    ALLOWED_POSITIONS_BY_SPORT.football,
  );
  const slotIdByPlayerId = new Map(
    assignment.map((a) => [a.playerId, a.slotId]),
  );

  const matchupPlayerIds = roster.map((r) => r.id);

  return db.transaction(async (tx) => {
    await tx
      .update(PublicSchema.matchupPlayers)
      .set({ positionId: null })
      .where(inArray(PublicSchema.matchupPlayers.id, matchupPlayerIds));

    const rows: Array<{
      id: number;
      matchupId: number;
      playerId: number;
      teamId: number;
      positionId: number | null;
    }> = [];

    for (const row of roster) {
      const newPositionId = slotIdByPlayerId.get(row.playerId) ?? null;
      const [result] = await tx
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: newPositionId, manuallyEdited: true })
        .where(eq(PublicSchema.matchupPlayers.id, row.id))
        .returning({
          id: PublicSchema.matchupPlayers.id,
          matchupId: PublicSchema.matchupPlayers.matchupId,
          playerId: PublicSchema.matchupPlayers.playerId,
          teamId: PublicSchema.matchupPlayers.teamId,
          positionId: PublicSchema.matchupPlayers.positionId,
        });
      if (result) rows.push(result);
    }
    return rows;
  });
}

// Mutation: setOptimalLineup
//
// Premium one-click lineup optimizer (LS-6378 / FMD-021): sets a football
// team's starting lineup to the combination of rostered players that
// maximizes total projected points for the week, respecting each slot's
// position eligibility. Solves the assignment problem exactly via
// `optimizeLineup` (Hungarian algorithm, @legacy-sports/utils) rather than a
// greedy fill.
//
// Football-only for now — baseball fantasy scoring depends on a much larger
// stat/scoring-settings surface (batting/pitching/fielding across a
// multi-game matchup) that this ticket does not cover; the ticket itself
// (FMD-021) is scoped to the Football Matchup Detail page.
builder.mutationField('setOptimalLineup', (t) =>
  t.field({
    type: [MatchupPlayer],
    description:
      'Premium (LS-6378): sets a football team’s starting lineup to the combination of rostered players that maximizes total projected points for the matchup week, respecting each starting slot’s position eligibility. Requires ENTITLEMENTS.optimal_lineup and team ownership; only available while the matchup is scheduled.',
    args: {
      matchupId: t.arg.int({ required: true }),
      teamId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const db = context.db;

      const [matchup] = await db
        .select({
          id: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          weekNumber: PublicSchema.matchups.weekNumber,
          status: PublicSchema.matchups.status,
          team1Id: PublicSchema.matchups.team1Id,
          team2Id: PublicSchema.matchups.team2Id,
        })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .limit(1);

      if (!matchup) {
        throw NotFoundError('Matchup not found');
      }

      if (args.teamId !== matchup.team1Id && args.teamId !== matchup.team2Id) {
        throw UserInputError('Team is not part of this matchup');
      }

      const membership = await verifyLeagueMembership(
        db,
        matchup.leagueId,
        context.user.id,
      );

      // Self-service only for now (LS-6378): a team's owner optimizes their
      // own lineup. Unlike the swap/move mutations, there is no
      // commissioner/GM bypass here — the ticket scopes this to the
      // premium-gated one-click action a team owner takes on their own
      // roster, not a league-management tool.
      if (membership.teamId !== args.teamId) {
        throw ForbiddenError('You can only optimize your own team roster');
      }

      await requireEntitlement(context, ENTITLEMENTS.optimal_lineup);

      if (matchup.status !== 'scheduled') {
        throw MatchupLockedError(matchup.status);
      }

      const [league] = await db
        .select({ sport: PublicSchema.leagues.sport })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, matchup.leagueId))
        .limit(1);

      if (league?.sport !== 'football') {
        throw UserInputError(
          'Optimize My Lineup is currently available for football leagues only',
        );
      }

      const leaguePositions = await db
        .select({
          id: PublicSchema.leaguePosition.id,
          positionType: PublicSchema.leaguePosition.positionType,
        })
        .from(PublicSchema.leaguePosition)
        .where(eq(PublicSchema.leaguePosition.leagueId, matchup.leagueId));

      const rosterRows = await db
        .select({
          id: PublicSchema.matchupPlayers.id,
          playerId: PublicSchema.matchupPlayers.playerId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(
          and(
            eq(PublicSchema.matchupPlayers.matchupId, args.matchupId),
            eq(PublicSchema.matchupPlayers.teamId, args.teamId),
          ),
        );

      if (rosterRows.length === 0) {
        return [];
      }

      const playerIds = rosterRows.map((r) => r.playerId);

      const [projectedPointsByPlayerId, eligibilityRows, seasonRows] =
        await Promise.all([
          getFootballProjectedPointsByPlayerId(
            context,
            args.matchupId,
            matchup.leagueId,
            matchup.weekNumber,
            rosterRows,
          ),
          db
            .select({
              playerId: PublicSchema.footballPlayerEligiblePositions.playerId,
              position: PublicSchema.footballPlayerEligiblePositions.position,
            })
            .from(PublicSchema.footballPlayerEligiblePositions)
            .where(
              inArray(
                PublicSchema.footballPlayerEligiblePositions.playerId,
                playerIds,
              ),
            ),
          db
            .select({
              playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
              season: PublicSchema.leagueWeekPlayerSeasons.season,
            })
            .from(PublicSchema.leagueWeekPlayerSeasons)
            .where(
              and(
                eq(
                  PublicSchema.leagueWeekPlayerSeasons.leagueId,
                  matchup.leagueId,
                ),
                eq(
                  PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                  matchup.weekNumber,
                ),
                inArray(
                  PublicSchema.leagueWeekPlayerSeasons.playerId,
                  playerIds,
                ),
              ),
            ),
        ]);

      const eligiblePositionsByPlayer = new Map<number, string[]>();
      for (const row of eligibilityRows) {
        const positions = eligiblePositionsByPlayer.get(row.playerId) ?? [];
        positions.push(row.position);
        eligiblePositionsByPlayer.set(row.playerId, positions);
      }

      const seasonMap = new Map(seasonRows.map((s) => [s.playerId, s.season]));

      const optimizerPlayers = rosterRows.map((row) => ({
        id: row.playerId,
        points: projectedPointsByPlayerId.get(row.playerId) ?? 0,
        eligibleStatPositions:
          eligiblePositionsByPlayer.get(row.playerId) ?? [],
      }));

      const updated = await computeAndApplyOptimalLineup(db, {
        roster: rosterRows,
        leaguePositions,
        optimizerPlayers,
      });

      return updated.map((r) => ({
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
      if (!(await checkAdminInDb(context))) {
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
      await requireAdmin(context);

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
