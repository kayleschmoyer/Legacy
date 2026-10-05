/**
 * Draft mutation: commissionerPick
 */

import {
  createBadgeService,
  findFailedEligibilityRule,
  PublicSchema,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { DraftPick } from '../types';
import { commitDraftPick, getCurrentDraftPickInfo } from '../helpers';
import { isLockWaitTimeout } from '../scheduled-mutations';
import { builder } from '../../builder';
import { requireLeagueId } from '../league-draft';
import { offloadNextPickIfAutoPick } from '../offload-auto-pick';
import { notifyOnTheClock } from '../on-the-clock-push';
import { createAllMatchupsForLeague } from '../../matchups/mutations';
import { logDraftPickActivity } from '../../../services/activity-log';
import {
  checkRosterCapacity,
  isPlayerOnRoster,
} from '../../../services/roster-service';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';
import {
  describeDbError,
  formatDbError,
} from '../../leagues/delete-resilience';

/**
 * Max attempts (including the first) for the Phase-2 locked transaction.
 * EventBridge's every-minute autoProcessDraftPicks tick and the LS-8107
 * makeDraftPick nudge can both acquire the `drafts` row lock at the same
 * moment a commissioner submits a pick on behalf of another team, tripping
 * the `SET LOCAL statement_timeout` guard (SQLSTATE 57014) on whichever
 * statement in this transaction runs while the lock is held elsewhere
 * (LS-8480). Unlike autoProcessDraftPicks — which can just skip and let the
 * next tick retry (LS-8398) — a human is waiting on this response, so retry
 * the whole transaction a couple of times instead of surfacing a transient
 * lock race as a hard failure (mirrors the makeDraftPick fix, LS-8476).
 */
const MAX_PICK_LOCK_ATTEMPTS = 3;

const lockRetryDelay = (attempt: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50 * attempt));

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

        // Commissioner picks are a league tool: a mock draft has no
        // commissioner, and its Control All Teams host picks through
        // makeDraftPick for every seat instead (LS-10076).
        const leagueId = requireLeagueId({ leagueId: draftPre.league_id });

        // Verify user is league commissioner
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
            'Only a league commissioner can make picks on behalf of others',
          );
        }

        const [leaguePre] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
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

        // Validate player eligibility against league settings through the SAME
        // shared predicate set the draft board uses (LS-8071) so the board and
        // every pick endpoint stay in lock-step on who is draftable.
        const failedRule = await findFailedEligibilityRule(
          context.db,
          playerId,
          {
            playerPool: leaguePre.playerPool,
            minCareerGames: leaguePre.minCareerGames,
            minCareerSeasons: leaguePre.minCareerSeasons,
            baseballHofOnly: leaguePre.baseballHofOnly,
            baseballEraFilter: leaguePre.baseballEraFilter,
            customEraStartYear: leaguePre.customEraStartYear,
            customEraEndYear: leaguePre.customEraEndYear,
            sport: leaguePre.sport,
          },
        );
        if (failedRule) {
          throw UserInputError(failedRule.message);
        }

        // ── LS-4692: Phase 2 — Short locked write transaction ─────────────
        const runLockedTx = () =>
          context.db.transaction(async (tx) => {
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
                  league_id: number | null;
                  pick_time_limit_seconds: number;
                  selection_method: string;
                }
              | undefined;

            if (!draft) {
              throw UserInputError('Draft not found');
            }

            const txLeagueId = requireLeagueId({ leagueId: draft.league_id });

            // TOCTOU re-verify league status — could have flipped between
            // Phase 1 and Phase 2.
            const [league] = await tx
              .select()
              .from(PublicSchema.leagues)
              .where(eq(PublicSchema.leagues.id, txLeagueId))
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

            // LS-8674: a kept player is rostered (team_members) before the
            // first pick with no draft_picks row — the check above alone
            // would miss it.
            if (await isPlayerOnRoster(tx, txLeagueId, playerId)) {
              throw UserInputError(
                'Player is already rostered as a keeper in this league',
              );
            }

            // Validate roster limit — count existing team members
            // A league seat always holds a team (CHECK drafts_kind_league_ck).
            const pickTeamId = currentPickInfo.teamId;
            if (pickTeamId === null) {
              throw new Error(
                `commissionerPick: league draft ${String(draftId)} seat ${String(currentPickInfo.participantId)} has no team`,
              );
            }

            const { isFull: rosterFull } = await checkRosterCapacity(
              tx,
              pickTeamId,
              txLeagueId,
              league.maxRosterSize,
            );

            if (rosterFull) {
              throw UserInputError(
                `Team roster is full (${league.maxRosterSize} players maximum)`,
              );
            }

            // Commit the pick: insert pick row, advance draft state, and add player to roster.
            // commitDraftPick is the single source of truth for all draft-pick DB writes.
            const {
              draftPick,
              isDraftComplete,
              nextDeadline: committedDeadline,
              nextPickInfo,
            } = await commitDraftPick({
              tx,
              draftId,
              leagueId: txLeagueId,
              pickInfo: currentPickInfo,
              playerId,
              maxRosterSize: league.maxRosterSize,
              pickTimeLimitSeconds: draft.pick_time_limit_seconds,
            });

            // LS-10593: a commissioner may pick while the draft is paused,
            // but commitDraftPick always arms a fresh timer. Keep the paused
            // draft's deadline cleared (pauseDraft's invariant) — resumeDraft
            // grants the on-clock seat a full timer — so the timer is neither
            // broadcast nor picked up by autoProcessDraftPicks while paused.
            const isPaused = league.draftStatus === 'paused';
            let nextDeadline = committedDeadline;
            if (isPaused && nextDeadline !== null) {
              await tx
                .update(PublicSchema.drafts)
                .set({ currentPickDeadline: null })
                .where(eq(PublicSchema.drafts.id, draftId));
              nextDeadline = null;
            }

            return {
              isPaused,
              draftPick,
              isDraftComplete,
              leagueId: txLeagueId,
              isMock: false,
              selectionMethod: draft.selection_method,
              currentPickInfo,
              nextPickInfo,
              nextDeadline,
            };
          });

        let result: Awaited<ReturnType<typeof runLockedTx>>;
        for (let attempt = 1; ; attempt++) {
          try {
            result = await runLockedTx();
            break;
          } catch (txError) {
            if (
              attempt < MAX_PICK_LOCK_ATTEMPTS &&
              isLockWaitTimeout(txError)
            ) {
              LOGGER.warn(
                '[LS-8480] Draft row lock wait timed out — retrying commissionerPick transaction',
                {
                  draftId,
                  playerId,
                  attempt,
                  dbError: formatDbError(describeDbError(txError)),
                },
              );
              await lockRetryDelay(attempt);
              continue;
            }
            throw txError;
          }
        }

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
            result.currentPickInfo.participantId,
            playerId,
            result.currentPickInfo.round,
            result.currentPickInfo.pickNumber,
            result.currentPickInfo.overallPick,
            result.nextPickInfo
              ? {
                  teamId: result.nextPickInfo.teamId,
                  participantId: result.nextPickInfo.participantId,
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
              draftId,
              result.selectionMethod,
            );
          }
        }

        // LS-10593: mirror makeDraftPick's post-pick handling for the seat
        // now on the clock. Without the LS-8107 offload an auto-pick seat
        // after a commissioner pick sat on the clock for its full timer.
        // The offload is skipped while paused (the deadline stays cleared
        // until resumeDraft); the on-the-clock push is still sent so the
        // manager knows they are up when the draft resumes.
        if (!result.isDraftComplete && result.nextPickInfo) {
          if (!result.isPaused) {
            await offloadNextPickIfAutoPick(context.db, {
              draftId,
              leagueId: result.leagueId,
              nextParticipantId: result.nextPickInfo.participantId,
            });
          }

          await notifyOnTheClock(context.db, context.notificationPublisher, {
            draftId,
            leagueId: result.leagueId,
            participantId: result.nextPickInfo.participantId,
            round: result.nextPickInfo.round,
            pickNumber: result.nextPickInfo.pickNumber,
          });
        }

        // Auto-create all matchups when draft completes.
        // Skipped for mock drafts — they have no league and rosters are not
        // persisted, so matchups and badge evaluation would be meaningless.
        if (result.isDraftComplete && !result.isMock) {
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
        if (error instanceof GraphQLError) {
          throw error;
        }
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
