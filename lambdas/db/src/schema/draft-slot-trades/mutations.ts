/**
 * Draft slot trades domain — Mutation resolvers
 *
 * Mutations:
 *   proposeDraftSlotTrade  — a team manager proposes swapping draft slots
 *                            with another team
 *   respondDraftSlotTrade  — the counterpart team accepts or declines
 *   approveDraftSlotTrade  — commissioner-only: approves an accepted trade
 *                            and atomically executes the slot swap
 *
 * Status machine: proposed -> accepted | declined
 *                  accepted -> approved -> executed  (single mutation;
 *                  commissioner approval always executes immediately — no
 *                  separate execute step, per LS-8387 decision 2026-07-22)
 *                  any pending state -> cancelled (auto, when the draft
 *                  starts — see cancelPendingDraftSlotTradesForLeague)
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';

import {
  assertDraftSlotTradingOpen,
  enrichDraftSlotTrade,
  ensureDraftTeamsSeeded,
  getActiveDraftId,
  postDraftSlotTradeSystemMessage,
  resolveOwnTeamForDraftSlotTrade,
  swapDraftOrder,
} from './helpers';
import { DraftSlotTrade } from './types';
import { builder } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';

// ── Mutation: proposeDraftSlotTrade ─────────────────────────────────────────

builder.mutationField('proposeDraftSlotTrade', (t) =>
  t.field({
    type: DraftSlotTrade,
    description:
      'Propose swapping your draft slot with another team’s, before the draft starts.',
    args: {
      leagueId: t.arg.int({ required: true }),
      counterpartTeamId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId, counterpartTeamId } = args;
      const userId = context.user.id;
      const db = context.db;

      await assertDraftSlotTradingOpen(db, leagueId);

      const proposerTeamId = await resolveOwnTeamForDraftSlotTrade(
        userId,
        leagueId,
        db,
      );

      if (proposerTeamId === counterpartTeamId) {
        throw UserInputError('You cannot trade with yourself');
      }

      const [counterpartTeam] = await db
        .select({ id: PublicSchema.teams.id })
        .from(PublicSchema.teams)
        .where(
          and(
            eq(PublicSchema.teams.id, counterpartTeamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (!counterpartTeam) {
        throw UserInputError(
          'The counterpart team does not exist in this league',
        );
      }

      // Guard against duplicate concurrent proposals between the same pair.
      const [alreadyPending] = await db
        .select({ id: PublicSchema.draftSlotTrades.id })
        .from(PublicSchema.draftSlotTrades)
        .where(
          and(
            eq(PublicSchema.draftSlotTrades.leagueId, leagueId),
            eq(PublicSchema.draftSlotTrades.status, 'proposed'),
            eq(PublicSchema.draftSlotTrades.proposerTeamId, proposerTeamId),
            eq(
              PublicSchema.draftSlotTrades.counterpartTeamId,
              counterpartTeamId,
            ),
          ),
        )
        .limit(1);
      if (alreadyPending) {
        throw UserInputError(
          'You already have a pending draft slot trade proposed to this team',
        );
      }

      const [newTrade] = await db
        .insert(PublicSchema.draftSlotTrades)
        .values({
          leagueId,
          proposerTeamId,
          counterpartTeamId,
          status: 'proposed',
        })
        .returning();

      await postDraftSlotTradeSystemMessage(
        'proposed',
        {
          leagueId,
          tradeId: newTrade.id,
          proposerTeamId,
          counterpartTeamId,
        },
        context,
      );

      return enrichDraftSlotTrade(newTrade.id, context);
    },
  }),
);

// ── Mutation: respondDraftSlotTrade ─────────────────────────────────────────

builder.mutationField('respondDraftSlotTrade', (t) =>
  t.field({
    type: DraftSlotTrade,
    description:
      'Accept or decline a proposed draft slot trade, as the counterpart team.',
    args: {
      tradeId: t.arg.int({ required: true }),
      accept: t.arg.boolean({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { tradeId, accept } = args;
      const userId = context.user.id;
      const db = context.db;

      const [trade] = await db
        .select()
        .from(PublicSchema.draftSlotTrades)
        .where(eq(PublicSchema.draftSlotTrades.id, tradeId))
        .limit(1);

      if (!trade) throw new Error('Draft slot trade not found');
      if (trade.status !== 'proposed') {
        throw UserInputError(
          `This draft slot trade has already been ${trade.status} and cannot be responded to`,
        );
      }

      const ownTeamId = await resolveOwnTeamForDraftSlotTrade(
        userId,
        trade.leagueId,
        db,
      );

      if (ownTeamId !== trade.counterpartTeamId) {
        throw ForbiddenError(
          'Only the counterpart team’s general manager can respond to this trade',
        );
      }

      // Re-check the draft hasn't gone live in the window since proposal —
      // the auto-cancel hook should already have flipped stale proposals to
      // 'cancelled', but this guards the same-instant race.
      await assertDraftSlotTradingOpen(db, trade.leagueId);

      const nextStatus = accept ? 'accepted' : 'declined';
      const claimResult = await db
        .update(PublicSchema.draftSlotTrades)
        .set({ status: nextStatus })
        .where(
          and(
            eq(PublicSchema.draftSlotTrades.id, tradeId),
            eq(PublicSchema.draftSlotTrades.status, 'proposed'),
          ),
        );

      if ((claimResult.rowCount ?? 0) === 0) {
        throw UserInputError(
          'This draft slot trade has already been responded to',
        );
      }

      await postDraftSlotTradeSystemMessage(
        accept ? 'accepted' : 'declined',
        {
          leagueId: trade.leagueId,
          tradeId,
          proposerTeamId: trade.proposerTeamId,
          counterpartTeamId: trade.counterpartTeamId,
        },
        context,
      );

      return enrichDraftSlotTrade(tradeId, context);
    },
  }),
);

// ── Mutation: approveDraftSlotTrade ─────────────────────────────────────────

builder.mutationField('approveDraftSlotTrade', (t) =>
  t.field({
    type: DraftSlotTrade,
    description:
      'Commissioner-only: approve an accepted draft slot trade and atomically swap the two teams’ draft slots.',
    args: {
      tradeId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { tradeId } = args;
      const userId = context.user.id;
      const db = context.db;

      const [trade] = await db
        .select()
        .from(PublicSchema.draftSlotTrades)
        .where(eq(PublicSchema.draftSlotTrades.id, tradeId))
        .limit(1);

      if (!trade) throw new Error('Draft slot trade not found');
      if (trade.status !== 'accepted') {
        throw UserInputError(
          `Only accepted draft slot trades can be approved (current status: ${trade.status})`,
        );
      }

      const [membership] = await db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, trade.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership || membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError(
          'Only the league Commissioner can approve a draft slot trade',
        );
      }

      // Defensive re-check: the toggle or draft status may have changed
      // since the trade was accepted.
      await assertDraftSlotTradingOpen(db, trade.leagueId);

      await db.transaction(async (tx) => {
        // Claim the row first — guards a concurrent double-approval.
        const claimResult = await tx
          .update(PublicSchema.draftSlotTrades)
          .set({ status: 'approved' })
          .where(
            and(
              eq(PublicSchema.draftSlotTrades.id, tradeId),
              eq(PublicSchema.draftSlotTrades.status, 'accepted'),
            ),
          );

        if ((claimResult.rowCount ?? 0) === 0) {
          throw UserInputError(
            'This draft slot trade has already been approved or is no longer accepted',
          );
        }

        const draftId = await getActiveDraftId(tx, trade.leagueId);
        await ensureDraftTeamsSeeded(tx, draftId, trade.leagueId);
        await swapDraftOrder(
          tx,
          draftId,
          trade.proposerTeamId,
          trade.counterpartTeamId,
        );

        await tx
          .update(PublicSchema.draftSlotTrades)
          .set({ status: 'executed' })
          .where(eq(PublicSchema.draftSlotTrades.id, tradeId));
      });

      await postDraftSlotTradeSystemMessage(
        'executed',
        {
          leagueId: trade.leagueId,
          tradeId,
          proposerTeamId: trade.proposerTeamId,
          counterpartTeamId: trade.counterpartTeamId,
        },
        context,
      );

      return enrichDraftSlotTrade(tradeId, context);
    },
  }),
);
