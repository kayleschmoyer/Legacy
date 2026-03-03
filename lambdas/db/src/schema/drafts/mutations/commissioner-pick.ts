/**
 * Draft mutation: commissionerPick
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
import { and, eq, sql } from 'drizzle-orm';

import { DraftPick } from '../types';
import { getCurrentDraftPickInfo } from '../helpers';
import { builder } from '../../builder';
import { createAllMatchupsForLeague } from '../../matchups/mutations';
import { AuthenticationError, ForbiddenError } from '../../graphql-errors';
import { insertActivityLog } from '../../../services/activity-log';

const badgeService = createBadgeService(getDbOptions());

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
        throw AuthenticationError();
      }

      const { draftId, playerId } = args;
      const userId = context.user.id;

      try {
        const result = await context.db.transaction(async (tx) => {
          // Surface lock waits as errors rather than silent hangs
          await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

          // Lock the draft row — narrow SELECT to avoid transferring unused columns
          const draftRows = await tx.execute(
            sql`SELECT id, league_id, pick_time_limit_seconds, selection_method FROM drafts WHERE id = ${draftId} FOR UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                league_id: number;
                pick_time_limit_seconds: number;
                selection_method: string;
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
            throw ForbiddenError(
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

        // Record commissioner pick in the activity log (fire-and-forget, non-fatal)
        void insertActivityLog(context, {
          leagueId: result.leagueId,
          teamId: result.currentPickInfo.teamId ?? null,
          actorUserId: userId,
          eventType: 'draft_pick_made',
          payload: {
            playerId,
            round: result.currentPickInfo.round,
            pickNumber: result.currentPickInfo.pickNumber,
            overallPick: result.currentPickInfo.overallPick,
            wasCommissionerPick: true,
          },
        });

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
