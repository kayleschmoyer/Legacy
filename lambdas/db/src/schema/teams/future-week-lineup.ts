/**
 * Week-scoped lineup edits for an upcoming week (LS-10815).
 *
 * My Roster lets a manager set an upcoming week's lineup ahead of time
 * (LS-9768). `team_members.positionId` is the CURRENT week's lineup, so a
 * future-week edit must not write it — doing so (and mirroring it into every
 * week ≥ the current one) is what made a Week 2 swap rewrite Week 1
 * (LS-5956, regressed as LS-10815). Instead a future-week edit is written only
 * to that week's and later weeks' `matchup_players` rows, flagged
 * `manuallyEdited` so current-week edits don't overwrite the plan, and
 * promoted into `team_members` when the week activates.
 */
import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, eq, gte, inArray, or } from 'drizzle-orm';

export interface LineupChange {
  playerId: number;
  positionId: number | null;
}

/**
 * The league's current week: the authoritative `currentWeek` column, falling
 * back to the legacy `currentMatchup` FK (LS-1592). Null when the league has
 * no active week.
 */
export async function resolveLeagueCurrentWeek(
  db: PublicDb,
  leagueId: number,
): Promise<number | null> {
  const [leagueRow] = await db
    .select({
      currentWeek: PublicSchema.leagues.currentWeek,
      currentMatchup: PublicSchema.leagues.currentMatchup,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);
  if (!leagueRow) return null;
  if (leagueRow.currentWeek != null) return leagueRow.currentWeek;
  if (!leagueRow.currentMatchup) return null;

  const [refMatchup] = await db
    .select({ weekNumber: PublicSchema.matchups.weekNumber })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, leagueRow.currentMatchup))
    .limit(1);
  return refMatchup?.weekNumber ?? null;
}

/**
 * Whether `weekNumber` names a week after the league's current week. A null
 * `weekNumber` (callers that don't pass one) is never a future-week edit.
 */
export async function isFutureWeekEdit(
  db: PublicDb,
  leagueId: number,
  weekNumber: number | null | undefined,
): Promise<boolean> {
  if (weekNumber == null) return false;
  const currentWeek = await resolveLeagueCurrentWeek(db, leagueId);
  return currentWeek != null && weekNumber > currentWeek;
}

/**
 * Apply `changes` to one team's `matchup_players` rows for `fromWeek` and every
 * later week. `team_members` and earlier weeks are never touched.
 *
 * - In `fromWeek` — the week the manager is editing — the changes always
 *   apply: any other player holding a target slot is benched first so the
 *   partial unique slot index (matchup_id, team_id, position_id) never sees two
 *   players in one slot.
 * - In later weeks the edit carries forward unless any affected row (a moved
 *   player or a slot incumbent) was itself edited explicitly for that week; a
 *   later week's own plan wins and that week is left as is.
 *
 * Every row written is flagged `manuallyEdited`, so a current-week edit's
 * forward sync (`syncCurrentMatchupPositions`) leaves the plan alone.
 */
export async function applyFutureWeekLineupChanges(
  db: PublicDb,
  args: {
    leagueId: number;
    teamId: number;
    fromWeek: number;
    changes: LineupChange[];
  },
): Promise<void> {
  const { leagueId, teamId, fromWeek, changes } = args;
  if (changes.length === 0) return;

  const weekMatchups = await db
    .select({
      id: PublicSchema.matchups.id,
      weekNumber: PublicSchema.matchups.weekNumber,
    })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        gte(PublicSchema.matchups.weekNumber, fromWeek),
        or(
          eq(PublicSchema.matchups.team1Id, teamId),
          eq(PublicSchema.matchups.team2Id, teamId),
        ),
      ),
    )
    .orderBy(asc(PublicSchema.matchups.weekNumber));

  for (const matchup of weekMatchups) {
    const rows = await db
      .select({
        id: PublicSchema.matchupPlayers.id,
        playerId: PublicSchema.matchupPlayers.playerId,
        positionId: PublicSchema.matchupPlayers.positionId,
        manuallyEdited: PublicSchema.matchupPlayers.manuallyEdited,
      })
      .from(PublicSchema.matchupPlayers)
      .where(
        and(
          eq(PublicSchema.matchupPlayers.matchupId, matchup.id),
          eq(PublicSchema.matchupPlayers.teamId, teamId),
        ),
      );
    const rowByPlayer = new Map(rows.map((r) => [r.playerId, r]));

    const applicable = changes.flatMap((change) => {
      const row = rowByPlayer.get(change.playerId);
      return row ? [{ row, positionId: change.positionId }] : [];
    });
    if (applicable.length === 0) continue;

    const movedPlayerIds = new Set(applicable.map((a) => a.row.playerId));
    const targetSlots = new Set(
      applicable
        .map((a) => a.positionId)
        .filter((id): id is number => id != null),
    );
    const incumbents = rows.filter(
      (r) =>
        r.positionId != null &&
        targetSlots.has(r.positionId) &&
        !movedPlayerIds.has(r.playerId),
    );

    const isEditedWeek = matchup.weekNumber === fromWeek;
    if (
      !isEditedWeek &&
      [...applicable.map((a) => a.row), ...incumbents].some(
        (r) => r.manuallyEdited,
      )
    ) {
      continue;
    }

    // Clear every affected row first, then assign — never two players in one
    // slot mid-statement.
    await db
      .update(PublicSchema.matchupPlayers)
      .set({ positionId: null, manuallyEdited: true })
      .where(
        inArray(PublicSchema.matchupPlayers.id, [
          ...applicable.map((a) => a.row.id),
          ...incumbents.map((r) => r.id),
        ]),
      );
    for (const { row, positionId } of applicable) {
      if (positionId == null) continue;
      await db
        .update(PublicSchema.matchupPlayers)
        .set({ positionId })
        .where(eq(PublicSchema.matchupPlayers.id, row.id));
    }
  }
}

/**
 * When a week activates, copy the lineup edits made for it ahead of time
 * (`manuallyEdited` rows — from My Roster's future-week view or the matchup
 * lineup editor) into `team_members`, so the activation resync from
 * `team_members` keeps the planned lineup instead of discarding it. A member
 * whose slot was taken by a planned edit is benched. Then the activated rows'
 * `manuallyEdited` flags are cleared: the week is now current and
 * `team_members` holds its lineup.
 */
export async function promotePlannedLineupsOnActivation(
  db: PublicDb,
  leagueId: number,
  matchupIds: number[],
): Promise<void> {
  if (matchupIds.length === 0) return;

  const plannedRows = await db
    .select({
      teamId: PublicSchema.matchupPlayers.teamId,
      playerId: PublicSchema.matchupPlayers.playerId,
      positionId: PublicSchema.matchupPlayers.positionId,
    })
    .from(PublicSchema.matchupPlayers)
    .where(
      and(
        inArray(PublicSchema.matchupPlayers.matchupId, matchupIds),
        eq(PublicSchema.matchupPlayers.manuallyEdited, true),
      ),
    );
  if (plannedRows.length === 0) return;

  const plannedByTeam = new Map<number, Map<number, number | null>>();
  for (const r of plannedRows) {
    let planned = plannedByTeam.get(r.teamId);
    if (!planned) {
      planned = new Map();
      plannedByTeam.set(r.teamId, planned);
    }
    planned.set(r.playerId, r.positionId);
  }

  await db.transaction(async (tx) => {
    for (const [teamId, planned] of plannedByTeam) {
      const members = await tx
        .select({
          id: PublicSchema.teamMembers.id,
          playerId: PublicSchema.teamMembers.playerId,
          positionId: PublicSchema.teamMembers.positionId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            eq(PublicSchema.teamMembers.teamId, teamId),
          ),
        );

      // Only planned rows for players still on the roster claim a slot — a
      // player dropped since the plan was made must not bench anyone.
      const plannedSlots = new Set(
        members
          .map((m) => planned.get(m.playerId))
          .filter((id): id is number => id != null),
      );
      const changed = members.flatMap((m) => {
        const target = planned.has(m.playerId)
          ? (planned.get(m.playerId) ?? null)
          : m.positionId != null && plannedSlots.has(m.positionId)
            ? null
            : m.positionId;
        return target === m.positionId ? [] : [{ id: m.id, target }];
      });
      if (changed.length === 0) continue;

      // Clear-then-assign keeps team_members_uk_team_position satisfied.
      await tx
        .update(PublicSchema.teamMembers)
        .set({ positionId: null })
        .where(
          inArray(
            PublicSchema.teamMembers.id,
            changed.map((c) => c.id),
          ),
        );
      for (const { id, target } of changed) {
        if (target == null) continue;
        await tx
          .update(PublicSchema.teamMembers)
          .set({ positionId: target })
          .where(eq(PublicSchema.teamMembers.id, id));
      }
    }

    await tx
      .update(PublicSchema.matchupPlayers)
      .set({ manuallyEdited: false })
      .where(
        and(
          inArray(PublicSchema.matchupPlayers.matchupId, matchupIds),
          eq(PublicSchema.matchupPlayers.manuallyEdited, true),
        ),
      );
  });
}
