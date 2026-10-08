import { and, eq, sql, SQL } from 'drizzle-orm';
import { ERA_YEAR_RANGES_BY_SPORT } from '@legacy-sports/utils';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
// Import from the defining modules, never the package barrel: '../index'
// re-exports this file, so the barrel import was a cycle — and in specs it
// re-entered the mocked @legacy-sports/db-client factory mid-load (LS-10079).
import { runWithPublicClient } from './client/Helpers';
import { type PublicDb, PublicSchema } from './client/PublicDbClient';

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

  // Cross-validate: automated drafts only support 'random' selection method.
  // This is caller input, not a server fault — throw DraftUserInputError (like
  // every other check in this function) so DraftService.startDraft classifies
  // it as errorType: 'user_input' instead of logging it as an unexpected
  // server error on every occurrence (LS-9910).
  if (draftMode === 'automated' && selectionMethod !== 'random') {
    throw new DraftUserInputError(
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

// Resolves a preset baseball era to its inclusive [start, end] year pair from
// the canonical `ERA_YEAR_RANGES_BY_SPORT` table that every UI surface also
// displays, so the enforced pool matches the advertised years (LS-10689).
// Looked up per call rather than copied at module load, so importing
// db-client never depends on `@legacy-sports/utils` being fully evaluated.
export function getPresetEraRange(era: string): [number, number] | null {
  const range = ERA_YEAR_RANGES_BY_SPORT.baseball[era];
  return range ? [range.start, range.end] : null;
}

export interface LeagueEligibilitySettings {
  /**
   * Restricts to players who appeared in that league. Intentionally narrowed to
   * mirror the `leagues.playerPool` Postgres enum exactly — adding a value here
   * requires a corresponding DB migration.
   */
  playerPool: 'all' | 'nl' | 'al' | 'nfl' | 'afc' | 'nfc';
  /** Minimum career AL/NL batting games (`career_batting.g`) */
  minCareerGames: number;
  /** Minimum distinct AL/NL batting seasons (`career_batting.seasons`) */
  minCareerSeasons: number;
  /**
   * Minimum career AL/NL games pitched (LS-10807). 0 / omitted = off. While
   * both pitcher minimums are off, the batter minimums apply exactly as before
   * (pure pitchers with no batting row pass); once either is set, pitchers are
   * judged on pitching and position players on batting — see
   * {@link careerMinimumConditions}.
   */
  minCareerPitcherGames?: number;
  /** Minimum distinct AL/NL seasons with a pitching appearance (LS-10807). */
  minCareerPitcherSeasons?: number;
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
  /**
   * Football defensive format, mirroring `leagues.defensive_format` (LS-10828).
   * Omit it to apply no format rule. Otherwise `'idp'` drops team D/ST
   * players, and any other value — including `null`, the column's legacy
   * state, which `getDefaultRosterPositions` also reads as D/ST — drops
   * players whose only eligible positions are DL/LB/DB. Ignored for baseball.
   */
  defensiveFormat?: string | null;
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
  key:
    | 'pool'
    | 'careerGames'
    | 'careerSeasons'
    | 'hofOnly'
    | 'era'
    | 'defensiveFormat';
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
  return getPresetEraRange(eraFilter);
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
 * Football leagues only support the conference (AFC/NFC) player-pool rule
 * and, when `defensiveFormat` is passed, the D/ST-vs-IDP rule (LS-10828) —
 * the remaining rules (career games/seasons, HoF, era) are baseball-specific
 * concepts with no football equivalent (LS-9040).
 */
export function buildEligibilityConditions(
  settings: LeagueEligibilitySettings,
): EligibilityCondition[] {
  if (settings.sport === 'football') {
    const footballConditions: EligibilityCondition[] = [];
    if (settings.playerPool === 'afc' || settings.playerPool === 'nfc') {
      const conference = settings.playerPool.toUpperCase();
      footballConditions.push({
        key: 'pool',
        condition: sql`EXISTS (
          SELECT 1 FROM nfl_teams nt
          WHERE nt.abbreviation = p.nfl_team AND nt.conference = ${conference}
        )`,
        message: `Player is not on an ${conference} team`,
      });
    }
    if (settings.defensiveFormat !== undefined) {
      footballConditions.push(
        defensiveFormatCondition(settings.defensiveFormat),
      );
    }
    return footballConditions;
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

  // Minimum career games / seasons (batter thresholds on career_batting,
  // pitcher thresholds on career_pitching_appearances — LS-10807).
  const career = careerMinimumConditions(settings);
  if (career.games) {
    conditions.push({
      key: 'careerGames',
      condition: career.games,
      message: `Player does not meet the minimum career games requirement (${formatCareerMinimum(
        settings.minCareerGames,
        settings.minCareerPitcherGames,
      )})`,
    });
  }
  if (career.seasons) {
    conditions.push({
      key: 'careerSeasons',
      condition: career.seasons,
      message: `Player does not meet the minimum career seasons requirement (${formatCareerMinimum(
        settings.minCareerSeasons,
        settings.minCareerPitcherSeasons,
      )})`,
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
 * A football league fields either team D/ST or individual defensive players
 * (IDP), never both (LS-9475), so the other kind can fill no slot and must not
 * be draftable (LS-10828). D/ST leagues drop players whose only eligible
 * positions are DL/LB/DB — read from `football_player_eligible_positions`, the
 * same relation the board's position filters use — and IDP leagues drop the
 * team-defense players. Offensive players and kickers pass in both.
 */
function defensiveFormatCondition(
  defensiveFormat: string | null,
): EligibilityCondition {
  if (defensiveFormat === 'idp') {
    return {
      key: 'defensiveFormat',
      condition: sql`p.is_dst = FALSE`,
      message:
        'This league uses individual defensive players (IDP), so team D/ST players are not draftable.',
    };
  }
  return {
    key: 'defensiveFormat',
    condition: sql`(
      NOT EXISTS (
        SELECT 1 FROM football_player_eligible_positions fpep
        WHERE fpep.player_id = p.id AND fpep.position IN ('DL', 'LB', 'DB')
      )
      OR EXISTS (
        SELECT 1 FROM football_player_eligible_positions fpep
        WHERE fpep.player_id = p.id AND fpep.position NOT IN ('DL', 'LB', 'DB')
      )
    )`,
    message:
      'This league uses team D/ST, so individual defensive players (DL/LB/DB) are not draftable.',
  };
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
 *
 * Optimized (LS-10552): the count is precomputed as `career_batting.seasons`
 * (career_batting aggregates exactly the AL/NL season_batting rows, so the
 * count is identical), turning the per-player correlated aggregate — ~23.6k
 * index scans + sorts per call — into one hash anti-join, the same shape as
 * {@link careerGamesCondition}. A player with no AL/NL batting seasons has no
 * career_batting row and passes, exactly as `COUNT(DISTINCT season) = 0` did.
 */
export function careerSeasonsCondition(minCareerSeasons: number): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM career_batting cb
    WHERE cb.player_id = p.id AND cb.seasons < ${minCareerSeasons}
  )`;
}

/** The four career thresholds, with the optional pitcher pair defaulted to 0. */
interface CareerMinimums {
  batterGames: number;
  batterSeasons: number;
  pitcherGames: number;
  pitcherSeasons: number;
}

function resolveCareerMinimums(
  settings: Pick<
    LeagueEligibilitySettings,
    | 'minCareerGames'
    | 'minCareerSeasons'
    | 'minCareerPitcherGames'
    | 'minCareerPitcherSeasons'
  >,
): CareerMinimums {
  return {
    batterGames: settings.minCareerGames,
    batterSeasons: settings.minCareerSeasons,
    pitcherGames: settings.minCareerPitcherGames ?? 0,
    pitcherSeasons: settings.minCareerPitcherSeasons ?? 0,
  };
}

/** "50" for a batter-only rule, "batters 50, pitchers 25" once pitchers have one. */
function formatCareerMinimum(
  batter: number,
  pitcher: number | undefined,
): string {
  return pitcher ? `batters ${batter}, pitchers ${pitcher}` : String(batter);
}

/**
 * SQL condition for one career dimension under separate batter and pitcher
 * thresholds (LS-10807). Each player is classified from their AL/NL
 * appearances:
 *
 *  - position player — never pitched: batter threshold on `career_batting`;
 *  - pure pitcher — pitched, and every batting game (if any) was one they
 *    pitched in: pitcher threshold on `career_pitching_appearances`. Old-era
 *    pitchers who batted are pitchers, not two-way players;
 *  - two-way player — pitched AND batted in more games than they pitched:
 *    eligible if they pass EITHER the full batter set (games and seasons) or
 *    the full pitcher set;
 *  - no MLB batting or pitching row at all — passes, as before.
 *
 * One hash anti-join over career_batting FULL JOIN
 * career_pitching_appearances (every player with any AL/NL batting or
 * pitching row), keyed on the coalesced player id. Verified on dev RDS
 * (EXPLAIN ANALYZE, full baseball pool, 50/3 batters + 25/3 pitchers):
 * ~47ms, vs ~29ms for the legacy batter-only pair. Splitting it into a
 * batting-side and a pitcher-only anti-join instead let the planner
 * underestimate the pitcher side and pick a nested-loop anti join (~2.8s).
 */
function roleSplitCareerCondition(
  dimension: 'games' | 'seasons',
  m: CareerMinimums,
): SQL {
  const batterPass =
    dimension === 'games'
      ? sql`cb.g >= ${m.batterGames}`
      : sql`cb.seasons >= ${m.batterSeasons}`;
  const pitcherPass =
    dimension === 'games'
      ? sql`COALESCE(cpa.g, 0) >= ${m.pitcherGames}`
      : sql`COALESCE(cpa.seasons, 0) >= ${m.pitcherSeasons}`;
  const twoWayPass = sql`(
    (cb.g >= ${m.batterGames} AND cb.seasons >= ${m.batterSeasons})
    OR (cpa.g >= ${m.pitcherGames} AND cpa.seasons >= ${m.pitcherSeasons})
  )`;
  return sql`NOT EXISTS (
    SELECT 1 FROM career_batting cb
    FULL JOIN career_pitching_appearances cpa ON cpa.player_id = cb.player_id
    WHERE COALESCE(cb.player_id, cpa.player_id) = p.id
      AND NOT COALESCE(
        CASE
          WHEN cb.player_id IS NULL THEN ${pitcherPass}
          WHEN COALESCE(cpa.g, 0) = 0 THEN ${batterPass}
          WHEN cb.g <= cpa.g THEN ${pitcherPass}
          ELSE ${twoWayPass}
        END,
        FALSE
      )
  )`;
}

/**
 * The league's career games / seasons predicates, or undefined for a
 * dimension that doesn't apply. Single source of truth for the draft board,
 * pick endpoints, batch eligibility filter and FA pool.
 *
 * While both pitcher minimums are 0 (the default), the legacy batter-only
 * predicates are returned unchanged, so existing leagues behave exactly as
 * before (LS-10807 AC). Once either pitcher minimum is set, both dimensions
 * switch to {@link roleSplitCareerCondition}.
 */
export function careerMinimumConditions(
  settings: Pick<
    LeagueEligibilitySettings,
    | 'minCareerGames'
    | 'minCareerSeasons'
    | 'minCareerPitcherGames'
    | 'minCareerPitcherSeasons'
  >,
): { games?: SQL; seasons?: SQL } {
  const m = resolveCareerMinimums(settings);
  if (m.pitcherGames <= 0 && m.pitcherSeasons <= 0) {
    return {
      games:
        m.batterGames > 0 ? careerGamesCondition(m.batterGames) : undefined,
      seasons:
        m.batterSeasons > 0
          ? careerSeasonsCondition(m.batterSeasons)
          : undefined,
    };
  }
  return {
    games:
      m.batterGames > 0 || m.pitcherGames > 0
        ? roleSplitCareerCondition('games', m)
        : undefined,
    seasons:
      m.batterSeasons > 0 || m.pitcherSeasons > 0
        ? roleSplitCareerCondition('seasons', m)
        : undefined,
  };
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

  const career = careerMinimumConditions(settings);

  // 2. Minimum career games
  if (career.games && currentIds.length > 0) {
    const rows = await db.execute(
      sql`
        SELECT p.id AS player_id
        FROM players p
        WHERE p.id = ANY(${sql.param(currentIds)}::integer[])
          AND ${career.games}
      `,
    );

    const eligible = new Set(
      rows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => eligible.has(id));
    excludedByCareerGames = before - currentIds.length;

    LOGGER.info(
      `Min career games filter (≥${formatCareerMinimum(settings.minCareerGames, settings.minCareerPitcherGames)}): ${before} → ${currentIds.length} (excluded ${excludedByCareerGames})`,
    );
  }

  // 3. Minimum career seasons
  if (career.seasons && currentIds.length > 0) {
    // LS-10552: same predicate as the draft board (careerMinimumConditions),
    // reading the precomputed career_batting.seasons instead of re-counting
    // distinct season_batting seasons per batch (LS-4693's grouped CTE).
    const rows = await db.execute(
      sql`
        SELECT p.id AS player_id
        FROM players p
        WHERE p.id = ANY(${sql.param(currentIds)}::integer[])
          AND ${career.seasons}
      `,
    );

    const eligible = new Set(
      rows.rows.map((r: Record<string, unknown>) => Number(r.player_id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => eligible.has(id));
    excludedByCareerSeasons = before - currentIds.length;

    LOGGER.info(
      `Min career seasons filter (≥${formatCareerMinimum(settings.minCareerSeasons, settings.minCareerPitcherSeasons)}): ${before} → ${currentIds.length} (excluded ${excludedByCareerSeasons})`,
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
      const range = getPresetEraRange(eraFilter);
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
