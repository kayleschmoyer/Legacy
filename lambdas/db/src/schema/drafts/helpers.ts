/**
 * Draft domain â€” helper functions
 */

import {
  calculateStandings,
  PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import {
  ALLOWED_POSITIONS,
  ALLOWED_POSITIONS_BY_SPORT,
  shuffleArray,
} from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, count, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { SportKind } from './strategies';
import type { DraftRules } from './draft-rules';
import { setDraftStatus } from './draft-status';
import { getDraftSeats, setSeatAutoPick } from './participants';
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
 * Count how many mock drafts the given user has created within the trailing
 * {@link MOCK_DRAFT_WINDOW_MS}. Used both to enforce the free-tier weekly
 * mock-draft cap and to surface remaining usage in the UI.
 *
 * Counts `drafts WHERE kind = 'mock' AND created_by = user` (LS-10076) —
 * joining someone else's lobby is free, and an expired lobby still counts (the
 * lobby-expiry job keeps its row until it has aged out of this window). The
 * legacy league-backed mock
 * drafts are gone (deleted by the LS-10076 migration), so there is no second
 * leg to count.
 */
export async function countRecentMockDrafts(
  db: PublicDb,
  userId: number,
): Promise<number> {
  const windowStart = new Date(Date.now() - MOCK_DRAFT_WINDOW_MS);
  const [{ mockDraftCount }] = await db
    .select({ mockDraftCount: count() })
    .from(PublicSchema.drafts)
    .where(
      and(
        eq(PublicSchema.drafts.kind, 'mock'),
        eq(PublicSchema.drafts.createdBy, userId),
        gte(PublicSchema.drafts.createdAt, windowStart),
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
  /**
   * The owning league, or `null` for a draft-first mock draft (LS-10076). A
   * league-less draft writes no roster rows and no league status/phase — its
   * picks live only in `draft_picks`.
   */
  leagueId: number | null;
  /** Current pick slot being filled, as returned by getCurrentDraftPickInfo. */
  pickInfo: {
    /** The seat's league team, or `null` for a mock-draft seat. */
    teamId: number | null;
    /** Seat filling this pick (`draft_participants.id`) — LS-10074. */
    participantId: number;
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
 * The slice of {@link DraftRules} this helper needs: the roster it is filling
 * and the sport whose eligibility relation to read.
 *
 * Taking rules rather than a `leagueId` is what lets a draft-first mock draft
 * (LS-10076) reuse this unchanged: its roster comes from
 * `getDefaultRosterPositions`, not from `league_positions` (LS-10086).
 */
export type DraftPositionRules = Pick<DraftRules, 'sport' | 'rosterPositions'>;

/**
 * Determine which of the draft's roster slot types still need a player on the
 * given seat (`draft_participants.id` — keyed by seat rather than team since
 * LS-10076, so a mock-draft seat with no team works the same way). Works
 * inside any transaction (tx: PublicDb).
 *
 * Shared by autoProcessDraftPicks (scheduled-mutations.ts), the makeDraftPick
 * auto-pick chain, and the draft board's pickability filter.
 *
 * The slot list arrives via {@link DraftRules.rosterPositions} rather than a
 * `league_positions` query of its own (LS-10074) — `league_positions` is
 * league-scoped, and a draft-first mock draft has no league to scope to.
 *
 * Football reads eligibility from `football_player_eligible_positions`
 * (LS-9479) — the baseball-only `playerEligiblePositions` table has zero
 * football rows (LS-9474 postmortem), so without this branch a football team's
 * drafted players were never detected as filling any slot, and every slot type
 * stayed "unfilled" for the whole draft regardless of what was actually picked.
 */
export async function getUnfilledPositionTypes(
  tx: PublicDb,
  draftId: number,
  participantId: number,
  rules: DraftPositionRules,
): Promise<string[]> {
  // 1. The draft's roster slot requirements
  const rosterPositions = rules.rosterPositions;
  const sport: SportKind = rules.sport;

  if (rosterPositions.length === 0) return [];

  // Count slots needed per position type
  const slotsNeeded = new Map<string, number>();
  for (const positionType of rosterPositions) {
    slotsNeeded.set(positionType, (slotsNeeded.get(positionType) ?? 0) + 1);
  }

  // 2. Seat's already-drafted player IDs in this draft
  const teamPicksResult = await tx.execute(
    sql`SELECT player_id FROM draft_picks WHERE draft_id = ${draftId} AND participant_id = ${participantId}`,
  );
  const teamPlayerIds = teamPicksResult.rows.map((r) => r.player_id as number);

  if (teamPlayerIds.length === 0) {
    // No picks yet — all position types are still needed
    return [...new Set(rosterPositions)];
  }

  // 3. Position eligibility for already-drafted players from the mat view
  // (football reads a disjoint relation — see the doc comment above).
  const eligiblePositionRows =
    sport === 'football'
      ? await tx
          .select({
            playerId: PublicSchema.footballPlayerEligiblePositions.playerId,
            position: PublicSchema.footballPlayerEligiblePositions.position,
          })
          .from(PublicSchema.footballPlayerEligiblePositions)
          .where(
            inArray(
              PublicSchema.footballPlayerEligiblePositions.playerId,
              teamPlayerIds,
            ),
          )
      : await tx
          .select({
            playerId: PublicSchema.playerEligiblePositions.playerId,
            position: PublicSchema.playerEligiblePositions.position,
          })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            inArray(
              PublicSchema.playerEligiblePositions.playerId,
              teamPlayerIds,
            ),
          );

  const allowedPositions = ALLOWED_POSITIONS_BY_SPORT[sport];

  // Build map: playerId → set of slot types the player can fill
  const playerSlotMap = new Map<number, Set<string>>();
  for (const row of eligiblePositionRows) {
    const existing = playerSlotMap.get(row.playerId) ?? new Set<string>();
    for (const [slotType, allowedStatPositions] of Object.entries(
      allowedPositions,
    )) {
      if (allowedStatPositions.includes(row.position)) {
        existing.add(slotType);
      }
    }
    playerSlotMap.set(row.playerId, existing);
  }

  // 4-5. Maximum bipartite matching between drafted players and slot
  // instances determines which slot types remain genuinely unfilled.
  return computeUnfilledSlotTypes(
    slotsNeeded,
    playerSlotMap,
    teamPlayerIds,
    allowedPositions,
  );
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
  allowedPositions: Readonly<
    Record<string, readonly string[]>
  > = ALLOWED_POSITIONS,
): string[] {
  const orderedSlotTypes = [...slotsNeeded.keys()].sort(
    (a, b) =>
      (allowedPositions[a]?.length ?? 1) - (allowedPositions[b]?.length ?? 1),
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
 * Uses the same {@link ALLOWED_POSITIONS_BY_SPORT} table that
 * {@link getUnfilledPositionTypes} uses to decide which slots a player
 * covers, so the two stay consistent: a player whose eligible positions
 * intersect this set is exactly a player that meets a still-open roster
 * requirement for the team.
 *
 * `sport` defaults to 'baseball' for backward compatibility. Previously this
 * always read the baseball-only {@link ALLOWED_POSITIONS} table regardless of
 * sport, so a football board's unfilled slots (QB/RB/WR/etc.) never matched
 * any key and the LS-8065 constraint silently didn't apply to football
 * (LS-9479 postmortem).
 *
 * Unknown slot types contribute no positions (mirrors the auto-pick helper,
 * which can never fill a slot type absent from the mapping) — this is the
 * safe failure mode: an unrecognized slot type yields no predicate rather
 * than an empty board. Returns a de-duplicated list; an empty
 * `unfilledPositionTypes` yields an empty list.
 */
export function eligibleStatPositionsForUnfilledSlots(
  unfilledPositionTypes: string[],
  sport: SportKind = 'baseball',
): string[] {
  const allowedPositions = ALLOWED_POSITIONS_BY_SPORT[sport];
  return [
    ...new Set(
      unfilledPositionTypes.flatMap(
        (slotType) => allowedPositions[slotType] ?? [],
      ),
    ),
  ];
}

/** Safety cap on rounds searched when resolving a pick assignment — well
 *  beyond any realistic maxRosterSize, guards against an infinite loop if
 *  every team somehow forfeited the same round. */
const MAX_ROUND_SEARCH = 500;

/**
 * Seed order (round-1 order) for a keeper league's "Reverse Standings" /
 * previous-year-inverse draft (LS-8929): the worst finisher from the prior
 * season picks first. Returns `null` when there is no usable prior-season
 * order — the caller falls back to its normal random shuffle — which covers
 * a league's inaugural keeper season (no `previousLeagueId` yet) and any
 * case where the prior season's standings can't be resolved.
 *
 * Team lineage across a season renewal has no dedicated mapping column —
 * `renewLeague` (leagues/mutations.ts) inserts each new season's teams in
 * the same relative order as the teams they were copied from, so sorting
 * both seasons' teams by id ascending and zipping them positionally recovers
 * the old-team -> new-team correspondence. A current team that can't be
 * matched this way (e.g. an expansion team added after renewal, or a
 * mismatched team count) drafts last, in id order — it has no prior-season
 * record to justify a better slot.
 */
export async function resolveReverseStandingsSeedOrder(
  db: PublicDb,
  params: {
    previousLeagueId: number | null;
    teams: { id: number }[];
  },
): Promise<{ id: number }[] | null> {
  const { previousLeagueId, teams } = params;
  if (!previousLeagueId) return null;

  const previousTeams = await db
    .select({ id: PublicSchema.teams.id })
    .from(PublicSchema.teams)
    .where(eq(PublicSchema.teams.leagueId, previousLeagueId))
    .orderBy(asc(PublicSchema.teams.id));

  if (previousTeams.length === 0 || previousTeams.length !== teams.length) {
    return null;
  }

  const currentTeamsByPreviousId = new Map(
    [...teams]
      .sort((a, b) => a.id - b.id)
      .map((team, index) => [previousTeams[index].id, team] as const),
  );

  const standings = await calculateStandings(db, previousLeagueId);
  if (standings.length === 0) return null;

  // Worst finisher first: highest rank number picks first.
  const worstFirst = [...standings].sort(
    (a, b) => (b.rank ?? 0) - (a.rank ?? 0),
  );

  const ordered: { id: number }[] = [];
  const seen = new Set<number>();
  for (const standing of worstFirst) {
    const currentTeam = currentTeamsByPreviousId.get(standing.teamId);
    if (currentTeam && !seen.has(currentTeam.id)) {
      ordered.push(currentTeam);
      seen.add(currentTeam.id);
    }
  }

  const unmatched = teams
    .filter((team) => !seen.has(team.id))
    .sort((a, b) => a.id - b.id);

  return [...ordered, ...unmatched];
}

/**
 * Walk rounds in draft order (skipping any team's forfeited round — LS-8674
 * keeper round-penalty) until `overallPick` falls within a round's active
 * teams. With an empty `forfeited` set this is arithmetically identical to
 * the plain snake/linear computation it replaces (round = ceil(pick/teams),
 * teamIndex mirrored on even rounds for snake) — keeper leagues with no
 * forfeited picks and non-keeper leagues both draft in the original order.
 *
 * `isSnake` also covers 'reverse_standings' drafts (LS-8929) — the reverse-
 * standings order only determines round 1's seed; rounds still alternate
 * snake-style like a standard third-party-standings draft, so the caller
 * passes `isSnake = draftOrder === 'snake' || draftOrder === 'reverse_standings'`.
 */
export function resolvePickAssignment(params: {
  overallPick: number;
  /**
   * Seats in slot order (LS-10074 — previously the draft's `draft_teams` rows,
   * now `draft_participants`). `id` is the seat's `participant_id`; it is
   * optional so the pure-arithmetic tests can pass team ids alone.
   */
  seats: { teamId: number | null; id?: number }[];
  isSnake: boolean;
  /**
   * `teamId:round` keys. Forfeits are a keeper-league concept, so a seat with
   * no team (a mock-draft seat, LS-10076) never forfeits.
   */
  forfeited: Set<string>;
}): {
  teamId: number | null;
  participantId: number | undefined;
  round: number;
  pickNumber: number;
} | null {
  const { overallPick, seats, isSnake, forfeited } = params;
  let cumulative = 0;

  for (let round = 1; round <= MAX_ROUND_SEARCH; round++) {
    const isReverseRound = isSnake && round % 2 === 0;
    const ordered = isReverseRound ? [...seats].reverse() : seats;
    const active =
      forfeited.size === 0
        ? ordered
        : ordered.filter(
            (s) => s.teamId === null || !forfeited.has(`${s.teamId}:${round}`),
          );

    if (overallPick <= cumulative + active.length) {
      const idxInRound = overallPick - cumulative - 1;
      const seat = active[idxInRound];
      if (!seat) return null;
      return {
        teamId: seat.teamId,
        participantId: seat.id,
        round,
        pickNumber: idxInRound + 1,
      };
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
  /** The seat's league team, or `null` for a mock-draft seat (LS-10076). */
  teamId: number | null;
  /**
   * Seat filling this pick (`draft_participants.id`) — LS-10074. The turn is
   * the seat's, not the team's: every "whose pick is it" comparison keys on
   * this (LS-10076).
   */
  participantId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
} | null> {
  // Get draft and its seats
  const [draft] = await db
    .select()
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  if (!draft) {
    return null;
  }

  const seats = await getDraftSeats(db, draftId);

  if (seats.length === 0) {
    // Message preserved verbatim: isDraftNotYetInitialized (scheduled-mutations)
    // and the DRAFT_TEAMS_NOT_CONFIGURED mapping in the getCurrentDraftPick
    // resolver both match on it (LS-4853).
    throw new Error('No teams configured for this draft');
  }

  // League seats always hold a team; mock-draft seats never do (LS-10076).
  // Every seat drafts — a mock draft's open lobby seats become AI at start.

  const currentOverallPick = draft.currentPick + 1;
  const isSnake =
    draft.draftOrder === 'snake' || draft.draftOrder === 'reverse_standings';

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
    seats,
    isSnake,
    forfeited,
  });

  if (!assignment?.participantId) {
    throw new Error('Could not determine team for current pick');
  }

  return {
    draftId,
    teamId: assignment.teamId,
    participantId: assignment.participantId,
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
  } = params;

  const now = new Date();

  // Insert the draft pick record. `team_id` is still written for league
  // drafts — roster and pick-history readers join on it (LS-10074) — and is
  // NULL for a mock-draft seat (LS-10076). `participant_id` names the seat
  // directly rather than leaving the LS-10073 bridge trigger to resolve it.
  const [draftPick] = await tx
    .insert(PublicSchema.draftPicks)
    .values({
      draftId,
      teamId: pickInfo.teamId,
      participantId: pickInfo.participantId,
      playerId,
      round: pickInfo.round,
      pickNumber: pickInfo.pickNumber,
      overallPick: pickInfo.overallPick,
      pickedAt: now,
    })
    .returning();

  // Determine whether the draft is now complete
  const seats = await getDraftSeats(tx, draftId);
  const numTeams = seats.length;
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

  // Mark the draft completed when the last pick is made. A league draft
  // dual-writes drafts.status and leagues.draft_status (+ league_phase, as
  // before) in this same transaction — LS-10074. A mock draft has no league
  // row to move (LS-10076).
  if (isDraftComplete) {
    await setDraftStatus(tx, {
      draftId,
      leagueId,
      status: 'completed',
      leaguePhase: 'active',
    });
  }

  // Add the drafted player to the team's roster. A mock draft has no team or
  // roster — its picks live only in draft_picks (LS-10076).
  if (leagueId !== null && pickInfo.teamId !== null) {
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
 * Return the first player from a seat's draft queue that is still available
 * (not yet drafted) in the given draft. Keyed by seat since LS-10076: a
 * mock-draft queue has no team.
 *
 * Returns `null` if:
 *  - the queue is empty
 *  - all queued players have already been drafted
 *
 * Used by both auto-pick paths (scheduled-mutations.ts and make-draft-pick.ts).
 */
export async function getFirstQueuedPlayerForSeat(
  db: PublicDb,
  draftId: number,
  participantId: number,
): Promise<number | null> {
  // Fetch the queue ordered by priority
  const queueRows = await db
    .select({ playerId: PublicSchema.draftQueue.playerId })
    .from(PublicSchema.draftQueue)
    .where(
      and(
        eq(PublicSchema.draftQueue.draftId, draftId),
        eq(PublicSchema.draftQueue.participantId, participantId),
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
 * LS-480 / LS-545: Enable auto-pick for any seat whose associated
 * league_member has no user (unmanaged / bot teams).
 *
 * Writes `draft_participants` since LS-10074 (previously `draft_teams`), so it
 * must be called **after** the draft's seats exist.
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
    await setSeatAutoPick(db, {
      draftId,
      leagueId,
      teamIds: teamIdsWithoutGM,
      autoPick: true,
    });
  }

  return teamIdsWithoutGM;
}

// ── resolveDraftTeamsOrder (LS-8742) ─────────────────────────────────────────

export interface ResolveDraftTeamsOrderResult {
  /** Team ids in final draft-pick order (1-indexed positionally by array index). */
  orderedTeamIds: number[];
  /** True when the draft's seats must be (re)created — none existed yet, or
   *  the existing seats no longer match the league's current team set. False
   *  means the existing seats should be left untouched. */
  needsInsert: boolean;
}

/**
 * Decide the seat order to use when a draft actually starts.
 *
 * `approveDraftSlotTrade` (LS-8676) lazily seeds the draft order pre-draft and
 * atomically swaps two teams' slots when a trade executes. Both
 * initializeDraft and autoStartScheduledDrafts previously deleted + reshuffled
 * that order unconditionally at draft start, silently discarding any
 * commissioner-approved slot trade the instant the draft began (LS-8742).
 *
 * Reads `draft_participants` since LS-10074 (previously `draft_teams`).
 *
 * If seats already exist for this draft and their team set still matches the
 * league's current teams, preserve them as-is. Only randomize a fresh order
 * when no seats exist yet, or when the seeded team set has drifted from the
 * league's current teams (e.g. a team was added/removed after seeding) —
 * in that case the stale seed can no longer be trusted, so fall back to the
 * original reshuffle behavior.
 *
 * `draftId` is `null` when the drafts row itself doesn't exist yet
 * (initializeDraft's first-ever call for a league) — no seats can exist in
 * that case either, so this always resolves a fresh order.
 *
 * When a fresh order is needed, `freshOrderOptions` (LS-8929) determines
 * whether it comes from Reverse Standings (keeper leagues only) or the
 * original random shuffle — see {@link resolveReverseStandingsSeedOrder}.
 * Omit it (or leave `draftOrder`/`rosterContinuity` non-matching) to always
 * shuffle, e.g. for mock drafts.
 */
export async function resolveDraftTeamsOrder(
  db: PublicDb,
  draftId: number | null,
  currentTeams: { id: number }[],
  freshOrderOptions?: {
    draftOrder: string;
    rosterContinuity: string | null;
    previousLeagueId: number | null;
  },
): Promise<ResolveDraftTeamsOrderResult> {
  const existingRows = draftId
    ? await db
        .select({
          teamId: PublicSchema.draftParticipants.teamId,
        })
        .from(PublicSchema.draftParticipants)
        .where(eq(PublicSchema.draftParticipants.draftId, draftId))
        .orderBy(asc(PublicSchema.draftParticipants.slot))
    : [];

  if (existingRows.length > 0) {
    // A league seat always holds a team; an unseated lobby slot (slice 4)
    // cannot take part in a league draft order.
    const existingSeatTeamIds = existingRows
      .map((r) => r.teamId)
      .filter((id): id is number => id !== null);
    const currentTeamIds = new Set(currentTeams.map((t) => t.id));
    const existingTeamIds = new Set(existingSeatTeamIds);
    const sameTeamSet =
      existingSeatTeamIds.length === currentTeamIds.size &&
      [...currentTeamIds].every((id) => existingTeamIds.has(id));

    if (sameTeamSet) {
      return { orderedTeamIds: existingSeatTeamIds, needsInsert: false };
    }

    LOGGER.warn(
      'draft seat team set no longer matches league teams — reshuffling instead of preserving seeded order',
      { draftId },
    );
  }

  const reverseStandingsOrder =
    freshOrderOptions?.draftOrder === 'reverse_standings' &&
    freshOrderOptions.rosterContinuity === 'keeper'
      ? await resolveReverseStandingsSeedOrder(db, {
          previousLeagueId: freshOrderOptions.previousLeagueId,
          teams: currentTeams,
        })
      : null;

  return {
    orderedTeamIds: (reverseStandingsOrder ?? shuffleArray(currentTeams)).map(
      (t) => t.id,
    ),
    needsInsert: true,
  };
}
