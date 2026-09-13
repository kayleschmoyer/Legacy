/**
 * Draft slot trades domain — shared helpers
 *
 * Draft pick order lives in `draft_participants` (draftId/teamId/leagueId/slot,
 * 1-indexed, unique per (draftId, slot) — see drafts/participants.ts,
 * draft-order.ts / initialize-draft.ts). Slot trading operates on this table,
 * via drafts/participants.ts, not on the
 * unrelated `season_draft_players` model from the standalone Season Draft
 * Game trivia mode (see PR description for why the ticket's file reference
 * was corrected).
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, desc, eq, inArray } from 'drizzle-orm';

import {
  ensureLeagueDraftSeated,
  swapLeagueDraftSeats,
} from '../drafts/participants';
import type { Context } from '../builder';
import { ForbiddenError, UserInputError } from '../graphql-errors';

export type DraftSlotTradeRow =
  typeof PublicSchema.draftSlotTrades.$inferSelect;

/** Non-terminal statuses a trade can still transition out of. */
export const PENDING_DRAFT_SLOT_TRADE_STATUSES = [
  'proposed',
  'accepted',
  'approved',
] as const;

// ── Team resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the caller's own team in the league for proposing/responding to a
 * trade. Mirrors trades.ts `resolveUserTeam`: only an active general manager
 * or commissioner may act on behalf of a team, and a locked team cannot
 * participate.
 */
export async function resolveOwnTeamForDraftSlotTrade(
  userId: number,
  leagueId: number,
  db: Context['db'],
): Promise<number> {
  const [membership] = await db
    .select({
      teamId: PublicSchema.leagueMembers.teamId,
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership?.teamId) {
    throw ForbiddenError('You do not have a team in this league');
  }

  if (
    membership.permissionLevel !== 'general_manager' &&
    membership.permissionLevel !== 'commissioner'
  ) {
    throw ForbiddenError(
      "Only the team's general manager can propose or respond to a draft slot trade",
    );
  }

  const [team] = await db
    .select({ isLocked: PublicSchema.teams.isLocked })
    .from(PublicSchema.teams)
    .where(
      and(
        eq(PublicSchema.teams.id, membership.teamId),
        eq(PublicSchema.teams.leagueId, leagueId),
      ),
    )
    .limit(1);

  if (!team) {
    throw ForbiddenError('Your team no longer exists in this league');
  }
  if (team.isLocked) {
    throw ForbiddenError(
      'Your team has been locked by the commissioner and cannot make roster moves',
    );
  }

  return membership.teamId;
}

// ── League / draft-state gating ─────────────────────────────────────────────

export interface DraftSlotTradeLeagueState {
  id: number;
  allowDraftSlotTrading: boolean;
  draftStatus: string;
}

/**
 * Fetch the league row and assert draft slot trading is currently allowed:
 * the feature is enabled and the draft has not yet started. Once
 * `draftStatus` leaves 'not-started' the draft is "live" — new proposals are
 * blocked and any still-pending trades are auto-cancelled (see
 * cancelPendingDraftSlotTradesForLeague, called from initializeDraft /
 * autoStartScheduledDrafts).
 */
export async function assertDraftSlotTradingOpen(
  db: Context['db'],
  leagueId: number,
): Promise<DraftSlotTradeLeagueState> {
  const [league] = await db
    .select({
      id: PublicSchema.leagues.id,
      allowDraftSlotTrading: PublicSchema.leagues.allowDraftSlotTrading,
      draftStatus: PublicSchema.leagues.draftStatus,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  if (!league) {
    throw UserInputError('League not found');
  }
  if (!league.allowDraftSlotTrading) {
    throw UserInputError('Draft slot trading is not enabled for this league');
  }
  if (league.draftStatus !== 'not-started') {
    throw UserInputError(
      'Draft slot trades can only be proposed before the draft starts',
    );
  }

  return league;
}

// ── seat seeding + atomic swap ──────────────────────────────────────────────

/**
 * Returns the league's current draft id (one `drafts` row is always created
 * at league creation — see LeagueService.createLeagueAndTeams).
 */
export async function getActiveDraftId(
  db: Context['db'],
  leagueId: number,
): Promise<number> {
  const [draft] = await db
    .select({ id: PublicSchema.drafts.id })
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.leagueId, leagueId))
    .orderBy(desc(PublicSchema.drafts.createdAt))
    .limit(1);

  if (!draft) {
    const message = `No draft record found for league ${String(leagueId)}`;
    LOGGER.error(message);
    throw new Error(message);
  }
  return draft.id;
}

/**
 * Seats are normally created by `initializeDraft` when the
 * commissioner actually starts the draft. Slot trading happens earlier —
 * before the draft starts — so on first use this seeds one row per current
 * league team in team-id order (a stable, deterministic default order).
 * A no-op once rows exist. Must run inside the caller's transaction.
 */
export async function ensureDraftTeamsSeeded(
  tx: Context['db'],
  draftId: number,
  leagueId: number,
): Promise<void> {
  // Seats live in draft_participants since LS-10074; ensureLeagueDraftSeated
  // owns the same "seed in team-id order only if nothing is seated yet" rule
  // this function used to implement against draft_teams.
  await ensureLeagueDraftSeated(tx, draftId, leagueId);
}

/**
 * Atomically swap the slots of two teams' seats within a draft.
 *
 * Delegates to {@link swapLeagueDraftSeats} (LS-10074). The sentinel dance this
 * used to need is gone with `draft_teams`: `draft_participants_uk_draft_slot`
 * is DEFERRABLE INITIALLY IMMEDIATE, so one statement may permute both rows.
 * Must run inside the caller's transaction.
 */
export async function swapDraftOrder(
  tx: Context['db'],
  draftId: number,
  teamAId: number,
  teamBId: number,
): Promise<{ teamAOrder: number; teamBOrder: number }> {
  return swapLeagueDraftSeats(tx, draftId, teamAId, teamBId);
}

// ── Auto-cancel on draft start (AC4) ────────────────────────────────────────

/**
 * Cancel every still-pending (proposed/accepted/approved) draft slot trade
 * for a league. Called from initializeDraft and autoStartScheduledDrafts —
 * the two places a draft transitions out of 'not-started' — so trading
 * always closes the instant the draft goes live. Must run inside the
 * caller's transaction so it commits atomically with the draft-start write.
 */
export async function cancelPendingDraftSlotTradesForLeague(
  tx: Context['db'],
  leagueId: number,
): Promise<number> {
  const result = await tx
    .update(PublicSchema.draftSlotTrades)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(PublicSchema.draftSlotTrades.leagueId, leagueId),
        inArray(PublicSchema.draftSlotTrades.status, [
          ...PENDING_DRAFT_SLOT_TRADE_STATUSES,
        ]),
      ),
    );

  const cancelledCount = result.rowCount ?? 0;
  if (cancelledCount > 0) {
    LOGGER.info('Auto-cancelled pending draft slot trades — draft started', {
      leagueId,
      cancelledCount,
    });
  }
  return cancelledCount;
}

// ── Hydration + notifications ───────────────────────────────────────────────

/** Fetch a trade by id and attach the two teams' names. */
export async function enrichDraftSlotTrade(
  tradeId: number,
  context: Context,
): Promise<
  DraftSlotTradeRow & {
    proposerTeamName: string | null;
    counterpartTeamName: string | null;
  }
> {
  const [trade] = await context.db
    .select()
    .from(PublicSchema.draftSlotTrades)
    .where(eq(PublicSchema.draftSlotTrades.id, tradeId))
    .limit(1);

  if (!trade) throw new Error('Draft slot trade not found');

  const [[proposerTeam], [counterpartTeam]] = await Promise.all([
    context.db
      .select({ name: PublicSchema.teams.name })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.id, trade.proposerTeamId))
      .limit(1),
    context.db
      .select({ name: PublicSchema.teams.name })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.id, trade.counterpartTeamId))
      .limit(1),
  ]);

  return {
    ...trade,
    proposerTeamName: proposerTeam?.name ?? null,
    counterpartTeamName: counterpartTeam?.name ?? null,
  };
}

/**
 * Post a system chat message + WebSocket broadcast for a draft slot trade
 * action, mirroring the existing draft-order / trade system-chat pattern
 * (postDraftOrderChatNotification / postTradeSystemMessage). Best-effort —
 * never throws, so a notification failure cannot fail the mutation.
 */
export async function postDraftSlotTradeSystemMessage(
  action: 'proposed' | 'accepted' | 'declined' | 'executed',
  opts: {
    leagueId: number;
    tradeId: number;
    proposerTeamId: number;
    counterpartTeamId: number;
  },
  context: Context,
): Promise<void> {
  try {
    const { leagueId, tradeId, proposerTeamId, counterpartTeamId } = opts;
    const db = context.db;

    const [[proposerRow], [counterpartRow]] = await Promise.all([
      db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, proposerTeamId))
        .limit(1),
      db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, counterpartTeamId))
        .limit(1),
    ]);

    const proposerTeamName =
      proposerRow?.name ?? `Team ${String(proposerTeamId)}`;
    const counterpartTeamName =
      counterpartRow?.name ?? `Team ${String(counterpartTeamId)}`;

    const messageText =
      action === 'executed'
        ? `🔀 Draft slot trade executed between ${proposerTeamName} and ${counterpartTeamName}`
        : action === 'proposed'
          ? `🔀 ${proposerTeamName} proposed a draft slot trade to ${counterpartTeamName}`
          : action === 'accepted'
            ? `🔀 ${counterpartTeamName} accepted a draft slot trade with ${proposerTeamName}`
            : `🔀 ${counterpartTeamName} declined a draft slot trade from ${proposerTeamName}`;

    const metadata: Record<string, unknown> = {
      action,
      tradeId,
      proposerTeamId,
      counterpartTeamId,
      proposerTeamName,
      counterpartTeamName,
    };

    const [chatMsg] = await db
      .insert(PublicSchema.leagueMessages)
      .values({
        leagueId,
        userId: null,
        messageText,
        messageType: 'draft_slot_trade',
        metadata,
      })
      .returning();

    if (context.notificationService && chatMsg) {
      context.notificationService
        .notifyLeagueChatMessage(leagueId, {
          leagueId,
          messageId: chatMsg.id,
          senderId: null,
          senderUsername: 'Trade Desk',
          messageText,
          timestamp: chatMsg.timestamp ?? new Date().toISOString(),
          messageType: 'draft_slot_trade',
          metadata,
        })
        .catch((err: unknown) => {
          LOGGER.warn('Failed to send draft slot trade WS notification', {
            err,
            tradeId,
          });
        });
    }
  } catch (err) {
    LOGGER.warn('postDraftSlotTradeSystemMessage failed (non-fatal)', { err });
  }
}
