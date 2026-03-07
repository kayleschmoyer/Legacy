/**
 * Waivers domain — Mutation resolvers
 *
 * Mutations: cancelWaiverClaim, claimFreeAgent, processWaiverClaims
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import { ProcessWaiverClaimsResult, WaiverClaim } from './types';
import { validateFaabBudget } from './helpers';
import {
  checkRosterCapacity,
  isPlayerOnRoster,
} from '../../services/roster-service';
import { WaiverClaimProcessor } from '../../services/waiver-processor';
import { assertAuthorized } from '../matchups/scheduled-mutations';
import { builder } from '../builder';
import { insertActivityLog } from '../../services/activity-log';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

// ── Mutation resolvers ─────────────────────────────────────────────────────

// Cancel a pending waiver claim
builder.mutationField('cancelWaiverClaim', (t) =>
  t.field({
    type: WaiverClaim,
    args: {
      claimId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const db = context.db;
      const userId = context.user.id;

      // Fetch the claim and verify ownership
      const existing = await db
        .select()
        .from(PublicSchema.waiverClaims)
        .where(eq(PublicSchema.waiverClaims.id, args.claimId))
        .limit(1);

      if (existing.length === 0) {
        throw new Error('Waiver claim not found');
      }

      const claim = existing[0];

      if (claim.userId !== userId) {
        throw ForbiddenError('You can only cancel your own waiver claims');
      }

      if (claim.status !== 'pending') {
        throw new Error(
          `Cannot cancel a waiver claim with status "${claim.status}"`,
        );
      }

      // Atomically cancel only if still pending (prevents TOCTOU race
      // with the processor which may have set it to 'processing')
      const updated = await db
        .update(PublicSchema.waiverClaims)
        .set({
          status: 'cancelled',
          errorMessage: 'Cancelled by user',
          processedAt: new Date(),
        })
        .where(
          and(
            eq(PublicSchema.waiverClaims.id, args.claimId),
            eq(PublicSchema.waiverClaims.status, 'pending'),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new Error(
          'This claim is already being processed and can no longer be cancelled',
        );
      }

      LOGGER.info('Waiver claim cancelled by user', {
        claimId: args.claimId,
        userId,
        leagueId: claim.leagueId,
        playerId: claim.playerId,
      });

      void insertActivityLog(context, {
        leagueId: claim.leagueId,
        teamId: claim.teamId,
        actorUserId: userId,
        eventType: 'waiver_cancelled',
        payload: { claimId: args.claimId, playerId: claim.playerId },
      });

      return updated[0];
    },
  }),
);

// Create a pending waiver claim to be processed later (via cron or manual trigger).
builder.mutationField('claimFreeAgent', (t) =>
  t.field({
    type: WaiverClaim,
    args: {
      leagueId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
      dropPlayerId: t.arg.int({ required: false }),
      faabBid: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId, playerId, dropPlayerId, faabBid } = args;
      const userId = context.user.id;
      const db = context.db;

      // 1. Resolve the user's team in this league
      const membership = await db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0 || !membership[0].teamId) {
        throw ForbiddenError('You do not have a team in this league');
      }
      const teamId = membership[0].teamId;

      // 2. Check the player is not already on a team in this league
      if (await isPlayerOnRoster(db, leagueId, playerId)) {
        throw new Error('This player is already on a roster in this league');
      }

      // 3. Check for existing pending claim for this player in this league
      const existingClaim = await db
        .select({ id: PublicSchema.waiverClaims.id })
        .from(PublicSchema.waiverClaims)
        .where(
          and(
            eq(PublicSchema.waiverClaims.leagueId, leagueId),
            eq(PublicSchema.waiverClaims.playerId, playerId),
            eq(PublicSchema.waiverClaims.teamId, teamId),
            eq(PublicSchema.waiverClaims.status, 'pending'),
          ),
        )
        .limit(1);

      if (existingClaim.length > 0) {
        throw new Error('You already have a pending claim for this player');
      }

      // 4. If roster is full, verify a drop player was provided
      const leagueRow = await db
        .select({
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          waiverType: PublicSchema.leagues.waiverType,
          waiverEnabled: PublicSchema.leagues.waiverEnabled,
          salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
          minSalary: PublicSchema.leagues.minSalary,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (leagueRow.length === 0) {
        throw new Error('League not found');
      }

      if (!leagueRow[0].waiverEnabled) {
        throw new Error('Waivers are not enabled for this league');
      }

      // FAAB validation
      const leagueWaiverType = leagueRow[0].waiverType;
      let resolvedFaabBid: number | null = null;
      if (leagueWaiverType === 'faab') {
        if (faabBid == null || faabBid < 0) {
          throw new Error(
            'A FAAB bid amount is required for this league (must be >= 0)',
          );
        }
        // Validate FAAB budget (accounts for all committed pending bids)
        await validateFaabBudget(db, teamId, faabBid);
        resolvedFaabBid = faabBid;
      }

      // Salary cap minimum bid validation: in a salary-cap league the FAAB bid
      // must be >= the player's current_salary in player_salaries (or
      // leagues.min_salary if the player has never entered the salary system).
      if (
        leagueRow[0].salaryCapEnabled &&
        leagueWaiverType === 'faab' &&
        resolvedFaabBid != null
      ) {
        const salaryRow = await db
          .select({ currentSalary: PublicSchema.playerSalaries.currentSalary })
          .from(PublicSchema.playerSalaries)
          .where(
            and(
              eq(PublicSchema.playerSalaries.leagueId, leagueId),
              eq(PublicSchema.playerSalaries.playerId, playerId),
            ),
          )
          .limit(1);
        const minBid =
          salaryRow.length > 0
            ? salaryRow[0].currentSalary
            : leagueRow[0].minSalary;
        if (resolvedFaabBid < minBid) {
          throw new Error(`Minimum FAAB bid for this player is $${minBid}`);
        }
      }

      const { isFull: rosterFull } = await checkRosterCapacity(
        db,
        teamId,
        leagueId,
        leagueRow[0].maxRosterSize,
      );

      if (rosterFull && !dropPlayerId) {
        throw new Error(
          'Roster is full. You must drop a player to add a free agent.',
        );
      }

      // 5. If a drop player is specified, verify they're on the roster
      if (dropPlayerId) {
        const dropMember = await db
          .select({ id: PublicSchema.teamMembers.id })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.teamId, teamId),
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              eq(PublicSchema.teamMembers.playerId, dropPlayerId),
            ),
          )
          .limit(1);

        if (dropMember.length === 0) {
          throw new Error(
            'The player you are trying to drop is not on your roster',
          );
        }

        // Warn if another pending claim already intends to drop this player
        const conflictingDrop = await db
          .select({ id: PublicSchema.waiverClaims.id })
          .from(PublicSchema.waiverClaims)
          .where(
            and(
              eq(PublicSchema.waiverClaims.teamId, teamId),
              eq(PublicSchema.waiverClaims.dropPlayerId, dropPlayerId),
              eq(PublicSchema.waiverClaims.status, 'pending'),
            ),
          )
          .limit(1);

        if (conflictingDrop.length > 0) {
          throw new Error(
            'You already have a pending claim that drops this player. Cancel it first or choose a different player to drop.',
          );
        }
      }

      // 6. Insert the pending waiver claim
      const inserted = await db
        .insert(PublicSchema.waiverClaims)
        .values({
          leagueId,
          teamId,
          userId,
          playerId,
          dropPlayerId: dropPlayerId ?? null,
          faabBid: resolvedFaabBid,
          status: 'pending',
        })
        .returning();

      if (inserted.length === 0) {
        throw new Error('Failed to create waiver claim');
      }

      LOGGER.info('Waiver claim created', {
        claimId: inserted[0].id,
        leagueId,
        teamId,
        playerId,
        dropPlayerId: dropPlayerId ?? null,
        faabBid: resolvedFaabBid,
        userId,
      });

      void insertActivityLog(context, {
        leagueId,
        teamId,
        actorUserId: userId,
        eventType: 'waiver_claimed',
        payload: {
          claimId: inserted[0].id,
          playerId,
          dropPlayerId: dropPlayerId ?? null,
          faabBid: resolvedFaabBid,
        },
      });

      return inserted[0];
    },
  }),
);

// Process all pending waiver claims. Can be triggered from the UI or via
// EventBridge cron hitting the GraphQL endpoint.
//
// Auth: system API key (EventBridge) → all leagues,
//       admin → all leagues,
//       commissioner/owner → own league only (leagueId required).
builder.mutationField('processWaiverClaims', (t) =>
  t.field({
    type: ProcessWaiverClaimsResult,
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      await assertAuthorized(context, args.leagueId);

      const processor = new WaiverClaimProcessor(
        context.db,
        context.notificationService,
      );
      return processor.process({ leagueId: args.leagueId });
    },
  }),
);
