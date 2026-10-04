import type {
  CareerStats as PfrCareerStats,
  PfrPlayer,
} from '@legacy-sports/pfr-client';
import { LOGGER } from '@legacy-sports/logging';

import type {
  StoredGameFootballKicking,
  StoredGameFootballPassing,
  StoredGameFootballReceiving,
  StoredGameFootballRushing,
} from './types';
import { getPfaPlayerSeasonPayload } from './s3-store';

/**
 * PFA (1960-1998) read path. LS-9997.
 *
 * THIS IS THE PFA HALF ONLY. It is deliberately not wired into any
 * season-boundary router: nothing here picks PFA vs nflverse by season, and
 * `lambdas/stats-lambda/src/load-football-game.ts` does not call it yet. The
 * routing (1960-1998 -> this, 1999+ -> `CareerStats`/`IDPStats`/`TeamDefense`
 * in `./provider`) is LS-10214's job.
 *
 * Unlike the nflverse provider, a miss does NOT fall back to
 * `@legacy-sports/pfr-client`: PFR 403s every scripted request (LS-9908), so a
 * fallback could never succeed from a server. A miss is returned as `null` so
 * the caller can record "no game data" explicitly.
 *
 * Coverage gaps (permanent, not bugs — ADR 0022, LS-9948):
 * - `fumbles` is always `null` (unknown), never `0`. PFA tracks no fumbles.
 * - There is no PFA equivalent of `IDPStats.getGameLog` or
 *   `TeamDefense.getGameLog`: no pre-1999 per-game IDP tackles exist from any
 *   source, and team defense is not staged in the PFA corpus.
 */

/*
 * Rebuild every row field-by-field so a key the ingest left out of the JSON
 * comes back as `null` instead of `undefined`. That matters most for
 * `fumbles`: it must reach the database as NULL, never be coerced to 0.
 */
function passingRow(row: StoredGameFootballPassing, playerId: number) {
  return {
    playerId,
    season: row.season,
    gameNum: row.gameNum,
    gameIdentifier: row.gameIdentifier,
    cmp: row.cmp ?? null,
    att: row.att ?? null,
    yds: row.yds ?? null,
    td: row.td ?? null,
    int: row.int ?? null,
    sacked: row.sacked ?? null,
    sackYds: row.sackYds ?? null,
    rating: row.rating ?? null,
  };
}

function rushingRow(row: StoredGameFootballRushing, playerId: number) {
  return {
    playerId,
    season: row.season,
    gameNum: row.gameNum,
    gameIdentifier: row.gameIdentifier,
    att: row.att ?? null,
    yds: row.yds ?? null,
    td: row.td ?? null,
    lng: row.lng ?? null,
    fumbles: row.fumbles ?? null,
  };
}

function receivingRow(row: StoredGameFootballReceiving, playerId: number) {
  return {
    playerId,
    season: row.season,
    gameNum: row.gameNum,
    gameIdentifier: row.gameIdentifier,
    rec: row.rec ?? null,
    tgt: row.tgt ?? null,
    yds: row.yds ?? null,
    td: row.td ?? null,
    lng: row.lng ?? null,
    fumbles: row.fumbles ?? null,
  };
}

function kickingRow(row: StoredGameFootballKicking, playerId: number) {
  return {
    playerId,
    season: row.season,
    gameNum: row.gameNum,
    gameIdentifier: row.gameIdentifier,
    fgm: row.fgm ?? null,
    fga: row.fga ?? null,
    fg019m: row.fg019m ?? null,
    fg019a: row.fg019a ?? null,
    fg2029m: row.fg2029m ?? null,
    fg2029a: row.fg2029a ?? null,
    fg3039m: row.fg3039m ?? null,
    fg3039a: row.fg3039a ?? null,
    fg4049m: row.fg4049m ?? null,
    fg4049a: row.fg4049a ?? null,
    fg50m: row.fg50m ?? null,
    fg50a: row.fg50a ?? null,
    xpm: row.xpm ?? null,
    xpa: row.xpa ?? null,
    lng: row.lng ?? null,
  };
}

/**
 * Passing/rushing/receiving/kicking game log for a 1960-1998 player-season,
 * in the same `GameLog` shape `CareerStats.getGameLog` returns.
 *
 * Returns `null` ("no data") when the corpus has no object for the
 * player-season: a crosswalk miss, no games that season, a season outside
 * 1960-1998, or no `FOOTBALL_CORPUS_S3_BUCKET` configured. It never returns
 * an empty-but-truthy log for a miss.
 *
 * Throws when S3 fails with anything other than a 404, or when the object
 * exists but is malformed (`PfaPayloadError`).
 */
async function getPfaCareerGameLog(
  player: PfrPlayer,
  season: number,
): Promise<PfrCareerStats.GameLog | null> {
  const payload = await getPfaPlayerSeasonPayload(player.pfrId, season);
  if (payload === null) return null;

  LOGGER.debug(
    `PFA S3 HIT for ${player.pfrId} ${season} (passing=${payload.passing.length}, rushing=${payload.rushing.length}, receiving=${payload.receiving.length}, kicking=${payload.kicking.length})`,
  );

  return {
    passing: payload.passing.map((row) => passingRow(row, player.id)),
    rushing: payload.rushing.map((row) => rushingRow(row, player.id)),
    receiving: payload.receiving.map((row) => receivingRow(row, player.id)),
    kicking: payload.kicking.map((row) => kickingRow(row, player.id)),
  };
}

export const PfaCareerStats = { getGameLog: getPfaCareerGameLog };
