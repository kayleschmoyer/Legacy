/**
 * Draft mutation: makeDraftPick
 */

import {
  createBadgeService,
  filterPlayerIdsByLeagueEligibility,
  isPlayerInPool,
  playerMeetsMinCareerGames,
  playerMeetsMinCareerSeasons,
  PublicSchema,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { DraftPick } from '../types';
import {
  ALLOWED_POSITIONS_FOR_AUTO_PICK,
  commitDraftPick,
  getCurrentDraftPickInfo,
  getFirstQueuedPlayerForTeam,
  getUnfilledPositionTypes,
} from '../helpers';
import { builder } from '../../builder';
import { createAllMatchupsForLeague } from '../../matchups/mutations';
import { logDraftPickActivity } from '../../../services/activity-log';
import { checkRosterCapacity } from '../../../services/roster-service';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

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
          // Surface lock waits as errors rather than silent hangs
          await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

          // Lock the draft row to serialize concurrent pick attempts.
          // Only select the columns actually needed to keep the locked row small
          // and avoid unnecessary data transfer.
          const draftRows = await tx.execute(
            sql`SELECT id, league_id, current_pick, pick_time_limit_seconds, selection_method FROM drafts WHERE id = ${draftId} FOR UPDATE`,
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

          // Fetch league to validate draft status and get maxRosterSize
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

          // Calculate current pick info using the locked draft row
          const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

          if (!currentPickInfo) {
            throw UserInputError('Could not determine current pick');
          }

          if (currentPickInfo.isComplete) {
            throw UserInputError('Draft is already complete');
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
            throw ForbiddenError(
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
            throw UserInputError('Player has already been drafted');
          }

          // Verify player exists
          const [player] = await tx
            .select()
            .from(PublicSchema.players)
            .where(eq(PublicSchema.players.id, playerId))
            .limit(1);

          if (!player) {
            throw UserInputError('Player not found');
          }

          // Validate player is in the league's player pool (AL/NL restriction)
          if (!(await isPlayerInPool(tx, playerId, league.playerPool))) {
            throw UserInputError(
              `Player is not in the ${league.playerPool.toUpperCase()} player pool`,
            );
          }

          // Validate Hall of Fame eligibility (LS-295)
          if (league.hofOnly && !player.hallOfFame) {
            throw UserInputError(
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
                throw UserInputError(
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
            throw UserInputError(
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
            throw UserInputError(
              `Player does not meet the minimum career seasons requirement (${league.minCareerSeasons})`,
            );
          }

          // Validate roster limit — count existing team members
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

        // Track effective draft completion across the manual pick + any auto-pick chain.
        let effectiveDraftComplete = result.isDraftComplete;
        let chainedNextPickInfo = result.nextPickInfo;

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

          // If the manual pick itself completed the draft, notify now.
          if (effectiveDraftComplete) {
            await context.notificationService.notifyDraftCompleted(
              result.leagueId,
              result.selectionMethod,
            );
          }
        }

        // ── LS-440: Chain consecutive auto-picks ───────────────────────────
        // After a manual pick, if the next team(s) have auto-pick enabled,
        // process their picks immediately rather than waiting for the
        // EventBridge timer to expire (which can take up to 60 seconds).
        // Uses the same smart FPG × positional-scarcity selection algorithm
        // as autoProcessDraftPicks in scheduled-mutations.ts.
        if (!effectiveDraftComplete && chainedNextPickInfo) {
          // Cap at 10 picks and bail out after 20 s so we respond well within
          // API Gateway's 29-second integration timeout. Any remaining
          // consecutive auto-picks are handled by the EventBridge timer
          // (fires within 60 s). LS-3119
          const MAX_CHAINED_AUTO_PICKS = 10;
          const CHAIN_TIME_BUDGET_MS = 20_000;
          const chainStartTime = Date.now();
          let chainCount = 0;
          let stoppedByTimeBudget = false;

          while (
            chainCount < MAX_CHAINED_AUTO_PICKS &&
            !effectiveDraftComplete &&
            chainedNextPickInfo
          ) {
            // Guard before every iteration — the while condition doesn't
            // re-evaluate the budget after the cheap auto-pick check below,
            // so check again here before starting the expensive transaction.
            if (Date.now() - chainStartTime >= CHAIN_TIME_BUDGET_MS) {
              stoppedByTimeBudget = true;
              break;
            }

            // Check if the upcoming team has auto-pick enabled
            const [upcomingTeamEntry] = await context.db
              .select({ autoPick: PublicSchema.draftTeams.autoPick })
              .from(PublicSchema.draftTeams)
              .where(
                and(
                  eq(PublicSchema.draftTeams.draftId, draftId),
                  eq(
                    PublicSchema.draftTeams.teamId,
                    chainedNextPickInfo.teamId,
                  ),
                ),
              )
              .limit(1);

            if (!upcomingTeamEntry?.autoPick) break;

            // Re-check budget after the cheap DB query above — we're about to
            // start a multi-query transaction that can take hundreds of ms.
            if (Date.now() - chainStartTime >= CHAIN_TIME_BUDGET_MS) {
              stoppedByTimeBudget = true;
              break;
            }

            // Capture the expected team ID before the async closure to avoid
            // non-null assertions inside the transaction callback.
            const expectedAutoPickTeamId = chainedNextPickInfo.teamId;

            // Execute one auto-pick inside a transaction with row-level locking
            const autoPickResult = await context.db.transaction(
              async (
                apTx,
              ): Promise<{
                draftPick: typeof PublicSchema.draftPicks.$inferSelect;
                playerId: number;
                autoPickReason: string;
                isDraftComplete: boolean;
                currentPickInfo: NonNullable<
                  Awaited<ReturnType<typeof getCurrentDraftPickInfo>>
                >;
                nextPickInfo: Awaited<
                  ReturnType<typeof getCurrentDraftPickInfo>
                >;
                nextDeadline: Date | null;
                leagueId: number;
                selectionMethod: string;
              } | null> => {
                // Lock draft row to prevent concurrent modifications
                const apDraftRows = await apTx.execute(
                  sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
                );
                const apDraft = apDraftRows.rows[0] as
                  | {
                      id: number;
                      league_id: number;
                      current_pick: number;
                      pick_time_limit_seconds: number;
                      selection_method: string;
                    }
                  | undefined;
                if (!apDraft) return null;

                const [apLeague] = await apTx
                  .select()
                  .from(PublicSchema.leagues)
                  .where(eq(PublicSchema.leagues.id, apDraft.league_id))
                  .limit(1);
                if (!apLeague || apLeague.draftStatus !== 'in-progress')
                  return null;

                const apPickInfo = await getCurrentDraftPickInfo(apTx, draftId);
                if (!apPickInfo || apPickInfo.isComplete) return null;

                // Race-condition guard: verify this is still the expected team
                if (apPickInfo.teamId !== expectedAutoPickTeamId) return null;

                // 1. Fetch undrafted player IDs (deterministic id-ascending order)
                const undraftedRows = await apTx.execute(
                  sql`SELECT id FROM players p
                      WHERE NOT EXISTS (
                        SELECT 1 FROM draft_picks dp
                        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
                      )
                      ORDER BY p.id ASC`,
                );
                const undraftedIds = undraftedRows.rows.map(
                  (r) => r.id as number,
                );

                // 2. Apply league eligibility filters
                const eligibilityResult =
                  await filterPlayerIdsByLeagueEligibility(apTx, undraftedIds, {
                    playerPool: apLeague.playerPool,
                    minCareerGames: apLeague.minCareerGames ?? 0,
                    minCareerSeasons: apLeague.minCareerSeasons ?? 0,
                    hofOnly: apLeague.hofOnly ?? false,
                    eraFilter: apLeague.eraFilter ?? 'all',
                    customEraStartYear: apLeague.customEraStartYear ?? null,
                    customEraEndYear: apLeague.customEraEndYear ?? null,
                  });
                const eligibleIds = undraftedIds.filter((id) =>
                  eligibilityResult.eligibleIds.has(id),
                );
                if (eligibleIds.length === 0)
                  throw new Error(
                    `No available players for auto-pick chain in draft ${draftId}`,
                  );

                // 3. Unfilled roster position types for this team
                const unfilledPositionTypes = await getUnfilledPositionTypes(
                  apTx,
                  draftId,
                  apPickInfo.teamId,
                  apDraft.league_id,
                );

                // 3a. Draft queue check (LS-473): prefer the user's queue over
                //     the FPG algorithm when a queued, eligible player is available.
                const eligibleSet = new Set(eligibleIds);
                const queuedPlayerId = await getFirstQueuedPlayerForTeam(
                  apTx,
                  draftId,
                  apPickInfo.teamId,
                );

                let autoPlayerId: number | undefined;
                let autoPickReason = '';

                if (
                  queuedPlayerId !== null &&
                  eligibleSet.has(queuedPlayerId)
                ) {
                  autoPlayerId = queuedPlayerId;
                  autoPickReason = `Draft queue pick — player ${queuedPlayerId} (user's next queued selection)`;
                }

                if (autoPlayerId !== undefined) {
                  // Queue pick: skip the expensive stats query
                  LOGGER.info(
                    '[LS-473] Chained auto-pick: using draft queue selection',
                    {
                      draftId,
                      teamId: apPickInfo.teamId,
                      playerId: autoPlayerId,
                    },
                  );
                } else {
                  // 4. Smart player selection: projected FPG × positional scarcity
                  //    (same algorithm as autoProcessDraftPicks)
                  const apGamesPerMatchup = apLeague.gamesPerMatchup ?? 5;
                  const apSpStartsPerMatchup = apLeague.spStartsPerMatchup ?? 1;
                  // Use pre-computed per-category PPG from player_scoring_cache (LS-902)
                  const statsRows = await apTx.execute(sql`
                  SELECT
                    p.id AS player_id,
                    (
                      COALESCE(cs.batting_ppg, 0)  * ${apGamesPerMatchup} +
                      COALESCE(cs.pitching_ppg, 0) * ${apSpStartsPerMatchup} +
                      COALESCE(cs.fielding_ppg, 0) * ${apGamesPerMatchup}
                    ) AS projected_fpg
                  FROM players p
                  LEFT JOIN public.player_scoring_cache cs
                    ON cs.player_id = p.id AND cs.league_id IS NULL
                  WHERE p.id = ANY(${sql.param(eligibleIds)}::integer[])
                  ORDER BY projected_fpg DESC
                `);

                  // Fetch position eligibility from the mat view (same source of truth as the UI)
                  const positionRows = await apTx
                    .select({
                      playerId: PublicSchema.playerEligiblePositions.playerId,
                      position: PublicSchema.playerEligiblePositions.position,
                    })
                    .from(PublicSchema.playerEligiblePositions)
                    .where(
                      inArray(
                        PublicSchema.playerEligiblePositions.playerId,
                        eligibleIds,
                      ),
                    );

                  const eligiblePositionsByPlayer = new Map<number, string[]>();
                  for (const row of positionRows) {
                    const positions =
                      eligiblePositionsByPlayer.get(row.playerId) ?? [];
                    positions.push(row.position);
                    eligiblePositionsByPlayer.set(row.playerId, positions);
                  }

                  const playerDraftInfo = new Map<
                    number,
                    { fpg: number; positions: string[] }
                  >();
                  for (const row of statsRows.rows) {
                    const pid = row.player_id as number;
                    playerDraftInfo.set(pid, {
                      fpg: Number(row.projected_fpg) || 0,
                      positions: eligiblePositionsByPlayer.get(pid) ?? [],
                    });
                  }

                  if (unfilledPositionTypes.length > 0) {
                    const totalEligible = Math.max(playerDraftInfo.size, 1);
                    const positionCandidateCounts = new Map<string, number>();
                    for (const posType of unfilledPositionTypes) {
                      const allowedStatPositions =
                        ALLOWED_POSITIONS_FOR_AUTO_PICK[posType] ?? [posType];
                      let posCount = 0;
                      for (const [, info] of playerDraftInfo) {
                        if (
                          allowedStatPositions.some((sp) =>
                            info.positions.includes(sp),
                          )
                        )
                          posCount++;
                      }
                      positionCandidateCounts.set(
                        posType,
                        Math.max(posCount, 1),
                      );
                    }

                    let bestScore = -Infinity;
                    for (const [id, info] of playerDraftInfo) {
                      let scarcityMultiplier = 0.25;
                      let matchesUnfilled = false;
                      let bestPosition = '';
                      for (const posType of unfilledPositionTypes) {
                        const allowedStatPositions =
                          ALLOWED_POSITIONS_FOR_AUTO_PICK[posType] ?? [posType];
                        if (
                          allowedStatPositions.some((sp) =>
                            info.positions.includes(sp),
                          )
                        ) {
                          matchesUnfilled = true;
                          const posCount =
                            positionCandidateCounts.get(posType) ??
                            totalEligible;
                          const posScarcity = Math.min(
                            Math.sqrt(totalEligible / posCount),
                            5.0,
                          );
                          if (posScarcity > scarcityMultiplier) {
                            scarcityMultiplier = posScarcity;
                            bestPosition = posType;
                          }
                        }
                      }
                      const draftScore = info.fpg * scarcityMultiplier;
                      if (draftScore > bestScore) {
                        bestScore = draftScore;
                        autoPlayerId = id;
                        autoPickReason = matchesUnfilled
                          ? `Best available for ${bestPosition} — ${info.fpg.toFixed(1)} projected FPG (×${scarcityMultiplier.toFixed(1)} positional scarcity)`
                          : `Best available (bench) — ${info.fpg.toFixed(1)} projected FPG`;
                      }
                    }
                  } else {
                    // All positions filled — pick the highest-FPG player (bench)
                    const topPlayer = statsRows.rows[0];
                    if (topPlayer) {
                      autoPlayerId = topPlayer.player_id as number;
                      autoPickReason = `Best available (bench) — ${Number(topPlayer.projected_fpg).toFixed(1)} projected FPG`;
                    }
                  }

                  // Final fallback (no career stats)
                  if (autoPlayerId === undefined) {
                    autoPlayerId = eligibleIds[0];
                    autoPickReason =
                      'Fallback selection (no career stats available)';
                  }
                } // end else (no queue pick)

                // Roster limit check
                const { isFull: apRosterFull } = await checkRosterCapacity(
                  apTx,
                  apPickInfo.teamId,
                  apDraft.league_id,
                  apLeague.maxRosterSize,
                );
                if (apRosterFull) {
                  throw new Error(
                    `Team ${apPickInfo.teamId} roster is full in draft ${draftId}`,
                  );
                }

                // Commit the pick: insert pick row, advance draft state, and add player to roster.
                const {
                  draftPick: apDraftPick,
                  isDraftComplete: apIsDraftComplete,
                  nextDeadline: apNextDeadline,
                  nextPickInfo: apNextPickInfo,
                } = await commitDraftPick({
                  tx: apTx,
                  draftId,
                  leagueId: apDraft.league_id,
                  pickInfo: apPickInfo,
                  playerId: autoPlayerId,
                  maxRosterSize: apLeague.maxRosterSize,
                  pickTimeLimitSeconds: apDraft.pick_time_limit_seconds,
                  isMockDraft: apLeague.isMockDraft,
                });

                return {
                  draftPick: apDraftPick,
                  playerId: autoPlayerId,
                  autoPickReason,
                  isDraftComplete: apIsDraftComplete,
                  currentPickInfo: apPickInfo,
                  nextPickInfo: apNextPickInfo,
                  nextDeadline: apNextDeadline,
                  leagueId: apDraft.league_id,
                  selectionMethod: apDraft.selection_method,
                };
              },
            );

            if (!autoPickResult) break;

            chainCount++;

            LOGGER.info('[LS-440] Chained auto-pick made after manual pick', {
              draftId,
              leagueId: autoPickResult.leagueId,
              playerId: autoPickResult.playerId,
              teamId: autoPickResult.currentPickInfo.teamId,
              overallPick: autoPickResult.currentPickInfo.overallPick,
              chainCount,
              reason: autoPickResult.autoPickReason,
            });

            // Send WS notification for this chained auto-pick
            if (context.notificationService) {
              await context.notificationService.notifyDraftPickMade(
                autoPickResult.leagueId,
                draftId,
                autoPickResult.draftPick.id,
                autoPickResult.currentPickInfo.teamId,
                autoPickResult.playerId,
                autoPickResult.currentPickInfo.round,
                autoPickResult.currentPickInfo.pickNumber,
                autoPickResult.currentPickInfo.overallPick,
                autoPickResult.nextPickInfo
                  ? {
                      teamId: autoPickResult.nextPickInfo.teamId,
                      round: autoPickResult.nextPickInfo.round,
                      pickNumber: autoPickResult.nextPickInfo.pickNumber,
                      overallPick: autoPickResult.nextPickInfo.overallPick,
                    }
                  : undefined,
                {
                  wasAutoPick: true,
                  autoPickReason: autoPickResult.autoPickReason,
                  currentPickDeadline:
                    autoPickResult.nextDeadline?.toISOString() ?? null,
                },
              );

              if (autoPickResult.isDraftComplete) {
                await context.notificationService.notifyDraftCompleted(
                  autoPickResult.leagueId,
                  autoPickResult.selectionMethod,
                );
              }
            }

            // Record chained auto-pick in the activity log (LS-538)
            await logDraftPickActivity(context, {
              leagueId: autoPickResult.leagueId,
              teamId: autoPickResult.currentPickInfo.teamId,
              actorUserId: null, // system-driven auto-pick
              playerId: autoPickResult.playerId,
              round: autoPickResult.currentPickInfo.round,
              pickNumber: autoPickResult.currentPickInfo.pickNumber,
              overallPick: autoPickResult.currentPickInfo.overallPick,
              wasAutoPick: true,
            });

            effectiveDraftComplete = autoPickResult.isDraftComplete;
            chainedNextPickInfo = autoPickResult.nextPickInfo;
          }

          if (chainCount > 0 || stoppedByTimeBudget) {
            const chainElapsedMs = Date.now() - chainStartTime;
            LOGGER.info('[LS-440] Auto-pick chain complete', {
              draftId,
              chainCount,
              effectiveDraftComplete,
              chainElapsedMs,
              stoppedByTimeBudget,
            });
          }
        }

        // Auto-create all matchups when draft completes.
        // Skipped for mock drafts — the league is ephemeral and rosters are not
        // persisted, so matchups and badge evaluation would be meaningless.
        if (effectiveDraftComplete && !result.isMockDraft) {
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
