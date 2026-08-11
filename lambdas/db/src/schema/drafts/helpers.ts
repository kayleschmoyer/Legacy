/**
 * Draft domain â€” helper functions
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { ALLOWED_POSITIONS, shuffleArray } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, count, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { ForbiddenError } from '../graphql-errors';
import { addPlayerToRoster } from '../../services/roster-service';

// ── Mock draft weekly-limit gating (LS-470 / LS-5178) ────────────────────────

/**
 * Free-tier users may start at most this many mock drafts per rolling 7-day
 * window. Users with the `unlimited_mock_drafts` entitlement are exempt.
 *
 * Single source of truth shared by the `initializeMockDraft` mutation (which
 * enforces the cap) and the `getMyMockDraftUsage` query (which surfaces the
 * usage to the web UI so the limit is reflected *before* submit — LS-5178).
 */
export const MOCK_DRAFT_FREE_WEEKLY_LIMIT = 2;

/** Rolling window (ms) over which mock drafts count toward the free-tier cap. */
export const MOCK_DRAFT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Count how many mock-draft leagues the given user has created within the
 * trailing {@link MOCK_DRAFT_WINDOW_MS}. Used both to enforce the free-tier
 * weekly mock-draft cap and to surface remaining usage in the UI.
 */
export async function countRecentMockDrafts(
  db: PublicDb,
  userId: number,
): Promise<number> {
  const windowStart = new Date(Date.now() - MOCK_DRAFT_WINDOW_MS);
  const [{ mockDraftCount }] = await db
    .select({ mockDraftCount: count() })
    .from(PublicSchema.leagues)
    .where(
      and(
        eq(PublicSchema.leagues.owner, userId),
        eq(PublicSchema.leagues.isMockDraft, true),
        gte(PublicSchema.leagues.createdAt, windowStart),
      ),
    );
  // Drizzle's count() can surface as a string/bigint depending on the driver;
  // this value flows through a GraphQL Int (getMyMockDraftUsage) and into
  // arithmetic, so coerce to a number to avoid serialization/compare surprises.
  return Number(mockDraftCount);
}

// â”€â”€ commitDraftPick types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CommitDraftPickParams {
  /** Drizzle transaction (or plain db) to run writes inside. */
  tx: PublicDb;
  draftId: number;
  leagueId: number;
  /** Current pick slot being filled, as returned by getCurrentDraftPickInfo. */
  pickInfo: {
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
  };
  playerId: number;
  maxRosterSize: number;
  pickTimeLimitSeconds: number;
  /**
   * Base time for computing the next pick deadline.
   * Defaults to the wall-clock `now` captured inside this function.
   * Scheduled auto-picks pass the *expired* deadline so the next team gets
   * a full timer window regardless of when EventBridge fired.
   */
  deadlineBaseTime?: Date;
  /**
   * When true, sets `draftStartedAt` on the drafts row.
   * Only the very first manual pick (overallPick === 1, current_pick === 0)
   * should pass this as true.
   */
  setStartedAt?: boolean;
  /**
   * When true, skips the addPlayerToRoster call so no teamMembers row is
   * persisted. Mock drafts record picks in draft_picks but never persist rosters.
   */
  isMockDraft?: boolean;
}

export interface CommitDraftPickResult {
  draftPick: typeof PublicSchema.draftPicks.$inferSelect;
  isDraftComplete: boolean;
  nextDeadline: Date | null;
  nextPickInfo: Awaited<ReturnType<typeof getCurrentDraftPickInfo>>;
  /** Wall-clock timestamp captured at the start of the commit. */
  now: Date;
}

// â”€â”€ Position eligibility for auto-pick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single source of truth: ALLOWED_POSITIONS from @legacy-sports/utils.
// Exported as ALLOWED_POSITIONS_FOR_AUTO_PICK for backward compatibility
// with scheduled-mutations.ts and make-draft-pick.ts.
// SP/RP include generic 'P' so players whose stat position is the generic
// pitcher key are correctly identified as eligible.
export const ALLOWED_POSITIONS_FOR_AUTO_PICK = ALLOWED_POSITIONS;

/**
 * Determine which league-defined position slot types still need a player
 * on the given team for this draft. Works inside any transaction (tx: PublicDb).
 *
 * Shared by autoProcessDraftPicks (scheduled-mutations.ts) and the
 * makeDraftPick auto-pick chain (mutations.ts).
 */
export async function getUnfilledPositionTypes(
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
    // No picks yet â€” all position types are still needed
    return [...new Set(leaguePositions.map((lp) => lp.positionType))];
  }

  // 3. Position eligibility for already-drafted players from the mat view
  const eligiblePositionRows = await tx
    .select({
      playerId: PublicSchema.playerEligiblePositions.playerId,
      position: PublicSchema.playerEligiblePositions.position,
    })
    .from(PublicSchema.playerEligiblePositions)
    .where(
      inArray(PublicSchema.playerEligiblePositions.playerId, teamPlayerIds),
    );

  // Build map: playerId → set of slot types the player can fill
  const playerSlotMap = new Map<number, Set<string>>();
  for (const row of eligiblePositionRows) {
    const existing = playerSlotMap.get(row.playerId) ?? new Set<string>();
    for (const [slotType, allowedStatPositions] of Object.entries(
      ALLOWED_POSITIONS,
    )) {
      if (allowedStatPositions.includes(row.position)) {
        existing.add(slotType);
      }
    }
    playerSlotMap.set(row.playerId, existing);
  }

  // 4-5. Maximum bipartite matching between drafted players and slot
  // instances determines which slot types remain genuinely unfilled.
  return computeUnfilledSlotTypes(slotsNeeded, playerSlotMap, teamPlayerIds);
}

/**
 * Given per-type slot requirements and which slot types each drafted player
 * can fill, return the slot types that cannot be covered by any valid
 * assignment of players to slots (LS-9123).
 *
 * A one-pass greedy assignment — each player claims the first open slot type
 * it's eligible for, in draft order — is NOT guaranteed to find a valid full
 * assignment even when one exists: a dual-eligible player (e.g. 3B/SS)
 * processed before a single-eligible player (3B only) can claim the shared
 * slot first, permanently starving the single-eligible player and leaving a
 * slot reported "unfilled" that a different, still-valid assignment would
 * have covered — e.g. an auto-drafted team ending up with no player at 3B
 * because auto-pick, driven by this function, never treated 3B as needed.
 * Kuhn's augmenting-path algorithm finds the true maximum matching, so a slot
 * type is only reported unfilled when no valid assignment can cover it.
 */
export function computeUnfilledSlotTypes(
  slotsNeeded: Map<string, number>,
  playerSlotMap: Map<number, Set<string>>,
  teamPlayerIds: number[],
): string[] {
  const orderedSlotTypes = [...slotsNeeded.keys()].sort(
    (a, b) =>
      (ALLOWED_POSITIONS[a]?.length ?? 1) - (ALLOWED_POSITIONS[b]?.length ?? 1),
  );

  const slotInstanceTypes: string[] = [];
  for (const [slotType, needed] of slotsNeeded) {
    for (let i = 0; i < needed; i++) slotInstanceTypes.push(slotType);
  }
  const slotInstancesByType = new Map<string, number[]>();
  slotInstanceTypes.forEach((slotType, idx) => {
    const list = slotInstancesByType.get(slotType) ?? [];
    list.push(idx);
    slotInstancesByType.set(slotType, list);
  });

  // slotInstance index -> playerId currently matched to it (or null)
  const matchedPlayerForSlot = new Array<number | null>(
    slotInstanceTypes.length,
  ).fill(null);

  function tryMatch(playerId: number, visited: Set<number>): boolean {
    const coverableSlots = playerSlotMap.get(playerId);
    if (!coverableSlots) return false;

    for (const slotType of coverableSlots) {
      for (const slotIdx of slotInstancesByType.get(slotType) ?? []) {
        if (visited.has(slotIdx)) continue;
        visited.add(slotIdx);

        const incumbent = matchedPlayerForSlot[slotIdx];
        if (incumbent === null || tryMatch(incumbent, visited)) {
          matchedPlayerForSlot[slotIdx] = playerId;
          return true;
        }
      }
    }
    return false;
  }

  for (const playerId of teamPlayerIds) {
    tryMatch(playerId, new Set());
  }

  const slotsCovered = new Map<string, number>();
  slotInstanceTypes.forEach((slotType, idx) => {
    if (matchedPlayerForSlot[idx] !== null) {
      slotsCovered.set(slotType, (slotsCovered.get(slotType) ?? 0) + 1);
    }
  });

  return orderedSlotTypes.filter(
    (slotType) =>
      (slotsCovered.get(slotType) ?? 0) < (slotsNeeded.get(slotType) ?? 0),
  );
}

/**
 * Map a set of still-unfilled league position slot types to the set of player
 * stat positions that could fill at least one of them (LS-8065).
 *
 * Uses the same {@link ALLOWED_POSITIONS} table that {@link getUnfilledPositionTypes}
 * uses to decide which slots a player covers, so the two stay consistent: a
 * player whose `player_eligible_positions` intersect this set is exactly a
 * player that meets a still-open roster requirement for the team.
 *
 * Unknown slot types contribute no positions (mirrors the auto-pick helper,
 * which can never fill a slot type absent from the mapping). Returns a
 * de-duplicated list; an empty `unfilledPositionTypes` yields an empty list.
 */
export function eligibleStatPositionsForUnfilledSlots(
  unfilledPositionTypes: string[],
): string[] {
  return [
    ...new Set(
      unfilledPositionTypes.flatMap(
        (slotType) => ALLOWED_POSITIONS[slotType] ?? [],
      ),
    ),
  ];
}

/** Safety cap on rounds searched when resolving a pick assignment — well
 *  beyond any realistic maxRosterSize, guards against an infinite loop if
 *  every team somehow forfeited the same round. */
const MAX_ROUND_SEARCH = 500;

/**
 * Walk rounds in draft order (skipping any team's forfeited round — LS-8674
 * keeper round-penalty) until `overallPick` falls within a round's active
 * teams. With an empty `forfeited` set this is arithmetically identical to
 * the plain snake/linear computation it replaces (round = ceil(pick/teams),
 * teamIndex mirrored on even rounds for snake) — keeper leagues with no
 * forfeited picks and non-keeper leagues both draft in the original order.
 */
export function resolvePickAssignment(params: {
  overallPick: number;
  draftTeams: { teamId: number }[];
  isSnake: boolean;
  forfeited: Set<string>;
}): { teamId: number; round: number; pickNumber: number } | null {
  const { overallPick, draftTeams, isSnake, forfeited } = params;
  let cumulative = 0;

  for (let round = 1; round <= MAX_ROUND_SEARCH; round++) {
    const isReverseRound = isSnake && round % 2 === 0;
    const ordered = isReverseRound ? [...draftTeams].reverse() : draftTeams;
    const active =
      forfeited.size === 0
        ? ordered
        : ordered.filter((t) => !forfeited.has(`${t.teamId}:${round}`));

    if (overallPick <= cumulative + active.length) {
      const idxInRound = overallPick - cumulative - 1;
      const team = active[idxInRound];
      if (!team) return null;
      return { teamId: team.teamId, round, pickNumber: idxInRound + 1 };
    }
    cumulative += active.length;
  }

  return null;
}

/**
 * Total draftable picks across the whole draft, accounting for forfeited
 * rounds (LS-8674 keeper round-penalty) — one fewer pick per forfeiture.
 */
export async function getTotalDraftPicks(
  db: PublicDb,
  draftId: number,
  numTeams: number,
  maxRosterSize: number,
): Promise<number> {
  const [{ forfeitedCount }] = await db
    .select({ forfeitedCount: count() })
    .from(PublicSchema.draftForfeitedPicks)
    .where(eq(PublicSchema.draftForfeitedPicks.draftId, draftId));
  return numTeams * maxRosterSize - Number(forfeitedCount);
}

/**
 * Calculate current pick information based on draft settings
 */
export async function getCurrentDraftPickInfo(
  db: PublicDb,
  draftId: number,
): Promise<{
  draftId: number;
  teamId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
} | null> {
  // Get draft and draft teams
  const [draft] = await db
    .select()
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  if (!draft) {
    return null;
  }

  const draftTeams = await db
    .select()
    .from(PublicSchema.draftTeams)
    .where(eq(PublicSchema.draftTeams.draftId, draftId))
    .orderBy(asc(PublicSchema.draftTeams.draftOrder));

  if (draftTeams.length === 0) {
    throw new Error('No teams configured for this draft');
  }

  const currentOverallPick = draft.currentPick + 1;
  const isSnake = draft.draftOrder === 'snake';

  const forfeitedRows = await db
    .select({
      teamId: PublicSchema.draftForfeitedPicks.teamId,
      round: PublicSchema.draftForfeitedPicks.round,
    })
    .from(PublicSchema.draftForfeitedPicks)
    .where(eq(PublicSchema.draftForfeitedPicks.draftId, draftId));
  const forfeited = new Set(forfeitedRows.map((r) => `${r.teamId}:${r.round}`));

  const assignment = resolvePickAssignment({
    overallPick: currentOverallPick,
    draftTeams,
    isSnake,
    forfeited,
  });

  if (!assignment) {
    throw new Error('Could not determine team for current pick');
  }

  return {
    draftId,
    teamId: assignment.teamId,
    round: assignment.round,
    pickNumber: assignment.pickNumber,
    overallPick: currentOverallPick,
    // True once the draft has been marked complete in the DB (draftCompletedAt set).
    // Previously hardcoded false, which caused the 5-second poll to never signal
    // completion and kept isMyPick=true for the team assigned the phantom "next" pick
    // (LS-4191).
    isComplete: draft.draftCompletedAt != null,
  };
}

/**
 * Verify that a user is a member of a league. Throws if not.
 */
export async function verifyLeagueMembership(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<void> {
  const [membership] = await db
    .select({ leagueId: PublicSchema.leagueMembers.leagueId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw ForbiddenError('You are not a member of this league');
  }
}

/**
 * Commit a single draft pick inside a transaction: insert the draftPicks row,
 * advance the draft state (currentPick, deadline, completion timestamps),
 * update league status when the draft completes, and add the player to the
 * team roster. Returns the inserted pick, completion flag, next deadline, and
 * the next pick info.
 *
 * This is the single source of truth for draft-pick DB writes, shared by:
 *   - makeDraftPick (manual pick + chained auto-picks)
 *   - commissionerPick
 *   - autoProcessDraftPicks (scheduled/EventBridge auto-picks)
 */
export async function commitDraftPick(
  params: CommitDraftPickParams,
): Promise<CommitDraftPickResult> {
  const {
    tx,
    draftId,
    leagueId,
    pickInfo,
    playerId,
    maxRosterSize,
    pickTimeLimitSeconds,
    deadlineBaseTime,
    setStartedAt = false,
    isMockDraft = false,
  } = params;

  const now = new Date();

  // Insert the draft pick record
  const [draftPick] = await tx
    .insert(PublicSchema.draftPicks)
    .values({
      draftId,
      teamId: pickInfo.teamId,
      playerId,
      round: pickInfo.round,
      pickNumber: pickInfo.pickNumber,
      overallPick: pickInfo.overallPick,
      pickedAt: now,
    })
    .returning();

  // Determine whether the draft is now complete
  const draftTeamRows = await tx
    .select()
    .from(PublicSchema.draftTeams)
    .where(eq(PublicSchema.draftTeams.draftId, draftId));
  const numTeams = draftTeamRows.length;
  // Forfeited rounds (LS-8674 keeper round-penalty) mean fewer total picks
  // than a plain numTeams * maxRosterSize — the forfeiting team's slot was
  // already filled by the keeper at draft init, not by a pick.
  const totalPicks = await getTotalDraftPicks(
    tx,
    draftId,
    numTeams,
    maxRosterSize,
  );
  const isDraftComplete = pickInfo.overallPick >= totalPicks;

  // Compute the next pick deadline.
  // Callers that need to preserve intended cadence (scheduled auto-picks)
  // pass deadlineBaseTime = the expired deadline rather than wall-clock now.
  const baseTime = deadlineBaseTime ?? now;
  const nextDeadline = isDraftComplete
    ? null
    : new Date(baseTime.getTime() + pickTimeLimitSeconds * 1000);

  // Advance the draft row
  await tx
    .update(PublicSchema.drafts)
    .set({
      currentPick: pickInfo.overallPick,
      currentPickDeadline: nextDeadline,
      updatedAt: now,
      ...(setStartedAt ? { draftStartedAt: now } : {}),
      ...(isDraftComplete ? { draftCompletedAt: now } : {}),
    })
    .where(eq(PublicSchema.drafts.id, draftId));

  // Mark the league draft as completed when the last pick is made
  if (isDraftComplete) {
    await tx
      .update(PublicSchema.leagues)
      .set({ draftStatus: 'completed', leaguePhase: 'active' })
      .where(eq(PublicSchema.leagues.id, leagueId));
  }

  // Add the drafted player to the team's roster.
  // Skipped for mock drafts — picks are recorded in draft_picks but rosters
  // are never persisted (isMockDraft=true leagues are ephemeral).
  if (!isMockDraft) {
    await addPlayerToRoster(tx, {
      teamId: pickInfo.teamId,
      leagueId,
      playerId,
      draftRound: pickInfo.round,
      draftPick: pickInfo.pickNumber,
      acquisitionType: 'draft',
    });
  }

  // Fetch next pick info so callers can send notifications / chain auto-picks
  let nextPickInfo: Awaited<ReturnType<typeof getCurrentDraftPickInfo>> = null;
  if (!isDraftComplete) {
    nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
  }

  return { draftPick, isDraftComplete, nextDeadline, nextPickInfo, now };
}

/**
 * Return the first player from a team's draft queue that is still available
 * (not yet drafted) in the given draft.
 *
 * Returns `null` if:
 *  - the queue is empty
 *  - all queued players have already been drafted
 *
 * Used by both auto-pick paths (scheduled-mutations.ts and make-draft-pick.ts).
 */
export async function getFirstQueuedPlayerForTeam(
  db: PublicDb,
  draftId: number,
  teamId: number,
): Promise<number | null> {
  // Fetch the queue ordered by priority
  const queueRows = await db
    .select({ playerId: PublicSchema.draftQueue.playerId })
    .from(PublicSchema.draftQueue)
    .where(
      and(
        eq(PublicSchema.draftQueue.draftId, draftId),
        eq(PublicSchema.draftQueue.teamId, teamId),
      ),
    )
    .orderBy(asc(PublicSchema.draftQueue.priority));

  if (queueRows.length === 0) return null;

  // Check which queued players are still undrafted
  const queuedPlayerIds = queueRows.map((r) => r.playerId);
  const draftedRows = await db
    .select({ playerId: PublicSchema.draftPicks.playerId })
    .from(PublicSchema.draftPicks)
    .where(
      and(
        eq(PublicSchema.draftPicks.draftId, draftId),
        inArray(PublicSchema.draftPicks.playerId, queuedPlayerIds),
      ),
    );

  const draftedIds = new Set(draftedRows.map((r) => r.playerId));

  // Return the first undrafted entry
  for (const row of queueRows) {
    if (!draftedIds.has(row.playerId)) {
      return row.playerId;
    }
  }

  return null;
}

// ── enableAutoPickForUnmanagedTeams ──────────────────────────────────────────

/**
 * LS-480 / LS-545: Enable auto-pick for any draft_teams rows whose associated
 * league_member has no user (unmanaged / bot teams).
 *
 * Must be called **after** draft_teams rows have been inserted for the draft.
 *
 * Shared by `initializeDraft` (initialize-draft.ts) and
 * `autoStartScheduledDrafts` (scheduled-mutations.ts) so neither path can
 * accidentally omit the auto-pick wiring.
 *
 * @returns The list of teamIds for which auto-pick was enabled.
 */
export async function enableAutoPickForUnmanagedTeams(
  db: PublicDb,
  leagueId: number,
  draftId: number,
  teamIds: number[],
): Promise<number[]> {
  if (teamIds.length === 0) return [];

  // Find team IDs that already have a managed member (general_manager or
  // commissioner) — both roles mean a real user is actively running the team.
  // Excluding 'commissioner' was a bug: commissioner teams were incorrectly
  // marked autoPick=true and auto-processed as if unattended (LS-4277).
  const teamsWithGM = await db
    .select({ teamId: PublicSchema.leagueMembers.teamId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        inArray(PublicSchema.leagueMembers.permissionLevel, [
          'general_manager',
          'commissioner',
        ]),
        isNotNull(PublicSchema.leagueMembers.teamId),
      ),
    );

  const teamIdsWithGM = new Set(
    teamsWithGM.map((m) => m.teamId).filter((id): id is number => id !== null),
  );

  const teamIdsWithoutGM = teamIds.filter((id) => !teamIdsWithGM.has(id));

  if (teamIdsWithoutGM.length > 0) {
    await db
      .update(PublicSchema.draftTeams)
      .set({ autoPick: true })
      .where(
        and(
          eq(PublicSchema.draftTeams.draftId, draftId),
          inArray(PublicSchema.draftTeams.teamId, teamIdsWithoutGM),
        ),
      );
  }

  return teamIdsWithoutGM;
}

// ── resolveDraftTeamsOrder (LS-8742) ─────────────────────────────────────────

export interface ResolveDraftTeamsOrderResult {
  /** Team ids in final draft-pick order (1-indexed positionally by array index). */
  orderedTeamIds: number[];
  /** True when draft_teams rows must be (re)inserted for this draft — no rows
   *  existed yet, or the existing rows no longer match the league's current
   *  team set. False means the existing rows should be left untouched. */
  needsInsert: boolean;
}

/**
 * Decide the draft_teams order to use when a draft actually starts.
 *
 * `approveDraftSlotTrade` (LS-8676) lazily seeds draft_teams pre-draft and
 * atomically swaps two teams' draftOrder when a trade executes. Both
 * initializeDraft and autoStartScheduledDrafts previously deleted + reshuffled
 * draft_teams unconditionally at draft start, silently discarding any
 * commissioner-approved slot trade the instant the draft began (LS-8742).
 *
 * If rows already exist for this draft and their team set still matches the
 * league's current teams, preserve them as-is. Only randomize a fresh order
 * when no rows exist yet, or when the seeded team set has drifted from the
 * league's current teams (e.g. a team was added/removed after seeding) —
 * in that case the stale seed can no longer be trusted, so fall back to the
 * original reshuffle behavior.
 *
 * `draftId` is `null` when the drafts row itself doesn't exist yet
 * (initializeDraft's first-ever call for a league) — no draft_teams rows can
 * exist in that case either, so this always shuffles.
 */
export async function resolveDraftTeamsOrder(
  db: PublicDb,
  draftId: number | null,
  currentTeams: { id: number }[],
): Promise<ResolveDraftTeamsOrderResult> {
  const existingRows = draftId
    ? await db
        .select({
          teamId: PublicSchema.draftTeams.teamId,
        })
        .from(PublicSchema.draftTeams)
        .where(eq(PublicSchema.draftTeams.draftId, draftId))
        .orderBy(asc(PublicSchema.draftTeams.draftOrder))
    : [];

  if (existingRows.length > 0) {
    const currentTeamIds = new Set(currentTeams.map((t) => t.id));
    const existingTeamIds = new Set(existingRows.map((r) => r.teamId));
    const sameTeamSet =
      existingRows.length === currentTeamIds.size &&
      [...currentTeamIds].every((id) => existingTeamIds.has(id));

    if (sameTeamSet) {
      return {
        orderedTeamIds: existingRows.map((r) => r.teamId),
        needsInsert: false,
      };
    }

    LOGGER.warn(
      'draft_teams team set no longer matches league teams — reshuffling instead of preserving seeded order',
      { draftId },
    );
  }

  return {
    orderedTeamIds: shuffleArray(currentTeams).map((t) => t.id),
    needsInsert: true,
  };
}
