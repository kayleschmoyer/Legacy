/**
 * Draft mutation: toggleDraftAutoPick (LS-427)
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import type { PublicDb } from '@legacy-sports/db-client';
import { getCurrentDraftPickInfo } from '../helpers';
import {
  type DraftSeat,
  getSeatForTeam,
  getSeatForUser,
  setSeatAutoPickById,
} from '../participants';
import { requireLeagueId } from '../league-draft';
import { builder } from '../../builder';
import { ForbiddenError, UserInputError } from '../../graphql-errors';

/**
 * The seat the caller's league team holds in this draft.
 *
 * @throws when the caller has no team in the league, or the team has no seat.
 */
async function resolveLeagueSeat(
  db: PublicDb,
  draft: { leagueId: number | null },
  draftId: number,
  userId: number,
): Promise<DraftSeat | null> {
  const leagueId = requireLeagueId(draft);

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
    throw ForbiddenError(
      'You are not a member of this league or do not own a team',
    );
  }

  return getSeatForTeam(db, draftId, membership.teamId);
}

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
 * A missed pick (deadline expires) is auto-picked for that one pick only;
 * auto-pick is switched on permanently just for teams with no manager
 * (autoProcessDraftPicks → enableAutoPickForUnmanagedTeams). A managed team
 * keeps its setting, and a manual pick by the seat's own manager turns
 * auto-pick back off (LS-10593).
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
      "Enable or disable auto-pick for the current user's team in a live draft. When enabled the system immediately picks for them as soon as their turn begins. A missed pick is auto-picked for that pick only (auto-pick stays on permanently only for teams with no manager), and making a pick manually turns auto-pick off.",
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
            kind: PublicSchema.drafts.kind,
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

        // Resolve the caller's seat: a mock-draft seat is held by the user
        // directly, a league seat by their team (LS-10076).
        const seat =
          draft.kind === 'mock'
            ? await getSeatForUser(context.db, draftId, userId)
            : await resolveLeagueSeat(context.db, draft, draftId, userId);

        if (!seat) {
          throw ForbiddenError('You are not participating in this draft');
        }

        // Update auto-pick preference
        await setSeatAutoPickById(context.db, seat.id, enable);

        LOGGER.info('[toggleDraftAutoPick] Auto-pick toggled', {
          draftId,
          participantId: seat.id,
          teamId: seat.teamId,
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
            currentPickInfo.participantId === seat.id
          ) {
            await context.db
              .update(PublicSchema.drafts)
              .set({ currentPickDeadline: new Date(Date.now() - 1) })
              .where(eq(PublicSchema.drafts.id, draftId));
            LOGGER.info(
              "[toggleDraftAutoPick] It is this seat's turn — expiring deadline immediately",
              { draftId, participantId: seat.id },
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
