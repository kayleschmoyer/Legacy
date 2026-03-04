/**
 * Draft mutation: commissionerSetDraftAutoPickDisabled (LS-481)
 *
 * Allows the league commissioner/GM to disable (or re-enable) the auto-pick
 * feature for the entire draft. When disabled:
 *   - autoProcessDraftPicks will NOT auto-pick for this draft when deadlines
 *     expire (the draft effectively requires manual picks for all teams).
 *   - Individual teams CANNOT enable their own auto-pick toggle.
 *
 * Auth: league commissioner (permissionLevel = 'commissioner').
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import { Draft } from '../types';
import { builder } from '../../builder';
import { AuthenticationError, ForbiddenError } from '../../graphql-errors';

// ── commissionerSetDraftAutoPickDisabled ─────────────────────────────────────

builder.mutationField('commissionerSetDraftAutoPickDisabled', (t) =>
  t.field({
    type: Draft,
    args: {
      draftId: t.arg.int({ required: true }),
      disabled: t.arg.boolean({ required: true }),
    },
    description:
      'Commissioner: enable or disable auto-pick for the entire draft (LS-481).' +
      ' When disabled, autoProcessDraftPicks will not fire and teams cannot opt in to auto-pick.',
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to change draft auto-pick settings',
        );
      }

      const { draftId, disabled } = args;
      const userId = context.user.id;

      // Fetch draft + leagueId
      const [draft] = await context.db
        .select({
          id: PublicSchema.drafts.id,
          leagueId: PublicSchema.drafts.leagueId,
        })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw new Error('Draft not found');
      }

      // Verify caller is the league commissioner
      const [membership] = await context.db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership || membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError(
          'Only the league commissioner can change the draft auto-pick setting',
        );
      }

      // Verify draft is currently in-progress (can only change mid-draft)
      const [league] = await context.db
        .select({ draftStatus: PublicSchema.leagues.draftStatus })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, draft.leagueId))
        .limit(1);

      if (!league || league.draftStatus !== 'in-progress') {
        throw new Error(
          'Draft auto-pick can only be toggled while a draft is in progress',
        );
      }

      // Apply the change
      await context.db
        .update(PublicSchema.drafts)
        .set({ autoPickDisabled: disabled })
        .where(eq(PublicSchema.drafts.id, draftId));

      LOGGER.info(
        '[commissionerSetDraftAutoPickDisabled] Auto-pick disabled flag set',
        {
          draftId,
          leagueId: draft.leagueId,
          userId,
          disabled,
        },
      );

      // Return the updated draft row
      const [updatedDraft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!updatedDraft) {
        throw new Error('Draft not found after update');
      }

      return updatedDraft;
    },
  }),
);
