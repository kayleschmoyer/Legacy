/**
 * Draft mutation: makeDraftPick
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
import { createAllMatchupsForLeague } from '../../matchups/mutations';
import { logDraftPickActivity } from '../../../services/activity-log';
import { checkRosterCapacity } from '../../../services/roster-service';
import { triggerAutoProcessDraftPicks } from '../trigger-auto-process';
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
 * moment a human submits a pick, tripping the `SET LOCAL statement_timeout`
 * guard (SQLSTATE 57014) on whichever statement in this transaction runs
 * while the lock is held elsewhere (LS-8475: the initial locking SELECT;
 * LS-8476: the commitDraftPick UPDATE). Unlike autoProcessDraftPicks — which
 * can just skip and let the next tick retry (LS-8398) — a human is waiting
 * on this response, so retry the whole transaction a couple of times instead
 * of surfacing a transient lock race as a hard failure.
 */
const MAX_PICK_LOCK_ATTEMPTS = 3;

const lockRetryDelay = (attempt: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50 * attempt));

const badgeService = createBadgeService(getDbOptions());

/**
 * Mutation: Make a draft pick
 *
 * Two-phase execution (LS-4692): Phase 1 runs static validation outside any
 * row lock (player eligibility, league-member auth, league-static filters);
 * Phase 2 acquires SELECT ... FOR NO KEY UPDATE on the drafts row only for
 * race-sensitive checks (existing pick, roster capacity) and the commit.
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
        // ── LS-4692: Phase 1 — Non-locking pre-validation ────────────────
        // All read-only checks that don't depend on draft state (player
        // existence, league-static eligibility filters, league-member auth)
        // run BEFORE the row lock is acquired. Only race-sensitive checks
        // (existing-pick, roster capacity) and the commit run inside the lock
        // in Phase 2. This shrinks the lock-hold window from ~10 sequential
        // DB round-trips to ~4, dramatically reducing contention on the
        // drafts row under concurrent pick traffic (queryid 4044566576106028777
        // and the correlated draft_picks INSERT tail).
        const draftPreRows = await context.db.execute(
          sql`SELECT id, league_id, current_pick, pick_time_limit_seconds, selection_method FROM drafts WHERE id = ${draftId}`,
        );
        const draftPre = draftPreRows.rows[0] as
          | {
              id: number;
              league_id: number;
              current_pick: number;
              pick_time_limit_seconds: number;
              selection_method: string;
            }
          | undefined;

        if (!draftPre) {
          throw UserInputError('Draft not found');
        }

        const [leaguePre] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draftPre.league_id))
          .limit(1);

        if (!leaguePre) {
          throw UserInputError('League not found');
        }

        if (leaguePre.draftStatus === 'paused') {
          throw UserInputError(
            'Draft is currently paused. Wait for the commissioner to resume.',
          );
        }

        if (leaguePre.draftStatus !== 'in-progress') {
          throw UserInputError(
            `Draft is not in progress (current status: ${leaguePre.draftStatus ?? 'unknown'})`,
          );
        }

        const currentPickInfoPre = await getCurrentDraftPickInfo(
          context.db,
          draftId,
        );

        if (!currentPickInfoPre) {
          throw UserInputError('Could not determine current pick');
        }

        if (currentPickInfoPre.isComplete) {
          throw UserInputError('Draft is already complete');
        }

        // Verify user owns the team whose turn it is. The user→team mapping
        // does not change mid-draft, so this is safe outside the lock; the
        // teamId is re-verified against the authoritative locked state below.
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

        if (!membership || membership.teamId !== currentPickInfoPre.teamId) {
          throw ForbiddenError(
            'Not authorized: It is not your turn to pick or you do not own this team',
          );
        }

        // Player existence + league-static eligibility filters. These depend
        // only on (playerId, league config) and not on any draft pick state.
        const [player] = await context.db
          .select()
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.id, playerId))
          .limit(1);

        if (!player) {
          throw UserInputError('Player not found');
        }

        // Static league-eligibility (pool, career games/seasons, HoF, era).
        // Evaluated through the SAME shared predicate set the draft board uses
        // (LS-8071), so a player shown as available can never be rejected here
        // — and the failing rule maps to a specific user-facing message.
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
        // FOR NO KEY UPDATE serializes concurrent writers to this draft row
        // without blocking concurrent FK-referencing inserts on draft_picks
        // from other transactions (those only need FOR KEY SHARE on drafts).
        const runLockedTx = () =>
          context.db.transaction(async (tx) => {
            // Surface lock waits as errors rather than silent hangs
            await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

            const draftRows = await tx.execute(
              sql`SELECT id, league_id, current_pick, pick_time_limit_seconds, selection_method FROM drafts WHERE id = ${draftId} FOR NO KEY UPDATE`,
            );
            const draft = draftRows.rows[0] as
              | {
                  id: number;
                  league_id: number;
                  current_pick: number;
                  pick_time_limit_seconds: number;
                  selection_method: string;
                }
              | undefined;

            if (!draft) {
              throw UserInputError('Draft not found');
            }

            // TOCTOU re-verify league status — could have flipped to paused
            // between Phase 1 and Phase 2.
            const [league] = await tx
              .select()
              .from(PublicSchema.leagues)
              .where(eq(PublicSchema.leagues.id, draft.league_id))
              .limit(1);

            if (!league) {
              throw UserInputError('League not found');
            }

            if (league.draftStatus === 'paused') {
              throw UserInputError(
                'Draft is currently paused. Wait for the commissioner to resume.',
              );
            }

            if (league.draftStatus !== 'in-progress') {
              throw UserInputError(
                `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
              );
            }

            // Authoritative pick info from the locked draft row
            const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

            if (!currentPickInfo) {
              throw UserInputError('Could not determine current pick');
            }

            if (currentPickInfo.isComplete) {
              throw UserInputError('Draft is already complete');
            }

            // TOCTOU guard: if the pick advanced between Phase 1 and Phase 2,
            // the user's request is stale (auth was checked against a different
            // team/slot). Surface as a user error so the client refetches and
            // retries against the new state.
            if (
              currentPickInfo.teamId !== currentPickInfoPre.teamId ||
              currentPickInfo.overallPick !== currentPickInfoPre.overallPick
            ) {
              throw UserInputError(
                'Draft state changed during pick submission — please refresh and retry',
              );
            }

            // Idempotency: if this exact pick was already made, return it.
            // Re-check inside the lock to cover duplicate submits that raced
            // through Phase 1 in parallel.
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
              // Fetch the actual next-pick info so that re-sending the WS
              // notification includes a valid nextPick payload. Previously,
              // nextPickInfo was hardcoded to null here, which caused the outer
              // heuristic (!isDraftComplete && nextPickInfo === null) to suppress
              // the notification entirely. Observers who missed the original
              // broadcast then never received the pick via WebSocket (LS-7977).
              // With a real nextPickInfo, the notification IS re-sent, and the
              // frontend de-dupes via notifiedPicksRef so no duplicate toasts appear.
              const idempotentNextPickInfo = await getCurrentDraftPickInfo(
                tx,
                draftId,
              );
              return {
                draftPick: existingOwnPick,
                isDraftComplete: false,
                leagueId: draft.league_id,
                isMockDraft: league.isMockDraft,
                selectionMethod: draft.selection_method,
                currentPickInfo,
                nextPickInfo: idempotentNextPickInfo,
                nextDeadline: null,
                isIdempotentPick: true,
              };
            }

            // Check if player has already been drafted (race-sensitive)
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

            // Validate roster limit (race-sensitive)
            const { isFull: rosterFull } = await checkRosterCapacity(
              tx,
              currentPickInfo.teamId,
              draft.league_id,
              league.maxRosterSize,
            );

            if (rosterFull) {
              throw UserInputError(
                `Team roster is full (${league.maxRosterSize} players maximum)`,
              );
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
                setStartedAt: draft.current_pick === 0,
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
              isIdempotentPick: false,
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
                '[LS-8476] Draft row lock wait timed out — retrying transaction',
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

        LOGGER.info('Draft pick made successfully', {
          draftId,
          playerId,
          teamId: result.currentPickInfo.teamId,
          round: result.currentPickInfo.round,
          pick: result.currentPickInfo.pickNumber,
          overallPick: result.currentPickInfo.overallPick,
          isDraftComplete: result.isDraftComplete,
        });

        // Send WebSocket notification for the pick (outside transaction).
        // Sent for both new and idempotent picks. Idempotent picks now carry
        // the actual nextPickInfo (fetched inside the transaction), so the
        // frontend receives a valid nextPick and won't prematurely mark the
        // draft complete (LS-4286). The frontend de-dupes notifications via
        // notifiedPicksRef, so no duplicate toasts are shown (LS-7977).
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
        }

        // ── LS-8107: Offload chained auto-picks to a separate request ───────
        // Previously (LS-440) consecutive auto-picks were chained synchronously
        // here — up to 10 picks / 20 s — which made the makeDraftPick response
        // slow whenever the human's pick was followed by several auto-pick
        // teams. Instead, return the human's pick immediately and let the
        // existing autoProcessDraftPicks path handle the auto-picks:
        //   1. Expire the next auto-pick team's deadline so the work is due now.
        //   2. Fire a set-and-forget HTTP nudge to autoProcessDraftPicks (the
        //      same system mutation EventBridge invokes every minute) so the
        //      picks are processed within ~1 s instead of waiting a full
        //      EventBridge cycle.
        // The EventBridge schedule (≤60 s) stays as the safety net if the nudge
        // is dropped. All failures here are non-fatal — the human's pick is
        // already committed (LS-3704: never surface a chain error to the client).
        if (
          !result.isIdempotentPick &&
          !result.isDraftComplete &&
          result.nextPickInfo
        ) {
          try {
            const [upcomingTeamEntry] = await context.db
              .select({ autoPick: PublicSchema.draftTeams.autoPick })
              .from(PublicSchema.draftTeams)
              .where(
                and(
                  eq(PublicSchema.draftTeams.draftId, draftId),
                  eq(
                    PublicSchema.draftTeams.teamId,
                    result.nextPickInfo.teamId,
                  ),
                ),
              )
              .limit(1);

            if (upcomingTeamEntry?.autoPick) {
              // Expire the next team's deadline so autoProcessDraftPicks treats
              // it as due immediately (mirrors LS-3643 / LS-427).
              await context.db
                .update(PublicSchema.drafts)
                .set({ currentPickDeadline: new Date(Date.now() - 1) })
                .where(eq(PublicSchema.drafts.id, draftId));

              // Set-and-forget: dispatch the nudge without awaiting it.
              triggerAutoProcessDraftPicks(result.leagueId);

              LOGGER.info(
                '[LS-8107] Offloaded chained auto-picks to autoProcessDraftPicks',
                {
                  draftId,
                  leagueId: result.leagueId,
                  nextTeamId: result.nextPickInfo.teamId,
                },
              );
            }
          } catch (offloadError) {
            LOGGER.warn(
              '[LS-8107] Failed to offload auto-picks (non-fatal)',
              offloadError instanceof Error
                ? offloadError
                : new Error(String(offloadError)),
              { draftId, leagueId: result.leagueId },
            );
          }
        }

        // Auto-create all matchups when the manual pick itself completes the
        // draft (the final pick, with no auto-pick teams after it). When an
        // auto-pick completes the draft, autoProcessDraftPicks → executePickEffects
        // handles matchup creation and the completion notification instead.
        // Skipped for mock drafts — the league is ephemeral and rosters are not
        // persisted, so matchups and badge evaluation would be meaningless.
        if (result.isDraftComplete && !result.isMockDraft) {
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
            LOGGER.error(
              'Failed to auto-create matchups after draft',
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
              LOGGER.warn('Badge evaluation after draft failed (non-fatal)', {
                leagueId: result.leagueId,
                err,
              });
            });
        }

        // Notify all completed drafts (real and mock).
        // For real drafts, this fires after createAllMatchupsForLeague so
        // positionId values are set before the frontend refetches team members.
        // Notifying before matchup creation caused roster lineup to show 0 (LS-3774).
        if (result.isDraftComplete && context.notificationService) {
          await context.notificationService.notifyDraftCompleted(
            result.leagueId,
            result.selectionMethod,
          );
        }

        // Record draft pick in the activity log (fire-and-forget, non-fatal)
        void logDraftPickActivity(context, {
          leagueId: result.leagueId,
          teamId: result.currentPickInfo?.teamId ?? null,
          actorUserId: userId,
          playerId,
          round: result.currentPickInfo?.round,
          pickNumber: result.currentPickInfo?.pickNumber,
          overallPick: result.currentPickInfo?.overallPick,
        });

        return result.draftPick;
      } catch (error) {
        // Skip error-level logging for expected user-facing errors
        const isExpected =
          error instanceof GraphQLError &&
          typeof error.extensions?.code === 'string' &&
          ['BAD_USER_INPUT', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(
            error.extensions.code,
          );
        if (!isExpected) {
          LOGGER.error(
            'Error making draft pick',
            error instanceof Error ? error : new Error(String(error)),
            { draftId, playerId, userId },
          );
        }
        throw error;
      }
    },
  }),
);
