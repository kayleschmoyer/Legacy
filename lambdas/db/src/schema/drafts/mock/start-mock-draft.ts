/**
 * Mock draft mutation: startMockDraft (LS-10076)
 *
 * The host closes an ONLINE lobby and puts it on the clock. Whatever is still
 * open becomes an AI seat, pending invitations expire, and the draft moves to
 * `in-progress`.
 *
 * The draft row is locked FOR UPDATE and its status re-checked inside the
 * transaction (LS-10147): `initializeDraft` had the same double-click race on
 * the league row, where the second call crashed on the seat unique key.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import { cpuSeatName, lockMockDraft } from './shared';
import { Draft } from '../types';
import { getCurrentDraftPickInfo } from '../helpers';
import { getSeatById } from '../participants';
import { triggerAutoProcessDraftPicks } from '../trigger-auto-process';
import { builder } from '../../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

builder.mutationField('startMockDraft', (t) =>
  t.field({
    type: Draft,
    description:
      'Host-only: start an ONLINE mock draft. Open seats become AI auto-pickers, ' +
      'pending invitations expire, and the draft goes on the clock.',
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to start a mock draft',
        );
      }

      const { draftId } = args;
      const userId = context.user.id;

      const started = await context.db.transaction(async (tx) => {
        const draft = await lockMockDraft(tx, draftId);

        if (draft.createdBy !== userId) {
          throw ForbiddenError('Only the mock draft host can start the draft');
        }
        if (draft.status !== 'not-started') {
          throw UserInputError('This mock draft has already started.');
        }
        if (draft.lobbyExpiresAt && draft.lobbyExpiresAt <= new Date()) {
          throw UserInputError('This mock draft lobby has expired.');
        }

        const seats = await tx
          .select({
            id: PublicSchema.draftParticipants.id,
            slot: PublicSchema.draftParticipants.slot,
            controller: PublicSchema.draftParticipants.controller,
          })
          .from(PublicSchema.draftParticipants)
          .where(eq(PublicSchema.draftParticipants.draftId, draftId));

        const now = new Date();

        // Seat AI on everything still open.
        for (const seat of seats.filter((s) => s.controller === 'open')) {
          await tx
            .update(PublicSchema.draftParticipants)
            .set({
              controller: 'ai',
              autoPick: true,
              seatName: cpuSeatName(seat.slot),
              updatedAt: now,
            })
            .where(eq(PublicSchema.draftParticipants.id, seat.id));
        }

        // A pending invitation to a draft that has started can never be
        // accepted — its reserved slot is gone.
        await tx
          .update(PublicSchema.invitations)
          .set({ status: 'expired', respondedAt: now })
          .where(
            and(
              eq(PublicSchema.invitations.draftId, draftId),
              eq(PublicSchema.invitations.status, 'pending'),
            ),
          );

        await tx
          .update(PublicSchema.drafts)
          .set({
            status: 'in-progress',
            lobbyExpiresAt: null,
            draftStartedAt: now,
            // A real deadline is written below, once the first seat is known.
            currentPickDeadline: new Date(
              now.getTime() + draft.pickTimeLimitSeconds * 1000,
            ),
            updatedAt: now,
          })
          .where(eq(PublicSchema.drafts.id, draftId));

        // If slot 1 is an AI seat, expire the deadline immediately so the
        // auto-pick sweep fires on the first nudge rather than after a full
        // pick clock (the LS-9369 rule, by seat).
        const firstPick = await getCurrentDraftPickInfo(tx, draftId);
        const firstSeat = firstPick
          ? await getSeatById(tx, firstPick.participantId)
          : null;
        const firstPickIsCpu = firstSeat?.autoPick === true;

        if (firstPickIsCpu) {
          await tx
            .update(PublicSchema.drafts)
            .set({ currentPickDeadline: new Date(now.getTime() - 1) })
            .where(eq(PublicSchema.drafts.id, draftId));
        }

        const [row] = await tx
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        return { draft: row, seatCount: seats.length, firstPickIsCpu };
      });

      LOGGER.info('Mock draft started', {
        draftId,
        userId,
        seatCount: started.seatCount,
      });

      if (context.notificationService) {
        try {
          await context.notificationService.notifyDraftStarted(
            null,
            draftId,
            started.draft.draftOrder,
            started.seatCount,
            started.draft.pickTimeLimitSeconds,
            (started.draft.currentPickDeadline ?? new Date()).toISOString(),
          );
        } catch (notificationError) {
          LOGGER.error(
            'Failed to send draft-started notification for mock draft',
            notificationError instanceof Error
              ? notificationError
              : new Error(String(notificationError)),
            { draftId },
          );
        }
      }

      // The first seat is a CPU one, so there is a pick due immediately.
      if (started.firstPickIsCpu) {
        triggerAutoProcessDraftPicks({ leagueId: null, draftId });
      }

      return started.draft;
    },
  }),
);
