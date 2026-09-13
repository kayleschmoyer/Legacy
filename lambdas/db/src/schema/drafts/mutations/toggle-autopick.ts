/**
 * Draft mutation: toggleDraftAutoPick (LS-427)
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import { getCurrentDraftPickInfo } from '../helpers';
import { getSeatForTeam, setSeatAutoPick } from '../participants';
import { builder } from '../../builder';
import { UserInputError } from '../../graphql-errors';

// ── toggleDraftAutoPick ───────────────────────────────────────────────────────

/**
 * Mutation: Toggle auto-pick for the current user's team in a live draft (LS-427)
 *
 * When enabled:
 *   - As soon as it is this team's turn on the clock, the system immediately
 *     makes the best available pick on their behalf (no waiting for deadline).
 *   - If the draft is in-progress and it is currently this team's turn, the
 *     deadline is immediately expired so autoProcessDraftPicks fires ASAP.
 *
 * When a team misses a pick (deadline expires), auto-pick is automatically
 * enabled for them — this mutation also allows manually re-enabling it or
 * turning it back off before the next pick.
 *
 * Auth: authenticated user who owns the relevant team in this draft.
 */
builder.mutationField('toggleDraftAutoPick', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      draftId: t.arg.int({ required: true }),
      enable: t.arg.boolean({ required: true }),
    },
    description:
      "Enable or disable auto-pick for the current user's team in a live draft. When enabled the system immediately picks for them as soon as their turn begins. Enabling also activates automatically when a team misses a pick.",
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to toggle auto-pick');
      }

      const { draftId, enable } = args;
      const userId = context.user.id;

      try {
        // Fetch draft
        const [draft] = await context.db
          .select({
            id: PublicSchema.drafts.id,
            leagueId: PublicSchema.drafts.leagueId,
            status: PublicSchema.drafts.status,
            autoPickDisabled: PublicSchema.drafts.autoPickDisabled,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        if (!draft) {
          throw UserInputError('Draft not found');
        }

        // LS-481: block if the commissioner has disabled auto-pick league-wide
        if (draft.autoPickDisabled) {
          throw new Error(
            'Auto-pick has been disabled for this draft by the commissioner',
          );
        }

        // Verify the draft is in-progress. Reads drafts.status (LS-10074)
        // rather than leagues.draft_status — the row is already loaded.
        if (draft.status !== 'in-progress') {
          throw new Error(
            'Auto-pick can only be toggled while a draft is in progress',
          );
        }

        // Resolve the user's team in this draft via league membership
        const [membership] = await context.db
          .select({ teamId: PublicSchema.leagueMembers.teamId })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership?.teamId) {
          throw new Error(
            'You are not a member of this league or do not own a team',
          );
        }

        const teamId = membership.teamId;

        // Verify the team holds a seat in this draft
        const seat = await getSeatForTeam(context.db, draftId, teamId);

        if (!seat) {
          throw new Error('Your team is not participating in this draft');
        }

        // Update auto-pick preference
        await setSeatAutoPick(context.db, {
          draftId,
          leagueId: draft.leagueId,
          teamIds: [teamId],
          autoPick: enable,
        });

        LOGGER.info('[toggleDraftAutoPick] Auto-pick toggled', {
          draftId,
          teamId,
          userId,
          enable,
        });

        // If enabling auto-pick and it is currently this team's turn, immediately
        // expire the deadline so autoProcessDraftPicks fires on the next nudge.
        if (enable) {
          const currentPickInfo = await getCurrentDraftPickInfo(
            context.db,
            draftId,
          );
          if (
            currentPickInfo &&
            !currentPickInfo.isComplete &&
            currentPickInfo.teamId === teamId
          ) {
            await context.db
              .update(PublicSchema.drafts)
              .set({ currentPickDeadline: new Date(Date.now() - 1) })
              .where(eq(PublicSchema.drafts.id, draftId));
            LOGGER.info(
              "[toggleDraftAutoPick] It is this team's turn — expiring deadline immediately",
              { draftId, teamId },
            );
          }
        }

        return enable;
      } catch (error) {
        LOGGER.error(
          'Error toggling auto-pick',
          error instanceof Error ? error : new Error(String(error)),
          { draftId, userId, enable },
        );
        throw error;
      }
    },
  }),
);
