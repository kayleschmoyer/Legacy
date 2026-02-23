/**
 * Waivers domain — Mutation resolvers
 *
 * Mutations: cancelWaiverClaim, claimFreeAgent, processWaiverClaims
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, sql } from 'drizzle-orm';

import { ProcessWaiverClaimsResult, WaiverClaim } from './types';
import { WaiverClaimProcessor } from '../../services/waiver-processor';
import { builder } from '../builder';

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
        throw new Error('Authentication required');
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
        throw new Error('You can only cancel your own waiver claims');
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
        throw new Error('Authentication required');
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
        throw new Error('You do not have a team in this league');
      }
      const teamId = membership[0].teamId;

      // 2. Check the player is not already on a team in this league
      const alreadyTaken = await db
        .select({ id: PublicSchema.teamMembers.id })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            eq(PublicSchema.teamMembers.playerId, playerId),
          ),
        )
        .limit(1);

      if (alreadyTaken.length > 0) {
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
        // Check team's remaining FAAB budget
        const teamRow = await db
          .select({ faabBudget: PublicSchema.teams.faabBudget })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, teamId))
          .limit(1);

        const remainingBudget = teamRow[0]?.faabBudget ?? 0;

        // Calculate already-committed bids (pending claims)
        const committedBids = await db
          .select({ total: sql<number>`COALESCE(SUM(faab_bid), 0)` })
          .from(PublicSchema.waiverClaims)
          .where(
            and(
              eq(PublicSchema.waiverClaims.teamId, teamId),
              eq(PublicSchema.waiverClaims.status, 'pending'),
            ),
          );
        const alreadyCommitted = Number(committedBids[0]?.total ?? 0);

        if (faabBid > remainingBudget - alreadyCommitted) {
          throw new Error(
            `Insufficient FAAB budget. You have $${remainingBudget - alreadyCommitted} available (total: $${remainingBudget}, committed: $${alreadyCommitted}).`,
          );
        }
        resolvedFaabBid = faabBid;
      }

      const rosterCount = await db
        .select({ total: count() })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, teamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        );

      const currentSize = rosterCount[0]?.total ?? 0;

      if (currentSize >= leagueRow[0].maxRosterSize && !dropPlayerId) {
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

      return inserted[0];
    },
  }),
);

// Process all pending waiver claims. Can be triggered from the UI or via
// EventBridge cron hitting the GraphQL endpoint.
builder.mutationField('processWaiverClaims', (t) =>
  t.field({
    type: ProcessWaiverClaimsResult,
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      const processor = new WaiverClaimProcessor(context.db);
      return processor.process({ leagueId: args.leagueId });
    },
  }),
);
