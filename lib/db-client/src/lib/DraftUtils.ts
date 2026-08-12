import { and, eq, sql, SQL } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { PublicDb, PublicSchema, runWithPublicClient } from '../index';

/**
 * Shared utilities for draft operations
 * Used by both DraftService (coordinator) and draft-processor lambda (worker)
 */

/**
 * Thrown when a draft operation fails because of invalid caller input
 * (bad leagueId, wrong status, missing access). Callers can inspect
 * `instanceof DraftUserInputError` to log at warn level and surface a
 * BAD_USER_INPUT GraphQL error rather than treating the condition as an
 * unexpected server fault.
 */
export class DraftUserInputError extends Error {
  readonly isUserFacing = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'DraftUserInputError';
  }
}

export const VALID_DRAFT_MODES = ['live', 'automated'] as const;
export type DraftMode = (typeof VALID_DRAFT_MODES)[number];

export const VALID_SELECTION_METHODS = [
  'standard',
  'auction',
  'random',
] as const;
export type SelectionMethod = (typeof VALID_SELECTION_METHODS)[number];

export const VALID_DRAFT_ORDERS = [
  'snake',
  'linear',
  'reverse_standings',
] as const;
export type DraftOrder = (typeof VALID_DRAFT_ORDERS)[number];

export interface DraftValidationOptions {
  leagueId: number;
  draftMode: string;
  selectionMethod: string;
  draftOrder?: string;
  userId?: number;
  skipUserValidation?: boolean;
}

/**
 * Validate draft mode is supported
 */
export function validateDraftMode(
  draftMode: string,
): asserts draftMode is DraftMode {
  if (!VALID_DRAFT_MODES.includes(draftMode as DraftMode)) {
    throw new DraftUserInputError(
      `Invalid draft mode: ${draftMode}. Valid modes are: ${VALID_DRAFT_MODES.join(', ')}`,
    );
  }
}

/**
 * Validate selection method is supported
 */
export function validateSelectionMethod(
  selectionMethod: string,
): asserts selectionMethod is SelectionMethod {
  if (!VALID_SELECTION_METHODS.includes(selectionMethod as SelectionMethod)) {
    throw new DraftUserInputError(
      `Invalid selection method: ${selectionMethod}. Valid methods are: ${VALID_SELECTION_METHODS.join(', ')}`,
    );
  }
}

/**
 * Validate draft order is supported
 */
export function validateDraftOrder(
  draftOrder: string,
): asserts draftOrder is DraftOrder {
  if (!VALID_DRAFT_ORDERS.includes(draftOrder as DraftOrder)) {
    throw new DraftUserInputError(
      `Invalid draft order: ${draftOrder}. Valid orders are: ${VALID_DRAFT_ORDERS.join(', ')}`,
    );
  }
}

/**
 * Check if user has access to a league
 */
export async function validateUserAccess(
  leagueId: number,
  userId: number,
): Promise<void> {
  const hasAccess = await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await db
      .select()
      .from(PublicSchema.leagueMembers)
      .where(
        and(
          eq(PublicSchema.leagueMembers.leagueId, leagueId),
          eq(PublicSchema.leagueMembers.userId, userId),
        ),
      )
      .limit(1);

    return result.length > 0;
  });

  if (!hasAccess) {
    throw new DraftUserInputError(
      `User ${userId} does not have access to league ${leagueId}`,
    );
  }
}

/**
 * Update league draft status with error handling
 */
export async function updateLeagueDraftStatus(
  leagueId: number,
  status: 'not-started' | 'queued' | 'in-progress' | 'completed',
  context?: string,
): Promise<void> {
  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      LOGGER.info(
        `🔄 Updating draft status for league ${leagueId} to '${status}'${context ? ` (${context})` : ''}`,
      );

      const updateResult = await db
        .update(PublicSchema.leagues)
        .set({
          draftStatus: status,
        })
        .where(eq(PublicSchema.leagues.id, leagueId))
        .returning();

      LOGGER.info('✅ Database update result:', updateResult);

      // Verify the update by reading it back
      const verificationResult = await db
        .select({
          id: PublicSchema.leagues.id,
          draftStatus: PublicSchema.leagues.draftStatus,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId));

      LOGGER.info('🔍 Verification query result:', verificationResult);
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    LOGGER.error(
      `❌ Failed to update draft status to '${status}' for league ${leagueId}:`,
      errorMessage,
    );
    throw error;
  }
}

/**
 * Fetch league details from database
 */
export async function fetchLeagueDetails(leagueId: number) {
  const league = await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await db
      .select({
        id: PublicSchema.leagues.id,
        name: PublicSchema.leagues.name,
        owner: PublicSchema.leagues.owner,
        maxRosterSize: PublicSchema.leagues.maxRosterSize,
        currentMatchup: PublicSchema.leagues.currentMatchup,
        currentWeek: PublicSchema.leagues.currentWeek,
        draftStatus: PublicSchema.leagues.draftStatus,
        leaguePhase: PublicSchema.leagues.leaguePhase,
        inviteCode: PublicSchema.leagues.inviteCode,
        playerPool: PublicSchema.leagues.playerPool,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    if (result.length === 0) {
      throw new DraftUserInputError(`League ${leagueId} not found`);
    }

    return result[0];
  });

  return league;
}

export interface CreateDraftOptions {
  leagueId: number;
  draftMode?: DraftMode;
  selectionMethod?: SelectionMethod;
  draftOrder?: DraftOrder;
}

/**
 * Create a draft record for a league with the given settings.
 * Should be called when a league is created so draft settings are always persisted.
 * Safe to call if a draft already exists — it will skip the insert.
 */
export async function createDraftForLeague(
  options: CreateDraftOptions,
): Promise<void> {
  const {
    leagueId,
    draftMode = 'live',
    selectionMethod = 'standard',
    draftOrder = 'snake',
  } = options;

  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      // Check if a draft record already exists
      const existing = await db
        .select({ id: PublicSchema.drafts.id })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .limit(1);

      if (existing.length > 0) {
        LOGGER.debug('Draft record already exists for league', { leagueId });
        return;
      }

      await db.insert(PublicSchema.drafts).values({
        leagueId,
        draftMode,
        selectionMethod,
        draftOrder,
      });

      LOGGER.info('Created draft record for league', {
        leagueId,
        draftMode,
        selectionMethod,
        draftOrder,
      });
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    LOGGER.error(
      `Failed to create draft record for league ${leagueId}:`,
      errorMessage,
    );
    throw error;
  }
}

/**
 * Comprehensive draft validation (used by both coordinator and worker)
 */
export async function validateDraftRequest(
  options: DraftValidationOptions,
): Promise<void> {
  const {
    leagueId,
    draftMode,
    selectionMethod,
    draftOrder,
    userId,
    skipUserValidation = false,
  } = options;

  // Validate draft mode
  validateDraftMode(draftMode);

  // Validate selection method
  validateSelectionMethod(selectionMethod);

  // Cross-validate: automated drafts only support 'random' selection method
  if (draftMode === 'automated' && selectionMethod !== 'random') {
    throw new Error(
      `Automated drafts only support the 'random' selection method. Got: '${selectionMethod}'`,
    );
  }

  // Validate draft order if provided
  if (draftOrder) {
    validateDraftOrder(draftOrder);
  }

  // Validate user access (if required)
  if (!skipUserValidation && userId) {
    await validateUserAccess(leagueId, userId);
  }

  // Verify league exists
  await fetchLeagueDetails(leagueId);
}

// ---------------------------------------------------------------------------
// League-level player eligibility filtering
// ---------------------------------------------------------------------------

// Era ranges shared between filtering logic — exported so callers can resolve
// a named era to a [start, end] year pair without redeclaring the constant.
export const ERA_RANGES: Record<string, [number, number]> = {
  dead_ball: [1871, 1919],
  golden_age: [1920, 1960],
  expansion: [1961, 1976],
  free_agency: [1977, 1993],
  steroid_era: [1994, 2005],
  modern: [2006, 9999],
};

export interface LeagueEligibilitySettings {
  /**
   * Restricts to players who appeared in that league. Intentionally narrowed to
   * mirror the `leagues.playerPool` Postgres enum exactly — adding a value here
   * requires a corresponding DB migration.
   */
  playerPool: 'all' | 'nl' | 'al' | 'nfl' | 'afc' | 'nfc';
  /** Minimum total career games (batting + pitching) a player must have */
  minCareerGames: number;
  /** Minimum distinct seasons a player must have appeared in */
  minCareerSeasons: number;
  /** When true, restrict to Hall of Fame players only */
  baseballHofOnly?: boolean;
  /** Era filter ('all' or named era or 'custom') */
  baseballEraFilter?: string;
  /** Start year for custom era (only used when baseballEraFilter = 'custom') */
  customEraStartYear?: number | null;
  /** End year for custom era (only used when baseballEraFilter = 'custom') */
  customEraEndYear?: number | null;
  /** Sport discriminator — when 'football', all baseball-specific filters are skipped. */
  sport?: 'baseball' | 'football';
}

export interface EligibilityFilterResult {
  /** Player IDs that passed all filters */
  eligibleIds: Set<number>;
  /** How many were removed by each filter (for logging) */
  excludedByPool: number;
  excludedByCareerGames: number;
  excludedByCareerSeasons: number;
  excludedByHofOnly: number;
  excludedByEraFilter: number;
}

/**
 * One league-eligibility rule, expressed as a reusable SQL predicate.
 *
 * `condition` is a Drizzle SQL fragment that evaluates to TRUE when a player
 * passes the rule. It references the table alias `p` (i.e. `players p`), so
 * callers must provide a query context where that alias exists. `message` is
 * the user-facing error a pick endpoint throws when the rule fails.
 */
export interface EligibilityCondition {
  key: 'pool' | 'careerGames' | 'careerSeasons' | 'hofOnly' | 'era';
  condition: SQL;
  message: string;
}

/**
 * Resolve a league's era filter to a concrete [startYear, endYear] range, or
 * null when no era restriction applies (era = 'all' / unset, or a custom era
 * missing one of its bounds).
 */
export function resolveEraRange(
  settings: LeagueEligibilitySettings,
): [number, number] | null {
  const eraFilter = settings.baseballEraFilter;
  if (!eraFilter || eraFilter === 'all') return null;
  if (eraFilter === 'custom') {
    const start = settings.customEraStartYear ?? null;
    const end = settings.customEraEndYear ?? null;
    return start != null && end != null ? [start, end] : null;
  }
  return ERA_RANGES[eraFilter] ?? null;
}

/** Humanise an era key ('steroid_era' → 'Steroid Era') for error messages. */
function formatEraLabel(eraFilter: string): string {
  return eraFilter.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build the league's static player-eligibility predicates as reusable,
 * `p`-aliased SQL fragments — the single source of truth consumed by every
 * endpoint that decides whether a player is draftable:
 *
 *  - the draft-board query (`getAvailableDraftPlayers`) AND-joins them and
 *    layers its own undrafted / search / position / sort filters on top, and
 *  - the pick mutations (`makeDraftPick`, `commissioner-pick`) evaluate the
 *    same predicates against the single candidate player via
 *    {@link findFailedEligibilityRule}.
 *
 * Because both paths consume the identical predicate set, a player shown as
 * available on the board can never be rejected by a pick on eligibility, and
 * vice-versa. Only rules that actually apply (given the league config) are
 * returned, in display order.
 *
 * Football leagues only support the conference (AFC/NFC) player-pool rule —
 * the remaining rules (career games/seasons, HoF, era) are baseball-specific
 * concepts with no football equivalent (LS-9040).
 */
export function buildEligibilityConditions(
  settings: LeagueEligibilitySettings,
): EligibilityCondition[] {
  if (settings.sport === 'football') {
    if (settings.playerPool === 'afc' || settings.playerPool === 'nfc') {
      const conference = settings.playerPool.toUpperCase();
      return [
        {
          key: 'pool',
          condition: sql`EXISTS (
            SELECT 1 FROM nfl_teams nt
            WHERE nt.abbreviation = p.nfl_team AND nt.conference = ${conference}
          )`,
          message: `Player is not on an ${conference} team`,
        },
      ];
    }
    return [];
  }

  const conditions: EligibilityCondition[] = [];

  // Player pool (AL / NL restriction). Check season_batting AND season_pitching
  // so pure pitchers (no batting rows in the DH era) stay in their pool.
  if (settings.playerPool !== 'all') {
    const poolUpper = settings.playerPool.toUpperCase();
    conditions.push({
      key: 'pool',
      condition: sql`EXISTS (
        SELECT 1 FROM season_batting sb
          WHERE sb.player_id = p.id AND sb.lg_id = ${poolUpper}
        UNION ALL
        SELECT 1 FROM season_pitching sp
          WHERE sp.player_id = p.id AND sp.lg_id = ${poolUpper}
      )`,
      message: `Player is not in the ${poolUpper} player pool`,
    });
  }

  // Minimum career games (career_batting.g — pure pitchers pass automatically).
  if (settings.minCareerGames > 0) {
    conditions.push({
      key: 'careerGames',
      condition: careerGamesCondition(settings.minCareerGames),
      message: `Player does not meet the minimum career games requirement (${settings.minCareerGames})`,
    });
  }

  // Minimum career seasons (distinct AL / NL batting seasons).
  if (settings.minCareerSeasons > 0) {
    conditions.push({
      key: 'careerSeasons',
      condition: careerSeasonsCondition(settings.minCareerSeasons),
      message: `Player does not meet the minimum career seasons requirement (${settings.minCareerSeasons})`,
    });
  }

  // Hall of Fame only.
  if (settings.baseballHofOnly) {
    conditions.push({
      key: 'hofOnly',
      condition: sql`p.hall_of_fame = TRUE`,
      message:
        'This league is restricted to Hall of Fame players. This player is not in the Hall of Fame.',
    });
  }

  // Era filter — player must have at least one AL / NL season in range.
  const eraRange = resolveEraRange(settings);
  if (eraRange) {
    const [eraStart, eraEnd] = eraRange;
    conditions.push({
      key: 'era',
      condition: sql`EXISTS (
        SELECT 1 FROM season_batting sb
          WHERE sb.player_id = p.id AND sb.lg_id IN ('AL', 'NL')
            AND sb.season >= ${eraStart} AND sb.season <= ${eraEnd}
        UNION ALL
        SELECT 1 FROM season_pitching sp
          WHERE sp.player_id = p.id AND sp.lg_id IN ('AL', 'NL')
            AND sp.season >= ${eraStart} AND sp.season <= ${eraEnd}
      )`,
      message: `Player has no recorded seasons in the ${formatEraLabel(
        settings.baseballEraFilter ?? '',
      )} era and is not eligible for this league.`,
    });
  }

  return conditions;
}

/**
 * Evaluate every applicable eligibility rule for a single player in one query
 * and return the first rule the player fails, or null if the player is
 * eligible (or no rules apply). Use this in the pick endpoints
 * (`makeDraftPick`, `commissioner-pick`) so they accept exactly the players
 * the draft board shows.
 *
 * Assumes the player exists; returns null when no row is found (callers verify
 * existence separately to surface a distinct "Player not found" error).
 */
export async function findFailedEligibilityRule(
  db: PublicDb,
  playerId: number,
  settings: LeagueEligibilitySettings,
): Promise<EligibilityCondition | null> {
  const conditions = buildEligibilityConditions(settings);
  if (conditions.length === 0) return null;

  // Evaluate all predicates in a single round-trip; alias each TRUE/FALSE
  // result as rule_<n> so we can report the first failing rule by index.
  const selectList = sql.join(
    conditions.map((c, i) => sql`(${c.condition}) AS ${sql.raw(`rule_${i}`)}`),
    sql`, `,
  );
  const result = await db.execute(
    sql`SELECT ${selectList} FROM players p WHERE p.id = ${playerId}`,
  );
  const row = result.rows[0] as Record<string, boolean | null> | undefined;
  if (!row) return null;

  for (let i = 0; i < conditions.length; i++) {
    if (row[`rule_${i}`] !== true) return conditions[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared SQL condition builders — single source of truth for career filters.
// Both the UI draft-pool query (queries.ts) and the batch eligibility
// filter below consume these so the criteria can never drift apart.
//
// Each builder returns a Drizzle SQL fragment that references the table
// alias `p` (i.e. `players p`).  Callers are responsible for providing a
// query context where that alias exists.
// ---------------------------------------------------------------------------

/**
 * SQL condition: player meets a minimum career-games threshold.
 *
 * Uses `career_batting.g` — NOT `players.total_games` which double-counts
 * batting + pitching appearances.  Pure pitchers with no `career_batting`
 * record pass automatically (no matching row → NOT EXISTS is true).
 *
 * Optimized (LS-905): single NOT EXISTS replaces the former NOT EXISTS OR IN
 * pattern, allowing one index scan on career_batting(player_id).
 */
export function careerGamesCondition(minCareerGames: number): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM career_batting cb
    WHERE cb.player_id = p.id AND cb.g < ${minCareerGames}
  )`;
}

/**
 * SQL condition: player meets a minimum career-seasons threshold.
 *
 * Counts only MLB (AL / NL) batting seasons.  Pure pitchers with no
 * MLB batting records pass automatically (COUNT = 0).
 *
 * Optimized (LS-905): replaced IN (GROUP BY HAVING) with a correlated scalar
 * subquery so the planner only evaluates the specific player's seasons
 * via idx_season_batting_player_lgid instead of materializing all players.
 *
 * Optimized (LS-9311): collapsed the former `NOT EXISTS (...) OR (SELECT
 * COUNT(DISTINCT season) ...) >= N` pair into a single scalar subquery. The
 * NOT EXISTS half was evaluated once per candidate player against the full
 * season_batting table, so the planner built a hash of the ~100k+ AL/NL rows
 * (season_batting has no player-agnostic selective predicate) on every call —
 * this predicate is part of the draft-board query family, the single largest
 * DB-time consumer in dev pg_stat_statements (~60M ms cumulative). A single
 * COUNT(DISTINCT season) subquery reuses the same per-player index-only scan
 * for both the "has no rows" and "meets threshold" checks, so only one
 * correlated subquery executes per row instead of two, and the full-table
 * hash build is eliminated entirely. Verified via EXPLAIN ANALYZE against dev
 * RDS: ~2.8s → ~1.5s for a representative getAvailableDraftPlayers call
 * (minCareerGames=50, minCareerSeasons=3).
 */
export function careerSeasonsCondition(minCareerSeasons: number): SQL {
  return sql`(
    SELECT COUNT(DISTINCT season) = 0 OR COUNT(DISTINCT season) >= ${minCareerSeasons}
    FROM season_batting
    WHERE player_id = p.id AND lg_id IN ('AL', 'NL')
  )`;
}

/**
 * Batch-filter a set of player IDs by league eligibility settings.
 *
 * Applies three successive filters (player pool → career games → career
 * seasons) and returns the surviving IDs plus per-filter exclusion counts.
 *
 * Use this in the auto-draft / random-assignment path where you need to
 * narrow a large candidate pool in bulk.
 */
export async function filterPlayerIdsByLeagueEligibility(
  db: PublicDb,
  playerIds: number[],
  settings: LeagueEligibilitySettings,
): Promise<EligibilityFilterResult> {
  let currentIds = [...playerIds];
  let excludedByPool = 0;
  let excludedByCareerGames = 0;
  let excludedByCareerSeasons = 0;
  let excludedByHofOnly = 0;
  let excludedByEraFilter = 0;

  // The career games/seasons, HoF, and era filters are baseball-specific
  // concepts with no football equivalent — football leagues skip them
  // entirely. The player-pool filter does apply to football (AFC/NFC
  // conference restriction), mirroring the real conference filter already
  // proven out by the footballPlayers query (LS-9040).
  if (settings.sport === 'football') {
    if (
      (settings.playerPool === 'afc' || settings.playerPool === 'nfc') &&
      currentIds.length > 0
    ) {
      const conference = settings.playerPool.toUpperCase();
      const poolRows = await db.execute(
        sql`SELECT p.id AS player_id
            FROM players p
            JOIN nfl_teams nt ON nt.abbreviation = p.nfl_team
            WHERE p.id = ANY(${sql.param(currentIds)}::integer[])
              AND nt.conference = ${conference}`,
      );
      const poolEligible = new Set(
        poolRows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
      );
      const before = currentIds.length;
      currentIds = currentIds.filter((id) => poolEligible.has(id));
      excludedByPool = before - currentIds.length;
      LOGGER.info(
        `Football conference filter (${conference}): ${before} → ${currentIds.length} (excluded ${excludedByPool})`,
      );
    } else {
      LOGGER.info(
        `[filterPlayerIdsByLeagueEligibility] Football league, pool='${settings.playerPool}' — no conference restriction, ${currentIds.length} players eligible`,
      );
    }
    return {
      eligibleIds: new Set(currentIds),
      excludedByPool,
      excludedByCareerGames,
      excludedByCareerSeasons,
      excludedByHofOnly,
      excludedByEraFilter,
    };
  }

  // 1. Player pool (AL / NL restriction)
  // Check both season_batting and season_pitching so that pure pitchers
  // (who have no batting records in the DH era) are correctly included
  // in their respective pool alongside batters.
  if (settings.playerPool !== 'all' && currentIds.length > 0) {
    const poolUpper = settings.playerPool.toUpperCase();
    const poolRows = await db.execute(
      sql`SELECT DISTINCT player_id
          FROM (
            SELECT player_id FROM season_batting
              WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
                AND lg_id = ${poolUpper}
            UNION
            SELECT player_id FROM season_pitching
              WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
                AND lg_id = ${poolUpper}
          ) pool_players`,
    );

    const poolEligible = new Set(
      poolRows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => poolEligible.has(id));
    excludedByPool = before - currentIds.length;

    LOGGER.info(
      `Player pool filter (${poolUpper}): ${before} → ${currentIds.length} (excluded ${excludedByPool})`,
    );
  }

  // 2. Minimum career games
  if (settings.minCareerGames > 0 && currentIds.length > 0) {
    const rows = await db.execute(
      sql`
        SELECT p.id AS player_id
        FROM players p
        WHERE p.id = ANY(${sql.param(currentIds)}::integer[])
          AND ${careerGamesCondition(settings.minCareerGames)}
      `,
    );

    const eligible = new Set(
      rows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => eligible.has(id));
    excludedByCareerGames = before - currentIds.length;

    LOGGER.info(
      `Min career games filter (≥${settings.minCareerGames}): ${before} → ${currentIds.length} (excluded ${excludedByCareerGames})`,
    );
  }

  // 3. Minimum career seasons
  if (settings.minCareerSeasons > 0 && currentIds.length > 0) {
    // LS-4693: replaces the previous correlated NOT EXISTS + COUNT(DISTINCT)
    // pair (two passes over season_batting per player) with a single pre-
    // aggregated CTE so the index on (player_id, lg_id, season) is scanned
    // once per batch instead of 2× per row.
    const rows = await db.execute(
      sql`
        WITH eligibility AS (
          SELECT player_id, COUNT(DISTINCT season) AS season_count
          FROM season_batting
          WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
            AND lg_id IN ('AL', 'NL')
          GROUP BY player_id
        )
        SELECT p.id AS player_id
        FROM players p
        LEFT JOIN eligibility e ON e.player_id = p.id
        WHERE p.id = ANY(${sql.param(currentIds)}::integer[])
          AND (e.player_id IS NULL OR e.season_count >= ${settings.minCareerSeasons})
      `,
    );

    const eligible = new Set(
      rows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => eligible.has(id));
    excludedByCareerSeasons = before - currentIds.length;

    LOGGER.info(
      `Min career seasons filter (≥${settings.minCareerSeasons}): ${before} → ${currentIds.length} (excluded ${excludedByCareerSeasons})`,
    );
  }

  // 4. Hall of Fame filter
  if (settings.baseballHofOnly && currentIds.length > 0) {
    const rows = await db.execute(
      sql`
        SELECT id FROM players
        WHERE id = ANY(${sql.param(currentIds)}::integer[])
          AND hall_of_fame = TRUE
      `,
    );
    const eligible = new Set(
      rows.rows.map((r: Record<string, unknown>) => Number(r.id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => eligible.has(id));
    excludedByHofOnly = before - currentIds.length;
    LOGGER.info(
      `HoF filter: ${before} → ${currentIds.length} (excluded ${excludedByHofOnly})`,
    );
  }

  // 5. Era filter
  const eraFilter = settings.baseballEraFilter;
  if (eraFilter && eraFilter !== 'all' && currentIds.length > 0) {
    let eraStart: number | null = null;
    let eraEnd: number | null = null;
    if (eraFilter === 'custom') {
      eraStart = settings.customEraStartYear ?? null;
      eraEnd = settings.customEraEndYear ?? null;
    } else {
      const range = ERA_RANGES[eraFilter];
      if (range) {
        [eraStart, eraEnd] = range;
      }
    }
    if (eraStart != null && eraEnd != null) {
      const rows = await db.execute(
        sql`
          SELECT DISTINCT player_id
          FROM (
            SELECT player_id FROM season_batting
              WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
                AND lg_id IN ('AL', 'NL')
                AND season >= ${eraStart} AND season <= ${eraEnd}
            UNION
            SELECT player_id FROM season_pitching
              WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
                AND lg_id IN ('AL', 'NL')
                AND season >= ${eraStart} AND season <= ${eraEnd}
          ) era_players
        `,
      );
      const eligible = new Set(
        rows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
      );
      const before = currentIds.length;
      currentIds = currentIds.filter((id) => eligible.has(id));
      excludedByEraFilter = before - currentIds.length;
      LOGGER.info(
        `Era filter (${eraFilter} ${eraStart}-${eraEnd}): ${before} → ${currentIds.length} (excluded ${excludedByEraFilter})`,
      );
    }
  }

  return {
    eligibleIds: new Set(currentIds),
    excludedByPool,
    excludedByCareerGames,
    excludedByCareerSeasons,
    excludedByHofOnly,
    excludedByEraFilter,
  };
}

/**
 * Atomically mark a draft as complete by stamping `draftCompletedAt` on the
 * drafts row and setting `draftStatus = 'completed'` and
 * `leaguePhase = 'active'` on the leagues row.
 *
 * Wrap the call in `db.transaction(async (tx) => …)` to make both writes
 * atomic.  The automated-draft path (draft-processor lambda) uses this helper;
 * the live-draft path (commitDraftPick in lambdas/db) performs the equivalent
 * updates inline on its own transaction and must be kept in sync by hand.
 */
export async function finalizeDraftCompletion(
  db: PublicDb,
  leagueId: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(PublicSchema.drafts)
    .set({ draftCompletedAt: now })
    .where(eq(PublicSchema.drafts.leagueId, leagueId));

  await db
    .update(PublicSchema.leagues)
    .set({ draftStatus: 'completed', leaguePhase: 'active' })
    .where(eq(PublicSchema.leagues.id, leagueId));

  LOGGER.info(
    'Draft finalized: draftCompletedAt stamped, draftStatus=completed, leaguePhase=active',
    {
      leagueId,
    },
  );
}
