/**
 * Draft domain — scheduled mutation for auto-starting drafts at their scheduled time.
 *
 * LS-8309: wired to `terraform/main/eventbridge.tf`'s `draft_scheduler_tick`
 * rule (rate(1 minute)). LS-8907 merged this into the same EventBridge
 * invocation as `autoProcessDraftPicks` — both mutations are sent as
 * sibling fields in one GraphQL request/Lambda invocation, each still
 * fully self-contained with its own try/catch, so a failure in one never
 * blocks or delays the other. Live check:
 * `aws events list-rules --name-prefix legacy-sports-dev`.
 *
 * When invoked, finds all live drafts with `scheduled_at <= now` and
 * `draft_status = 'not-started'`, then initializes them exactly as
 * `initializeDraft` would for live mode:
 *  1. Shuffle & seat the draft (draft_participants)
 *  2. Set draftStartedAt, initial pick deadline
 *  3. Update league draft_status → 'in-progress'
 *  4. Send DRAFT_STARTED WebSocket notification
 *
 * Guarded rollout (LS-8309): drafts whose `scheduled_at` is more than
 * `STALE_SCHEDULE_THRESHOLD_MS` in the past are treated as stale backlog
 * rather than auto-started — see `STALE_SCHEDULE_THRESHOLD_MS` below. This
 * prevents every long-dormant scheduled draft from mass-starting in the same
 * invocation the first time the rule goes live in an environment that has
 * been silently accumulating past-due `scheduled_at` rows.
 *
 * Authorization: system-only (system request or admin).
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, lte } from 'drizzle-orm';

import {
  enableAutoPickForUnmanagedTeams,
  resolveDraftTeamsOrder,
} from './helpers';
import { setLeagueDraftStatus } from './draft-status';
import { reseatLeagueDraft } from './participants';
import { notifyDraftStartPushes } from './on-the-clock-push';
import { cancelPendingDraftSlotTradesForLeague } from '../draft-slot-trades/helpers';
import { builder } from '../builder';

// ── Guarded rollout (LS-8309) ────────────────────────────────────────────────

/**
 * Drafts whose `scheduled_at` is more than this far in the past are skipped
 * as stale backlog (reported via `result.errors`) instead of auto-started.
 *
 * Rationale: the EventBridge rule polls every minute, so under normal
 * operation a due draft is picked up within a minute of its scheduled time.
 * A draft overdue by more than this threshold got there because no invoker
 * existed yet (LS-8309) or because auto-start silently failed for a while —
 * either way it should not be lumped into an unattended mass-start the
 * moment the rule (re)starts polling; it needs a human to look at it.
 */
export const STALE_SCHEDULE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

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
 * Runs on an every-minute EventBridge schedule, sent as a sibling field in
 * the same GraphQL request/invocation as `autoProcessDraftPicks` (LS-8907)
 * — see the header comment for the guarded-rollout staleness cutoff.
 */
builder.mutationField('autoStartScheduledDrafts', (t) =>
  t.field({
    type: AutoStartScheduledDraftsResult,
    args: {},
    description:
      'System-only: start all live drafts whose scheduled_at has arrived.',
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
            // The inner join below keeps this to league drafts, so read the
            // non-null league id rather than the nullable drafts.league_id.
            leagueId: PublicSchema.leagues.id,
            draftMode: PublicSchema.drafts.draftMode,
            selectionMethod: PublicSchema.drafts.selectionMethod,
            draftOrder: PublicSchema.drafts.draftOrder,
            pickTimeLimitSeconds: PublicSchema.drafts.pickTimeLimitSeconds,
            scheduledAt: PublicSchema.drafts.scheduledAt,
            rosterContinuity: PublicSchema.leagues.rosterContinuity,
            previousLeagueId: PublicSchema.leagues.previousLeagueId,
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

        // Guarded rollout (LS-8309): separate drafts that are merely due from
        // those that are stale backlog (overdue by more than the threshold).
        // Only the former auto-start; the latter are reported for manual
        // triage so a long-dormant backlog can't mass-start in one invocation.
        const staleCutoff = new Date(
          now.getTime() - STALE_SCHEDULE_THRESHOLD_MS,
        );
        const draftsToStart = scheduledDrafts.filter(
          (d) => d.scheduledAt && d.scheduledAt >= staleCutoff,
        );
        const staleDrafts = scheduledDrafts.filter(
          (d) => !d.scheduledAt || d.scheduledAt < staleCutoff,
        );

        for (const stale of staleDrafts) {
          const overdueMs = now.getTime() - (stale.scheduledAt?.getTime() ?? 0);
          LOGGER.warn(
            `[autoStartScheduledDrafts] Draft ${stale.draftId} is stale backlog — skipping auto-start`,
            { draftId: stale.draftId, leagueId: stale.leagueId, overdueMs },
          );
          result.errors.push(
            `Draft ${stale.draftId}: scheduled_at is more than ${
              STALE_SCHEDULE_THRESHOLD_MS / 60_000
            } minutes overdue — skipped as stale backlog, needs manual review`,
          );
        }

        if (draftsToStart.length === 0) {
          LOGGER.info(
            '[autoStartScheduledDrafts] No non-stale scheduled drafts due to start',
          );
          return result;
        }

        LOGGER.info(
          `[autoStartScheduledDrafts] Found ${draftsToStart.length} draft(s) to start`,
        );

        const notificationService = context.notificationService;

        for (const draft of draftsToStart) {
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

            // LS-8742: preserve any seat order already seeded by an
            // approved draft slot trade (LS-8676) instead of unconditionally
            // reshuffling it away at draft start. When a fresh order is
            // needed, Reverse Standings (keeper leagues only, LS-8929)
            // orders worst-to-best by the previous season's final
            // standings; falls back to random otherwise (including a
            // keeper league's inaugural season).
            const { orderedTeamIds, needsInsert } =
              await resolveDraftTeamsOrder(context.db, draftId, teams, {
                draftOrder: draft.draftOrder,
                rosterContinuity: draft.rosterContinuity,
                previousLeagueId: draft.previousLeagueId,
              });

            const startedAt = new Date();
            const pickTimeLimit = Number(draft.pickTimeLimitSeconds) || 120;
            const initialDeadline = new Date(
              startedAt.getTime() + pickTimeLimit * 1000,
            );

            // Wrap the multi-step write sequence in a transaction so a
            // mid-flight failure cannot leave draft state inconsistent.
            const autoPickTeamIds = await context.db.transaction(async (tx) => {
              // Clear any stale draft_picks from a previous run first —
              // draft_picks.participant_id cascades, so reseating below
              // would otherwise take them with it.
              await tx
                .delete(PublicSchema.draftPicks)
                .where(eq(PublicSchema.draftPicks.draftId, draftId));

              if (needsInsert) {
                // Replace any stale seats from a previous run with the
                // freshly resolved (randomized) order.
                await reseatLeagueDraft(tx, {
                  draftId,
                  leagueId,
                  orderedTeamIds,
                });
              }

              // LS-545 / LS-480: Enable auto-pick for teams without a
              // general manager. Runs inside the transaction, after the
              // seats it writes to exist (LS-10074).
              const unmanagedTeamIds = await enableAutoPickForUnmanagedTeams(
                tx,
                leagueId,
                draftId,
                orderedTeamIds,
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

              // Draft status — dual-written onto the league in the same
              // transaction (LS-10074).
              await setLeagueDraftStatus(tx, {
                draftId,
                leagueId,
                status: 'in-progress',
              });

              // The draft is now starting — any still-pending draft slot
              // trades (proposed/accepted/approved) can never execute
              // (LS-8676 AC4).
              await cancelPendingDraftSlotTradesForLeague(tx, leagueId);

              return unmanagedTeamIds;
            });

            if (autoPickTeamIds.length > 0) {
              LOGGER.info(
                '[autoStartScheduledDrafts] Auto-pick enabled for unmanaged teams',
                { leagueId, draftId, teamIds: autoPickTeamIds },
              );
            }

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

            // LS-10593: push the first-pick holder (on the clock) and every other
            // league member (draft started). Never throws.
            await notifyDraftStartPushes(
              context.db,
              context.notificationPublisher,
              { draftId, leagueId },
            );

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
