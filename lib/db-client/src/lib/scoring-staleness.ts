/**
 * Scoring staleness (LS-9665).
 *
 * A matchup's persisted score is *stale* when it was not computed under the
 * scoring inputs that are current right now. This module is the single home
 * for that predicate and for the batched lookup it needs, so the GraphQL
 * resolver, the league-chat system messages (LS-9666), the UI indicator
 * (LS-9667) and the one-time rescore (LS-9668) all answer the question the
 * same way rather than each re-deriving it.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { PublicDb } from './client/PublicDbClient';
import * as Schema from '../drizzle/public/schema';

export interface ScoringStalenessInput {
  /**
   * When the matchup's persisted score was computed
   * (`matchups.scored_at`). NULL for scores written before provenance
   * existed, or never computed.
   */
  scoredAt: Date | string | null | undefined;
  /**
   * The most recent `league_scoring_change_log.changed_at` for the league's
   * active scoring profile, or null when the league has never changed its
   * scoring settings.
   */
  lastScoringChangeAt: Date | string | null | undefined;
  /**
   * Whether the matchup has a persisted score at all (either team score
   * non-null). A matchup that has never been scored has no persisted score
   * whose provenance could be stale.
   */
  hasPersistedScore: boolean;
}

const toTime = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

/**
 * Is this matchup's persisted score stale?
 *
 * - `null` — the matchup has no persisted score, so the question does not
 *   apply. This is why the GraphQL field is nullable: a scheduled or unplayed
 *   matchup is not "stale", it simply has nothing to be stale about, and
 *   answering `true` would badge every future matchup in the league.
 * - `true` — either the score predates scoring provenance (`scoredAt` is null,
 *   which after this ticket means it was written before the column existed and
 *   therefore under the pre-N-times semantic), or the league's active scoring
 *   profile changed after the score was computed.
 * - `false` — the score was computed, and nothing has changed since.
 */
export const isScoringStale = ({
  scoredAt,
  lastScoringChangeAt,
  hasPersistedScore,
}: ScoringStalenessInput): boolean | null => {
  if (!hasPersistedScore) return null;

  const scoredAtTime = toTime(scoredAt);

  // Scored, but with no provenance recorded: written before this column
  // existed, so it cannot be shown to be current. LS-9668's one-time rescore
  // stamps these exactly rather than backfilling them from `updated_at`.
  if (scoredAtTime === null) return true;

  const changedAtTime = toTime(lastScoringChangeAt);
  if (changedAtTime === null) return false;

  return changedAtTime > scoredAtTime;
};

/**
 * Latest scoring-settings change per league, for the leagues given.
 *
 * One query for all leagues — callers batch rather than asking per matchup.
 * Leagues with an active profile but no change-log rows, and leagues with no
 * active profile at all, both map to `null` (nothing has ever changed).
 *
 * "Active profile" is the league's default profile, matching
 * `getActiveScoringProfileForLeague`. Served by the existing
 * `league_scoring_profiles_unique_default` partial unique index and
 * `league_scoring_change_log_profile_id_changed_at_idx`.
 */
export async function getLatestScoringChangeAtByLeague(
  db: PublicDb,
  leagueIds: number[],
): Promise<Map<number, Date | null>> {
  const uniqueLeagueIds = [...new Set(leagueIds)];
  const result = new Map<number, Date | null>(
    uniqueLeagueIds.map((leagueId) => [leagueId, null]),
  );

  if (uniqueLeagueIds.length === 0) return result;

  const rows = await db
    .select({
      leagueId: Schema.leagueScoringProfiles.leagueId,
      // Typed as string | Date deliberately. The column is declared
      // `mode: 'string'`, but that mapping applies to column selections, not to
      // a raw `sql` expression — MAX() comes back through node-postgres' own
      // timestamptz parser, which yields a Date. Annotating it `string` would
      // be a lie the `new Date(...)` below only accidentally survives.
      changedAt: sql<
        string | Date
      >`MAX(${Schema.leagueScoringChangeLog.changedAt})`,
    })
    .from(Schema.leagueScoringChangeLog)
    .innerJoin(
      Schema.leagueScoringProfiles,
      eq(
        Schema.leagueScoringChangeLog.profileId,
        Schema.leagueScoringProfiles.id,
      ),
    )
    .where(
      and(
        inArray(Schema.leagueScoringProfiles.leagueId, uniqueLeagueIds),
        eq(Schema.leagueScoringProfiles.isDefault, true),
      ),
    )
    .groupBy(Schema.leagueScoringProfiles.leagueId);

  for (const row of rows) {
    const changedAt = row.changedAt ? new Date(row.changedAt) : null;
    result.set(
      row.leagueId,
      changedAt && !Number.isNaN(changedAt.getTime()) ? changedAt : null,
    );
  }

  return result;
}

/** One `league_scoring_change_log` row, joined out to display-ready fields. */
export interface ScoringChangeLogEntry {
  statDisplayName: string;
  previousMultiplier: number | null;
  newMultiplier: number | null;
  changedAt: Date;
  changedByUsername: string | null;
}

/**
 * Scoring change history per league, for the leagues given (LS-9667).
 *
 * One query for all leagues — the UI indicator's "what changed and when"
 * interaction batches by league rather than issuing a query per matchup.
 * Rows are for the league's active (default) profile only, newest first.
 * Leagues with no change-log rows map to an empty array.
 */
export async function getScoringChangeLogByLeague(
  db: PublicDb,
  leagueIds: number[],
): Promise<Map<number, ScoringChangeLogEntry[]>> {
  const uniqueLeagueIds = [...new Set(leagueIds)];
  const result = new Map<number, ScoringChangeLogEntry[]>(
    uniqueLeagueIds.map((leagueId) => [leagueId, []]),
  );

  if (uniqueLeagueIds.length === 0) return result;

  const rows = await db
    .select({
      leagueId: Schema.leagueScoringProfiles.leagueId,
      statDisplayName: Schema.scoringStatDefinitions.displayName,
      previousMultiplier: Schema.leagueScoringChangeLog.previousMultiplier,
      newMultiplier: Schema.leagueScoringChangeLog.newMultiplier,
      changedAt: Schema.leagueScoringChangeLog.changedAt,
      changedByUsername: Schema.users.username,
    })
    .from(Schema.leagueScoringChangeLog)
    .innerJoin(
      Schema.leagueScoringProfiles,
      eq(
        Schema.leagueScoringChangeLog.profileId,
        Schema.leagueScoringProfiles.id,
      ),
    )
    .innerJoin(
      Schema.scoringStatDefinitions,
      eq(
        Schema.leagueScoringChangeLog.statDefinitionId,
        Schema.scoringStatDefinitions.id,
      ),
    )
    .leftJoin(
      Schema.users,
      eq(Schema.leagueScoringChangeLog.changedBy, Schema.users.id),
    )
    .where(
      and(
        inArray(Schema.leagueScoringProfiles.leagueId, uniqueLeagueIds),
        eq(Schema.leagueScoringProfiles.isDefault, true),
      ),
    )
    .orderBy(desc(Schema.leagueScoringChangeLog.changedAt));

  for (const row of rows) {
    const changedAt = toTime(row.changedAt);
    if (changedAt === null) continue;

    const entries = result.get(row.leagueId) ?? [];
    entries.push({
      statDisplayName: row.statDisplayName,
      previousMultiplier:
        row.previousMultiplier !== null ? Number(row.previousMultiplier) : null,
      newMultiplier:
        row.newMultiplier !== null ? Number(row.newMultiplier) : null,
      changedAt: new Date(changedAt),
      changedByUsername: row.changedByUsername ?? null,
    });
    result.set(row.leagueId, entries);
  }

  return result;
}
