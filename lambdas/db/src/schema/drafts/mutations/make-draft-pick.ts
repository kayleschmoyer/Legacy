/**
 * Draft mutation: makeDraftPick
 */

import {
  createBadgeService,
  isPlayerInPool,
  playerMeetsMinCareerGames,
  playerMeetsMinCareerSeasons,
  PublicSchema,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, sql } from 'drizzle-orm';

import { DraftPick } from '../types';
import { getCurrentDraftPickInfo } from '../helpers';
import { builder } from '../../builder';
import { createAllMatchupsForLeague } from '../../matchups/mutations';
import { insertActivityLog } from '../../../services/activity-log';
import { AuthenticationError } from '../../graphql-errors';

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
        throw AuthenticationError(
          'Authentication required to make a draft pick',
        );
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
