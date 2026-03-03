/**
 * Draft mutations: pauseDraft + resumeDraft
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, desc, eq } from 'drizzle-orm';

import { Draft } from '../types';
import { builder } from '../../builder';
import { AuthenticationError, ForbiddenError } from '../../graphql-errors';

// ── Pause / Resume Draft ────────────────────────────────────────────────────

/**
 * Mutation: Pause a live draft
 * Only the league General Manager/commissioner can pause. Sets status to 'paused'
 * so makeDraftPick will reject picks until resumed.
 */
builder.mutationField('pauseDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;
      const userId = context.user.id;

      // Verify user is a league owner/commissioner
      const [membership] = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership || membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError('Only a league commissioner can pause the draft');
      }

      // Verify draft is in-progress
      const [league] = await context.db
        .select()
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!league) {
        throw new Error('League not found');
      }

      if (league.draftStatus !== 'in-progress') {
        throw new Error(
          `Cannot pause draft: current status is '${league.draftStatus}'`,
        );
      }

      // Update league status to paused
      await context.db
        .update(PublicSchema.leagues)
        .set({ draftStatus: 'paused' })
        .where(eq(PublicSchema.leagues.id, leagueId));

      // Clear the pick deadline while paused
      await context.db
        .update(PublicSchema.drafts)
        .set({ currentPickDeadline: null })
        .where(eq(PublicSchema.drafts.leagueId, leagueId));

      // Get the draft record to return
      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .orderBy(desc(PublicSchema.drafts.createdAt))
        .limit(1);

      LOGGER.info('Draft paused', { leagueId, userId });

      // Notify all league connections
      if (context.notificationService) {
        await context.notificationService.notifyDraftPaused(leagueId);
      }

      return draft;
    },
  }),
);

/**
 * Mutation: Resume a paused draft
 * Only the league owner/commissioner can resume. Sets status back to 'in-progress'.
 */
builder.mutationField('resumeDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;
      const userId = context.user.id;

      // Verify user is a league owner/commissioner
      const [membership] = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership || membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError('Only a league commissioner can resume the draft');
      }

      // Verify draft is paused
      const [league] = await context.db
        .select()
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!league) {
        throw new Error('League not found');
      }

      if (league.draftStatus !== 'paused') {
        throw new Error(
          `Cannot resume draft: current status is '${league.draftStatus}'`,
        );
      }

      // Update league status back to in-progress
      await context.db
        .update(PublicSchema.leagues)
        .set({ draftStatus: 'in-progress' })
        .where(eq(PublicSchema.leagues.id, leagueId));

      // Get the draft record and set a fresh pick deadline
      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .orderBy(desc(PublicSchema.drafts.createdAt))
        .limit(1);

      if (draft) {
        const pickTimeLimit = Number(draft.pickTimeLimitSeconds) || 120;
        const resumeDeadline = new Date(Date.now() + pickTimeLimit * 1000);
        await context.db
          .update(PublicSchema.drafts)
          .set({ currentPickDeadline: resumeDeadline })
          .where(eq(PublicSchema.drafts.id, draft.id));

        LOGGER.info('Draft resumed', { leagueId, userId });

        // Notify all league connections
        if (context.notificationService) {
          await context.notificationService.notifyDraftResumed(
            leagueId,
            resumeDeadline.toISOString(),
          );
        }
      } else {
        LOGGER.info('Draft resumed (no draft record found)', {
          leagueId,
          userId,
        });
      }

      return draft;
    },
  }),
);
