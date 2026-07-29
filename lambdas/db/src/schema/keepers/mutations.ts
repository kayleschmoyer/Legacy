/**
 * Keeper designations domain — Mutation resolvers (LS-8673)
 *
 * Mutations: designateKeeper, undesignateKeeper
 */
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';
import {
  countCountedKeeperDesignations,
  getConsecutiveKeepStreak,
  isDraftLive,
  isRookiePlayer,
  resolveTeamIdForUser,
} from './helpers';
import { KeeperDesignation } from './types';
import { builder } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';

type KeeperDesignationRow = typeof PublicSchema.keeperDesignations.$inferSelect;

/** Loads the league + validates it is a keeper league with a live-draft
 *  check, shared by both designateKeeper and undesignateKeeper. */
async function loadKeeperLeagueOrThrow(db: PublicDb, leagueId: number) {
  const [league] = await db
    .select({
      rosterContinuity: PublicSchema.leagues.rosterContinuity,
      keeperSettings: PublicSchema.leagues.keeperSettings,
      seasonNumber: PublicSchema.leagues.seasonNumber,
      draftStatus: PublicSchema.leagues.draftStatus,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  if (!league) {
    throw UserInputError('League not found');
  }
  if (league.rosterContinuity !== 'keeper' || !league.keeperSettings) {
    throw UserInputError('This league does not have keeper mode enabled');
  }
  if (isDraftLive(league.draftStatus)) {
    throw UserInputError(
      'Keeper designations are locked once the draft has started',
    );
  }

  return {
    keeperSettings: league.keeperSettings,
    season: league.seasonNumber ?? 1,
  };
}

export interface DesignateKeeperParams {
  leagueId: number;
  playerId: number;
  userId: number;
}

/**
 * Core designateKeeper logic, exported standalone (mirrors
 * validateKeeperConfig, LS-8671) so eligibility/limit/lock enforcement can be
 * exercised directly against a test database without going through the
 * GraphQL layer.
 */
export async function designateKeeper(
  db: PublicDb,
  params: DesignateKeeperParams,
): Promise<KeeperDesignationRow> {
  const { leagueId, playerId, userId } = params;

  const teamId = await resolveTeamIdForUser(db, leagueId, userId);
  if (!teamId) {
    throw ForbiddenError('You do not have a team in this league');
  }

  const { keeperSettings, season } = await loadKeeperLeagueOrThrow(
    db,
    leagueId,
  );

  // Player must currently be on the caller's roster.
  const [rosterSlot] = await db
    .select({
      totalGames: PublicSchema.players.totalGames,
    })
    .from(PublicSchema.teamMembers)
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.players.id, PublicSchema.teamMembers.playerId),
    )
    .where(
      and(
        eq(PublicSchema.teamMembers.leagueId, leagueId),
        eq(PublicSchema.teamMembers.teamId, teamId),
        eq(PublicSchema.teamMembers.playerId, playerId),
      ),
    )
    .limit(1);

  if (!rosterSlot) {
    throw UserInputError('This player is not on your roster');
  }

  // A unique constraint on (league, team, player, season) means a released
  // designation must be reused (updated back to 'pending') rather than
  // re-inserted — a manager can change their mind more than once pre-draft.
  const [existing] = await db
    .select({
      id: PublicSchema.keeperDesignations.id,
      status: PublicSchema.keeperDesignations.status,
    })
    .from(PublicSchema.keeperDesignations)
    .where(
      and(
        eq(PublicSchema.keeperDesignations.leagueId, leagueId),
        eq(PublicSchema.keeperDesignations.teamId, teamId),
        eq(PublicSchema.keeperDesignations.playerId, playerId),
        eq(PublicSchema.keeperDesignations.season, season),
      ),
    )
    .limit(1);
  if (existing && existing.status !== 'released') {
    throw UserInputError('This player is already designated as a keeper');
  }

  const rookieExempt = keeperSettings.rookieExempt;
  const exempt = rookieExempt && isRookiePlayer(rosterSlot.totalGames);

  if (!exempt) {
    const countedCount = await countCountedKeeperDesignations(db, {
      leagueId,
      teamId,
      season,
      rookieExempt,
    });
    if (countedCount >= keeperSettings.keeperCount) {
      throw UserInputError(
        `Keeper limit reached (${keeperSettings.keeperCount}). Undesignate a player before adding another.`,
      );
    }

    if (keeperSettings.maxConsecutiveKeeps != null) {
      const streak = await getConsecutiveKeepStreak(db, {
        leagueId,
        userId,
        playerId,
        stopAt: keeperSettings.maxConsecutiveKeeps,
      });
      if (streak >= keeperSettings.maxConsecutiveKeeps) {
        throw UserInputError(
          `This player has already been kept for the maximum ${keeperSettings.maxConsecutiveKeeps} consecutive season(s) allowed`,
        );
      }
    }
  }

  const [inserted] = existing
    ? await db
        .update(PublicSchema.keeperDesignations)
        .set({ status: 'pending' })
        .where(eq(PublicSchema.keeperDesignations.id, existing.id))
        .returning()
    : await db
        .insert(PublicSchema.keeperDesignations)
        .values({
          leagueId,
          teamId,
          playerId,
          season,
          status: 'pending',
        })
        .returning();

  if (!inserted) {
    throw new Error('Failed to create keeper designation');
  }

  LOGGER.info('Keeper designated', {
    designationId: inserted.id,
    leagueId,
    teamId,
    playerId,
    season,
  });

  return inserted;
}

export interface UndesignateKeeperParams {
  leagueId: number;
  playerId: number;
  userId: number;
}

/** Core undesignateKeeper logic, exported standalone — see designateKeeper. */
export async function undesignateKeeper(
  db: PublicDb,
  params: UndesignateKeeperParams,
): Promise<KeeperDesignationRow> {
  const { leagueId, playerId, userId } = params;

  const teamId = await resolveTeamIdForUser(db, leagueId, userId);
  if (!teamId) {
    throw ForbiddenError('You do not have a team in this league');
  }

  const { season } = await loadKeeperLeagueOrThrow(db, leagueId);

  // Atomic conditional update guards against a race with a lock transition
  // between the loadKeeperLeagueOrThrow check above and this write,
  // mirroring cancelWaiverClaim's pending-only guard.
  const [updated] = await db
    .update(PublicSchema.keeperDesignations)
    .set({ status: 'released' })
    .where(
      and(
        eq(PublicSchema.keeperDesignations.leagueId, leagueId),
        eq(PublicSchema.keeperDesignations.teamId, teamId),
        eq(PublicSchema.keeperDesignations.playerId, playerId),
        eq(PublicSchema.keeperDesignations.season, season),
        eq(PublicSchema.keeperDesignations.status, 'pending'),
      ),
    )
    .returning();

  if (!updated) {
    throw UserInputError('No pending keeper designation found for this player');
  }

  LOGGER.info('Keeper undesignated', {
    designationId: updated.id,
    leagueId,
    teamId,
    playerId,
  });

  return updated;
}

builder.mutationField('designateKeeper', (t) =>
  t.field({
    type: KeeperDesignation,
    description:
      'Designate a roster player as a keeper for the upcoming draft. ' +
      'Enforces keeperCount, maxConsecutiveKeeps, and rookieExempt; ' +
      'rejected once the draft is live. (LS-8673)',
    args: {
      leagueId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return designateKeeper(context.db, {
        leagueId: args.leagueId,
        playerId: args.playerId,
        userId: context.user.id,
      });
    },
  }),
);

builder.mutationField('undesignateKeeper', (t) =>
  t.field({
    type: KeeperDesignation,
    description:
      'Withdraw a pending keeper designation before the draft goes live. (LS-8673)',
    args: {
      leagueId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return undesignateKeeper(context.db, {
        leagueId: args.leagueId,
        playerId: args.playerId,
        userId: context.user.id,
      });
    },
  }),
);
