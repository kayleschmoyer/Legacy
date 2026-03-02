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

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { getCurrentDraftPickInfo } from './helpers';
import { builder, type Context } from '../builder';
import { createAllMatchupsForLeague } from '../matchups/mutations';

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
    throw new Error('Unauthorized: authentication required.');
  }

  if (!leagueId) {
    throw new Error(
      'Unauthorized: only system processes can trigger for all leagues. Provide a leagueId.',
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
    throw new Error('Unauthorized: you are not a member of this league.');
  }
}

// ── Position eligibility for auto-pick (mirrors draft-processor ALLOWED_POSITIONS) ──
// Maps each league roster slot type to the player stat position keys that qualify for it.
// Source of truth: lib/shared-components/src/utils/PositionModels.ts
const ALLOWED_POSITIONS_FOR_AUTO_PICK: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  '1B': ['1B'],
  '2B': ['2B'],
  '3B': ['3B'],
  C: ['C'],
  CF: ['CF'],
  DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
  IF: ['1B', '2B', '3B', 'SS'],
  LF: ['LF'],
  OF: ['LF', 'RF', 'CF'],
  RF: ['RF'],
  RP: ['RP', 'P'],
  SP: ['SP', 'P'],
  SS: ['SS'],
  XDH: ['DH'],
});

/**
 * Determine which league-defined position slot types still need a player on the
 * given team for this draft. Uses career_fielding.positions_played JSONB data
 * (same source as the draft-processor and GraphQL API) to map already-drafted
 * players to slot types, then returns the slot types that still have open slots.
 *
 * The greedy assignment orders slots by specificity (fewest allowed player
 * positions first) so that a multi-position player is not "wasted" on a
 * specialist slot that another player could fill instead.
 */
async function getUnfilledPositionTypes(
  tx: PublicDb,
  draftId: number,
  teamId: number,
  leagueId: number,
): Promise<string[]> {
  // 1. League position requirements
  const leaguePositions = await tx
    .select({ positionType: PublicSchema.leaguePosition.positionType })
    .from(PublicSchema.leaguePosition)
    .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));

  if (leaguePositions.length === 0) return [];

  // Count slots needed per position type
  const slotsNeeded = new Map<string, number>();
  for (const lp of leaguePositions) {
    slotsNeeded.set(
      lp.positionType,
      (slotsNeeded.get(lp.positionType) ?? 0) + 1,
    );
  }

  // 2. Team's already-drafted player IDs in this draft
  const teamPicksResult = await tx.execute(
    sql`SELECT player_id FROM draft_picks WHERE draft_id = ${draftId} AND team_id = ${teamId}`,
  );
  const teamPlayerIds = teamPicksResult.rows.map((r) => r.player_id as number);

  if (teamPlayerIds.length === 0) {
    // No picks yet — all position types are still needed
    return [...new Set(leaguePositions.map((lp) => lp.positionType))];
  }

  // 3. Career fielding data for already-drafted players
  const fieldingRows = await tx
    .select({
      playerId: PublicSchema.careerFielding.playerId,
      positionsPlayed: PublicSchema.careerFielding.positionsPlayed,
    })
    .from(PublicSchema.careerFielding)
    .where(inArray(PublicSchema.careerFielding.playerId, teamPlayerIds));

  // Build map: playerId → set of slot types the player can fill
  const playerSlotMap = new Map<number, Set<string>>();
  for (const row of fieldingRows) {
    if (!row.playerId) continue;
    const positionsPlayed = row.positionsPlayed as Record<
      string,
      unknown
    > | null;
    const playerStatPositions = positionsPlayed
      ? Object.keys(positionsPlayed)
      : [];

    const coverableSlots = new Set<string>();
    for (const [slotType, allowedStatPositions] of Object.entries(
      ALLOWED_POSITIONS_FOR_AUTO_PICK,
    )) {
      if (allowedStatPositions.some((sp) => playerStatPositions.includes(sp))) {
        coverableSlots.add(slotType);
      }
    }
    playerSlotMap.set(row.playerId, coverableSlots);
  }

  // 4. Greedily assign players to slots (most-specific slots first)
  const slotsCovered = new Map<string, number>();
  const orderedSlotTypes = [...slotsNeeded.keys()].sort(
    (a, b) =>
      (ALLOWED_POSITIONS_FOR_AUTO_PICK[a]?.length ?? 1) -
      (ALLOWED_POSITIONS_FOR_AUTO_PICK[b]?.length ?? 1),
  );

  for (const playerId of teamPlayerIds) {
    const coverableSlots = playerSlotMap.get(playerId);
    if (!coverableSlots) continue;

    for (const slotType of orderedSlotTypes) {
      const needed = slotsNeeded.get(slotType) ?? 0;
      const covered = slotsCovered.get(slotType) ?? 0;
      if (covered < needed && coverableSlots.has(slotType)) {
        slotsCovered.set(slotType, covered + 1);
        break; // Each player fills exactly one slot
      }
    }
  }

  // 5. Return slot types that still have open slots
  return orderedSlotTypes.filter(
    (slotType) =>
      (slotsCovered.get(slotType) ?? 0) < (slotsNeeded.get(slotType) ?? 0),
  );
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
            const MAX_AUTO_PICKS_PER_DRAFT = 100;
            let picksThisDraft = 0;

            while (picksThisDraft < MAX_AUTO_PICKS_PER_DRAFT) {
              // Process the expired pick inside a transaction
              const pickResult = await context.db.transaction(async (tx) => {
                // Lock the draft row
                const draftRows = await tx.execute(
                  sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
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

                // Verify league still in-progress
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

                // Get current pick info
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

                // Find the best available player (not yet drafted).
                // Prefer players that can fill a still-open league roster position
                // slot (minimum requirements), falling back to any available player.

                // ── Eligibility predicates (same logic as DraftUtils.filterPlayerIdsByLeagueEligibility) ──
                const playerPoolCondition =
                  league.playerPool !== 'all'
                    ? sql`AND p.id IN (
                      SELECT sb.player_id FROM season_batting sb
                      WHERE sb.lg_id = ${league.playerPool.toUpperCase()}
                    )`
                    : sql``;

                const minCareerGamesCondition =
                  (league.minCareerGames ?? 0) > 0
                    ? sql`AND (
                      COALESCE((SELECT g FROM career_batting  cb WHERE cb.player_id = p.id LIMIT 1), 0) +
                      COALESCE((SELECT g FROM career_pitching cp WHERE cp.player_id = p.id LIMIT 1), 0)
                    ) >= ${league.minCareerGames}`
                    : sql``;

                const minCareerSeasonsCondition =
                  (league.minCareerSeasons ?? 0) > 0
                    ? sql`AND (
                      SELECT COUNT(DISTINCT season)
                      FROM (
                        SELECT season FROM season_batting  WHERE player_id = p.id
                        UNION
                        SELECT season FROM season_pitching WHERE player_id = p.id
                      ) s
                    ) >= ${league.minCareerSeasons}`
                    : sql``;

                // Determine which position slot types the team still needs to fill
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
                    eligibilityFilters: {
                      playerPool: league.playerPool,
                      minCareerGames: league.minCareerGames,
                      minCareerSeasons: league.minCareerSeasons,
                    },
                  },
                );

                let autoPlayerId: number | undefined;

                // Try to find a player eligible for one of the unfilled positions
                if (unfilledPositionTypes.length > 0) {
                  // Expand each unfilled slot type to its allowed stat-position keys,
                  // then check whether the player has any of those keys in
                  // career_fielding.positions_played (JSONB ? operator).
                  const allowedStatPositions = [
                    ...new Set(
                      unfilledPositionTypes.flatMap(
                        (pt) => ALLOWED_POSITIONS_FOR_AUTO_PICK[pt] ?? [pt],
                      ),
                    ),
                  ];

                  // Build a chain of JSONB key-exists conditions (OR)
                  const jsonConditions = allowedStatPositions
                    .map((pos) => sql`cf.positions_played ? ${pos}`)
                    .reduce((acc, cond) => sql`${acc} OR ${cond}`);

                  const positionAwarePlayers = await tx.execute(sql`
                  SELECT p.id
                  FROM players p
                  JOIN career_fielding cf ON cf.player_id = p.id
                  WHERE p.id NOT IN (
                    SELECT dp.player_id FROM draft_picks dp WHERE dp.draft_id = ${draftId}
                  )
                  ${playerPoolCondition}
                  ${minCareerGamesCondition}
                  ${minCareerSeasonsCondition}
                  AND cf.positions_played IS NOT NULL
                  AND (${jsonConditions})
                  ORDER BY p.id ASC
                  LIMIT 1
                `);

                  if (positionAwarePlayers.rows.length > 0) {
                    autoPlayerId = positionAwarePlayers.rows[0].id as number;
                    LOGGER.info(
                      '[autoProcessDraftPicks] Selected position-aware auto-pick',
                      {
                        draftId,
                        playerId: autoPlayerId,
                        unfilledPositionTypes,
                      },
                    );
                  }
                }

                // Fallback: pick any available player by ID (deterministic)
                if (autoPlayerId === undefined) {
                  const fallbackPlayers = await tx.execute(sql`
                  SELECT p.id
                  FROM players p
                  WHERE p.id NOT IN (
                    SELECT dp.player_id FROM draft_picks dp WHERE dp.draft_id = ${draftId}
                  )
                  ${playerPoolCondition}
                  ${minCareerGamesCondition}
                  ${minCareerSeasonsCondition}
                  ORDER BY p.id ASC
                  LIMIT 1
                `);

                  if (fallbackPlayers.rows.length === 0) {
                    throw new Error(
                      `No available players for draft ${draftId}`,
                    );
                  }

                  autoPlayerId = fallbackPlayers.rows[0].id as number;
                  LOGGER.info(
                    '[autoProcessDraftPicks] Using fallback auto-pick (no position match)',
                    {
                      draftId,
                      playerId: autoPlayerId,
                    },
                  );
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

                // Calculate next pick info for notification
                let nextPickInfo: Awaited<
                  ReturnType<typeof getCurrentDraftPickInfo>
                > = null;
                if (!isDraftComplete) {
                  nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
                }

                return {
                  draftPick,
                  autoPlayerId,
                  isDraftComplete,
                  currentPickInfo,
                  nextPickInfo,
                  nextDeadline,
                };
              });

              if (!pickResult) {
                break; // Deadline not expired or cleared — exit inner loop
              }

              result.picksAutoMade++;
              picksThisDraft++;

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
