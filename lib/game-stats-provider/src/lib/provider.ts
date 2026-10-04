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

// Retrosheet and Baseball Reference share the `TTTYYYYMMDDG` game id format.
const GAME_IDENTIFIER_YEAR = /^\w{3}(\d{4})\d{4}\d$/;

/**
 * Drop rows whose game_identifier year is not the requested season (LS-10395).
 *
 * The scraper stamps every row with the season it ASKED for, but takes the
 * game_identifier from the page Baseball Reference actually SERVED. When BBRef
 * has no game log for the requested year it serves another year's log
 * instead, so rows for (say) 1898 games got cached under seasons 1884-1897.
 * Those rows are then picked as that season's games in matchups. Filtering
 * here covers both sources and both call sites (stats Lambda and CLI). A row
 * whose id cannot be parsed is dropped too, since its season cannot be
 * verified.
 */
function dropWrongSeasonRows<T extends { gameIdentifier: string }>(
  rows: T[],
  player: Player,
  season: number,
  statType: 'batting' | 'pitching' | 'fielding',
): T[] {
  const kept: T[] = [];
  const dropped: string[] = [];
  for (const row of rows) {
    if (GAME_IDENTIFIER_YEAR.exec(row.gameIdentifier)?.[1] === String(season)) {
      kept.push(row);
    } else {
      dropped.push(row.gameIdentifier);
    }
  }
  if (dropped.length > 0) {
    LOGGER.warn(
      `Dropped ${dropped.length} of ${rows.length} ${statType} rows for ${player.brefId} ${season} whose game_identifier is not from ${season}. Samples: ${dropped.slice(0, 3).join(', ')}`,
    );
  }
  return kept;
}

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
  const rows =
    payload === null
      ? await scrapeAllGameBattingStats(player, season)
      : payload.batting.map((row) => ({ ...row, playerId: player.id }));
  return dropWrongSeasonRows(rows, player, season, 'batting');
}

export async function getAllGamePitchingStats(
  player: Player,
  season: number,
): Promise<GamePitching[]> {
  const payload = await loadPayload(player, season);
  // `outsRecorded` is intentionally absent: Postgres GENERATES it from `ip`,
  // so including it in an INSERT is rejected. The cast mirrors how the
  // scraper's `parseRow` builds these rows.
  const rows =
    payload === null
      ? await scrapeAllGamePitchingStats(player, season)
      : payload.pitching.map(
          (row) => ({ ...row, playerId: player.id }) as GamePitching,
        );
  return dropWrongSeasonRows(rows, player, season, 'pitching');
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
    return dropWrongSeasonRows(
      await scrapeAllGameFieldingStats(player, season, pos),
      player,
      season,
      'fielding',
    );
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
  return dropWrongSeasonRows(
    payload.fielding.map((row) => ({ ...row, playerId: player.id })),
    player,
    season,
    'fielding',
  );
}
