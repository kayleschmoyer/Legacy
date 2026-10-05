import { LOGGER } from '@legacy-sports/logging';
import { clearCache, isPfrForbiddenError } from '@legacy-sports/pfr-client';
import { loadFootballCareerStats } from '@legacy-sports/data-loaders';
import {
  PublicDb,
  PublicSchema,
  refreshFootballPlayerEligiblePositions,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { toError } from '../utils/errors';

export interface HandleLoadFootballCareerArgs {
  playerId?: number;
  all?: boolean;
  batch?: string;
  /**
   * Load the next N un-fetched players, prioritizing never-fetched first then
   * oldest (mirrors the baseball `--prioritize-new` flow). Resumable: the
   * loader stamps stats_last_fetched_at, so repeated runs continue forward.
   */
  limit?: number;
  startSeason?: number;
}

const CACHE_CLEAR_INTERVAL = 50;

// Number of consecutive player failures that trigger an early abort instead of
// grinding through the rest of the list. A run of back-to-back failures is
// almost always one systemic cause (expired PFR_CF_CLEARANCE, DB connection
// dropped, PFR down) rather than N independent per-player problems, and every
// further attempt just burns time producing the same error.
const FAILURE_STREAK_THRESHOLD = 4;

const AUTH_EXPIRED_MESSAGE =
  'PFR auth appears to have expired — refresh PFR_CF_CLEARANCE and re-run.';

interface PlayerLoadResult {
  success: boolean;
  error?: string;
  /**
   * The thrown Error itself, kept so the run summary can forward it to Rollbar
   * as a first-class argument (stack trace intact) rather than only its
   * flattened message string.
   */
  errorInstance?: Error;
  isAuthError?: boolean;
}

/**
 * Tracks consecutive failures across a loop of `loadSinglePlayer` calls so a
 * systemic outage aborts the run instead of repeating per player. A success
 * resets the streak, so scattered per-player errors never trigger an abort.
 *
 * The streak is deliberately failure-class agnostic (LS-8431): an earlier fix
 * only counted 403s, which left a dropped DB connection to fail every
 * remaining player — 20+ identical errors in a single second, one Rollbar
 * occurrence each, until Rollbar's per-minute cap started dropping *real*
 * errors (LS-8571). Auth is still tracked separately, but only to pick a more
 * actionable operator message.
 */
class FailureStreakTracker {
  private consecutiveFailures = 0;
  private failureCount = 0;
  private sawAuthFailure = false;
  private firstError: string | undefined;
  private firstErrorInstance: Error | undefined;

  /** Records a result; returns true once the abort threshold is reached. */
  record(result: PlayerLoadResult): boolean {
    if (result.success) {
      this.consecutiveFailures = 0;
      return false;
    }
    this.consecutiveFailures++;
    this.failureCount++;
    this.sawAuthFailure ||= result.isAuthError === true;
    this.firstError ??= result.error;
    this.firstErrorInstance ??= result.errorInstance;
    return this.consecutiveFailures >= FAILURE_STREAK_THRESHOLD;
  }

  get hasFailures(): boolean {
    return this.failureCount > 0;
  }

  /**
   * The single operator-facing line describing what went wrong this run.
   * Auth expiry gets its own message because the remedy is specific; anything
   * else reports the count plus the first error as a representative sample.
   */
  get summaryMessage(): string {
    if (this.sawAuthFailure) return AUTH_EXPIRED_MESSAGE;
    return (
      `${this.failureCount} player(s) failed — first error: ` +
      `${this.firstError ?? 'unknown'}`
    );
  }

  /**
   * The first failing Error, forwarded alongside {@link summaryMessage} so
   * Rollbar receives a real stack trace (RollbarOutputDestination picks the
   * first Error argument), not just the flattened message text.
   */
  get representativeError(): Error | undefined {
    return this.firstErrorInstance;
  }
}

async function getFootballPlayers(db: PublicDb) {
  return await db
    .select()
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.sport, 'football'));
}

/**
 * Select the next `limit` football players to load, prioritizing those never
 * fetched (stats_last_fetched_at IS NULL, ordered first) then the oldest. Only
 * players with a pfrId are eligible. Backed by the timestamp the loader stamps,
 * this makes `--limit` a resumable "load the next batch" command.
 */
async function getFootballPlayersPrioritized(db: PublicDb, limit: number) {
  return await db
    .select()
    .from(PublicSchema.players)
    .where(
      and(
        eq(PublicSchema.players.sport, 'football'),
        isNotNull(PublicSchema.players.pfrId),
      ),
    )
    .orderBy(sql`stats_last_fetched_at ASC NULLS FIRST`)
    .limit(limit);
}

/**
 * Refresh football_player_eligible_positions once per run (LS-10553) — the
 * stat-inferred QB/K branches read career_football_passing / _kicking, which
 * this command writes. Non-fatal: stale eligibility beats a failed load.
 */
async function refreshEligiblePositions(db: PublicDb): Promise<void> {
  try {
    await refreshFootballPlayerEligiblePositions(db);
    LOGGER.info('football_player_eligible_positions refreshed.');
  } catch (refreshError) {
    LOGGER.error(
      'Failed to refresh football_player_eligible_positions:',
      toError(refreshError),
    );
  }
}

async function loadSinglePlayer(
  db: PublicDb,
  playerId: number,
  startSeason?: number,
): Promise<PlayerLoadResult> {
  try {
    const result = await loadFootballCareerStats(db, playerId, startSeason);
    LOGGER.info(
      `Player ${playerId} (${result.pfrId}): ` +
        (result.groupsUpserted.length > 0
          ? `upserted [${result.groupsUpserted.join(', ')}]`
          : 'no stat groups found'),
    );
    return { success: true };
  } catch (err) {
    const errorInstance = err instanceof Error ? err : new Error(String(err));
    const message = errorInstance.message;
    // Per-player failures are logged at `warn`, never `error`: a batch run
    // fails player-by-player from one systemic cause, and `error` is the level
    // forwarded to Rollbar (RollbarOutputDestination.shouldLog), so logging
    // each one at `error` turns a single outage into N Rollbar occurrences.
    // That flood is what tripped Rollbar's per-minute item cap and caused real
    // errors to be dropped (LS-8431 / LS-8571). The caller emits exactly one
    // `error`-level summary per run instead — see runPlayerBatch.
    LOGGER.warn(`Player ${playerId} failed: ${message}`);
    return {
      success: false,
      error: message,
      errorInstance,
      isAuthError: isPfrForbiddenError(err),
    };
  }
}

interface BatchPlayer {
  id: number;
  pfrId: string | null;
}

interface BatchOutcome {
  attempted: number;
  failed: number;
  /** True when the loop stopped early on a consecutive-failure streak. */
  aborted: boolean;
}

/**
 * Runs `loadSinglePlayer` over `players`, aborting on a consecutive-failure
 * streak and emitting exactly one `error`-level line for the whole run.
 *
 * Shared by every batch mode (--batch, --limit, --all) so the fail-fast and
 * Rollbar-noise behaviour can't drift between them — before LS-8431 the loop
 * was copy-pasted three times.
 *
 * `skipWithoutPfrId` mirrors --all mode, which iterates every football player
 * including those that have no PFR id to fetch.
 */
async function runPlayerBatch(
  db: PublicDb,
  players: BatchPlayer[],
  startSeason: number | undefined,
  { skipWithoutPfrId = false }: { skipWithoutPfrId?: boolean } = {},
): Promise<BatchOutcome> {
  const tracker = new FailureStreakTracker();
  let attempted = 0;
  let failed = 0;
  let aborted = false;

  for (const [index, player] of players.entries()) {
    LOGGER.info(
      `[${index + 1}/${players.length}] Player ${player.id}` +
        (player.pfrId ? ` (${player.pfrId})` : ''),
    );

    if (skipWithoutPfrId && !player.pfrId) {
      LOGGER.warn(`Skipping player ${player.id} — no pfrId`);
      continue;
    }

    attempted++;
    const result = await loadSinglePlayer(db, player.id, startSeason);
    if (!result.success) failed++;

    if (tracker.record(result)) {
      aborted = true;
      LOGGER.error(
        `Aborting after ${FAILURE_STREAK_THRESHOLD} consecutive failures. ` +
          tracker.summaryMessage,
        ...(tracker.representativeError ? [tracker.representativeError] : []),
      );
      break;
    }

    if ((index + 1) % CACHE_CLEAR_INTERVAL === 0) {
      clearCache();
    }
  }

  if (attempted > failed) {
    await refreshEligiblePositions(db);
  }

  // One `error`-level line per run — the only signal that reaches Rollbar.
  // Skipped when the abort above already logged it, so a run never
  // double-alerts.
  if (!aborted && tracker.hasFailures) {
    LOGGER.error(
      tracker.summaryMessage,
      ...(tracker.representativeError ? [tracker.representativeError] : []),
    );
  }

  return { attempted, failed, aborted };
}

export async function handleLoadFootballCareer(
  args: HandleLoadFootballCareerArgs,
): Promise<void> {
  const { playerId, all, batch, limit, startSeason } = args;

  if (!playerId && !all && !batch && limit === undefined) {
    LOGGER.error('One of --player-id, --all, --batch, or --limit is required');
    process.exit(1);
  }

  // Validate --limit up front so an invalid value (NaN/0/negative) fails loudly
  // instead of being falsy and silently falling through to all-players mode.
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    LOGGER.error(`--limit must be a positive integer (received: ${limit})`);
    process.exit(1);
  }

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db: PublicDb) => {
    // --- Single player mode ---
    if (playerId) {
      LOGGER.info(`Loading football career stats for player ${playerId}`);
      const { success, error } = await loadSinglePlayer(
        db,
        playerId,
        startSeason,
      );
      if (!success) {
        LOGGER.error(`Failed: ${error}`);
        process.exit(1);
      }
      await refreshEligiblePositions(db);
      return;
    }

    // --- Batch file mode ---
    if (batch) {
      const resolvedBatchPath = resolve(process.cwd(), batch);
      const raw = readFileSync(resolvedBatchPath, 'utf8');
      const playerIds: number[] = [];
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line, index) => {
          const parsed = parseInt(line, 10);
          if (isNaN(parsed)) {
            LOGGER.warn(
              `Skipping malformed player ID in batch file at line ${index + 1}: "${line}"`,
            );
          } else {
            playerIds.push(parsed);
          }
        });

      LOGGER.info(
        `Loading football career stats for ${playerIds.length} players from ${batch}`,
      );
      const outcome = await runPlayerBatch(
        db,
        playerIds.map((id) => ({ id, pfrId: null })),
        startSeason,
      );

      LOGGER.info(
        `Batch complete: ${outcome.attempted - outcome.failed}/${playerIds.length} succeeded`,
      );
      if (outcome.aborted) {
        process.exit(1);
      }
      return;
    }

    // --- Prioritized batch mode (--limit): the next N un-fetched players ---
    if (limit !== undefined) {
      const batchPlayers = await getFootballPlayersPrioritized(db, limit);
      if (batchPlayers.length === 0) {
        LOGGER.info('No football players with a pfrId to load.');
        return;
      }
      LOGGER.info(
        `Loading next ${batchPlayers.length} football player(s) ` +
          '(never-fetched first, then oldest)',
      );
      const outcome = await runPlayerBatch(db, batchPlayers, startSeason);

      LOGGER.info(
        `Batch complete: ${outcome.attempted - outcome.failed}/${batchPlayers.length} succeeded — run again to continue.`,
      );
      // Exit non-zero when the entire batch failed (e.g. cookie/tunnel down)
      // or the loop aborted early on a failure streak — either way callers/CI
      // must see the failure. Partial failures with no abort are expected for
      // a resumable loader — failed players stay un-stamped and retry next
      // run.
      if (outcome.failed === batchPlayers.length || outcome.aborted) {
        process.exit(1);
      }
      return;
    }

    // --- All football players mode ---
    const players = await getFootballPlayers(db);
    LOGGER.info(
      `Loading football career stats for all ${players.length} football players`,
    );
    const outcome = await runPlayerBatch(db, players, startSeason, {
      skipWithoutPfrId: true,
    });

    LOGGER.info(
      `All-players load complete: ${outcome.attempted - outcome.failed}/${outcome.attempted} succeeded`,
    );
    if (outcome.aborted) {
      process.exit(1);
    }
  });
}
