/**
 * Mock draft lobby mutations (LS-10076):
 *
 *   leaveMockDraft      — give up your seat
 *   kickMockDraftSeat   — host removes a seat holder before the start
 *   updateMockDraftLobby— host changes settings or visibility before the start
 *   deleteMockDraft     — host deletes the draft outright
 *   deleteMyMockDrafts  — delete all of the caller's mock drafts (test reset)
 *
 * Every write locks the draft row FOR UPDATE and re-reads its status inside
 * the transaction (LS-10147), because host transfer and seat release both
 * race with `startMockDraft`.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';

import {
  assertPickTimeLimitInRange,
  assertPoolMatchesSport,
  broadcastLobbyUpdate,
  isValidDraftOrder,
  isValidPlayerPool,
  lockMockDraft,
  openSeatName,
} from './shared';
import { builder } from '../../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

/** What happened to the caller's seat, so the client knows where to go next. */
const LeaveMockDraftResult = builder
  .objectRef<{
    draftId: number;
    draftDeleted: boolean;
    newHostUserId: number | null;
  }>('LeaveMockDraftResult')
  .implement({
    description: 'The outcome of leaving a mock draft (LS-10076).',
    fields: (t) => ({
      draftId: t.exposeInt('draftId'),
      draftDeleted: t.exposeBoolean('draftDeleted', {
        description:
          'True when the host left an empty lobby, which deletes the draft.',
      }),
      newHostUserId: t.exposeInt('newHostUserId', {
        nullable: true,
        description:
          'Set when leaving transferred the host role to another seat.',
      }),
    }),
  });

builder.mutationField('leaveMockDraft', (t) =>
  t.field({
    type: LeaveMockDraftResult,
    description:
      'Give up your seat. Before the draft starts the seat reopens; afterwards ' +
      'it becomes an AI auto-picker so the draft can still finish. A host who ' +
      'leaves hands off to the earliest joiner, or deletes an empty lobby.',
    args: { draftId: t.arg.int({ required: true }) },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to leave a mock draft',
        );
      }

      const { draftId } = args;
      const userId = context.user.id;

      const outcome = await context.db.transaction(async (tx) => {
        const draft = await lockMockDraft(tx, draftId);

        const [seat] = await tx
          .select({
            id: PublicSchema.draftParticipants.id,
            slot: PublicSchema.draftParticipants.slot,
          })
          .from(PublicSchema.draftParticipants)
          .where(
            and(
              eq(PublicSchema.draftParticipants.draftId, draftId),
              eq(PublicSchema.draftParticipants.userId, userId),
            ),
          )
          .limit(1);

        if (!seat) {
          throw ForbiddenError('You do not have a seat in this mock draft');
        }

        const now = new Date();
        const started = draft.status !== 'not-started';

        await tx
          .update(PublicSchema.draftParticipants)
          .set(
            started
              ? {
                  // Mid-draft the seat still has to pick, so the CPU takes over.
                  userId: null,
                  controller: 'ai',
                  autoPick: true,
                  updatedAt: now,
                }
              : {
                  userId: null,
                  controller: 'open',
                  autoPick: false,
                  seatName: openSeatName(seat.slot),
                  joinedAt: null,
                  updatedAt: now,
                },
          )
          .where(eq(PublicSchema.draftParticipants.id, seat.id));

        if (draft.createdBy !== userId) {
          return { draftDeleted: false, newHostUserId: null };
        }

        // Host transfer: the earliest joiner still seated takes over.
        const [successor] = await tx
          .select({ userId: PublicSchema.draftParticipants.userId })
          .from(PublicSchema.draftParticipants)
          .where(
            and(
              eq(PublicSchema.draftParticipants.draftId, draftId),
              isNotNull(PublicSchema.draftParticipants.userId),
              ne(PublicSchema.draftParticipants.id, seat.id),
            ),
          )
          .orderBy(
            asc(PublicSchema.draftParticipants.joinedAt),
            asc(PublicSchema.draftParticipants.slot),
          )
          .limit(1);

        if (!successor?.userId) {
          // Nobody is left to hand it to. An unstarted lobby is deleted; a
          // draft already in progress is left to the AI seats and the
          // stale-offline purge.
          if (!started) {
            await tx
              .delete(PublicSchema.drafts)
              .where(eq(PublicSchema.drafts.id, draftId));
            return { draftDeleted: true, newHostUserId: null };
          }
          return { draftDeleted: false, newHostUserId: null };
        }

        await tx
          .update(PublicSchema.drafts)
          .set({ createdBy: successor.userId, updatedAt: now })
          .where(eq(PublicSchema.drafts.id, draftId));

        return { draftDeleted: false, newHostUserId: successor.userId };
      });

      LOGGER.info('User left mock draft', { draftId, userId, ...outcome });

      if (!outcome.draftDeleted) {
        await broadcastLobbyUpdate(
          context,
          draftId,
          outcome.newHostUserId !== null ? 'host' : 'seat-freed',
        );
      }

      return { draftId, ...outcome };
    },
  }),
);

builder.mutationField('kickMockDraftSeat', (t) =>
  t.field({
    type: 'Boolean',
    description:
      "Host-only: free another user's seat before the draft starts. The seat " +
      'reopens for a new joiner.',
    args: {
      draftId: t.arg.int({ required: true }),
      participantId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to manage a mock draft',
        );
      }

      const { draftId, participantId } = args;
      const userId = context.user.id;

      await context.db.transaction(async (tx) => {
        const draft = await lockMockDraft(tx, draftId);

        if (draft.createdBy !== userId) {
          throw ForbiddenError('Only the mock draft host can remove a seat');
        }
        if (draft.status !== 'not-started') {
          throw UserInputError(
            'Seats can only be removed before the draft starts.',
          );
        }

        const [seat] = await tx
          .select({
            id: PublicSchema.draftParticipants.id,
            slot: PublicSchema.draftParticipants.slot,
            userId: PublicSchema.draftParticipants.userId,
          })
          .from(PublicSchema.draftParticipants)
          .where(
            and(
              eq(PublicSchema.draftParticipants.id, participantId),
              eq(PublicSchema.draftParticipants.draftId, draftId),
            ),
          )
          .limit(1);

        if (!seat) {
          throw UserInputError('Seat not found in this mock draft');
        }
        if (seat.userId === userId) {
          throw UserInputError(
            'You cannot remove your own seat — leave the draft instead.',
          );
        }

        await tx
          .update(PublicSchema.draftParticipants)
          .set({
            userId: null,
            controller: 'open',
            autoPick: false,
            seatName: openSeatName(seat.slot),
            joinedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.draftParticipants.id, seat.id));
      });

      LOGGER.info('Mock draft seat kicked', { draftId, participantId, userId });
      await broadcastLobbyUpdate(context, draftId, 'seat-kicked');

      return true;
    },
  }),
);

builder.mutationField('updateMockDraftLobby', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Host-only: change an unstarted lobby’s settings or visibility.',
    args: {
      draftId: t.arg.int({ required: true }),
      isPublic: t.arg.boolean({ required: false }),
      draftOrder: t.arg.string({ required: false }),
      playerPool: t.arg.string({ required: false }),
      pickTimeLimitSeconds: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to manage a mock draft',
        );
      }

      const { draftId } = args;
      const userId = context.user.id;

      // Shape-only validation, before the lock: a bad argument is the caller's
      // mistake, not a reason to hold a row lock while we find out.
      if (args.draftOrder != null && !isValidDraftOrder(args.draftOrder)) {
        throw UserInputError('draftOrder must be "snake" or "linear"');
      }
      if (args.playerPool != null && !isValidPlayerPool(args.playerPool)) {
        throw UserInputError(
          'playerPool must be one of: "all", "nl", "al", "nfl", "afc", "nfc"',
        );
      }
      if (args.pickTimeLimitSeconds != null) {
        assertPickTimeLimitInRange(args.pickTimeLimitSeconds);
      }
      const draftOrder = args.draftOrder;
      const playerPool = args.playerPool;

      await context.db.transaction(async (tx) => {
        const draft = await lockMockDraft(tx, draftId);

        if (draft.createdBy !== userId) {
          throw ForbiddenError('Only the mock draft host can change the lobby');
        }
        if (draft.status !== 'not-started') {
          throw UserInputError(
            'Lobby settings can only be changed before the draft starts.',
          );
        }
        if (args.isPublic === true && draft.mockMode !== 'online') {
          // CHECK drafts_public_mock_ck: only an online mock draft is public.
          throw UserInputError('Only an online mock draft can be public.');
        }
        // The pool has to match the draft's sport, which is only known once
        // the row is loaded.
        if (playerPool != null && isValidPlayerPool(playerPool)) {
          assertPoolMatchesSport(draft.sport, playerPool);
        }

        await tx
          .update(PublicSchema.drafts)
          .set({
            ...(args.isPublic != null ? { isPublic: args.isPublic } : {}),
            ...(draftOrder != null && isValidDraftOrder(draftOrder)
              ? { draftOrder }
              : {}),
            ...(args.pickTimeLimitSeconds != null
              ? { pickTimeLimitSeconds: args.pickTimeLimitSeconds }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.drafts.id, draftId));

        if (playerPool != null && isValidPlayerPool(playerPool)) {
          await tx
            .update(PublicSchema.mockDraftSettings)
            .set({ playerPool, updatedAt: new Date() })
            .where(eq(PublicSchema.mockDraftSettings.draftId, draftId));
        }
      });

      LOGGER.info('Mock draft lobby updated', { draftId, userId });
      await broadcastLobbyUpdate(context, draftId, 'settings');

      return true;
    },
  }),
);

builder.mutationField('deleteMockDraft', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Host-only: delete a mock draft. Its seats, picks and chat cascade with it.',
    args: { draftId: t.arg.int({ required: true }) },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to delete a mock draft',
        );
      }

      const { draftId } = args;
      const userId = context.user.id;

      await context.db.transaction(async (tx) => {
        const draft = await lockMockDraft(tx, draftId);

        if (draft.createdBy !== userId) {
          throw ForbiddenError('Only the mock draft host can delete the draft');
        }

        await tx
          .delete(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId));
      });

      LOGGER.info('Mock draft deleted', { draftId, userId });
      return true;
    },
  }),
);

builder.mutationField('deleteMyMockDrafts', (t) =>
  t.field({
    type: 'Int',
    description:
      'Delete every mock draft the caller created, and return how many. Scoped ' +
      'to the caller, so it can never touch anyone else’s draft. Replaces ' +
      'deleteMyMockDraftLeagues, which reset the weekly cap by deleting the ' +
      'throwaway leagues the old path created (LS-8238).',
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to reset mock drafts',
        );
      }

      const userId = context.user.id;

      const deleted = await context.db
        .delete(PublicSchema.drafts)
        .where(
          and(
            eq(PublicSchema.drafts.kind, 'mock'),
            eq(PublicSchema.drafts.createdBy, userId),
          ),
        )
        .returning({ id: PublicSchema.drafts.id });

      LOGGER.info('Deleted own mock drafts', { userId, count: deleted.length });

      return deleted.length;
    },
  }),
);
