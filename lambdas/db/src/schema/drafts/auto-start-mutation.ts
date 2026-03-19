/**
 * Draft domain — scheduled mutation for auto-starting drafts at their scheduled time.
 *
 * Triggered every minute by EventBridge. Finds all live drafts with
 * `scheduled_at <= now` and `draft_status = 'not-started'`, then initializes
 * them exactly as `initializeDraft` would for live mode:
 *  1. Shuffle & insert draft_teams rows
 *  2. Set draftStartedAt, initial pick deadline
 *  3. Update league draft_status → 'in-progress'
 *  4. Send DRAFT_STARTED WebSocket notification
 *
 * Authorization: system-only (EventBridge API key required).
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { shuffleArray } from '@legacy-sports/utils';
import { and, eq, lte } from 'drizzle-orm';

import { enableAutoPickForUnmanagedTeams } from './helpers';
import { builder } from '../builder';

// ── Response Type ────────────────────────────────────────────────────────────

interface AutoStartScheduledDraftsResultShape {
  draftsStarted: number;
  errors: string[];
}

const AutoStartScheduledDraftsResult =
  builder.objectRef<AutoStartScheduledDraftsResultShape>(
    'AutoStartScheduledDraftsResult',
  );

builder.objectType(AutoStartScheduledDraftsResult, {
  description: 'Result of the scheduled draft auto-start job',
  fields: (t) => ({
    draftsStarted: t.exposeInt('draftsStarted'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Mutation ─────────────────────────────────────────────────────────────────

/**
 * Mutation: autoStartScheduledDrafts
 *
 * Finds all drafts whose `scheduled_at` is at or before the current time and
 * whose associated league has `draft_status = 'not-started'`, then starts each
 * one as a live draft.
 *
 * Called by EventBridge every minute alongside `autoProcessDraftPicks`.
 */
builder.mutationField('autoStartScheduledDrafts', (t) =>
  t.field({
    type: AutoStartScheduledDraftsResult,
    args: {},
    description:
      'System-only: start all live drafts whose scheduled_at has arrived. Triggered by EventBridge every minute.',
    resolve: async (_parent, _args, context) => {
      // Only EventBridge system requests or admins may invoke this
      if (!context.isSystemRequest && !context.user?.isAdmin) {
        throw new Error(
          'Unauthorized: autoStartScheduledDrafts is a system-only operation.',
        );
      }

      LOGGER.info(
        '[autoStartScheduledDrafts] Scanning for scheduled drafts to start',
      );

      const result: AutoStartScheduledDraftsResultShape = {
        draftsStarted: 0,
        errors: [],
      };

      try {
        const now = new Date();

        // Find all drafts with scheduled_at <= now that belong to a not-started league
        const scheduledDrafts = await context.db
          .select({
            draftId: PublicSchema.drafts.id,
            leagueId: PublicSchema.drafts.leagueId,
            draftMode: PublicSchema.drafts.draftMode,
            selectionMethod: PublicSchema.drafts.selectionMethod,
            draftOrder: PublicSchema.drafts.draftOrder,
            pickTimeLimitSeconds: PublicSchema.drafts.pickTimeLimitSeconds,
            scheduledAt: PublicSchema.drafts.scheduledAt,
          })
          .from(PublicSchema.drafts)
          .innerJoin(
            PublicSchema.leagues,
            eq(PublicSchema.drafts.leagueId, PublicSchema.leagues.id),
          )
          .where(
            and(
              lte(PublicSchema.drafts.scheduledAt, now),
              eq(PublicSchema.leagues.draftStatus, 'not-started'),
            ),
          );

        if (scheduledDrafts.length === 0) {
          LOGGER.info(
            '[autoStartScheduledDrafts] No scheduled drafts due to start',
          );
          return result;
        }

        LOGGER.info(
          `[autoStartScheduledDrafts] Found ${scheduledDrafts.length} draft(s) to start`,
        );

        const notificationService = context.notificationService;

        for (const draft of scheduledDrafts) {
          const { draftId, leagueId } = draft;
          try {
            // Get all teams in the league
            const teams = await context.db
              .select({ id: PublicSchema.teams.id })
              .from(PublicSchema.teams)
              .where(eq(PublicSchema.teams.leagueId, leagueId));

            if (teams.length < 2) {
              LOGGER.warn(
                `[autoStartScheduledDrafts] League ${leagueId} has fewer than 2 teams — skipping`,
                { leagueId, teamCount: teams.length },
              );
              result.errors.push(
                `League ${leagueId}: fewer than 2 teams, cannot auto-start`,
              );
              continue;
            }

            // Randomize draft order
            const shuffled = shuffleArray(teams);

            // LS-545 / LS-480: Enable auto-pick for teams without a general manager
            const autoPickTeamIds = await enableAutoPickForUnmanagedTeams(
              context.db,
              leagueId,
              draftId,
              shuffled.map((t) => t.id),
            );

            if (autoPickTeamIds.length > 0) {
              LOGGER.info(
                '[autoStartScheduledDrafts] Auto-pick enabled for unmanaged teams',
                { leagueId, draftId, teamIds: autoPickTeamIds },
              );
            }

            const startedAt = new Date();
            const pickTimeLimit = Number(draft.pickTimeLimitSeconds) || 120;
            const initialDeadline = new Date(
              startedAt.getTime() + pickTimeLimit * 1000,
            );

            // Wrap the multi-step write sequence in a transaction so a
            // mid-flight failure cannot leave draft state inconsistent.
            await context.db.transaction(async (tx) => {
              // Clear any stale draft_teams and draft_picks from previous runs
              await tx
                .delete(PublicSchema.draftTeams)
                .where(eq(PublicSchema.draftTeams.draftId, draftId));
              await tx
                .delete(PublicSchema.draftPicks)
                .where(eq(PublicSchema.draftPicks.draftId, draftId));

              // Insert draft teams in randomized order
              await tx.insert(PublicSchema.draftTeams).values(
                shuffled.map((team, index) => ({
                  draftId,
                  teamId: team.id,
                  leagueId,
                  draftOrder: index + 1,
                })),
              );

              // Update the draft record with started timestamps + first pick deadline
              await tx
                .update(PublicSchema.drafts)
                .set({
                  draftStartedAt: startedAt,
                  currentPick: 0,
                  currentPickDeadline: initialDeadline,
                  updatedAt: startedAt,
                })
                .where(eq(PublicSchema.drafts.id, draftId));

              // Update league status
              await tx
                .update(PublicSchema.leagues)
                .set({ draftStatus: 'in-progress' })
                .where(eq(PublicSchema.leagues.id, leagueId));
            });

            // Send WebSocket notification
            if (notificationService) {
              await notificationService.notifyDraftStarted(
                leagueId,
                draftId,
                draft.draftOrder,
                teams.length,
                pickTimeLimit,
                initialDeadline.toISOString(),
              );
            }

            // Post system league message
            try {
              const [chatMsg] = await context.db
                .insert(PublicSchema.leagueMessages)
                .values({
                  leagueId,
                  userId: null,
                  messageText:
                    '🏈 The scheduled draft has automatically started! Get ready to pick.',
                  messageType: 'draft_settings',
                  metadata: {
                    autoStarted: true,
                    scheduledAt: draft.scheduledAt?.toISOString(),
                  },
                })
                .returning();

              if (notificationService) {
                notificationService
                  .notifyLeagueChatMessage(leagueId, {
                    leagueId,
                    messageId: chatMsg.id,
                    senderId: null,
                    senderUsername: 'System',
                    messageText:
                      '🏈 The scheduled draft has automatically started! Get ready to pick.',
                    timestamp: chatMsg.timestamp ?? startedAt.toISOString(),
                    messageType: 'draft_settings',
                    metadata: { autoStarted: true },
                  })
                  .catch((notifyErr: unknown) => {
                    LOGGER.warn(
                      '[autoStartScheduledDrafts] Failed to send chat WS notification',
                      { leagueId, notifyErr },
                    );
                  });
              }
            } catch (chatErr) {
              LOGGER.warn(
                '[autoStartScheduledDrafts] Failed to insert system chat message (non-fatal)',
                { leagueId, chatErr },
              );
            }

            result.draftsStarted++;
            LOGGER.info('[autoStartScheduledDrafts] Draft auto-started', {
              draftId,
              leagueId,
              teamCount: teams.length,
              scheduledAt: draft.scheduledAt,
            });
          } catch (draftError) {
            const errMsg =
              draftError instanceof Error
                ? draftError.message
                : String(draftError);
            LOGGER.error(
              `[autoStartScheduledDrafts] Error starting draft ${draftId}`,
              draftError instanceof Error ? draftError : new Error(errMsg),
              { draftId, leagueId },
            );
            result.errors.push(`Draft ${draftId}: ${errMsg}`);
          }
        }

        LOGGER.info('[autoStartScheduledDrafts] Completed', {
          draftsStarted: result.draftsStarted,
          errorCount: result.errors.length,
        });

        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        LOGGER.error(
          '[autoStartScheduledDrafts] Fatal error',
          error instanceof Error ? error : new Error(errMsg),
        );
        result.errors.push(errMsg);
        return result;
      }
    },
  }),
);
