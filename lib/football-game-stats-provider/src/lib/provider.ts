import {
  type GameFootballDefense,
  type GameFootballDefenseIdp,
  CareerStats as PfrCareerStats,
  IDPStats as PfrIDPStats,
  type PfrPlayer,
  TeamDefense as PfrTeamDefense,
} from '@legacy-sports/pfr-client';
import { LOGGER } from '@legacy-sports/logging';

import {
  getPlayerSeasonPayload,
  getTeamDefenseSeasonPayload,
} from './s3-store';

/**
 * Game-level football stats, sourced from the nflverse corpus staged in S3
 * (1999-2025) with a `@legacy-sports/pfr-client` fallback.
 *
 * `CareerStats`, `IDPStats` and `TeamDefense` here are deliberate drop-in
 * replacements for the identically-named namespaces in
 * `@legacy-sports/pfr-client` — `lambdas/stats-lambda/src/load-football-game.ts`
 * imports `{ CareerStats, IDPStats, TeamDefense }` from that package today,
 * so swapping the import source is the whole migration. Mirrors
 * `@legacy-sports/game-stats-provider`'s relationship to
 * `@legacy-sports/bref-client` (LS-9817).
 *
 * Why this exists: PFR sits behind a Cloudflare bot wall that 403s every
 * scripted request, and Sports Reference's terms of use prohibit building a
 * derived corpus from their content at any rate (LS-9908 spike; ADR 0022).
 * nflverse is CC-BY-4.0 and covers the same 1999-2025 range, derived from
 * play-by-play data instead. See `NFLVERSE_ATTRIBUTION` in `./types` for the
 * attribution notice its license requires.
 *
 * Coverage: nflverse covers 1999-2025. Seasons outside that range, and any
 * 1999+ player nflverse's `pfr_id` crosswalk does not resolve, fall through
 * to the scraper — the fallback is permanent, not a migration shim, the same
 * shape as the PFA half of this corpus for 1960-1998 (LS-9948).
 */

async function getCareerGameLog(
  player: PfrPlayer,
  season: number,
): Promise<PfrCareerStats.GameLog> {
  const payload = await getPlayerSeasonPayload(player.pfrId, season);
  if (payload === null) {
    return PfrCareerStats.getGameLog(player, season);
  }

  LOGGER.debug(
    `nflverse S3 HIT for ${player.pfrId} ${season} (passing=${payload.passing.length}, rushing=${payload.rushing.length}, receiving=${payload.receiving.length}, kicking=${payload.kicking.length})`,
  );

  return {
    passing: payload.passing.map((row) => ({ ...row, playerId: player.id })),
    rushing: payload.rushing.map((row) => ({ ...row, playerId: player.id })),
    receiving: payload.receiving.map((row) => ({
      ...row,
      playerId: player.id,
    })),
    kicking: payload.kicking.map((row) => ({ ...row, playerId: player.id })),
  };
}

export const CareerStats = { getGameLog: getCareerGameLog };

async function getIdpGameLog(
  player: PfrPlayer,
  season: number,
): Promise<GameFootballDefenseIdp[]> {
  const payload = await getPlayerSeasonPayload(player.pfrId, season);
  if (payload === null) {
    return PfrIDPStats.getGameLog(player, season);
  }

  LOGGER.debug(
    `nflverse S3 HIT for IDP ${player.pfrId} ${season} (${payload.defenseIdp.length} games)`,
  );

  return payload.defenseIdp.map((row) => ({ ...row, playerId: player.id }));
}

export const IDPStats = { getGameLog: getIdpGameLog };

async function getTeamDefenseGameLog(
  player: PfrPlayer,
  nflTeam: string,
  season: number,
): Promise<GameFootballDefense[]> {
  const payload = await getTeamDefenseSeasonPayload(nflTeam, season);
  if (payload === null) {
    return PfrTeamDefense.getGameLog(player, nflTeam, season);
  }

  LOGGER.debug(
    `nflverse S3 HIT for team defense ${nflTeam} ${season} (${payload.games.length} games)`,
  );

  return payload.games.map((row) => ({ ...row, playerId: player.id }));
}

export const TeamDefense = { getGameLog: getTeamDefenseGameLog };
