/**
 * Mock draft mutation: joinMockDraft (LS-10076, replacing the LS-9181 flow)
 *
 * Seats a user into an open slot of an ONLINE mock-draft lobby. The legacy
 * path resolved an invite code to a *league* and claimed one of its teams;
 * there is no league now, so a code (or, for a public lobby, the draft id)
 * resolves a `drafts` row and claims a `draft_participants` seat.
 *
 * The draft row is locked FOR UPDATE for the whole claim (LS-10147's pattern):
 * two joiners racing for the last seat serialize on that lock, so exactly one
 * of them gets it and the other is told the lobby is full.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import {
  broadcastLobbyUpdate,
  getSeatAvailability,
  lockMockDraft,
} from './shared';
import { builder } from '../../builder';
import { SportKindEnum } from '../../leagues/types';
import { AuthenticationError, UserInputError } from '../../graphql-errors';

interface JoinMockDraftShape {
  draftId: number;
  seatId: number;
  sport: 'baseball' | 'football';
}

const JoinMockDraftResult = builder.objectRef<JoinMockDraftShape>(
  'JoinMockDraftResult',
);

builder.objectType(JoinMockDraftResult, {
  description: 'The seat claimed by joinMockDraft (LS-10076).',
  fields: (t) => ({
    draftId: t.exposeInt('draftId'),
    seatId: t.exposeInt('seatId', {
      description: "The claimed seat's `draft_participants.id`.",
    }),
    sport: t.field({
      type: SportKindEnum,
      description:
        'Sport of the joined draft — an invite code carries no sport hint, so ' +
        'the client cannot route to /baseball or /football without it (LS-9480).',
      resolve: (parent) => parent.sport,
    }),
  }),
});

/** The message an unusable code or id gets, whichever way it failed. */
const UNKNOWN_CODE_MESSAGE =
  'Invalid invite code. Please check the code and try again.';

builder.mutationField('joinMockDraft', (t) =>
  t.field({
    type: JoinMockDraftResult,
    description:
      'Join an ONLINE mock draft lobby, claiming an open seat that would ' +
      'otherwise be filled by AI when the host starts the draft. A private ' +
      'lobby requires its invite code; a public one can be joined by draft id. ' +
      'Fails once the draft has started or the lobby has expired.',
    args: {
      inviteCode: t.arg.string({
        required: false,
        description: 'Required for a private lobby.',
      }),
      draftId: t.arg.int({
        required: false,
        description:
          'Joins a public lobby directly. Ignored when a code is given.',
      }),
      teamName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to join a mock draft',
        );
      }

      const userId = context.user.id;
      const teamName = args.teamName.trim();
      if (teamName.length === 0) {
        throw UserInputError('teamName is required');
      }

      // Resolve the target draft outside the lock — the row is re-read FOR
      // UPDATE below, so this only decides *which* row to lock.
      const code = args.inviteCode?.trim().toUpperCase();
      let targetDraftId: number;

      if (code) {
        const [match] = await context.db
          .select({ id: PublicSchema.drafts.id })
          .from(PublicSchema.drafts)
          .where(
            and(
              eq(PublicSchema.drafts.inviteCode, code),
              eq(PublicSchema.drafts.kind, 'mock'),
            ),
          )
          .limit(1);
        if (!match) throw UserInputError(UNKNOWN_CODE_MESSAGE);
        targetDraftId = match.id;
      } else if (args.draftId != null) {
        targetDraftId = args.draftId;
      } else {
        throw UserInputError('An invite code or a draft id is required');
      }

      const seat = await context.db.transaction(async (tx) => {
        const draft = await lockMockDraft(tx, targetDraftId);

        // A public lobby is joinable by id; a private one only by its code.
        if (!code && !draft.isPublic) {
          throw UserInputError(UNKNOWN_CODE_MESSAGE);
        }
        if (draft.mockMode !== 'online') {
          throw UserInputError('This mock draft is not a joinable lobby.');
        }
        if (draft.status !== 'not-started') {
          throw UserInputError(
            'This mock draft has already started and can no longer be joined.',
          );
        }
        if (draft.lobbyExpiresAt && draft.lobbyExpiresAt <= new Date()) {
          throw UserInputError('This mock draft lobby has expired.');
        }

        const { seats, openSlots } = await getSeatAvailability(tx, draft.id);

        if (seats.some((s) => s.userId === userId)) {
          throw UserInputError('You have already joined this mock draft.');
        }

        // A slot held by a pending invitation is reserved for that user, not
        // for whoever pastes the code first — openSlots already excludes it.
        const openSeat = seats.find((s) => s.slot === openSlots[0]);

        if (!openSeat) {
          throw UserInputError(
            'This mock draft is full. All seats have been claimed.',
          );
        }

        await tx
          .update(PublicSchema.draftParticipants)
          .set({
            userId,
            controller: 'user',
            seatName: teamName.slice(0, 40),
            joinedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.draftParticipants.id, openSeat.id));

        return { id: openSeat.id, sport: draft.sport };
      });

      LOGGER.info('User joined mock draft', {
        userId,
        draftId: targetDraftId,
        seatId: seat.id,
      });

      await broadcastLobbyUpdate(context, targetDraftId, 'seat-claimed');

      return { draftId: targetDraftId, seatId: seat.id, sport: seat.sport };
    },
  }),
);
