/**
 * Draft chat (LS-10076): `draft_messages`, the mock-draft equivalent of a
 * league's `league_messages`.
 *
 * League drafts keep using league chat — a league draft's chat outlives the
 * draft — so this is the mock-draft side of the client's chat-source adapter.
 * Only seat holders read or post: a mock draft has no spectators.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, eq, lt } from 'drizzle-orm';

import { authorizeDraft, requireSeat } from '../authorize-draft';
import { builder } from '../../builder';
import { detectProfanity } from '../../../services/profanity-filter';
import { AuthenticationError, UserInputError } from '../../graphql-errors';

const MAX_DRAFT_MESSAGE_LENGTH = 1000;
const DEFAULT_MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGE_SIZE = 200;

interface DraftMessageShape {
  id: number;
  draftId: number;
  userId: number | null;
  messageText: string;
  messageType: string;
  gifUrl: string | null;
  containsProfanity: boolean;
  createdAt: Date;
}

const DraftMessage = builder
  .objectRef<DraftMessageShape>('DraftMessage')
  .implement({
    description: "A chat message in a mock draft's own chat (LS-10076).",
    fields: (t) => ({
      id: t.exposeInt('id'),
      draftId: t.exposeInt('draftId'),
      userId: t.exposeInt('userId', {
        nullable: true,
        description: 'Null once the sender deletes their account.',
      }),
      messageText: t.exposeString('messageText'),
      messageType: t.exposeString('messageType'),
      gifUrl: t.exposeString('gifUrl', { nullable: true }),
      containsProfanity: t.exposeBoolean('containsProfanity', {
        description:
          'Server-side profanity check result, as on LeagueMessage (LS-6296).',
      }),
      createdAt: t.string({ resolve: (m) => m.createdAt.toISOString() }),
      user: t.field({
        type: 'User',
        nullable: true,
        resolve: (message, _args, context) =>
          message.userId === null
            ? null
            : context.loaders.users.load(message.userId),
      }),
    }),
  });

builder.queryField('draftMessages', (t) =>
  t.field({
    type: [DraftMessage],
    description:
      "A mock draft's chat, oldest first. Seat holders only — there are no " +
      'spectators in a mock draft.',
    args: {
      draftId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false }),
      beforeId: t.arg.int({
        required: false,
        description: 'Page backwards: only messages with a lower id.',
      }),
    },
    resolve: async (_parent, args, context) => {
      const { draftId } = args;
      await authorizeDraft(context, draftId, 'participate');

      const limit = Math.min(
        args.limit ?? DEFAULT_MESSAGE_PAGE_SIZE,
        MAX_MESSAGE_PAGE_SIZE,
      );

      return context.db
        .select({
          id: PublicSchema.draftMessages.id,
          draftId: PublicSchema.draftMessages.draftId,
          userId: PublicSchema.draftMessages.userId,
          messageText: PublicSchema.draftMessages.messageText,
          messageType: PublicSchema.draftMessages.messageType,
          gifUrl: PublicSchema.draftMessages.gifUrl,
          containsProfanity: PublicSchema.draftMessages.containsProfanity,
          createdAt: PublicSchema.draftMessages.createdAt,
        })
        .from(PublicSchema.draftMessages)
        .where(
          args.beforeId != null
            ? and(
                eq(PublicSchema.draftMessages.draftId, draftId),
                lt(PublicSchema.draftMessages.id, args.beforeId),
              )
            : eq(PublicSchema.draftMessages.draftId, draftId),
        )
        .orderBy(asc(PublicSchema.draftMessages.id))
        .limit(limit);
    },
  }),
);

builder.mutationField('sendDraftMessage', (t) =>
  t.field({
    type: DraftMessage,
    description: "Post a message to a mock draft's chat. Seat holders only.",
    args: {
      draftId: t.arg.int({ required: true }),
      messageText: t.arg.string({ required: true }),
      gifUrl: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required to send a message');
      }

      const { draftId } = args;
      const messageText = args.messageText.trim();

      if (messageText.length === 0) {
        throw UserInputError('Message cannot be empty');
      }
      if (messageText.length > MAX_DRAFT_MESSAGE_LENGTH) {
        throw UserInputError(
          `Message cannot exceed ${MAX_DRAFT_MESSAGE_LENGTH} characters`,
        );
      }

      const auth = await authorizeDraft(context, draftId, 'participate');
      requireSeat(auth);

      const userId = context.user.id;
      const senderUsername = context.user.username ?? `user_${String(userId)}`;

      const [message] = await context.db
        .insert(PublicSchema.draftMessages)
        .values({
          draftId,
          userId,
          messageText,
          messageType: args.gifUrl ? 'gif' : 'text',
          gifUrl: args.gifUrl ?? null,
          containsProfanity: detectProfanity(messageText),
        })
        .returning();

      if (context.notificationService) {
        try {
          await context.notificationService.notifyDraftChatMessage({
            draftId,
            messageId: message.id,
            senderId: userId,
            senderUsername,
            messageText: message.messageText,
            gifUrl: message.gifUrl,
            timestamp: message.createdAt.toISOString(),
          });
        } catch (err) {
          // The message is already persisted; a dropped frame costs the room
          // a refetch, not the message.
          LOGGER.warn('Failed to broadcast draft chat message', {
            draftId,
            messageId: message.id,
            err,
          });
        }
      }

      return message;
    },
  }),
);
