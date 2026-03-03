/**
 * Draft domain — scheduled (system) mutation for auto-picking expired draft picks.
 *
 * Triggered every minute by EventBridge. Each invocation chains through all
 * consecutively-expired deadlines per draft (inner retry loop) so short pick
 * timers (e.g. 30s) aren't bottlenecked by the 1-minute polling interval.
 *
 * Finds all in-progress drafts where `current_pick_deadline` has passed,
 * then auto-picks the best available player for the timed-out team,
 * preferring players that fill still-open league roster position slots
 * (minimum requirements).
 *
 * Uses the same 3-tier auth pattern as other scheduled mutations:
 *   - System API key (EventBridge) → allowed for ALL leagues
 *   - Admin user → allowed for ALL leagues
 *   - Commissioner / General Manager → allowed for their league only
 */

import {
  filterPlayerIdsByLeagueEligibility,
  PublicSchema,
} from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, lte, sql } from 'drizzle-orm';

import {
  ALLOWED_POSITIONS_FOR_AUTO_PICK,
  getCurrentDraftPickInfo,
  getUnfilledPositionTypes,
} from './helpers';
import { builder, type Context } from '../builder';
import { createAllMatchupsForLeague } from '../matchups/mutations';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';
import { insertActivityLog } from '../../services/activity-log';

/**
 * Lighter auth check for the draft auto-pick nudge.
 * ANY authenticated league member can trigger this, not just commissioners/GMs.
 * The mutation itself is fully idempotent — it only processes picks whose
 * deadline has actually passed, so there is no abuse vector.
 */
async function assertLeagueMemberOrSystem(
  context: Context,
  leagueId: number | null | undefined,
): Promise<void> {
  // System requests (EventBridge) can always operate on all leagues
  if (context.isSystemRequest) return;

  // Admin users can always operate on all leagues
  if (context.user?.isAdmin) return;

  if (!context.user) {
    throw AuthenticationError();
  }

  if (!leagueId) {
    throw ForbiddenError(
      'Only system processes can trigger for all leagues. Provide a leagueId.',
    );
  }

  // Any league member can nudge the auto-pick (the mutation is idempotent)
  const membership = await context.db
    .select({ leagueId: PublicSchema.leagueMembers.leagueId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, context.user.id),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    throw ForbiddenError('You are not a member of this league');
  }
}

// ── Response Type ────────────────────────────────────────────────────────────

interface AutoProcessDraftPicksResultShape {
  draftsProcessed: number;
  picksAutoMade: number;
  draftsCompleted: number;
  errors: string[];
}

const AutoProcessDraftPicksResult =
  builder.objectRef<AutoProcessDraftPicksResultShape>(
    'AutoProcessDraftPicksResult',
  );

builder.objectType(AutoProcessDraftPicksResult, {
  description:
    'Result of the automated draft pick processing for expired deadlines',
  fields: (t) => ({
    draftsProcessed: t.exposeInt('draftsProcessed'),
    picksAutoMade: t.exposeInt('picksAutoMade'),
    draftsCompleted: t.exposeInt('draftsCompleted'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Mutation: autoProcessDraftPicks ──────────────────────────────────────────
// Triggered every minute by EventBridge. Each invocation chains through ALL
// consecutively-expired deadlines per draft so short pick timers (e.g. 30s)
// don't bottleneck at the 1-minute EventBridge polling interval.
//
// For each expired draft, auto-picks the best available player that passes
// league eligibility (playerPool, minCareerGames, minCareerSeasons) and fills
// an open league position slot first (minimum requirements), then falls back
// to any eligible player. Advances the draft after each pick.

builder.mutationField('autoProcessDraftPicks', (t) =>
  t.field({
    type: AutoProcessDraftPicksResult,
    args: {
      leagueId: t.arg.int({
        required: false,
        description:
          'Optional: restrict to a single league. Required for non-system callers (any league member can nudge).',
      }),
    },
    description:
      'Process expired draft pick deadlines. Idempotent — safe to call from any client as a nudge. EventBridge also calls this every minute as a fallback.',
    resolve: async (_parent, args, context) => {
      const leagueId = args.leagueId ?? null;
      await assertLeagueMemberOrSystem(context, leagueId);

      LOGGER.info('[autoProcessDraftPicks] Starting expired draft pick scan');

      const result: AutoProcessDraftPicksResultShape = {
        draftsProcessed: 0,
        picksAutoMade: 0,
        draftsCompleted: 0,
        errors: [],
      };

      try {
        // Find all in-progress drafts with expired deadlines
        const now = new Date();
        const expiredDraftsQuery = sql`
          SELECT d.id AS draft_id, d.league_id, d.current_pick,
                 d.draft_order, d.selection_method, d.pick_time_limit_seconds
          FROM drafts d
          INNER JOIN leagues l ON l.id = d.league_id
          WHERE l.draft_status = 'in-progress'
            AND d.current_pick_deadline IS NOT NULL
            AND d.current_pick_deadline <= ${now}
            ${leagueId ? sql`AND d.league_id = ${leagueId}` : sql``}
          ORDER BY d.current_pick_deadline ASC
        `;

        const expiredDrafts = await context.db.execute(expiredDraftsQuery);

        if (expiredDrafts.rows.length === 0) {
          LOGGER.info('[autoProcessDraftPicks] No expired draft picks found');
          return result;
        }

        LOGGER.info(
          `[autoProcessDraftPicks] Found ${expiredDrafts.rows.length} drafts with expired deadlines`,
        );

        const notificationService = createNotificationService();

        for (const row of expiredDrafts.rows) {
          const draftId = row.draft_id as number;
          const draftLeagueId = row.league_id as number;
          const pickTimeLimitSeconds = row.pick_time_limit_seconds as number;

          try {
            result.draftsProcessed++;

            // Inner loop: chain through consecutive expired deadlines.
            // When pickTimeLimitSeconds < the EventBridge interval, multiple
            // deadlines may have expired. Process them all in one invocation,
            // capped to stay within Lambda timeout limits.
            //
            // Time-budget guard: each auto-pick spans a DB transaction that
            // can take several seconds (eligibility + stats queries across
            // 23 k players). The Lambda timeout is 30 s, so we stop chaining
            // at 20 s to avoid timing out mid-transaction, which would abort
            // the transaction and leave the connection in a bad state for the
            // next invocation. EventBridge (every 60 s) or the next client
            // nudge will resume where we left off.
            const PICK_LOOP_BUDGET_MS = 20_000;
            const loopStartTime = Date.now();
            const MAX_AUTO_PICKS_PER_DRAFT = 100;
            let picksThisDraft = 0;

            while (picksThisDraft < MAX_AUTO_PICKS_PER_DRAFT) {
              // Bail out before the Lambda timeout rather than dying mid-transaction.
              const elapsedMs = Date.now() - loopStartTime;
              if (elapsedMs > PICK_LOOP_BUDGET_MS) {
                LOGGER.info(
                  `[autoProcessDraftPicks] Time budget exhausted after ${elapsedMs} ms — stopping inner loop for draft ${draftId} (${picksThisDraft} picks this invocation)`,
                );
                break;
              }

              // ─── Phase 1: Non-locking pre-computation ─────────────────────────────────
              // Check deadline and fetch candidate pool BEFORE acquiring the row lock.
              // This moves the expensive read queries (23 k-row player join, eligibility
              // filters, stats for ~1000 candidates) off the critical path, dramatically
              // reducing lock hold time and contention during live drafts.

              // Fast bail-out: check deadline without acquiring any lock
              const preCheckRows = await context.db.execute(
                sql`SELECT id, league_id, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId}`,
              );
              const preCheckDraft = preCheckRows.rows[0] as
                | {
                    id: number;
                    league_id: number;
                    current_pick: number;
                    current_pick_deadline: Date | null;
                  }
                | undefined;

              if (!preCheckDraft) {
                LOGGER.warn(
                  `[autoProcessDraftPicks] Draft ${draftId} not found in pre-check`,
                );
                break;
              }

              const preCheckNow = new Date();
              if (
                !preCheckDraft.current_pick_deadline ||
                new Date(preCheckDraft.current_pick_deadline) > preCheckNow
              ) {
                LOGGER.info(
                  `[autoProcessDraftPicks] Draft ${draftId} deadline not expired in pre-check — stopping loop`,
                );
                break;
              }

              // League status check outside transaction — fail fast without holding the row lock
              const [leaguePre] = await context.db
                .select()
                .from(PublicSchema.leagues)
                .where(eq(PublicSchema.leagues.id, draftLeagueId))
                .limit(1);

              if (!leaguePre || leaguePre.draftStatus !== 'in-progress') {
                LOGGER.info(
                  `[autoProcessDraftPicks] League ${draftLeagueId} is not in-progress, skipping draft ${draftId}`,
                );
                break;
              }

              // 1. Fetch the top 1000 undrafted candidates pre-sorted by projected
              //    fantasy points per game (FPG). Limiting the candidate pool here
              //    avoids passing 23 k+ player IDs as array parameters to the
              //    eligibility filters and the scoring query, which previously
              //    caused ~10 s per pick and Lambda timeouts.
              //    1000 candidates gives ample coverage for all roster positions
              //    while reducing downstream query cost by ~23×.
              const undraftedRows = await context.db.execute(
                sql`SELECT p.id,
                    (
                      CASE WHEN COALESCE(cb.g, 0) > 0 THEN
                        (COALESCE(cb.h,0)*1.0 + COALESCE(cb.doubles,0)*2.0 +
                         COALESCE(cb.triples,0)*3.0 + COALESCE(cb.hr,0)*4.0 +
                         COALESCE(cb.r,0)*1.0 + COALESCE(cb.rbi,0)*1.0 +
                         COALESCE(cb.sb,0)*2.0 + COALESCE(cb.cs,0)*-1.0 +
                         COALESCE(cb.hbp,0)*1.0 + COALESCE(cb.so,0)*-0.5
                        ) / cb.g
                      ELSE 0 END
                      +
                      CASE WHEN COALESCE(cp.g, 0) > 0 THEN
                        (COALESCE(cp.w,0)*5.0 + COALESCE(cp.l,0)*-2.0 +
                         COALESCE(cp.sv,0)*5.0 + COALESCE(cp.so,0)*1.0 +
                         COALESCE(cp.outs_recorded,0)*1.0 + COALESCE(cp.h,0)*-1.0 +
                         COALESCE(cp.er,0)*-2.0 + COALESCE(cp.bb,0)*-1.0
                        ) / cp.g
                      ELSE 0 END
                      +
                      CASE WHEN COALESCE(cf.g, 0) > 0 THEN
                        COALESCE(cf.e_def,0) * -1.0 / cf.g
                      ELSE 0 END
                    ) AS fpg
                  FROM players p
                  LEFT JOIN career_batting cb ON cb.player_id = p.id
                  LEFT JOIN career_pitching cp ON cp.player_id = p.id
                  LEFT JOIN career_fielding cf ON cf.player_id = p.id
                  WHERE p.id NOT IN (
                    SELECT player_id FROM draft_picks WHERE draft_id = ${draftId}
                  )
                  ORDER BY fpg DESC
                  LIMIT 1000`,
              );
              const undraftedIds = undraftedRows.rows.map(
                (r) => r.id as number,
              );

              // 2. Apply all eligibility filters via the shared DraftUtils function
              //    (playerPool, minCareerGames, minCareerSeasons, hofOnly, eraFilter)
              const eligibilityResult =
                await filterPlayerIdsByLeagueEligibility(
                  context.db,
                  undraftedIds,
                  {
                    playerPool: leaguePre.playerPool,
                    minCareerGames: leaguePre.minCareerGames ?? 0,
                    minCareerSeasons: leaguePre.minCareerSeasons ?? 0,
                    hofOnly: leaguePre.hofOnly ?? false,
                    eraFilter: leaguePre.eraFilter ?? 'all',
                    customEraStartYear: leaguePre.customEraStartYear ?? null,
                    customEraEndYear: leaguePre.customEraEndYear ?? null,
                  },
                );
              // Filter preserves FPG-descending order from undraftedIds
              const eligibleIds = undraftedIds.filter((id) =>
                eligibilityResult.eligibleIds.has(id),
              );

              if (eligibleIds.length === 0) {
                throw new Error(`No available players for draft ${draftId}`);
              }

              // 3. Pre-compute per-player stats and positions for the candidate pool.
              //    Done outside the lock so this expensive join doesn't hold the row lock.
              //
              // Scoring weights mirror lib/scoring/src/baseball/DefaultScoring.ts:
              //   Batting:  H=1, 2B=2, 3B=3, HR=4, R=1, RBI=1, SB=2, CS=-1, HBP=1, SO=-0.5
              //   Pitching: W=5, L=-2, SV=5, SO=1, outsRecorded=1, H=-1, ER=-2, BB=-1
              //   Fielding: E=-1
              // Projected matchup pts = career ppg × games per matchup (hitters)
              //                         career ppg × SP starts per matchup (pitchers)
              const gamesPerMatchup = leaguePre.gamesPerMatchup ?? 5;
              const spStartsPerMatchup = leaguePre.spStartsPerMatchup ?? 1;
              const statsRows = await context.db.execute(
                sql`SELECT
                  p.id AS player_id,
                  cf.positions_played,
                  (
                    CASE WHEN COALESCE(cb.g, 0) > 0 THEN
                      (COALESCE(cb.h,0)*1.0 + COALESCE(cb.doubles,0)*2.0 +
                       COALESCE(cb.triples,0)*3.0 + COALESCE(cb.hr,0)*4.0 +
                       COALESCE(cb.r,0)*1.0 + COALESCE(cb.rbi,0)*1.0 +
                       COALESCE(cb.sb,0)*2.0 + COALESCE(cb.cs,0)*-1.0 +
                       COALESCE(cb.hbp,0)*1.0 + COALESCE(cb.so,0)*-0.5
                      ) / cb.g * ${gamesPerMatchup}
                    ELSE 0 END
                    +
                    CASE WHEN COALESCE(cp.g, 0) > 0 THEN
                      (COALESCE(cp.w,0)*5.0 + COALESCE(cp.l,0)*-2.0 +
                       COALESCE(cp.sv,0)*5.0 + COALESCE(cp.so,0)*1.0 +
                       COALESCE(cp.outs_recorded,0)*1.0 + COALESCE(cp.h,0)*-1.0 +
                       COALESCE(cp.er,0)*-2.0 + COALESCE(cp.bb,0)*-1.0
                      ) / cp.g * ${spStartsPerMatchup}
                    ELSE 0 END
                    +
                    CASE WHEN COALESCE(cf.g, 0) > 0 THEN
                      COALESCE(cf.e_def,0) * -1.0 / cf.g * ${gamesPerMatchup}
                    ELSE 0 END
                  ) AS projected_fpg
                FROM players p
                LEFT JOIN career_batting cb ON cb.player_id = p.id
                LEFT JOIN career_pitching cp ON cp.player_id = p.id
                LEFT JOIN career_fielding cf ON cf.player_id = p.id
                WHERE p.id = ANY(${sql.param(eligibleIds)}::integer[])
                ORDER BY projected_fpg DESC`,
              );

              // Build player info map: id → { fpg, positions } (passed into tx via closure)
              const playerDraftInfo = new Map<
                number,
                { fpg: number; positions: string[] }
              >();
              // Ranked IDs in descending FPG order (statsRows already sorted)
              const rankedEligibleIds: number[] = [];
              for (const row of statsRows.rows) {
                const playerId = row.player_id as number;
                const positionsPlayed = row.positions_played as Record<
                  string,
                  unknown
                > | null;
                playerDraftInfo.set(playerId, {
                  fpg: Number(row.projected_fpg) || 0,
                  positions: positionsPlayed
                    ? Object.keys(positionsPlayed)
                    : [],
                });
                rankedEligibleIds.push(playerId);
              }
              // Append any eligibleIds not in statsRows (no career stats — final fallback)
              for (const id of eligibleIds) {
                if (!playerDraftInfo.has(id)) {
                  rankedEligibleIds.push(id);
                  playerDraftInfo.set(id, { fpg: 0, positions: [] });
                }
              }

              // ─── Phase 2: Short locked write transaction ─────────────────────────────
              // By this point the expensive read work is done. The transaction only needs
              // to: acquire the row lock, re-validate the deadline (TOCTOU guard), score
              // players from the pre-computed map (pure in-memory), and write the pick.
              const pickResult = await context.db.transaction(async (tx) => {
                // Surface lock waits as errors rather than silent hangs
                await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

                // Acquire row-level lock — narrow SELECT avoids transferring unused columns
                const draftRows = await tx.execute(
                  sql`SELECT id, league_id, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId} FOR UPDATE`,
                );
                const draft = draftRows.rows[0] as
                  | {
                      id: number;
                      league_id: number;
                      current_pick: number;
                      current_pick_deadline: Date | null;
                    }
                  | undefined;

                if (!draft) {
                  throw new Error(`Draft ${draftId} not found`);
                }

                // Re-check deadline inside transaction — may have been picked
                // by a user, or the chained deadline may still be in the future.
                const checkNow = new Date();
                if (
                  !draft.current_pick_deadline ||
                  new Date(draft.current_pick_deadline) > checkNow
                ) {
                  LOGGER.info(
                    `[autoProcessDraftPicks] Draft ${draftId} deadline no longer expired (pick was made), skipping`,
                  );
                  return null;
                }

                // Capture the expired deadline for chaining — the NEXT deadline
                // is computed from this value (not from wall-clock now) so the
                // intended cadence is preserved when EventBridge fires late.
                const expiredDeadline = new Date(draft.current_pick_deadline);

                // Re-validate league status inside the transaction (guards against race
                // between the pre-check outside and this lock acquisition).
                const [league] = await tx
                  .select()
                  .from(PublicSchema.leagues)
                  .where(eq(PublicSchema.leagues.id, draftLeagueId))
                  .limit(1);

                if (!league || league.draftStatus !== 'in-progress') {
                  LOGGER.info(
                    `[autoProcessDraftPicks] League ${draftLeagueId} is not in-progress, skipping draft ${draftId}`,
                  );
                  return null;
                }

                // Get authoritative pick info from the locked draft row
                const currentPickInfo = await getCurrentDraftPickInfo(
                  tx,
                  draftId,
                );

                if (!currentPickInfo || currentPickInfo.isComplete) {
                  LOGGER.info(
                    `[autoProcessDraftPicks] Draft ${draftId} is already complete`,
                  );
                  return null;
                }

                // Determine unfilled roster positions for the current team (lightweight reads)
                const unfilledPositionTypes = await getUnfilledPositionTypes(
                  tx,
                  draftId,
                  currentPickInfo.teamId,
                  draftLeagueId,
                );

                LOGGER.info(
                  '[autoProcessDraftPicks] Unfilled position types for team',
                  {
                    draftId,
                    teamId: currentPickInfo.teamId,
                    unfilledPositionTypes,
                    eligibleCount: rankedEligibleIds.length,
                    eligibilityFilters: {
                      playerPool: league.playerPool,
                      minCareerGames: league.minCareerGames,
                      minCareerSeasons: league.minCareerSeasons,
                      hofOnly: league.hofOnly,
                      eraFilter: league.eraFilter,
                    },
                  },
                );

                let autoPlayerId: number | undefined;
                let autoPickReason = '';

                // ── Smart auto-pick: projected fantasy points + positional scarcity ──
                // Score the pre-computed candidate pool entirely in-memory — no DB queries.
                if (unfilledPositionTypes.length > 0) {
                  // Compute positional scarcity: scarcer positions → higher boost
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
                      ) {
                        posCount++;
                      }
                    }
                    positionCandidateCounts.set(posType, Math.max(posCount, 1));
                  }

                  // Score each player: projected matchup pts × scarcity multiplier
                  // Players matching scarcer unfilled positions get a boost;
                  // players not matching any unfilled position get a penalty.
                  let bestScore = -Infinity;

                  for (const [id, info] of playerDraftInfo) {
                    let scarcityMultiplier = 0.25; // Penalty for not filling any need
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
                          positionCandidateCounts.get(posType) ?? totalEligible;
                        // sqrt-based scarcity: moderate boost, capped at 5×
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
                        ? `Best available for ${bestPosition} — ${info.fpg.toFixed(1)} projected matchup pts (×${scarcityMultiplier.toFixed(1)} positional scarcity)`
                        : `Best available (bench) — ${info.fpg.toFixed(1)} projected matchup pts`;
                    }
                  }

                  LOGGER.info(
                    '[autoProcessDraftPicks] Smart auto-pick selected',
                    {
                      draftId,
                      playerId: autoPlayerId,
                      reason: autoPickReason,
                      unfilledPositionTypes,
                      positionScarcity: Object.fromEntries(
                        positionCandidateCounts,
                      ),
                    },
                  );
                } else {
                  // No unfilled positions — pick the highest-FPG player (bench).
                  // rankedEligibleIds is pre-sorted by projected_fpg DESC.
                  const topId = rankedEligibleIds[0];
                  if (topId !== undefined) {
                    autoPlayerId = topId;
                    const fpg = playerDraftInfo.get(topId)?.fpg ?? 0;
                    autoPickReason = `Best available (bench) — ${fpg.toFixed(1)} projected matchup pts`;
                    LOGGER.info(
                      '[autoProcessDraftPicks] Auto-pick for bench (all positions filled)',
                      {
                        draftId,
                        playerId: autoPlayerId,
                        projectedFpg: fpg.toFixed(2),
                      },
                    );
                  }
                }

                // Final fallback (should rarely happen — only if no stats exist)
                if (autoPlayerId === undefined) {
                  autoPlayerId = eligibleIds[0];
                  autoPickReason =
                    'Fallback selection (no career stats available)';
                  LOGGER.info(
                    '[autoProcessDraftPicks] Using final fallback auto-pick',
                    { draftId, playerId: autoPlayerId },
                  );
                }

                // Guard: the pre-computed top player could have been drafted by a
                // concurrent pick between Phase 1 and this transaction. Walk the
                // ranked list to find the first player still available.
                if (autoPlayerId !== undefined) {
                  const preferredId = autoPlayerId;
                  const [alreadyDrafted] = await tx
                    .select({ playerId: PublicSchema.draftPicks.playerId })
                    .from(PublicSchema.draftPicks)
                    .where(
                      and(
                        eq(PublicSchema.draftPicks.draftId, draftId),
                        eq(PublicSchema.draftPicks.playerId, preferredId),
                      ),
                    )
                    .limit(1);
                  if (alreadyDrafted) {
                    autoPlayerId = undefined;
                    for (const candidateId of rankedEligibleIds) {
                      if (candidateId === preferredId) continue;
                      const [taken] = await tx
                        .select({ playerId: PublicSchema.draftPicks.playerId })
                        .from(PublicSchema.draftPicks)
                        .where(
                          and(
                            eq(PublicSchema.draftPicks.draftId, draftId),
                            eq(PublicSchema.draftPicks.playerId, candidateId),
                          ),
                        )
                        .limit(1);
                      if (!taken) {
                        autoPlayerId = candidateId;
                        autoPickReason = `${autoPickReason} (fallback: preferred player drafted concurrently)`;
                        break;
                      }
                    }
                  }
                }

                if (autoPlayerId === undefined) {
                  throw new Error(`No available players for draft ${draftId}`);
                }

                // Validate roster limit
                const [rosterCount] = await tx
                  .select({ count: count() })
                  .from(PublicSchema.teamMembers)
                  .where(
                    and(
                      eq(
                        PublicSchema.teamMembers.teamId,
                        currentPickInfo.teamId,
                      ),
                      eq(PublicSchema.teamMembers.leagueId, draftLeagueId),
                    ),
                  );

                if (
                  rosterCount &&
                  Number(rosterCount.count) >= league.maxRosterSize
                ) {
                  throw new Error(
                    `Team ${currentPickInfo.teamId} roster is full in draft ${draftId}`,
                  );
                }

                const pickNow = new Date();

                // Create the auto pick
                const [draftPick] = await tx
                  .insert(PublicSchema.draftPicks)
                  .values({
                    draftId,
                    teamId: currentPickInfo.teamId,
                    playerId: autoPlayerId,
                    round: currentPickInfo.round,
                    pickNumber: currentPickInfo.pickNumber,
                    overallPick: currentPickInfo.overallPick,
                    pickedAt: pickNow,
                  })
                  .returning();

                // Calculate if draft is complete
                const numTeams = (
                  await tx
                    .select()
                    .from(PublicSchema.draftTeams)
                    .where(eq(PublicSchema.draftTeams.draftId, draftId))
                ).length;
                const totalPicks = numTeams * league.maxRosterSize;
                const isDraftComplete =
                  currentPickInfo.overallPick >= totalPicks;

                // Chain from the expired deadline (not from wall-clock now)
                // so the next team gets their full timer window.
                const nextDeadline = isDraftComplete
                  ? null
                  : new Date(
                      expiredDeadline.getTime() + pickTimeLimitSeconds * 1000,
                    );

                await tx
                  .update(PublicSchema.drafts)
                  .set({
                    currentPick: currentPickInfo.overallPick,
                    currentPickDeadline: nextDeadline,
                    updatedAt: pickNow,
                    ...(isDraftComplete ? { draftCompletedAt: pickNow } : {}),
                  })
                  .where(eq(PublicSchema.drafts.id, draftId));

                if (isDraftComplete) {
                  await tx
                    .update(PublicSchema.leagues)
                    .set({ draftStatus: 'completed' })
                    .where(eq(PublicSchema.leagues.id, draftLeagueId));
                }

                // Add player to team roster
                await tx.insert(PublicSchema.teamMembers).values({
                  teamId: currentPickInfo.teamId,
                  leagueId: draftLeagueId,
                  playerId: autoPlayerId,
                  draftRound: currentPickInfo.round,
                  draftPick: currentPickInfo.pickNumber,
                  acquisitionType: 'draft',
                });

                // Mark this team as auto-pick going forward since they missed a
                // pick — subsequent picks will be made instantly on their behalf
                // without waiting for the deadline to expire (LS-427).
                await tx
                  .update(PublicSchema.draftTeams)
                  .set({ autoPick: true })
                  .where(
                    and(
                      eq(PublicSchema.draftTeams.draftId, draftId),
                      eq(
                        PublicSchema.draftTeams.teamId,
                        currentPickInfo.teamId,
                      ),
                    ),
                  );

                // Calculate next pick info for notification
                let nextPickInfo: Awaited<
                  ReturnType<typeof getCurrentDraftPickInfo>
                > = null;
                if (!isDraftComplete) {
                  nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
                }

                // If the next team has auto-pick enabled, immediately expire their
                // deadline so the inner loop chains to them right away (LS-427).
                let effectiveNextDeadline = nextDeadline;
                if (nextPickInfo && !isDraftComplete) {
                  const [nextTeamEntry] = await tx
                    .select({ autoPick: PublicSchema.draftTeams.autoPick })
                    .from(PublicSchema.draftTeams)
                    .where(
                      and(
                        eq(PublicSchema.draftTeams.draftId, draftId),
                        eq(PublicSchema.draftTeams.teamId, nextPickInfo.teamId),
                      ),
                    )
                    .limit(1);
                  if (nextTeamEntry?.autoPick) {
                    effectiveNextDeadline = new Date(pickNow.getTime() - 1);
                    await tx
                      .update(PublicSchema.drafts)
                      .set({ currentPickDeadline: effectiveNextDeadline })
                      .where(eq(PublicSchema.drafts.id, draftId));
                    LOGGER.info(
                      '[autoProcessDraftPicks] Next team has auto-pick — expiring deadline immediately',
                      { draftId, nextTeamId: nextPickInfo.teamId },
                    );
                  }
                }

                return {
                  draftPick,
                  autoPlayerId,
                  autoPickReason,
                  isDraftComplete,
                  currentPickInfo,
                  nextPickInfo,
                  nextDeadline: effectiveNextDeadline,
                };
              });

              if (!pickResult) {
                break; // Deadline not expired or cleared — exit inner loop
              }

              result.picksAutoMade++;
              picksThisDraft++;

              // Record auto-pick in the activity log (fire-and-forget, non-fatal)
              void insertActivityLog(context, {
                leagueId: draftLeagueId,
                teamId: pickResult.currentPickInfo.teamId ?? null,
                actorUserId: null,
                eventType: 'draft_pick_made',
                payload: {
                  playerId: pickResult.autoPlayerId,
                  round: pickResult.currentPickInfo.round,
                  pickNumber: pickResult.currentPickInfo.pickNumber,
                  overallPick: pickResult.currentPickInfo.overallPick,
                  wasAutoPick: true,
                },
              });

              LOGGER.info('[autoProcessDraftPicks] Auto-pick made', {
                draftId,
                leagueId: draftLeagueId,
                playerId: pickResult.autoPlayerId,
                teamId: pickResult.currentPickInfo.teamId,
                overallPick: pickResult.currentPickInfo.overallPick,
                isDraftComplete: pickResult.isDraftComplete,
              });

              // Send WebSocket notifications (outside transaction)
              if (notificationService) {
                await notificationService.notifyDraftPickMade(
                  draftLeagueId,
                  draftId,
                  pickResult.draftPick.id,
                  pickResult.currentPickInfo.teamId,
                  pickResult.autoPlayerId,
                  pickResult.currentPickInfo.round,
                  pickResult.currentPickInfo.pickNumber,
                  pickResult.currentPickInfo.overallPick,
                  pickResult.nextPickInfo
                    ? {
                        teamId: pickResult.nextPickInfo.teamId,
                        round: pickResult.nextPickInfo.round,
                        pickNumber: pickResult.nextPickInfo.pickNumber,
                        overallPick: pickResult.nextPickInfo.overallPick,
                      }
                    : undefined,
                  {
                    wasAutoPick: true,
                    autoPickReason: pickResult.autoPickReason,
                    currentPickDeadline:
                      pickResult.nextDeadline?.toISOString() ?? null,
                  },
                );

                if (pickResult.isDraftComplete) {
                  result.draftsCompleted++;
                  await notificationService.notifyDraftCompleted(
                    draftLeagueId,
                    (row.selection_method as string) ?? 'standard',
                  );
                }
              }

              // Auto-create matchups when draft completes
              if (pickResult.isDraftComplete) {
                try {
                  const matchupResult = await createAllMatchupsForLeague(
                    context.db,
                    draftLeagueId,
                  );
                  LOGGER.info(
                    '[autoProcessDraftPicks] Auto-created matchups after draft completion',
                    {
                      leagueId: draftLeagueId,
                      matchupCount: matchupResult.matchupCount,
                    },
                  );
                } catch (matchupError) {
                  LOGGER.error(
                    '[autoProcessDraftPicks] Failed to auto-create matchups',
                    {
                      leagueId: draftLeagueId,
                      error:
                        matchupError instanceof Error
                          ? matchupError.message
                          : String(matchupError),
                    },
                  );
                }
              }

              // ── Inner-loop control ──────────────────────────────────
              if (pickResult.isDraftComplete) {
                break; // Draft finished
              }

              // If the chained deadline is already expired, pick again now
              // instead of waiting for the next EventBridge invocation.
              if (
                pickResult.nextDeadline &&
                pickResult.nextDeadline <= new Date()
              ) {
                LOGGER.info(
                  '[autoProcessDraftPicks] Chained deadline already expired, continuing',
                  {
                    draftId,
                    nextDeadline: pickResult.nextDeadline.toISOString(),
                    picksThisDraft,
                  },
                );
                continue;
              }

              break; // Next deadline is in the future
            } // end while (auto-pick chaining)
          } catch (draftError) {
            const errMsg =
              draftError instanceof Error
                ? draftError.message
                : String(draftError);
            LOGGER.error(
              `[autoProcessDraftPicks] Error processing draft ${draftId}`,
              { draftId, leagueId: draftLeagueId, error: errMsg },
            );
            result.errors.push(`Draft ${draftId}: ${errMsg}`);
          }
        }

        LOGGER.info('[autoProcessDraftPicks] Completed', {
          draftsProcessed: result.draftsProcessed,
          picksAutoMade: result.picksAutoMade,
          draftsCompleted: result.draftsCompleted,
          errorCount: result.errors.length,
        });

        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        LOGGER.error('[autoProcessDraftPicks] Fatal error', {
          error: errMsg,
        });
        result.errors.push(errMsg);
        return result;
      }
    },
  }),
);

// ── Mutation: autoStartScheduledDrafts ───────────────────────────────────────
// Triggered every minute by EventBridge. Finds all live drafts with
// `scheduled_at <= now` and `draft_status = 'not-started'`, then initializes
// them exactly as `initializeDraft` would for live mode:
//  1. Shuffle & insert draft_teams rows
//  2. Set draftStartedAt, initial pick deadline
//  3. Update league draft_status → 'in-progress'
//  4. Send DRAFT_STARTED WebSocket notification
//
// Authorization: system-only (EventBridge API key required).

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

/**
 * Mutation: autoStartScheduledDrafts
 *
 * Finds all drafts whose `scheduled_at` is at or before the current time and
 * whose associated league has `draft_status = 'not-started'`, then starts each
 * one as a live draft.
 *
 * Called by EventBridge every minute alongside `autoProcessDraftPicks`.
 */
builder.mutationField('autoStartScheduledDrafts', (t) =>
  t.field({
    type: AutoStartScheduledDraftsResult,
    args: {},
    description:
      'System-only: start all live drafts whose scheduled_at has arrived. Triggered by EventBridge every minute.',
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
            leagueId: PublicSchema.drafts.leagueId,
            draftMode: PublicSchema.drafts.draftMode,
            selectionMethod: PublicSchema.drafts.selectionMethod,
            draftOrder: PublicSchema.drafts.draftOrder,
            pickTimeLimitSeconds: PublicSchema.drafts.pickTimeLimitSeconds,
            scheduledAt: PublicSchema.drafts.scheduledAt,
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

        LOGGER.info(
          `[autoStartScheduledDrafts] Found ${scheduledDrafts.length} draft(s) to start`,
        );

        const notificationService = createNotificationService();

        for (const draft of scheduledDrafts) {
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

            // Fisher-Yates shuffle
            const shuffled = [...teams];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Clear any stale draft_teams and draft_picks from previous runs
            await context.db
              .delete(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, draftId));
            await context.db
              .delete(PublicSchema.draftPicks)
              .where(eq(PublicSchema.draftPicks.draftId, draftId));

            // Insert draft teams in randomized order
            await context.db.insert(PublicSchema.draftTeams).values(
              shuffled.map((team, index) => ({
                draftId,
                teamId: team.id,
                leagueId,
                draftOrder: index + 1,
              })),
            );

            const startedAt = new Date();
            const pickTimeLimit = Number(draft.pickTimeLimitSeconds) || 120;
            const initialDeadline = new Date(
              startedAt.getTime() + pickTimeLimit * 1000,
            );

            // Update the draft record with started timestamps + first pick deadline
            await context.db
              .update(PublicSchema.drafts)
              .set({
                draftStartedAt: startedAt,
                currentPick: 0,
                currentPickDeadline: initialDeadline,
                updatedAt: startedAt,
              })
              .where(eq(PublicSchema.drafts.id, draftId));

            // Update league status
            await context.db
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'in-progress' })
              .where(eq(PublicSchema.leagues.id, leagueId));

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
              { draftId, leagueId, error: errMsg },
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
        LOGGER.error('[autoStartScheduledDrafts] Fatal error', {
          error: errMsg,
        });
        result.errors.push(errMsg);
        return result;
      }
    },
  }),
);
