/**
 * Draft domain — mutation fields
 */

import {
  createBadgeService,
  isPlayerInPool,
  playerMeetsMinCareerGames,
  playerMeetsMinCareerSeasons,
  PublicSchema,
} from '@legacy-sports/db-client';
import {
  createNotificationService,
  DraftSqsService,
  type StartDraftMessage,
} from '@legacy-sports/aws-utils';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';

import {
  Draft,
  DraftPick,
  UpdateDraftSettingsInput,
  UpdateDraftSettingsPayload,
} from './types';
import { getCurrentDraftPickInfo } from './helpers';
import { builder } from '../builder';
import type { Context } from '../builder';
import { createAllMatchupsForLeague } from '../matchups/mutations';
import { insertActivityLog } from '../../services/activity-log';

const badgeService = createBadgeService(getDbOptions());

/**
 * Mutation: Make a draft pick
 *
 * Runs inside a serializable transaction with SELECT ... FOR UPDATE on the
 * drafts row to prevent race conditions from concurrent requests.
 *
 * Validates:
 * - Auth, draft status (in-progress, not paused), turn ownership
 * - Player availability, player pool eligibility, roster limits
 * - Idempotency (returns existing pick if same player at same overallPick)
 */
builder.mutationField('makeDraftPick', (t) =>
  t.field({
    type: DraftPick,
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to make a draft pick');
      }

      const { draftId, playerId } = args;
      const userId = context.user.id;

      try {
        // Entire pick operation runs in a transaction with row-level locking
        const result = await context.db.transaction(async (tx) => {
          // Lock the draft row to serialize concurrent pick attempts
          const draftRows = await tx.execute(
            sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                league_id: number;
                current_pick: number;
                draft_order: string;
                draft_mode: string;
                selection_method: string;
                pick_time_limit_seconds: number;
                draft_started_at: Date | null;
                draft_completed_at: Date | null;
              }
            | undefined;

          if (!draft) {
            throw new Error('Draft not found');
          }

          // Fetch league to validate draft status and get maxRosterSize
          const [league] = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.league_id))
            .limit(1);

          if (!league) {
            throw new Error('League not found');
          }

          if (league.draftStatus === 'paused') {
            throw new Error(
              'Draft is currently paused. Wait for the commissioner to resume.',
            );
          }

          if (league.draftStatus !== 'in-progress') {
            throw new Error(
              `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
            );
          }

          // Calculate current pick info using the locked draft row
          const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

          if (!currentPickInfo) {
            throw new Error('Could not determine current pick');
          }

          if (currentPickInfo.isComplete) {
            throw new Error('Draft is already complete');
          }

          // Idempotency: if this exact pick was already made, return it
          const [existingOwnPick] = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(
              and(
                eq(PublicSchema.draftPicks.draftId, draftId),
                eq(PublicSchema.draftPicks.playerId, playerId),
                eq(PublicSchema.draftPicks.teamId, currentPickInfo.teamId),
                eq(
                  PublicSchema.draftPicks.overallPick,
                  currentPickInfo.overallPick,
                ),
              ),
            )
            .limit(1);

          if (existingOwnPick) {
            LOGGER.info('Idempotent pick detected, returning existing pick', {
              draftId,
              playerId,
              pickId: existingOwnPick.id,
            });
            return {
              draftPick: existingOwnPick,
              isDraftComplete: false,
              leagueId: draft.league_id,
              selectionMethod: draft.selection_method,
              currentPickInfo,
              nextPickInfo: null,
            };
          }

          // Verify user owns the team whose turn it is
          const leagueMembers = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.league_id),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          const membership = leagueMembers[0];

          if (!membership || membership.teamId !== currentPickInfo.teamId) {
            throw new Error(
              'Not authorized: It is not your turn to pick or you do not own this team',
            );
          }

          // Check if player has already been drafted (by another team)
          const existingPick = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(
              and(
                eq(PublicSchema.draftPicks.draftId, draftId),
                eq(PublicSchema.draftPicks.playerId, playerId),
              ),
            )
            .limit(1);

          if (existingPick.length > 0) {
            throw new Error('Player has already been drafted');
          }

          // Verify player exists
          const [player] = await tx
            .select()
            .from(PublicSchema.players)
            .where(eq(PublicSchema.players.id, playerId))
            .limit(1);

          if (!player) {
            throw new Error('Player not found');
          }

          // Validate player is in the league's player pool (AL/NL restriction)
          if (!(await isPlayerInPool(tx, playerId, league.playerPool))) {
            throw new Error(
              `Player is not in the ${league.playerPool.toUpperCase()} player pool`,
            );
          }

          // Validate Hall of Fame eligibility (LS-295)
          if (league.hofOnly && !player.hallOfFame) {
            throw new Error(
              'This league is restricted to Hall of Fame players. This player is not in the Hall of Fame.',
            );
          }

          // Validate era eligibility (LS-295)
          if (league.eraFilter && league.eraFilter !== 'all') {
            const ERA_RANGES: Record<string, [number, number]> = {
              dead_ball: [1871, 1919],
              golden_age: [1920, 1960],
              expansion: [1961, 1976],
              free_agency: [1977, 1993],
              steroid_era: [1994, 2005],
              modern: [2006, 9999],
            };
            let eraStart: number | null = null;
            let eraEnd: number | null = null;
            if (league.eraFilter === 'custom') {
              eraStart = league.customEraStartYear ?? null;
              eraEnd = league.customEraEndYear ?? null;
            } else {
              const range = ERA_RANGES[league.eraFilter];
              if (range) {
                [eraStart, eraEnd] = range;
              }
            }
            if (eraStart != null && eraEnd != null) {
              const eraCheckResult = await tx.execute(
                sql`SELECT 1 FROM (
                  SELECT player_id FROM season_batting
                    WHERE player_id = ${playerId}
                      AND lg_id IN ('AL', 'NL')
                      AND season >= ${eraStart}
                      AND season <= ${eraEnd}
                  UNION
                  SELECT player_id FROM season_pitching
                    WHERE player_id = ${playerId}
                      AND lg_id IN ('AL', 'NL')
                      AND season >= ${eraStart}
                      AND season <= ${eraEnd}
                ) era_check LIMIT 1`,
              );
              if (!eraCheckResult.rows[0]) {
                const eraLabel = league.eraFilter
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c: string) => c.toUpperCase());
                throw new Error(
                  `Player has no recorded seasons in the ${eraLabel} era and is not eligible for this league.`,
                );
              }
            }
          }

          // Validate player meets minimum career games requirement
          if (
            !(await playerMeetsMinCareerGames(
              tx,
              playerId,
              league.minCareerGames,
            ))
          ) {
            throw new Error(
              `Player does not meet the minimum career games requirement (${league.minCareerGames})`,
            );
          }

          // Validate player meets minimum career seasons requirement
          if (
            !(await playerMeetsMinCareerSeasons(
              tx,
              playerId,
              league.minCareerSeasons,
            ))
          ) {
            throw new Error(
              `Player does not meet the minimum career seasons requirement (${league.minCareerSeasons})`,
            );
          }

          // Validate roster limit — count existing team members
          const [rosterCount] = await tx
            .select({ count: count() })
            .from(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.teamId, currentPickInfo.teamId),
                eq(PublicSchema.teamMembers.leagueId, draft.league_id),
              ),
            );

          if (
            rosterCount &&
            Number(rosterCount.count) >= league.maxRosterSize
          ) {
            throw new Error(
              `Team roster is full (${league.maxRosterSize} players maximum)`,
            );
          }

          const now = new Date();

          // Create the draft pick
          const [draftPick] = await tx
            .insert(PublicSchema.draftPicks)
            .values({
              draftId,
              teamId: currentPickInfo.teamId,
              playerId,
              round: currentPickInfo.round,
              pickNumber: currentPickInfo.pickNumber,
              overallPick: currentPickInfo.overallPick,
              pickedAt: now,
            })
            .returning();

          // Determine if this is the first pick (set draftStartedAt)
          const isFirstPick = draft.current_pick === 0;

          // Compute total picks dynamically from current league settings
          const numTeams = (
            await tx
              .select()
              .from(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, draftId))
          ).length;
          const totalPicks = numTeams * league.maxRosterSize;
          const isDraftComplete = currentPickInfo.overallPick >= totalPicks;

          // Update draft: advance currentPick, conditionally set started/completed timestamps
          // and set the next pick deadline (or clear it if complete)
          const nextDeadline = isDraftComplete
            ? null
            : new Date(now.getTime() + draft.pick_time_limit_seconds * 1000);

          await tx
            .update(PublicSchema.drafts)
            .set({
              currentPick: currentPickInfo.overallPick,
              currentPickDeadline: nextDeadline,
              updatedAt: now,
              ...(isFirstPick ? { draftStartedAt: now } : {}),
              ...(isDraftComplete ? { draftCompletedAt: now } : {}),
            })
            .where(eq(PublicSchema.drafts.id, draftId));

          // If draft is complete, update league status
          if (isDraftComplete) {
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'completed' })
              .where(eq(PublicSchema.leagues.id, draft.league_id));
          }

          // Add player to team roster
          await tx.insert(PublicSchema.teamMembers).values({
            teamId: currentPickInfo.teamId,
            leagueId: draft.league_id,
            playerId,
            draftRound: currentPickInfo.round,
            draftPick: currentPickInfo.pickNumber,
            acquisitionType: 'draft',
          });

          // Calculate next pick info for notification payload
          let nextPickInfo: Awaited<
            ReturnType<typeof getCurrentDraftPickInfo>
          > = null;
          if (!isDraftComplete) {
            nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
          }

          return {
            draftPick,
            isDraftComplete,
            leagueId: draft.league_id,
            selectionMethod: draft.selection_method,
            currentPickInfo,
            nextPickInfo,
            nextDeadline,
          };
        });

        LOGGER.info('Draft pick made successfully', {
          draftId,
          playerId,
          teamId: result.currentPickInfo.teamId,
          round: result.currentPickInfo.round,
          pick: result.currentPickInfo.pickNumber,
          overallPick: result.currentPickInfo.overallPick,
          isDraftComplete: result.isDraftComplete,
        });

        // Send WebSocket notification for the pick (outside transaction)
        if (context.notificationService) {
          await context.notificationService.notifyDraftPickMade(
            result.leagueId,
            draftId,
            result.draftPick.id,
            result.currentPickInfo.teamId,
            playerId,
            result.currentPickInfo.round,
            result.currentPickInfo.pickNumber,
            result.currentPickInfo.overallPick,
            result.nextPickInfo
              ? {
                  teamId: result.nextPickInfo.teamId,
                  round: result.nextPickInfo.round,
                  pickNumber: result.nextPickInfo.pickNumber,
                  overallPick: result.nextPickInfo.overallPick,
                }
              : undefined,
            {
              wasAutoPick: false,
              currentPickDeadline: result.nextDeadline?.toISOString() ?? null,
            },
          );

          // If draft completed, also send draft-completed notification
          if (result.isDraftComplete) {
            await context.notificationService.notifyDraftCompleted(
              result.leagueId,
              result.selectionMethod,
            );
          }
        }

        // Auto-create all matchups when draft completes
        if (result.isDraftComplete) {
          try {
            const matchupResult = await createAllMatchupsForLeague(
              context.db,
              result.leagueId,
            );
            LOGGER.info('Auto-created matchups after draft completion', {
              leagueId: result.leagueId,
              matchupCount: matchupResult.matchupCount,
            });
          } catch (matchupError) {
            // Log but don't fail the draft pick — matchups can be created manually
            LOGGER.error('Failed to auto-create matchups after draft', {
              leagueId: result.leagueId,
              error:
                matchupError instanceof Error
                  ? matchupError.message
                  : String(matchupError),
            });
          }

          // Evaluate draft badges for all participants (fire-and-forget, non-fatal)
          badgeService
            .evaluateDraftBadges(result.leagueId)
            .catch((err: unknown) => {
              LOGGER.warn('Badge evaluation after draft failed (non-fatal)', {
                leagueId: result.leagueId,
                err,
              });
            });
        }

        // Record draft pick in the activity log (fire-and-forget, non-fatal)
        void insertActivityLog(context, {
          leagueId: result.leagueId,
          teamId: result.currentPickInfo?.teamId ?? null,
          actorUserId: userId,
          eventType: 'draft_pick_made',
          payload: {
            playerId,
            round: result.currentPickInfo?.round,
            pickNumber: result.currentPickInfo?.pickNumber,
            overallPick: result.currentPickInfo?.overallPick,
          },
        });

        return result.draftPick;
      } catch (error) {
        LOGGER.error('Error making draft pick', {
          draftId,
          playerId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

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
        throw new Error('Authentication required to initialize a draft');
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
          throw new Error(
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

        let draft: typeof PublicSchema.drafts.$inferSelect;
        if (existingDraft) {
          // Clear any leftover draft_teams from a previous initialization
          await context.db
            .delete(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, existingDraft.id));

          // Clear any leftover draft_picks from a previous initialization
          await context.db
            .delete(PublicSchema.draftPicks)
            .where(eq(PublicSchema.draftPicks.draftId, existingDraft.id));

          const [updated] = await context.db
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
          draft = updated;
        } else {
          const [created] = await context.db
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
          draft = created;
        }

        // Insert draft_teams with the randomized order (1-indexed)
        await context.db.insert(PublicSchema.draftTeams).values(
          shuffled.map((team, index) => ({
            draftId: draft.id,
            teamId: team.id,
            leagueId,
            draftOrder: index + 1,
          })),
        );

        // ── Branch: Live vs Automated ───────────────────────────────
        if (draftMode === 'live') {
          // Update league status to in-progress
          await context.db
            .update(PublicSchema.leagues)
            .set({ draftStatus: 'in-progress' })
            .where(eq(PublicSchema.leagues.id, leagueId));

          // Set the initial pick deadline now that draft is live
          const pickTimeLimit = Number(draft.pickTimeLimitSeconds) || 120;
          const initialDeadline = new Date(Date.now() + pickTimeLimit * 1000);
          const [draftWithDeadline] = await context.db
            .update(PublicSchema.drafts)
            .set({ currentPickDeadline: initialDeadline })
            .where(eq(PublicSchema.drafts.id, draft.id))
            .returning();
          draft = draftWithDeadline;

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
          // Automated draft: queue via SQS for background processing
          const queueUrl = process.env.SQS_AUTOMATIC_DRAFTS_URL;
          if (!queueUrl) {
            throw new Error(
              'Automated draft queue is not configured (SQS_AUTOMATIC_DRAFTS_URL)',
            );
          }

          // Set status to 'queued' first, then send SQS message
          // If SQS fails, rollback the status change
          await context.db
            .update(PublicSchema.leagues)
            .set({ draftStatus: 'queued' })
            .where(eq(PublicSchema.leagues.id, leagueId));

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

/**
 * Mutation: Update draft settings (mode, selection method, order, player pool).
 * Only allowed when the league's draftStatus is 'not-started'.
 */
builder.mutationField('updateDraftSettings', (t) =>
  t.field({
    type: UpdateDraftSettingsPayload,
    args: {
      input: t.arg({ type: UpdateDraftSettingsInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to update draft settings');
      }

      const {
        leagueId,
        draftMode,
        selectionMethod,
        draftOrder,
        playerPool,
        pickTimeLimitSeconds,
        eraFilter,
        hofOnly,
        customEraStartYear,
        customEraEndYear,
        scheduledAt: scheduledAtInput,
      } = args.input;
      const userId = context.user.id;

      try {
        // Verify user is the league owner
        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            owner: PublicSchema.leagues.owner,
            draftStatus: PublicSchema.leagues.draftStatus,
            playerPool: PublicSchema.leagues.playerPool,
            eraFilter: PublicSchema.leagues.eraFilter,
            hofOnly: PublicSchema.leagues.hofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.owner !== userId) {
          throw new Error(
            'Only the league General Manager can update draft settings',
          );
        }

        // Prevent changes after draft has started
        if (league.draftStatus !== 'not-started') {
          throw new Error(
            'Draft settings cannot be changed after the draft has been started',
          );
        }

        // Validate enum values
        const validDraftModes = ['live', 'automated'];
        const validSelectionMethods = ['standard', 'auction', 'random'];
        const validDraftOrders = ['snake', 'linear'];
        const validPlayerPools = ['all', 'nl', 'al'];

        if (draftMode && !validDraftModes.includes(draftMode)) {
          throw new Error(
            `Invalid draft mode: ${draftMode}. Must be one of: ${validDraftModes.join(', ')}`,
          );
        }
        if (
          selectionMethod &&
          !validSelectionMethods.includes(selectionMethod)
        ) {
          throw new Error(
            `Invalid selection method: ${selectionMethod}. Must be one of: ${validSelectionMethods.join(', ')}`,
          );
        }
        if (draftOrder && !validDraftOrders.includes(draftOrder)) {
          throw new Error(
            `Invalid draft order: ${draftOrder}. Must be one of: ${validDraftOrders.join(', ')}`,
          );
        }
        if (playerPool && !validPlayerPools.includes(playerPool)) {
          throw new Error(
            `Invalid player pool: ${playerPool}. Must be one of: ${validPlayerPools.join(', ')}`,
          );
        }

        const validEraFilters = [
          'all',
          'dead_ball',
          'golden_age',
          'expansion',
          'free_agency',
          'steroid_era',
          'modern',
          'custom',
        ];
        if (eraFilter && !validEraFilters.includes(eraFilter)) {
          throw new Error(
            `Invalid era filter: ${eraFilter}. Must be one of: ${validEraFilters.join(', ')}`,
          );
        }
        if (
          eraFilter === 'custom' &&
          customEraStartYear != null &&
          customEraEndYear != null &&
          customEraStartYear > customEraEndYear
        ) {
          throw new Error(
            'Custom era start year must be less than or equal to end year',
          );
        }

        if (
          pickTimeLimitSeconds !== undefined &&
          pickTimeLimitSeconds !== null
        ) {
          if (pickTimeLimitSeconds < 30 || pickTimeLimitSeconds > 3600) {
            throw new Error(
              'Pick time limit must be between 30 and 3600 seconds',
            );
          }
        }

        // Validate scheduledAt (LS-423): if provided and not null, must be a valid
        // future ISO-8601 date. Pass null explicitly to clear the schedule.
        let parsedScheduledAt: Date | null | undefined = undefined; // undefined = don't touch
        if (scheduledAtInput !== undefined) {
          if (scheduledAtInput === null) {
            parsedScheduledAt = null; // explicit clear
          } else {
            const parsed = new Date(scheduledAtInput);
            if (isNaN(parsed.getTime())) {
              throw new Error(
                `Invalid scheduledAt value: "${scheduledAtInput}". Must be a valid ISO-8601 datetime.`,
              );
            }
            if (parsed.getTime() <= Date.now()) {
              throw new Error('scheduledAt must be a future date and time.');
            }
            parsedScheduledAt = parsed;
          }
        }

        // Update player-eligibility fields on the league if any provided
        let updatedPlayerPool = league.playerPool;
        const leagueEligibilityUpdates: Record<string, unknown> = {};
        if (playerPool) {
          leagueEligibilityUpdates['playerPool'] = playerPool as
            | 'all'
            | 'nl'
            | 'al';
        }
        if (eraFilter != null) {
          leagueEligibilityUpdates['eraFilter'] = eraFilter;
        }
        if (hofOnly != null) {
          leagueEligibilityUpdates['hofOnly'] = hofOnly;
        }
        if (customEraStartYear !== undefined) {
          leagueEligibilityUpdates['customEraStartYear'] = customEraStartYear;
        }
        if (customEraEndYear !== undefined) {
          leagueEligibilityUpdates['customEraEndYear'] = customEraEndYear;
        }
        if (Object.keys(leagueEligibilityUpdates).length > 0) {
          leagueEligibilityUpdates['updatedAt'] = new Date();
          const [updatedLeague] = await context.db
            .update(PublicSchema.leagues)
            .set(leagueEligibilityUpdates)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .returning({ playerPool: PublicSchema.leagues.playerPool });
          updatedPlayerPool = updatedLeague.playerPool;
        }

        // Check if a draft record exists, create one if not
        let [existingDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .limit(1);

        // Cross-validate: automated drafts only support 'random' selection
        const effectiveDraftMode = draftMode ?? existingDraft?.draftMode;
        const effectiveSelectionMethod =
          selectionMethod ?? existingDraft?.selectionMethod;

        if (
          effectiveDraftMode === 'automated' &&
          effectiveSelectionMethod &&
          effectiveSelectionMethod !== 'random'
        ) {
          throw new Error(
            "Automated drafts only support the 'random' selection method.",
          );
        }

        const draftUpdates: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (draftMode) {
          draftUpdates['draftMode'] = draftMode as 'live' | 'automated';
        }
        if (selectionMethod) {
          draftUpdates['selectionMethod'] = selectionMethod as
            | 'standard'
            | 'auction'
            | 'random';
        }
        if (draftOrder) {
          draftUpdates['draftOrder'] = draftOrder as 'snake' | 'linear';
        }
        if (
          pickTimeLimitSeconds !== undefined &&
          pickTimeLimitSeconds !== null
        ) {
          draftUpdates['pickTimeLimitSeconds'] = pickTimeLimitSeconds;
        }

        // Handle scheduledAt: set when provided, clear when null, skip when undefined
        if (parsedScheduledAt !== undefined) {
          draftUpdates['scheduledAt'] = parsedScheduledAt;
        }

        if (existingDraft) {
          const [updated] = await context.db
            .update(PublicSchema.drafts)
            .set(draftUpdates)
            .where(eq(PublicSchema.drafts.id, existingDraft.id))
            .returning();
          existingDraft = updated;
        } else {
          const [created] = await context.db
            .insert(PublicSchema.drafts)
            .values({
              leagueId,
              draftMode: (draftMode as 'live' | 'automated') || 'live',
              selectionMethod:
                (selectionMethod as 'standard' | 'auction' | 'random') ||
                'standard',
              draftOrder: (draftOrder as 'snake' | 'linear') || 'snake',
              currentPick: 0,
            })
            .returning();
          existingDraft = created;
        }

        LOGGER.info('Draft settings updated successfully', {
          leagueId,
          draftMode: existingDraft.draftMode,
          selectionMethod: existingDraft.selectionMethod,
          draftOrder: existingDraft.draftOrder,
          playerPool: updatedPlayerPool,
        });

        // Post a system chat notification so all league members see the change
        const username = context.user.username ?? `user_${userId}`;
        const changedFields: string[] = [];
        if (draftMode) changedFields.push(`mode → ${draftMode}`);
        if (selectionMethod)
          changedFields.push(`selection → ${selectionMethod}`);
        if (draftOrder) changedFields.push(`order → ${draftOrder}`);
        if (playerPool) changedFields.push(`player pool → ${playerPool}`);
        if (eraFilter) changedFields.push(`era filter → ${eraFilter}`);
        if (hofOnly != null)
          changedFields.push(`HOF only → ${hofOnly ? 'on' : 'off'}`);
        if (pickTimeLimitSeconds)
          changedFields.push(`pick timer → ${pickTimeLimitSeconds}s`);
        if (parsedScheduledAt !== undefined) {
          changedFields.push(
            parsedScheduledAt === null
              ? 'scheduled start → removed'
              : `scheduled start → ${parsedScheduledAt.toLocaleString('en-US', { timeZoneName: 'short' })}`,
          );
        }
        const changesSummary =
          changedFields.length > 0 ? ` (${changedFields.join(', ')})` : '';
        const notificationText = `${username} updated draft settings${changesSummary}.`;

        const [chatMsg] = await context.db
          .insert(PublicSchema.leagueMessages)
          .values({
            leagueId,
            userId: null,
            messageText: notificationText,
            messageType: 'draft_settings',
            metadata: { username, changes: changedFields },
          })
          .returning();

        const notificationService = createNotificationService();
        if (notificationService) {
          notificationService
            .notifyLeagueChatMessage(leagueId, {
              leagueId,
              messageId: chatMsg.id,
              senderId: null,
              senderUsername: username,
              messageText: notificationText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
              messageType: 'draft_settings',
              metadata: { username, changes: changedFields },
            })
            .catch((err: unknown) => {
              LOGGER.warn(
                'Failed to send league chat WS notification for settings update',
                { err },
              );
            });
        }

        return {
          ...existingDraft,
          playerPool: updatedPlayerPool,
        };
      } catch (error) {
        LOGGER.error('Error updating draft settings', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

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
        throw new Error('Authentication required');
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
        throw new Error('Only a league commissioner can pause the draft');
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
        throw new Error('Authentication required');
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
        throw new Error('Only a league commissioner can resume the draft');
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

// ── Commissioner Pick ───────────────────────────────────────────────────────

/**
 * Mutation: Commissioner makes a pick on behalf of a General Manager
 *
 * Allows the league General Manager/commissioner to make a pick for any team when
 * that team's General Manager is absent (e.g., timed out, disconnected).
 * Same validation as makeDraftPick except the turn-ownership check
 * is replaced by a commissioner permission check.
 */
builder.mutationField('commissionerPick', (t) =>
  t.field({
    type: DraftPick,
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { draftId, playerId } = args;
      const userId = context.user.id;

      try {
        const result = await context.db.transaction(async (tx) => {
          // Lock the draft row
          const draftRows = await tx.execute(
            sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                league_id: number;
                current_pick: number;
                draft_order: string;
                selection_method: string;
                pick_time_limit_seconds: number;
              }
            | undefined;

          if (!draft) {
            throw new Error('Draft not found');
          }

          // Verify user is league owner or commissioner
          const [membership] = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.league_id),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          if (!membership || membership.permissionLevel !== 'commissioner') {
            throw new Error(
              'Only a league commissioner can make picks on behalf of others',
            );
          }

          const [league] = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.league_id))
            .limit(1);

          if (!league) {
            throw new Error('League not found');
          }

          if (
            league.draftStatus !== 'in-progress' &&
            league.draftStatus !== 'paused'
          ) {
            throw new Error(
              `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
            );
          }

          const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

          if (!currentPickInfo || currentPickInfo.isComplete) {
            throw new Error('Draft is already complete');
          }

          // Check player availability
          const existingPick = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(
              and(
                eq(PublicSchema.draftPicks.draftId, draftId),
                eq(PublicSchema.draftPicks.playerId, playerId),
              ),
            )
            .limit(1);

          if (existingPick.length > 0) {
            throw new Error('Player has already been drafted');
          }

          const [player] = await tx
            .select()
            .from(PublicSchema.players)
            .where(eq(PublicSchema.players.id, playerId))
            .limit(1);

          if (!player) {
            throw new Error('Player not found');
          }

          // Validate player eligibility against league settings
          if (!(await isPlayerInPool(tx, playerId, league.playerPool))) {
            throw new Error(
              `Player is not in the ${league.playerPool.toUpperCase()} player pool`,
            );
          }

          // Validate Hall of Fame eligibility (LS-295)
          if (league.hofOnly && !player.hallOfFame) {
            throw new Error(
              'This league is restricted to Hall of Fame players. This player is not in the Hall of Fame.',
            );
          }

          // Validate era eligibility (LS-295)
          if (league.eraFilter && league.eraFilter !== 'all') {
            const ERA_RANGES: Record<string, [number, number]> = {
              dead_ball: [1871, 1919],
              golden_age: [1920, 1960],
              expansion: [1961, 1976],
              free_agency: [1977, 1993],
              steroid_era: [1994, 2005],
              modern: [2006, 9999],
            };
            let eraStart: number | null = null;
            let eraEnd: number | null = null;
            if (league.eraFilter === 'custom') {
              eraStart = league.customEraStartYear ?? null;
              eraEnd = league.customEraEndYear ?? null;
            } else {
              const range = ERA_RANGES[league.eraFilter];
              if (range) {
                [eraStart, eraEnd] = range;
              }
            }
            if (eraStart != null && eraEnd != null) {
              const eraCheckResult = await tx.execute(
                sql`SELECT 1 FROM (
                  SELECT player_id FROM season_batting
                    WHERE player_id = ${playerId}
                      AND lg_id IN ('AL', 'NL')
                      AND season >= ${eraStart}
                      AND season <= ${eraEnd}
                  UNION
                  SELECT player_id FROM season_pitching
                    WHERE player_id = ${playerId}
                      AND lg_id IN ('AL', 'NL')
                      AND season >= ${eraStart}
                      AND season <= ${eraEnd}
                ) era_check LIMIT 1`,
              );
              if (!eraCheckResult.rows[0]) {
                const eraLabel = league.eraFilter
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c: string) => c.toUpperCase());
                throw new Error(
                  `Player has no recorded seasons in the ${eraLabel} era and is not eligible for this league.`,
                );
              }
            }
          }

          if (
            !(await playerMeetsMinCareerGames(
              tx,
              playerId,
              league.minCareerGames,
            ))
          ) {
            throw new Error(
              `Player does not meet the minimum career games requirement (${league.minCareerGames})`,
            );
          }

          if (
            !(await playerMeetsMinCareerSeasons(
              tx,
              playerId,
              league.minCareerSeasons,
            ))
          ) {
            throw new Error(
              `Player does not meet the minimum career seasons requirement (${league.minCareerSeasons})`,
            );
          }

          const now = new Date();

          const [draftPick] = await tx
            .insert(PublicSchema.draftPicks)
            .values({
              draftId,
              teamId: currentPickInfo.teamId,
              playerId,
              round: currentPickInfo.round,
              pickNumber: currentPickInfo.pickNumber,
              overallPick: currentPickInfo.overallPick,
              pickedAt: now,
            })
            .returning();

          const numTeams = (
            await tx
              .select()
              .from(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, draftId))
          ).length;
          const totalPicks = numTeams * league.maxRosterSize;
          const isDraftComplete = currentPickInfo.overallPick >= totalPicks;

          const nextDeadline = isDraftComplete
            ? null
            : new Date(now.getTime() + draft.pick_time_limit_seconds * 1000);

          await tx
            .update(PublicSchema.drafts)
            .set({
              currentPick: currentPickInfo.overallPick,
              currentPickDeadline: nextDeadline,
              updatedAt: now,
              ...(isDraftComplete ? { draftCompletedAt: now } : {}),
            })
            .where(eq(PublicSchema.drafts.id, draftId));

          if (isDraftComplete) {
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'completed' })
              .where(eq(PublicSchema.leagues.id, draft.league_id));
          }

          await tx.insert(PublicSchema.teamMembers).values({
            teamId: currentPickInfo.teamId,
            leagueId: draft.league_id,
            playerId,
            draftRound: currentPickInfo.round,
            draftPick: currentPickInfo.pickNumber,
            acquisitionType: 'draft',
          });

          let nextPickInfo: Awaited<
            ReturnType<typeof getCurrentDraftPickInfo>
          > = null;
          if (!isDraftComplete) {
            nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
          }

          return {
            draftPick,
            isDraftComplete,
            leagueId: draft.league_id,
            selectionMethod: draft.selection_method,
            currentPickInfo,
            nextPickInfo,
            nextDeadline,
          };
        });

        LOGGER.info('Commissioner pick made', {
          draftId,
          playerId,
          byUserId: userId,
          teamId: result.currentPickInfo.teamId,
          overallPick: result.currentPickInfo.overallPick,
        });

        if (context.notificationService) {
          await context.notificationService.notifyDraftPickMade(
            result.leagueId,
            draftId,
            result.draftPick.id,
            result.currentPickInfo.teamId,
            playerId,
            result.currentPickInfo.round,
            result.currentPickInfo.pickNumber,
            result.currentPickInfo.overallPick,
            result.nextPickInfo
              ? {
                  teamId: result.nextPickInfo.teamId,
                  round: result.nextPickInfo.round,
                  pickNumber: result.nextPickInfo.pickNumber,
                  overallPick: result.nextPickInfo.overallPick,
                }
              : undefined,
            {
              wasAutoPick: false,
              currentPickDeadline: result.nextDeadline?.toISOString() ?? null,
            },
          );

          if (result.isDraftComplete) {
            await context.notificationService.notifyDraftCompleted(
              result.leagueId,
              result.selectionMethod,
            );
          }
        }

        // Auto-create all matchups when draft completes
        if (result.isDraftComplete) {
          try {
            const matchupResult = await createAllMatchupsForLeague(
              context.db,
              result.leagueId,
            );
            LOGGER.info(
              'Auto-created matchups after commissioner draft completion',
              {
                leagueId: result.leagueId,
                matchupCount: matchupResult.matchupCount,
              },
            );
          } catch (matchupError) {
            LOGGER.error(
              'Failed to auto-create matchups after commissioner draft',
              {
                leagueId: result.leagueId,
                error:
                  matchupError instanceof Error
                    ? matchupError.message
                    : String(matchupError),
              },
            );
          }

          // Evaluate draft badges for all participants (fire-and-forget, non-fatal)
          badgeService
            .evaluateDraftBadges(result.leagueId)
            .catch((err: unknown) => {
              LOGGER.warn(
                'Badge evaluation after commissioner draft failed (non-fatal)',
                { leagueId: result.leagueId, err },
              );
            });
        }

        return result.draftPick;
      } catch (error) {
        LOGGER.error('Error making commissioner pick', {
          draftId,
          playerId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

// ── Helpers shared by setDraftOrder / randomizeDraftOrder ────────────────────

/**
 * Post a system chat notification for a draft order change and broadcast it
 * over WebSocket so all connected league members see the update immediately.
 */
async function postDraftOrderChatNotification(
  db: Context['db'],
  leagueId: number,
  username: string,
  messageText: string,
): Promise<void> {
  const [chatMsg] = await db
    .insert(PublicSchema.leagueMessages)
    .values({
      leagueId,
      userId: null,
      messageText,
      messageType: 'draft_order',
      metadata: { username },
    })
    .returning();

  const notificationService = createNotificationService();
  if (notificationService) {
    notificationService
      .notifyLeagueChatMessage(leagueId, {
        leagueId,
        messageId: chatMsg.id,
        senderId: null,
        senderUsername: username,
        messageText,
        timestamp: chatMsg.timestamp ?? new Date().toISOString(),
        messageType: 'draft_order',
        metadata: { username },
      })
      .catch((err: unknown) => {
        LOGGER.warn(
          'Failed to send league chat WS notification for draft order change',
          { err },
        );
      });
  }
}

// ── setDraftOrder ─────────────────────────────────────────────────────────────

/**
 * Mutation: Set a specific draft order
 *
 * Allows the commissioner to supply an explicit ordered list of teamIds.
 * Only permitted when the draft is 'in-progress' and no picks have been made
 * (currentPick === 0).
 *
 * Posts a system chat message so all league members are notified.
 */
builder.mutationField('setDraftOrder', (t) =>
  t.field({
    type: Draft,
    args: {
      draftId: t.arg.int({ required: true }),
      teamIds: t.arg.intList({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { draftId, teamIds } = args;
      const userId = context.user.id;

      try {
        // Fetch draft + league
        const [draft] = await context.db
          .select({
            id: PublicSchema.drafts.id,
            leagueId: PublicSchema.drafts.leagueId,
            currentPick: PublicSchema.drafts.currentPick,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        if (!draft) {
          throw new Error('Draft not found');
        }

        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            draftStatus: PublicSchema.leagues.draftStatus,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draft.leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        // Only allowed when draft is in-progress and no picks made yet
        if (league.draftStatus !== 'in-progress') {
          throw new Error(
            'Draft order can only be changed while the draft is in-progress',
          );
        }
        if (Number(draft.currentPick) !== 0) {
          throw new Error(
            'Draft order cannot be changed after picks have been made',
          );
        }

        // Verify the caller is the league GM (commissioner)
        const [membership] = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership || membership.permissionLevel !== 'general_manager') {
          throw new Error(
            'Only the league General Manager can change the draft order',
          );
        }

        // Fetch current draft_teams to validate the provided teamIds
        const currentTeams = await context.db
          .select({ teamId: PublicSchema.draftTeams.teamId })
          .from(PublicSchema.draftTeams)
          .where(eq(PublicSchema.draftTeams.draftId, draftId));

        const currentTeamIds = new Set(currentTeams.map((t) => t.teamId));

        if (teamIds.length !== currentTeamIds.size) {
          throw new Error(
            `Expected ${String(currentTeamIds.size)} team IDs but received ${String(teamIds.length)}`,
          );
        }
        for (const id of teamIds) {
          if (!currentTeamIds.has(id)) {
            throw new Error(`Team ${String(id)} is not part of this draft`);
          }
        }

        // Update draft_teams draftOrder for each team
        for (let i = 0; i < teamIds.length; i++) {
          await context.db
            .update(PublicSchema.draftTeams)
            .set({ draftOrder: i + 1 })
            .where(
              and(
                eq(PublicSchema.draftTeams.draftId, draftId),
                eq(PublicSchema.draftTeams.teamId, teamIds[i]),
              ),
            );
        }

        LOGGER.info('Commissioner set draft order', {
          draftId,
          leagueId: draft.leagueId,
          teamIds,
          userId,
        });

        // Post chat notification
        const username = context.user.username ?? `user_${String(userId)}`;
        const notificationText = `${username} set a custom draft order.`;
        await postDraftOrderChatNotification(
          context.db,
          draft.leagueId,
          username,
          notificationText,
        );

        // Return updated draft record
        const [updatedDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        return updatedDraft;
      } catch (error) {
        LOGGER.error('Error setting draft order', {
          draftId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

// ── randomizeDraftOrder ───────────────────────────────────────────────────────

/**
 * Mutation: Randomize the draft order
 *
 * Shuffles the existing draft_teams positions using a Fisher-Yates shuffle.
 * Only permitted when the draft is 'in-progress' and no picks have been made
 * (currentPick === 0).
 *
 * Posts a system chat message so all league members are notified.
 */
builder.mutationField('randomizeDraftOrder', (t) =>
  t.field({
    type: Draft,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { draftId } = args;
      const userId = context.user.id;

      try {
        // Fetch draft + league
        const [draft] = await context.db
          .select({
            id: PublicSchema.drafts.id,
            leagueId: PublicSchema.drafts.leagueId,
            currentPick: PublicSchema.drafts.currentPick,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        if (!draft) {
          throw new Error('Draft not found');
        }

        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            draftStatus: PublicSchema.leagues.draftStatus,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draft.leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        // Only allowed when draft is in-progress and no picks made yet
        if (league.draftStatus !== 'in-progress') {
          throw new Error(
            'Draft order can only be randomized while the draft is in-progress',
          );
        }
        if (Number(draft.currentPick) !== 0) {
          throw new Error(
            'Draft order cannot be randomized after picks have been made',
          );
        }

        // Verify the caller is the league GM
        const [membership] = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership || membership.permissionLevel !== 'general_manager') {
          throw new Error(
            'Only the league General Manager can randomize the draft order',
          );
        }

        // Fetch current team IDs in this draft
        const currentTeams = await context.db
          .select({ teamId: PublicSchema.draftTeams.teamId })
          .from(PublicSchema.draftTeams)
          .where(eq(PublicSchema.draftTeams.draftId, draftId))
          .orderBy(asc(PublicSchema.draftTeams.draftOrder));

        if (currentTeams.length === 0) {
          throw new Error('No teams found for this draft');
        }

        // Fisher-Yates shuffle
        const shuffled = [...currentTeams];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Update draftOrder for each team
        for (let i = 0; i < shuffled.length; i++) {
          await context.db
            .update(PublicSchema.draftTeams)
            .set({ draftOrder: i + 1 })
            .where(
              and(
                eq(PublicSchema.draftTeams.draftId, draftId),
                eq(PublicSchema.draftTeams.teamId, shuffled[i].teamId),
              ),
            );
        }

        LOGGER.info('Commissioner randomized draft order', {
          draftId,
          leagueId: draft.leagueId,
          userId,
        });

        // Post chat notification
        const username = context.user.username ?? `user_${String(userId)}`;
        const notificationText = `${username} randomized the draft order.`;
        await postDraftOrderChatNotification(
          context.db,
          draft.leagueId,
          username,
          notificationText,
        );

        // Return updated draft record
        const [updatedDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        return updatedDraft;
      } catch (error) {
        LOGGER.error('Error randomizing draft order', {
          draftId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);
