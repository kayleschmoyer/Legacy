import { LOGGER } from '@legacy-sports/logging';
import { clearCache } from '@legacy-sports/pfr-client';
import { loadFootballCareerStats } from '@legacy-sports/data-loaders';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

async function loadSinglePlayer(
  db: PublicDb,
  playerId: number,
  startSeason?: number,
): Promise<{ success: boolean; error?: string }> {
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
    const message = err instanceof Error ? err.message : String(err);
    LOGGER.error(`Player ${playerId} failed: ${message}`);
    return { success: false, error: message };
  }
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
      const errors: Array<{ playerId: number; error: string }> = [];

      for (const [index, pid] of playerIds.entries()) {
        LOGGER.info(`[${index + 1}/${playerIds.length}] Player ${pid}`);
        const result = await loadSinglePlayer(db, pid, startSeason);
        if (!result.success) {
          errors.push({ playerId: pid, error: result.error ?? 'unknown' });
        }
        if ((index + 1) % CACHE_CLEAR_INTERVAL === 0) {
          clearCache();
        }
      }

      LOGGER.info(
        `Batch complete: ${playerIds.length - errors.length}/${playerIds.length} succeeded`,
      );
      if (errors.length > 0) {
        LOGGER.error(
          `${errors.length} player(s) failed:`,
          JSON.stringify(errors),
        );
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
      const errors: Array<{ playerId: number; error: string }> = [];

      for (const [index, p] of batchPlayers.entries()) {
        LOGGER.info(
          `[${index + 1}/${batchPlayers.length}] Player ${p.id} (${p.pfrId ?? 'no pfrId'})`,
        );
        const result = await loadSinglePlayer(db, p.id, startSeason);
        if (!result.success) {
          errors.push({ playerId: p.id, error: result.error ?? 'unknown' });
        }
        if ((index + 1) % CACHE_CLEAR_INTERVAL === 0) {
          clearCache();
        }
      }

      LOGGER.info(
        `Batch complete: ${batchPlayers.length - errors.length}/${batchPlayers.length} succeeded — run again to continue.`,
      );
      if (errors.length > 0) {
        LOGGER.error(
          `${errors.length} player(s) failed:`,
          JSON.stringify(errors),
        );
      }
      // Exit non-zero only when the entire batch failed (e.g. cookie/tunnel
      // down) so callers/CI see the failure. Partial failures are expected for
      // a resumable loader — failed players stay un-stamped and retry next run.
      if (errors.length === batchPlayers.length) {
        process.exit(1);
      }
      return;
    }

    // --- All football players mode ---
    const players = await getFootballPlayers(db);
    LOGGER.info(
      `Loading football career stats for all ${players.length} football players`,
    );
    const errors: Array<{ playerId: number; error: string }> = [];

    for (const [index, p] of players.entries()) {
      LOGGER.info(
        `[${index + 1}/${players.length}] Player ${p.id} (${p.pfrId ?? 'no pfrId'})`,
      );

      if (!p.pfrId) {
        LOGGER.warn(`Skipping player ${p.id} — no pfrId`);
        continue;
      }

      const result = await loadSinglePlayer(db, p.id, startSeason);
      if (!result.success) {
        errors.push({ playerId: p.id, error: result.error ?? 'unknown' });
      }

      if ((index + 1) % CACHE_CLEAR_INTERVAL === 0) {
        clearCache();
      }
    }

    LOGGER.info(
      `All-players load complete: ${players.length - errors.length}/${players.length} succeeded`,
    );
    if (errors.length > 0) {
      LOGGER.error(
        `${errors.length} player(s) failed:`,
        JSON.stringify(errors),
      );
    }
  });
}
