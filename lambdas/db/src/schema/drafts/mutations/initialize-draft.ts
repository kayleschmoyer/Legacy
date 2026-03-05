/**
 * Draft mutation: initializeDraft
 */

import { PublicSchema } from '@legacy-sports/db-client';
import {
  DraftSqsService,
  type StartDraftMessage,
} from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { Draft } from '../types';
import { builder } from '../../builder';
import { AuthenticationError, ForbiddenError } from '../../graphql-errors';

/**
 * Mutation: Initialize a draft (live or automated)
 * Creates the drafts record, randomizes team order into draft_teams, and
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
          'snake') as 'snake' | 'linear';

        if (draftOrder !== 'snake' && draftOrder !== 'linear') {
          throw new Error("draftOrder must be 'snake' or 'linear'");
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
          throw new Error('League not found');
        }

        if (league.draftStatus !== 'not-started') {
          throw new Error(
            `Cannot initialize draft: current status is '${league.draftStatus}'`,
          );
        }

        // Verify user is the league owner
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

        if (
          !membership ||
          (membership.permissionLevel !== 'general_manager' &&
            membership.permissionLevel !== 'commissioner')
        ) {
          throw ForbiddenError(
            'Only the league General Manager or commissioner can initialize a draft',
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

        // Fisher-Yates shuffle for randomized draft order
        const shuffled = [...teams];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
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
              teamIdsWithoutGM: number[];
              pickTimeLimit: number;
              initialDeadline: Date;
            }
          | {
              draft: typeof PublicSchema.drafts.$inferSelect;
              mode: 'automated';
            };

        const txResult: TxResult = await context.db.transaction(async (tx) => {
          let txDraft: typeof PublicSchema.drafts.$inferSelect;

          if (existingDraft) {
            // Clear any leftover draft_teams from a previous initialization
            await tx
              .delete(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, existingDraft.id));

            // Clear any leftover draft_picks from a previous initialization
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

          // Insert draft_teams with the randomized order (1-indexed)
          await tx.insert(PublicSchema.draftTeams).values(
            shuffled.map((team, index) => ({
              draftId: txDraft.id,
              teamId: team.id,
              leagueId,
              draftOrder: index + 1,
            })),
          );

          // ── Branch: Live vs Automated ───────────────────────────────
          if (draftMode === 'live') {
            // Update league status to in-progress
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'in-progress' })
              .where(eq(PublicSchema.leagues.id, leagueId));

            // LS-480: Enable auto-pick for any teams without a general manager
            const teamsWithGM = await tx
              .select({ teamId: PublicSchema.leagueMembers.teamId })
              .from(PublicSchema.leagueMembers)
              .where(
                and(
                  eq(PublicSchema.leagueMembers.leagueId, leagueId),
                  eq(
                    PublicSchema.leagueMembers.permissionLevel,
                    'general_manager',
                  ),
                  isNotNull(PublicSchema.leagueMembers.teamId),
                ),
              );

            const teamIdsWithGM = new Set(
              teamsWithGM
                .map((m) => m.teamId)
                .filter((id): id is number => id !== null),
            );

            const teamIdsWithoutGM = shuffled
              .map((t) => t.id)
              .filter((id) => !teamIdsWithGM.has(id));

            if (teamIdsWithoutGM.length > 0) {
              await tx
                .update(PublicSchema.draftTeams)
                .set({ autoPick: true })
                .where(
                  and(
                    eq(PublicSchema.draftTeams.draftId, txDraft.id),
                    inArray(PublicSchema.draftTeams.teamId, teamIdsWithoutGM),
                  ),
                );
            }

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
              teamIdsWithoutGM,
              pickTimeLimit,
              initialDeadline,
            };
          } else {
            // Automated: update league status to 'queued' inside the transaction.
            // SQS send happens after commit (see below).
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'queued' })
              .where(eq(PublicSchema.leagues.id, leagueId));

            return { draft: txDraft, mode: 'automated' as const };
          }
        });

        const draft = txResult.draft;

        // ── Post-transaction side effects ──────────────────────────
        if (txResult.mode === 'live') {
          const { teamIdsWithoutGM, pickTimeLimit, initialDeadline } = txResult;

          if (teamIdsWithoutGM.length > 0) {
            LOGGER.info(
              'Auto-pick enabled for teams without general managers',
              {
                leagueId,
                draftId: draft.id,
                teamIds: teamIdsWithoutGM,
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
          // Automated draft: send SQS message now that DB writes are committed.
          // If SQS fails, a compensating write rolls back the league status.
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
              draftMode,
              selectionMethod,
              draftOrder,
              requestedBy: userId,
              timestamp: new Date().toISOString(),
            };
            await sqsService.sendStartDraftMessage(message);
          } catch (sqsError) {
            // Rollback league status if SQS send failed
            LOGGER.error('SQS send failed, rolling back draft status', {
              leagueId,
              error:
                sqsError instanceof Error ? sqsError.message : String(sqsError),
            });
            await context.db
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'not-started' })
              .where(eq(PublicSchema.leagues.id, leagueId));
            throw new Error(
              `Failed to queue automated draft: ${
                sqsError instanceof Error ? sqsError.message : 'Unknown error'
              }`,
            );
          }

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
        LOGGER.error('Error initializing draft', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);
