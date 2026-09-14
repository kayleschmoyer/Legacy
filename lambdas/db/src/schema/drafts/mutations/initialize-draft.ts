/**
 * Draft mutation: initializeDraft
 */

import { PublicSchema } from '@legacy-sports/db-client';
import {
  DraftSqsService,
  type StartDraftMessage,
} from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, desc, eq } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { Draft } from '../types';
import {
  enableAutoPickForUnmanagedTeams,
  resolveDraftTeamsOrder,
} from '../helpers';
import { setLeagueDraftStatus } from '../draft-status';
import { reseatLeagueDraft } from '../participants';
import { cancelPendingDraftSlotTradesForLeague } from '../../draft-slot-trades/helpers';
import { applyKeeperDesignationsForDraft } from '../keeper-application';
import { builder } from '../../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

/**
 * Mutation: Initialize a draft (live or automated)
 * Creates the drafts record, randomizes the seat order (draft_participants), and
 * either starts a live pick-by-pick session or queues an automated draft to SQS.
 *
 * For live drafts: sets draftStatus to 'in-progress', sets pick deadline,
 * sends WebSocket notification.
 * For automated drafts: sets draftStatus to 'queued', sends SQS message to
 * the draft-processor Lambda for background processing.
 *
 * This is the single entry point for all draft types — the commissioner UI
 * calls this mutation regardless of draft mode.
 */
builder.mutationField('initializeDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
      draftOrder: t.arg.string({ required: false }), // 'snake' (default) | 'linear'
      draftMode: t.arg.string({ required: false }), // 'live' (default) | 'automated'
      selectionMethod: t.arg.string({ required: false }), // 'standard' | 'auction' | 'random'
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to initialize a draft',
        );
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // Read saved draft settings from the database
        const [savedDraft] = await context.db
          .select({
            draftMode: PublicSchema.drafts.draftMode,
            selectionMethod: PublicSchema.drafts.selectionMethod,
            draftOrder: PublicSchema.drafts.draftOrder,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .orderBy(desc(PublicSchema.drafts.createdAt))
          .limit(1);

        // Use saved settings as defaults, then override with any explicit args
        const draftMode = (args.draftMode ??
          savedDraft?.draftMode ??
          'live') as 'live' | 'automated';
        const selectionMethod = (args.selectionMethod ??
          savedDraft?.selectionMethod ??
          'standard') as 'standard' | 'auction' | 'random';
        const draftOrder = (args.draftOrder ??
          savedDraft?.draftOrder ??
          'snake') as 'snake' | 'linear' | 'reverse_standings';

        if (
          draftOrder !== 'snake' &&
          draftOrder !== 'linear' &&
          draftOrder !== 'reverse_standings'
        ) {
          throw new Error(
            "draftOrder must be 'snake', 'linear', or 'reverse_standings'",
          );
        }
        if (draftMode !== 'live' && draftMode !== 'automated') {
          throw new Error("draftMode must be 'live' or 'automated'");
        }

        // Fetch league
        const [league] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw UserInputError('League not found');
        }

        if (league.draftStatus !== 'not-started') {
          throw UserInputError(
            `Cannot initialize draft: current status is '${league.draftStatus}'`,
          );
        }

        // Reverse Standings requires a keeper league's prior-season data —
        // out of scope for redraft/dynasty leagues (LS-8929).
        if (
          draftOrder === 'reverse_standings' &&
          league.rosterContinuity !== 'keeper'
        ) {
          throw UserInputError(
            "The 'reverse_standings' draft order is only available for keeper leagues",
          );
        }

        // Verify user is the league commissioner
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
          throw ForbiddenError(
            'Only the league Commissioner can initialize a draft',
          );
        }

        // Get all teams in the league
        const teams = await context.db
          .select({ id: PublicSchema.teams.id })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, leagueId))
          .orderBy(asc(PublicSchema.teams.id));

        if (teams.length < 2) {
          throw new Error('At least 2 teams are required to start a draft');
        }

        // Upsert the draft record — update the existing one from league creation,
        // or create a new one if somehow missing
        const [existingDraft] = await context.db
          .select({ id: PublicSchema.drafts.id })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .orderBy(desc(PublicSchema.drafts.createdAt))
          .limit(1);

        // Wrap all multi-step DB writes in a transaction so the sequence is
        // atomic. A failure mid-sequence no longer leaves the draft in an
        // inconsistent state. For automated drafts, the SQS send happens
        // *after* the transaction commits so the external call does not block
        // the DB connection; a compensating write rolls back if SQS fails.
        type TxResult =
          | {
              draft: typeof PublicSchema.drafts.$inferSelect;
              mode: 'live';
              autoPickTeamIds: number[];
              pickTimeLimit: number;
              initialDeadline: Date;
            }
          | {
              draft: typeof PublicSchema.drafts.$inferSelect;
              mode: 'automated';
            };

        const txResult: TxResult = await context.db.transaction(async (tx) => {
          let txDraft: typeof PublicSchema.drafts.$inferSelect;

          // LS-10147: re-check draftStatus under a row lock before touching
          // seats. The pre-transaction check above is TOCTOU-vulnerable — two
          // concurrent initializeDraft calls (e.g. a double-clicked "start
          // draft" button) can both read 'not-started' and both reach the
          // reseat below, racing each other's delete+insert into the same
          // (draft_id, team_id) seats and crashing on a unique-constraint
          // violation instead of failing cleanly. Locking here serializes the
          // two calls: the second blocks until the first commits, then sees
          // the now-advanced status and bails out with a normal user-facing
          // rejection (caught below and skipped from Rollbar, same as any
          // other state-machine conflict).
          const [lockedLeague] = await tx
            .select({ draftStatus: PublicSchema.leagues.draftStatus })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .limit(1)
            .for('update');

          if (lockedLeague.draftStatus !== 'not-started') {
            throw UserInputError(
              `Cannot initialize draft: current status is '${lockedLeague.draftStatus}'`,
            );
          }

          // LS-8742: preserve any seat order already seeded by an
          // approved draft slot trade (LS-8676) instead of unconditionally
          // reshuffling it away at draft start. When a fresh order is
          // needed, Reverse Standings (keeper leagues only, LS-8929) orders
          // worst-to-best by the previous season's final standings; falls
          // back to random otherwise (including a keeper league's
          // inaugural season, with no previous standings to draw from).
          const { orderedTeamIds, needsInsert } = await resolveDraftTeamsOrder(
            tx,
            existingDraft?.id ?? null,
            teams,
            {
              draftOrder,
              rosterContinuity: league.rosterContinuity,
              previousLeagueId: league.previousLeagueId,
            },
          );

          if (existingDraft) {
            // Clear any leftover draft_picks from a previous initialization
            // first: draft_picks.participant_id cascades, so reseating below
            // would otherwise take them with it (LS-10074).
            await tx
              .delete(PublicSchema.draftPicks)
              .where(eq(PublicSchema.draftPicks.draftId, existingDraft.id));

            const [updated] = await tx
              .update(PublicSchema.drafts)
              .set({
                draftMode,
                selectionMethod,
                draftOrder,
                currentPick: 0,
                draftStartedAt: new Date(),
                draftCompletedAt: null,
                currentPickDeadline: null,
              })
              .where(eq(PublicSchema.drafts.id, existingDraft.id))
              .returning();
            txDraft = updated;
          } else {
            const [created] = await tx
              .insert(PublicSchema.drafts)
              .values({
                leagueId,
                draftMode,
                selectionMethod,
                draftOrder,
                currentPick: 0,
                draftStartedAt: new Date(),
              })
              .returning();
            txDraft = created;
          }

          if (needsInsert) {
            // Seat the draft in the resolved order (slot is 1-indexed).
            await reseatLeagueDraft(tx, {
              draftId: txDraft.id,
              leagueId,
              orderedTeamIds,
            });
          }

          // The draft is now starting — any still-pending draft slot trades
          // (proposed/accepted/approved) can never execute (LS-8676 AC4).
          await cancelPendingDraftSlotTradesForLeague(tx, leagueId);

          // LS-8674: keeper leagues auto-assign locked keeper designations
          // to their teams (with cost applied) before the first pick. Must
          // run after the seats exist (forfeited-pick rows reference this
          // draftId) and before any pick/bid can happen.
          if (league.rosterContinuity === 'keeper' && league.keeperSettings) {
            await applyKeeperDesignationsForDraft(tx, {
              leagueId,
              draftId: txDraft.id,
              season: league.seasonNumber ?? 1,
              maxRosterSize: league.maxRosterSize,
              costModel: league.keeperSettings.costModel,
              auctionBudget: league.auctionBudget,
              auctionMinBid: league.auctionMinBid ?? 1,
            });
          }

          // ── Branch: Live vs Automated ───────────────────────────────
          if (draftMode === 'live') {
            // Draft status — dual-written onto the league in the same
            // transaction (LS-10074).
            await setLeagueDraftStatus(tx, {
              draftId: txDraft.id,
              leagueId,
              status: 'in-progress',
            });

            // LS-480 / LS-545: Enable auto-pick for any teams without a general manager
            const autoPickTeamIds = await enableAutoPickForUnmanagedTeams(
              tx,
              leagueId,
              txDraft.id,
              orderedTeamIds,
            );

            // Set the initial pick deadline now that draft is live
            const pickTimeLimit = Number(txDraft.pickTimeLimitSeconds) || 120;
            const initialDeadline = new Date(Date.now() + pickTimeLimit * 1000);
            const [draftWithDeadline] = await tx
              .update(PublicSchema.drafts)
              .set({ currentPickDeadline: initialDeadline })
              .where(eq(PublicSchema.drafts.id, txDraft.id))
              .returning();
            txDraft = draftWithDeadline;

            return {
              draft: txDraft,
              mode: 'live' as const,
              autoPickTeamIds,
              pickTimeLimit,
              initialDeadline,
            };
          } else {
            // Automated: do NOT set draftStatus='queued' inside the transaction.
            // If the Lambda is killed (timeout, OOM, SIGTERM) between commit and
            // SQS send, the catch block below never runs and the league is left
            // stuck in 'queued' forever with no SQS message ever sent (LS-5074).
            // Status is set to 'queued' only after the SQS send succeeds.
            return { draft: txDraft, mode: 'automated' as const };
          }
        });

        const draft = txResult.draft;

        // ── Post-transaction side effects ──────────────────────────
        if (txResult.mode === 'live') {
          const { autoPickTeamIds, pickTimeLimit, initialDeadline } = txResult;

          if (autoPickTeamIds.length > 0) {
            LOGGER.info(
              'Auto-pick enabled for teams without general managers',
              {
                leagueId,
                draftId: draft.id,
                teamIds: autoPickTeamIds,
              },
            );
          }

          LOGGER.info('Live draft initialized', {
            leagueId,
            draftId: draft.id,
            draftMode,
            draftOrder,
            teamCount: teams.length,
          });

          // Notify all league connections that the draft has started
          if (context.notificationService) {
            await context.notificationService.notifyDraftStarted(
              leagueId,
              draft.id,
              draftOrder,
              teams.length,
              pickTimeLimit,
              initialDeadline.toISOString(),
            );
          }
        } else {
          // Automated draft: send the SQS message FIRST, then mark draftStatus
          // as 'queued'. Previously the status was set inside the transaction
          // and SQS sent afterward — if the Lambda was killed (timeout/OOM)
          // between commit and SQS send the league sat in 'queued' forever
          // with no message ever sent. Reordering eliminates that race
          // (LS-5074): if SQS fails we leave the league at 'not-started' and
          // the caller retries; if the status update fails after a successful
          // SQS send the draft-processor still progresses the league via its
          // own `updateDraftStatus('in-progress')` call.
          const queueUrl = process.env.SQS_AUTOMATIC_DRAFTS_URL;
          if (!queueUrl) {
            throw new Error(
              'Automated draft queue is not configured (SQS_AUTOMATIC_DRAFTS_URL)',
            );
          }

          try {
            const sqsService = new DraftSqsService(queueUrl);
            const message: StartDraftMessage = {
              leagueId,
              draftId: draft.id,
              draftMode,
              selectionMethod,
              draftOrder,
              requestedBy: userId,
              timestamp: new Date().toISOString(),
            };
            await sqsService.sendStartDraftMessage(message);
          } catch (sqsError) {
            LOGGER.error(
              'SQS send failed for automated draft',
              sqsError instanceof Error
                ? sqsError
                : new Error(String(sqsError)),
              { leagueId },
            );
            throw new Error(
              `Failed to queue automated draft: ${
                sqsError instanceof Error ? sqsError.message : 'Unknown error'
              }`,
            );
          }

          // Mark league as 'queued' only after SQS confirms acceptance.
          // Conditional on draftStatus='not-started' so we don't clobber an
          // 'in-progress'/'completed' state if the draft-processor has
          // already started consuming the message we just sent.
          await context.db.transaction(async (tx) => {
            await setLeagueDraftStatus(tx, {
              draftId: draft.id,
              leagueId,
              status: 'queued',
              expectedLeagueStatus: 'not-started',
            });
          });

          LOGGER.info('Automated draft queued', {
            leagueId,
            draftId: draft.id,
            draftMode,
            selectionMethod,
            draftOrder,
            teamCount: teams.length,
          });
        }

        return draft;
      } catch (error) {
        // Skip error-level logging for expected user-facing errors (e.g. a
        // commissioner re-initializing a draft that is already 'paused' or
        // 'in-progress' — a normal state-machine rejection, not a system
        // failure). Mirrors the pattern in make-draft-pick.ts so these don't
        // pollute Rollbar (LS-9168).
        const isExpected =
          error instanceof GraphQLError &&
          typeof error.extensions?.code === 'string' &&
          ['BAD_USER_INPUT', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(
            error.extensions.code,
          );
        if (!isExpected) {
          LOGGER.error(
            'Error initializing draft',
            error instanceof Error ? error : new Error(String(error)),
            { leagueId, userId },
          );
        }
        throw error;
      }
    },
  }),
);
