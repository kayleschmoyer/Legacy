import { and, eq, sql } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { PublicDb, PublicSchema, runWithPublicClient } from '../index';

/**
 * Shared utilities for draft operations
 * Used by both DraftService (coordinator) and draft-processor lambda (worker)
 */

export const VALID_DRAFT_MODES = ['live', 'automated'] as const;
export type DraftMode = (typeof VALID_DRAFT_MODES)[number];

export const VALID_SELECTION_METHODS = [
  'standard',
  'auction',
  'random',
] as const;
export type SelectionMethod = (typeof VALID_SELECTION_METHODS)[number];

export const VALID_DRAFT_ORDERS = ['snake', 'linear'] as const;
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
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
        } as Partial<typeof PublicSchema.leagues.$inferInsert>)
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
        inviteCode: PublicSchema.leagues.inviteCode,
        playerPool: PublicSchema.leagues.playerPool,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    if (result.length === 0) {
      throw new Error(`League ${leagueId} not found`);
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
  /** 'all' | 'nl' | 'al' — restricts to players who appeared in that league */
  playerPool: string;
  /** Minimum total career games (batting + pitching) a player must have */
  minCareerGames: number;
  /** Minimum distinct seasons a player must have appeared in */
  minCareerSeasons: number;
  /** When true, restrict to Hall of Fame players only */
  hofOnly?: boolean;
  /** Era filter ('all' or named era or 'custom') */
  eraFilter?: string;
  /** Start year for custom era filter */
  customEraStartYear?: number | null;
  /** End year for custom era filter */
  customEraEndYear?: number | null;
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
 * Check whether a single player passes the league's player-pool restriction.
 *
 * Use this in the live-draft `makeDraftPick` path where you validate one
 * player at a time inside a transaction.
 */
export async function isPlayerInPool(
  db: PublicDb,
  playerId: number,
  playerPool: string,
): Promise<boolean> {
  if (playerPool === 'all') return true;

  // Check both batting AND pitching records so that pure pitchers (who have
  // no season_batting rows in the DH era) are correctly included in their pool.
  const poolUpper = playerPool.toUpperCase();
  const result = await db.execute(
    sql`SELECT 1 FROM (
          SELECT player_id FROM season_batting
            WHERE player_id = ${playerId} AND lg_id = ${poolUpper}
          UNION
          SELECT player_id FROM season_pitching
            WHERE player_id = ${playerId} AND lg_id = ${poolUpper}
        ) pool_check
        LIMIT 1`,
  );
  return result.rows.length > 0;
}

/**
 * Check whether a single player meets the minimum career games threshold.
 */
export async function playerMeetsMinCareerGames(
  db: PublicDb,
  playerId: number,
  minCareerGames: number,
): Promise<boolean> {
  if (minCareerGames <= 0) return true;

  const result = await db.execute(
    sql`SELECT total_games FROM players WHERE id = ${playerId}`,
  );
  return Number(result.rows[0]?.total_games ?? 0) >= minCareerGames;
}

/**
 * Check whether a single player meets the minimum career seasons threshold.
 */
export async function playerMeetsMinCareerSeasons(
  db: PublicDb,
  playerId: number,
  minCareerSeasons: number,
): Promise<boolean> {
  if (minCareerSeasons <= 0) return true;

  const result = await db.execute(
    sql`SELECT COUNT(DISTINCT season) AS season_count
        FROM (
          SELECT season FROM season_batting  WHERE player_id = ${playerId}
          UNION
          SELECT season FROM season_pitching WHERE player_id = ${playerId}
        ) s`,
  );
  return Number(result.rows[0]?.season_count ?? 0) >= minCareerSeasons;
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
        SELECT p.id AS player_id,
               p.total_games
        FROM players p
        WHERE p.id = ANY(${sql.param(currentIds)}::integer[])
      `,
    );

    const eligible = new Set(
      rows.rows
        .filter(
          (r: Record<string, unknown>) =>
            Number(r.total_games) >= settings.minCareerGames,
        )
        .map((r: Record<string, unknown>) => Number(r.player_id)),
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
    const rows = await db.execute(
      sql`
        SELECT player_id, COUNT(DISTINCT season) AS season_count
        FROM (
          SELECT player_id, season FROM season_batting  WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
          UNION
          SELECT player_id, season FROM season_pitching WHERE player_id = ANY(${sql.param(currentIds)}::integer[])
        ) all_seasons
        GROUP BY player_id
      `,
    );

    const eligible = new Set(
      rows.rows
        .filter(
          (r: Record<string, unknown>) =>
            Number(r.season_count) >= settings.minCareerSeasons,
        )
        .map((r: Record<string, unknown>) => Number(r.player_id)),
    );
    const before = currentIds.length;
    currentIds = currentIds.filter((id) => eligible.has(id));
    excludedByCareerSeasons = before - currentIds.length;

    LOGGER.info(
      `Min career seasons filter (≥${settings.minCareerSeasons}): ${before} → ${currentIds.length} (excluded ${excludedByCareerSeasons})`,
    );
  }

  // 4. Hall of Fame filter
  if (settings.hofOnly && currentIds.length > 0) {
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
  const eraFilter = settings.eraFilter;
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
 * drafts row and setting `draftStatus = 'completed'` on the leagues row.
 *
 * When `db` is a transaction object (e.g. inside commitDraftPick), both writes
 * share that transaction and are fully atomic.  When called standalone (e.g.
 * from draft-processor), wrap the call in `db.transaction(async (tx) => …)`
 * to achieve the same atomicity guarantee.
 *
 * Shared by:
 *  - commitDraftPick (lambdas/db) — passes its caller-supplied tx
 *  - draft-processor lambda — wraps in its own db.transaction()
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
    .set({ draftStatus: 'completed' } as Partial<
      typeof PublicSchema.leagues.$inferInsert
    >)
    .where(eq(PublicSchema.leagues.id, leagueId));

  LOGGER.info(
    'Draft finalized: draftCompletedAt stamped and draftStatus set to completed',
    {
      leagueId,
    },
  );
}
