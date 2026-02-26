/**
 * Trades domain — Mutation resolvers
 *
 * Mutations:
 *   proposeTrade   — a team manager initiates a trade offer
 *   acceptTrade    — receiving manager accepts; players are swapped atomically
 *   rejectTrade    — receiving manager declines the offer
 *   cancelTrade    — proposing manager withdraws the offer
 *   vetoTrade      — league commissioner reverses an accepted trade
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray } from 'drizzle-orm';

import { TradeOffer } from './types';
import { builder, type Context } from '../builder';

// ── Helper: fetch and enrich a single trade ────────────────────────────────

async function enrichTrade(tradeId: number, context: Context) {
  const [trade] = await context.db
    .select()
    .from(PublicSchema.tradeOffers)
    .where(eq(PublicSchema.tradeOffers.id, tradeId))
    .limit(1);

  if (!trade) throw new Error('Trade offer not found');

  const [proposingTeam] = await context.db
    .select({ name: PublicSchema.teams.name })
    .from(PublicSchema.teams)
    .where(eq(PublicSchema.teams.id, trade.proposingTeamId))
    .limit(1);

  const [receivingTeam] = await context.db
    .select({ name: PublicSchema.teams.name })
    .from(PublicSchema.teams)
    .where(eq(PublicSchema.teams.id, trade.receivingTeamId))
    .limit(1);

  const rawPlayers = await context.db
    .select({
      id: PublicSchema.tradeOfferPlayers.id,
      tradeOfferId: PublicSchema.tradeOfferPlayers.tradeOfferId,
      playerId: PublicSchema.tradeOfferPlayers.playerId,
      fromTeamId: PublicSchema.tradeOfferPlayers.fromTeamId,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
    })
    .from(PublicSchema.tradeOfferPlayers)
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.tradeOfferPlayers.playerId, PublicSchema.players.id),
    )
    .where(eq(PublicSchema.tradeOfferPlayers.tradeOfferId, tradeId));

  return {
    ...trade,
    proposingTeamName: proposingTeam?.name ?? null,
    receivingTeamName: receivingTeam?.name ?? null,
    players: rawPlayers.map(
      (p: {
        id: number;
        tradeOfferId: number;
        playerId: number;
        fromTeamId: number;
        firstName: string;
        lastName: string;
      }) => ({
        id: p.id,
        tradeOfferId: p.tradeOfferId,
        playerId: p.playerId,
        fromTeamId: p.fromTeamId,
        playerName: `${p.firstName} ${p.lastName}`.trim(),
        playerPosition: null,
      }),
    ),
  };
}

// ── Helper: resolve a user's team in a league ─────────────────────────────

async function resolveUserTeam(
  userId: number,
  leagueId: number,
  db: Context['db'],
) {
  const [membership] = await db
    .select({ teamId: PublicSchema.leagueMembers.teamId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership?.teamId) {
    throw new Error('You do not have a team in this league');
  }

  return membership.teamId;
}

// ── Helper: post a system chat message for a trade action ─────────────────

const TRADE_ACTION_LABELS: Record<string, string> = {
  proposed: 'proposed a trade to',
  accepted: 'accepted a trade with',
  rejected: 'rejected a trade from',
  cancelled: 'cancelled their trade offer to',
  vetoed: 'vetoed the trade between',
};

async function postTradeSystemMessage(
  action: 'proposed' | 'accepted' | 'rejected' | 'cancelled' | 'vetoed',
  opts: {
    leagueId: number;
    tradeId: number;
    proposingTeamId: number;
    receivingTeamId: number;
    actingUserId: number;
  },
  context: Context,
): Promise<void> {
  try {
    const { leagueId, tradeId, proposingTeamId, receivingTeamId } = opts;
    const db = context.db;

    const [[proposingRow], [receivingRow]] = await Promise.all([
      db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, proposingTeamId))
        .limit(1),
      db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, receivingTeamId))
        .limit(1),
    ]);

    const proposingTeamName = proposingRow?.name ?? `Team ${proposingTeamId}`;
    const receivingTeamName = receivingRow?.name ?? `Team ${receivingTeamId}`;

    const label = TRADE_ACTION_LABELS[action] ?? action;
    const emoji =
      action === 'accepted'
        ? '✅'
        : action === 'vetoed'
          ? '🚫'
          : action === 'rejected'
            ? '❌'
            : action === 'cancelled'
              ? '↩️'
              : '🔁';

    const messageText =
      action === 'vetoed'
        ? `${emoji} Commissioner vetoed the trade between ${proposingTeamName} and ${receivingTeamName}`
        : `${emoji} ${action === 'proposed' ? proposingTeamName : action === 'accepted' || action === 'rejected' ? receivingTeamName : proposingTeamName} ${label} ${action === 'proposed' ? receivingTeamName : proposingTeamName}`;

    const tradeMetadata: Record<string, unknown> = {
      action,
      tradeId,
      proposingTeamName,
      receivingTeamName,
      proposingTeamId,
      receivingTeamId,
    };

    const [chatMsg] = await db
      .insert(PublicSchema.leagueMessages)
      .values({
        leagueId,
        userId: null,
        messageText,
        messageType: 'trade',
        metadata: tradeMetadata,
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
          messageType: 'trade',
          metadata: tradeMetadata,
        })
        .catch((err: unknown) => {
          LOGGER.warn('Failed to send trade system chat WS notification', {
            err,
            tradeId,
          });
        });
    }
  } catch (err) {
    LOGGER.warn('postTradeSystemMessage failed (non-fatal)', { err });
  }
}

// ── Mutation: proposeTrade ────────────────────────────────────────────────

builder.mutationField('proposeTrade', (t) =>
  t.field({
    type: TradeOffer,
    description:
      'Propose a trade to another team. Provide the players you are offering and the players you want in return.',
    args: {
      leagueId: t.arg.int({ required: true }),
      receivingTeamId: t.arg.int({ required: true }),
      offeringPlayerIds: t.arg.intList({ required: true }),
      requestingPlayerIds: t.arg.intList({ required: true }),
      message: t.arg.string({ required: false }),
      expiresInDays: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const {
        leagueId,
        receivingTeamId,
        offeringPlayerIds,
        requestingPlayerIds,
        message,
        expiresInDays,
      } = args;
      const userId = context.user.id;
      const db = context.db;

      if (offeringPlayerIds.length === 0 && requestingPlayerIds.length === 0) {
        throw new Error(
          'A trade must include at least one player on each side',
        );
      }
      if (offeringPlayerIds.length === 0) {
        throw new Error('You must offer at least one player');
      }
      if (requestingPlayerIds.length === 0) {
        throw new Error(
          'You must request at least one player from the other team',
        );
      }

      // 1. Resolve the proposing team
      const proposingTeamId = await resolveUserTeam(userId, leagueId, db);

      if (proposingTeamId === receivingTeamId) {
        throw new Error('You cannot trade with yourself');
      }

      // 2. Verify the receiving team exists in this league
      const [receivingTeam] = await db
        .select({ id: PublicSchema.teams.id })
        .from(PublicSchema.teams)
        .where(
          and(
            eq(PublicSchema.teams.id, receivingTeamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (!receivingTeam) {
        throw new Error('The receiving team does not exist in this league');
      }

      // 3. Verify the offering players are on the proposing team
      const offeringMembers = await db
        .select({ playerId: PublicSchema.teamMembers.playerId })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, proposingTeamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            inArray(PublicSchema.teamMembers.playerId, offeringPlayerIds),
          ),
        );

      if (offeringMembers.length !== offeringPlayerIds.length) {
        throw new Error(
          'One or more players you are offering are not on your roster',
        );
      }

      // 4. Verify the requested players are on the receiving team
      const requestingMembers = await db
        .select({ playerId: PublicSchema.teamMembers.playerId })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, receivingTeamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            inArray(PublicSchema.teamMembers.playerId, requestingPlayerIds),
          ),
        );

      if (requestingMembers.length !== requestingPlayerIds.length) {
        throw new Error(
          "One or more players you are requesting are not on the other team's roster",
        );
      }

      // 5. Create the trade offer
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const [newTrade] = await db
        .insert(PublicSchema.tradeOffers)
        .values({
          leagueId,
          proposingTeamId,
          receivingTeamId,
          status: 'pending',
          message: message ?? null,
          expiresAt,
        })
        .returning();

      // 6. Insert player legs
      const playerRows = [
        ...offeringPlayerIds.map((playerId) => ({
          tradeOfferId: newTrade.id,
          playerId,
          fromTeamId: proposingTeamId,
        })),
        ...requestingPlayerIds.map((playerId) => ({
          tradeOfferId: newTrade.id,
          playerId,
          fromTeamId: receivingTeamId,
        })),
      ];

      await db.insert(PublicSchema.tradeOfferPlayers).values(playerRows);

      LOGGER.info('Trade proposed', {
        tradeId: newTrade.id,
        proposingTeamId,
        receivingTeamId,
        leagueId,
        offeringCount: offeringPlayerIds.length,
        requestingCount: requestingPlayerIds.length,
      });

      // 7. Send DM + WebSocket notification to the receiving team's manager
      try {
        const [receivingMember] = await db
          .select({ userId: PublicSchema.leagueMembers.userId })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.teamId, receivingTeamId),
            ),
          )
          .limit(1);

        if (receivingMember) {
          const [[proposingTeamRow], [receivingTeamRow]] = await Promise.all([
            db
              .select({ name: PublicSchema.teams.name })
              .from(PublicSchema.teams)
              .where(eq(PublicSchema.teams.id, proposingTeamId))
              .limit(1),
            db
              .select({ name: PublicSchema.teams.name })
              .from(PublicSchema.teams)
              .where(eq(PublicSchema.teams.id, receivingTeamId))
              .limit(1),
          ]);

          const proposingTeamName = proposingTeamRow?.name ?? 'A team';
          const receivingTeamName = receivingTeamRow?.name ?? 'your team';
          const dmText =
            `\u{1F501} Trade offer from ${proposingTeamName}: ` +
            `${offeringPlayerIds.length} player(s) offered for ` +
            `${requestingPlayerIds.length} player(s)` +
            (message ? ` \u2014 "${message}"` : '') +
            '. Check the Trades tab to respond.';

          const [dm] = await db
            .insert(PublicSchema.directMessages)
            .values({
              fromUserId: userId,
              toUserId: receivingMember.userId,
              leagueId,
              messageText: dmText,
            })
            .returning();

          if (context.notificationService) {
            const proposingUsername =
              context.user.username ?? `User #${userId}`;
            const createdAtIso =
              dm.createdAt instanceof Date
                ? dm.createdAt.toISOString()
                : String(dm.createdAt);
            const proposedAtIso =
              newTrade.createdAt instanceof Date
                ? newTrade.createdAt.toISOString()
                : String(newTrade.createdAt);

            await context.notificationService.notifyDirectMessage(
              receivingMember.userId,
              {
                messageId: dm.id,
                fromUserId: userId,
                fromUsername: proposingUsername,
                toUserId: receivingMember.userId,
                leagueId,
                messageText: dmText,
                createdAt: createdAtIso,
              },
            );

            await context.notificationService.notifyTradeOffer(
              receivingMember.userId,
              {
                leagueId,
                tradeOfferId: newTrade.id,
                proposingTeamId,
                receivingTeamId,
                proposingTeamName,
                receivingTeamName,
                playerCount:
                  offeringPlayerIds.length + requestingPlayerIds.length,
                proposedAt: proposedAtIso,
              },
            );
          }
        }
      } catch (notifyErr) {
        LOGGER.warn('Failed to send trade proposal notification (non-fatal)', {
          error: notifyErr,
          tradeId: newTrade.id,
        });
      }

      await postTradeSystemMessage(
        'proposed',
        {
          leagueId,
          tradeId: newTrade.id,
          proposingTeamId,
          receivingTeamId,
          actingUserId: userId,
        },
        context,
      );

      return enrichTrade(newTrade.id, context);
    },
  }),
);

// ── Mutation: acceptTrade ─────────────────────────────────────────────────

builder.mutationField('acceptTrade', (t) =>
  t.field({
    type: TradeOffer,
    description:
      'Accept a pending trade offer. Players are swapped between teams immediately.',
    args: {
      tradeId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const userId = context.user.id;
      const db = context.db;

      // 1. Fetch the trade
      const [trade] = await db
        .select()
        .from(PublicSchema.tradeOffers)
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId))
        .limit(1);

      if (!trade) {
        throw new Error('Trade offer not found');
      }

      if (trade.status !== 'pending') {
        throw new Error(
          `This trade offer has already been ${trade.status} and cannot be accepted`,
        );
      }

      // 2. Verify the caller owns the receiving team
      const receivingTeamId = trade.receivingTeamId;
      const [membership] = await db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, trade.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership?.teamId || membership.teamId !== receivingTeamId) {
        throw new Error(
          'Only the receiving team manager can accept this trade',
        );
      }

      // 3. Fetch all player legs
      const playerLegs = await db
        .select()
        .from(PublicSchema.tradeOfferPlayers)
        .where(eq(PublicSchema.tradeOfferPlayers.tradeOfferId, args.tradeId));

      if (playerLegs.length === 0) {
        throw new Error('Trade has no players — cannot execute');
      }

      // 4. Atomically swap players and mark trade accepted
      //    For each leg: change the player's teamId to the opposite team.
      const proposingTeamId = trade.proposingTeamId;

      for (const leg of playerLegs) {
        const toTeamId =
          leg.fromTeamId === proposingTeamId
            ? receivingTeamId
            : proposingTeamId;

        await db
          .update(PublicSchema.teamMembers)
          .set({
            teamId: toTeamId,
            // Clear position assignment — positions may not be valid on new team
            positionId: null,
          })
          .where(
            and(
              eq(PublicSchema.teamMembers.leagueId, trade.leagueId),
              eq(PublicSchema.teamMembers.playerId, leg.playerId),
              eq(PublicSchema.teamMembers.teamId, leg.fromTeamId),
            ),
          );
      }

      // 5. Mark the trade as accepted
      await db
        .update(PublicSchema.tradeOffers)
        .set({ status: 'accepted', respondedAt: new Date() })
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId));

      LOGGER.info('Trade accepted — players swapped', {
        tradeId: args.tradeId,
        proposingTeamId,
        receivingTeamId,
        leaguesId: trade.leagueId,
        legsSwapped: playerLegs.length,
      });

      // 6. Notify the whole league that rosters changed
      try {
        if (context.notificationService) {
          await context.notificationService.notifyRosterUpdate(trade.leagueId);
        }
      } catch (notifyErr) {
        LOGGER.warn(
          'Failed to send roster update notification after trade accept (non-fatal)',
          { error: notifyErr, tradeId: args.tradeId },
        );
      }

      await postTradeSystemMessage(
        'accepted',
        {
          leagueId: trade.leagueId,
          tradeId: args.tradeId,
          proposingTeamId,
          receivingTeamId,
          actingUserId: userId,
        },
        context,
      );

      return enrichTrade(args.tradeId, context);
    },
  }),
);

// ── Mutation: rejectTrade ─────────────────────────────────────────────────

builder.mutationField('rejectTrade', (t) =>
  t.field({
    type: TradeOffer,
    description: 'Reject a pending trade offer as the receiving team manager.',
    args: {
      tradeId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const userId = context.user.id;
      const db = context.db;

      const [trade] = await db
        .select()
        .from(PublicSchema.tradeOffers)
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId))
        .limit(1);

      if (!trade) throw new Error('Trade offer not found');
      if (trade.status !== 'pending') {
        throw new Error(`This trade offer has already been ${trade.status}`);
      }

      // Verify the caller is the receiving team manager
      const [membership] = await db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, trade.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership?.teamId || membership.teamId !== trade.receivingTeamId) {
        throw new Error(
          'Only the receiving team manager can reject this trade',
        );
      }

      await db
        .update(PublicSchema.tradeOffers)
        .set({ status: 'rejected', respondedAt: new Date() })
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId));

      LOGGER.info('Trade rejected', {
        tradeId: args.tradeId,
        userId,
        leagueId: trade.leagueId,
      });

      await postTradeSystemMessage(
        'rejected',
        {
          leagueId: trade.leagueId,
          tradeId: args.tradeId,
          proposingTeamId: trade.proposingTeamId,
          receivingTeamId: trade.receivingTeamId,
          actingUserId: userId,
        },
        context,
      );

      return enrichTrade(args.tradeId, context);
    },
  }),
);

// ── Mutation: cancelTrade ─────────────────────────────────────────────────

builder.mutationField('cancelTrade', (t) =>
  t.field({
    type: TradeOffer,
    description: 'Cancel a pending trade offer as the team that proposed it.',
    args: {
      tradeId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const userId = context.user.id;
      const db = context.db;

      const [trade] = await db
        .select()
        .from(PublicSchema.tradeOffers)
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId))
        .limit(1);

      if (!trade) throw new Error('Trade offer not found');
      if (trade.status !== 'pending') {
        throw new Error(
          `This trade offer has already been ${trade.status} and cannot be cancelled`,
        );
      }

      // Verify the caller is the proposing team manager
      const [membership] = await db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, trade.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership?.teamId || membership.teamId !== trade.proposingTeamId) {
        throw new Error('Only the team that proposed this trade can cancel it');
      }

      await db
        .update(PublicSchema.tradeOffers)
        .set({ status: 'cancelled', respondedAt: new Date() })
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId));

      LOGGER.info('Trade cancelled by proposer', {
        tradeId: args.tradeId,
        userId,
        leagueId: trade.leagueId,
      });

      await postTradeSystemMessage(
        'cancelled',
        {
          leagueId: trade.leagueId,
          tradeId: args.tradeId,
          proposingTeamId: trade.proposingTeamId,
          receivingTeamId: trade.receivingTeamId,
          actingUserId: userId,
        },
        context,
      );

      return enrichTrade(args.tradeId, context);
    },
  }),
);

// ── Mutation: vetoTrade ───────────────────────────────────────────────────

builder.mutationField('vetoTrade', (t) =>
  t.field({
    type: TradeOffer,
    description:
      'Commissioner-only: veto an accepted trade, reversing the player swap.',
    args: {
      tradeId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const userId = context.user.id;
      const db = context.db;

      const [trade] = await db
        .select()
        .from(PublicSchema.tradeOffers)
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId))
        .limit(1);

      if (!trade) throw new Error('Trade offer not found');
      if (trade.status !== 'accepted') {
        throw new Error('Only accepted trades can be vetoed');
      }

      // Verify commissioner/owner of the league
      const [membership] = await db
        .select({
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, trade.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (
        !membership ||
        !['general_manager', 'assistant_manager', 'commissioner'].includes(
          membership.permissionLevel ?? '',
        )
      ) {
        throw new Error(
          'Only the league General Manager or commissioner can veto a trade',
        );
      }

      // Reverse the player swap
      const playerLegs = await db
        .select()
        .from(PublicSchema.tradeOfferPlayers)
        .where(eq(PublicSchema.tradeOfferPlayers.tradeOfferId, args.tradeId));

      for (const leg of playerLegs) {
        // Return each player to the original `from_team_id`
        await db
          .update(PublicSchema.teamMembers)
          .set({ teamId: leg.fromTeamId, positionId: null })
          .where(
            and(
              eq(PublicSchema.teamMembers.leagueId, trade.leagueId),
              eq(PublicSchema.teamMembers.playerId, leg.playerId),
            ),
          );
      }

      await db
        .update(PublicSchema.tradeOffers)
        .set({ status: 'vetoed', vetoedAt: new Date() })
        .where(eq(PublicSchema.tradeOffers.id, args.tradeId));

      LOGGER.info('Trade vetoed by commissioner', {
        tradeId: args.tradeId,
        vetoeingUserId: userId,
        leagueId: trade.leagueId,
      });

      await postTradeSystemMessage(
        'vetoed',
        {
          leagueId: trade.leagueId,
          tradeId: args.tradeId,
          proposingTeamId: trade.proposingTeamId,
          receivingTeamId: trade.receivingTeamId,
          actingUserId: userId,
        },
        context,
      );

      return enrichTrade(args.tradeId, context);
    },
  }),
);
