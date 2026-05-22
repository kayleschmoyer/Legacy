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
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, sql } from 'drizzle-orm';

import { DraftPick } from '../types';
import { commitDraftPick, getCurrentDraftPickInfo } from '../helpers';
import { builder } from '../../builder';
import { createAllMatchupsForLeague } from '../../matchups/mutations';
import { logDraftPickActivity } from '../../../services/activity-log';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

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
        // ── LS-4692: Phase 1 — Non-locking pre-validation ────────────────
        // Same shrink pattern as makeDraftPick — all read-only validation
        // (commissioner permission, player existence, league-static
        // eligibility filters) runs before acquiring the row lock.
        const draftPreRows = await context.db.execute(
          sql`SELECT id, league_id, pick_time_limit_seconds, selection_method FROM drafts WHERE id = ${draftId}`,
        );
        const draftPre = draftPreRows.rows[0] as
          | {
              id: number;
              league_id: number;
              pick_time_limit_seconds: number;
              selection_method: string;
            }
          | undefined;

        if (!draftPre) {
          throw UserInputError('Draft not found');
        }

        // Verify user is league commissioner
        const [membership] = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, draftPre.league_id),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership || membership.permissionLevel !== 'commissioner') {
          throw ForbiddenError(
            'Only a league commissioner can make picks on behalf of others',
          );
        }

        const [leaguePre] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draftPre.league_id))
          .limit(1);

        if (!leaguePre) {
          throw UserInputError('League not found');
        }

        if (
          leaguePre.draftStatus !== 'in-progress' &&
          leaguePre.draftStatus !== 'paused'
        ) {
          throw UserInputError(
            `Draft is not in progress (current status: ${leaguePre.draftStatus ?? 'unknown'})`,
          );
        }

        const [player] = await context.db
          .select()
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.id, playerId))
          .limit(1);

        if (!player) {
          throw UserInputError('Player not found');
        }

        // Validate player eligibility against league settings
        if (
          !(await isPlayerInPool(context.db, playerId, leaguePre.playerPool))
        ) {
          throw UserInputError(
            `Player is not in the ${leaguePre.playerPool.toUpperCase()} player pool`,
          );
        }

        // Validate Hall of Fame eligibility (LS-295)
        if (leaguePre.hofOnly && !player.hallOfFame) {
          throw UserInputError(
            'This league is restricted to Hall of Fame players. This player is not in the Hall of Fame.',
          );
        }

        // Validate era eligibility (LS-295)
        if (leaguePre.eraFilter && leaguePre.eraFilter !== 'all') {
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
          if (leaguePre.eraFilter === 'custom') {
            eraStart = leaguePre.customEraStartYear ?? null;
            eraEnd = leaguePre.customEraEndYear ?? null;
          } else {
            const range = ERA_RANGES[leaguePre.eraFilter];
            if (range) {
              [eraStart, eraEnd] = range;
            }
          }
          if (eraStart != null && eraEnd != null) {
            const eraCheckResult = await context.db.execute(
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
              const eraLabel = leaguePre.eraFilter
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              throw UserInputError(
                `Player has no recorded seasons in the ${eraLabel} era and is not eligible for this league.`,
              );
            }
          }
        }

        if (
          !(await playerMeetsMinCareerGames(
            context.db,
            playerId,
            leaguePre.minCareerGames,
          ))
        ) {
          throw UserInputError(
            `Player does not meet the minimum career games requirement (${leaguePre.minCareerGames})`,
          );
        }

        if (
          !(await playerMeetsMinCareerSeasons(
            context.db,
            playerId,
            leaguePre.minCareerSeasons,
          ))
        ) {
          throw UserInputError(
            `Player does not meet the minimum career seasons requirement (${leaguePre.minCareerSeasons})`,
          );
        }

        // ── LS-4692: Phase 2 — Short locked write transaction ─────────────
        const result = await context.db.transaction(async (tx) => {
          // Surface lock waits as errors rather than silent hangs
          await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

          // FOR NO KEY UPDATE serializes concurrent writers without blocking
          // FK-referencing draft_picks INSERTs from other transactions.
          const draftRows = await tx.execute(
            sql`SELECT id, league_id, pick_time_limit_seconds, selection_method FROM drafts WHERE id = ${draftId} FOR NO KEY UPDATE`,
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
            throw UserInputError('Draft not found');
          }

          // TOCTOU re-verify league status — could have flipped between
          // Phase 1 and Phase 2.
          const [league] = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.league_id))
            .limit(1);

          if (!league) {
            throw UserInputError('League not found');
          }

          if (
            league.draftStatus !== 'in-progress' &&
            league.draftStatus !== 'paused'
          ) {
            throw UserInputError(
              `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
            );
          }

          const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

          if (!currentPickInfo || currentPickInfo.isComplete) {
            throw UserInputError('Draft is already complete');
          }

          // Check player availability (race-sensitive)
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
            throw UserInputError('Player has already been drafted');
          }

          // Commit the pick: insert pick row, advance draft state, and add player to roster.
          // commitDraftPick is the single source of truth for all draft-pick DB writes.
          const { draftPick, isDraftComplete, nextDeadline, nextPickInfo } =
            await commitDraftPick({
              tx,
              draftId,
              leagueId: draft.league_id,
              pickInfo: currentPickInfo,
              playerId,
              maxRosterSize: league.maxRosterSize,
              pickTimeLimitSeconds: draft.pick_time_limit_seconds,
              isMockDraft: league.isMockDraft,
            });

          return {
            draftPick,
            isDraftComplete,
            leagueId: draft.league_id,
            isMockDraft: league.isMockDraft,
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

        // Auto-create all matchups when draft completes.
        // Skipped for mock drafts — the league is ephemeral and rosters are not
        // persisted, so matchups and badge evaluation would be meaningless.
        if (result.isDraftComplete && !result.isMockDraft) {
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
              matchupError instanceof Error
                ? matchupError
                : new Error(String(matchupError)),
              { leagueId: result.leagueId },
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
        void logDraftPickActivity(context, {
          leagueId: result.leagueId,
          teamId: result.currentPickInfo?.teamId ?? null,
          actorUserId: userId,
          playerId,
          round: result.currentPickInfo?.round,
          pickNumber: result.currentPickInfo?.pickNumber,
          overallPick: result.currentPickInfo?.overallPick,
          wasCommissionerPick: true,
        });

        return result.draftPick;
      } catch (error) {
        LOGGER.error(
          'Error making commissioner pick',
          error instanceof Error ? error : new Error(String(error)),
          { draftId, playerId, userId },
        );
        throw error;
      }
    },
  }),
);
