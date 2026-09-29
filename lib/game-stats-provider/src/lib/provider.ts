import {
  getAllGameBattingStats as scrapeAllGameBattingStats,
  getAllGameFieldingStats as scrapeAllGameFieldingStats,
  getAllGamePitchingStats as scrapeAllGamePitchingStats,
} from '@legacy-sports/bref-client';
import type {
  GameBatting,
  GameFielding,
  GamePitching,
  Player,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';

import { getSeasonPayload } from './s3-store';

/**
 * Game-level baseball stats, sourced from the Retrosheet corpus staged in S3
 * with a Baseball Reference fallback.
 *
 * These three functions are deliberate drop-in replacements for the
 * identically-named exports of `@legacy-sports/bref-client`: both the stats
 * Lambda (`player-stats-loader.ts`) and the CLI (`loadGameStats.ts`) import
 * that trio, so swapping the import converts both call sites.
 *
 * Why this exists: the scraper is capped at 15 requests/minute GLOBALLY (an
 * in-process limiter in `BRefSession`, made global by
 * `reserved_concurrent_executions = 1`), which ceilings the whole pipeline at
 * roughly 37 matchups/hour. Retrosheet is static files, so the cap disappears
 * for the ~95% of player-seasons it covers. See LS-9809 / LS-9817.
 *
 * Coverage: Retrosheet's processed CSVs span 1897-2025. Pre-1897 player-seasons
 * are absent and fall through to the scraper, which is why the fallback is
 * permanent rather than a migration shim.
 */

async function loadPayload(player: Player, season: number) {
  if (!player.brefId) {
    return null;
  }
  const payload = await getSeasonPayload(player.brefId, season);
  // Defence in depth (LS-10230): the ingest never writes a payload with no
  // batting and no pitching, but if one exists, serving it would record the
  // player-season as having no games. Treat it as a miss so the scraper runs.
  if (
    payload !== null &&
    payload.batting.length === 0 &&
    payload.pitching.length === 0
  ) {
    LOGGER.warn(
      `Retrosheet payload for ${player.brefId} ${season} has no batting or pitching rows; falling back to Baseball Reference`,
    );
    return null;
  }
  return payload;
}

export async function getAllGameBattingStats(
  player: Player,
  season: number,
): Promise<GameBatting[]> {
  const payload = await loadPayload(player, season);
  if (payload === null) {
    return scrapeAllGameBattingStats(player, season);
  }
  return payload.batting.map((row) => ({ ...row, playerId: player.id }));
}

export async function getAllGamePitchingStats(
  player: Player,
  season: number,
): Promise<GamePitching[]> {
  const payload = await loadPayload(player, season);
  if (payload === null) {
    return scrapeAllGamePitchingStats(player, season);
  }
  // `outsRecorded` is intentionally absent: Postgres GENERATES it from `ip`,
  // so including it in an INSERT is rejected. The cast mirrors how the
  // scraper's `parseRow` builds these rows.
  return payload.pitching.map(
    (row) => ({ ...row, playerId: player.id }) as GamePitching,
  );
}

export async function getAllGameFieldingStats(
  player: Player,
  season: number,
  pos: string,
): Promise<GameFielding[]> {
  const payload = await loadPayload(player, season);
  if (payload === null) {
    // Preserve the scraper's existing contract exactly, including its
    // return-empty-when-position-is-missing behaviour.
    return scrapeAllGameFieldingStats(player, season, pos);
  }

  // The `pos` argument is intentionally unused on this path. The scraper needs
  // it because Baseball Reference publishes one fielding game-log PER
  // POSITION, so it cannot fetch anything without knowing which to request —
  // and returns [] when the caller has no position, which is why
  // `game_fielding` has never been populated. Retrosheet carries every
  // position, already aggregated to one row per player-game at ingest, so the
  // position is neither needed nor a filter here.
  if (!pos) {
    LOGGER.debug(
      `Serving fielding for ${player.brefId} ${season} from Retrosheet despite absent position (scraper would have returned [])`,
    );
  }
  return payload.fielding.map((row) => ({ ...row, playerId: player.id }));
}
