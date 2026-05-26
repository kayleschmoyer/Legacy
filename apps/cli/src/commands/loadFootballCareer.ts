import { LOGGER } from '@legacy-sports/logging';
import { clearCache } from '@legacy-sports/pfr-client';
import { loadFootballCareerStats } from '@legacy-sports/data-loaders';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface HandleLoadFootballCareerArgs {
  playerId?: number;
  all?: boolean;
  batch?: string;
  startSeason?: number;
}

const CACHE_CLEAR_INTERVAL = 50;

async function getFootballPlayers(db: PublicDb) {
  return await db
    .select()
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.sport, 'football'));
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
  const { playerId, all, batch, startSeason } = args;

  if (!playerId && !all && !batch) {
    LOGGER.error('One of --player-id, --all, or --batch is required');
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
