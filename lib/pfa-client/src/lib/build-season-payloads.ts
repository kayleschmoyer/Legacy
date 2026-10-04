import type {
  StoredGameFootballKicking,
  StoredGameFootballPassing,
  StoredGameFootballReceiving,
  StoredGameFootballRushing,
} from './s3-payload';
import type { PfaBoxScore, PfaKickerGameLogRow } from './types';

/**
 * Accumulates per-(pfaId, season) rows across a full crawl, one call to
 * {@link accumulateBoxScore} per parsed box score and one call to
 * {@link accumulateKickerGameLog} per parsed kicker game log. Pure and I/O
 * free so it's unit-testable without a live crawl — the ingest command
 * (`apps/cli/src/commands/ingestPfaFootball.ts`) owns all fetching and
 * feeds parsed results in here.
 *
 * `gameNum` is assigned incrementally as rows are pushed (the caller must
 * feed box scores in chronological order — the season index page already
 * returns them that way), mirroring `assignGameNumbers` in
 * `@legacy-sports/football-game-stats-provider`'s `transform.ts`: only
 * games with real activity in a category count toward that category's
 * numbering, so a receiver's 3rd game with a catch might be the whole
 * team's 5th game of the season.
 */
export interface PfaIngestAccumulator {
  passing: Map<string, Map<number, StoredGameFootballPassing[]>>;
  rushing: Map<string, Map<number, StoredGameFootballRushing[]>>;
  receiving: Map<string, Map<number, StoredGameFootballReceiving[]>>;
  kicking: Map<string, Map<number, StoredGameFootballKicking[]>>;
}

export function createAccumulator(): PfaIngestAccumulator {
  return {
    passing: new Map(),
    rushing: new Map(),
    receiving: new Map(),
    kicking: new Map(),
  };
}

function pushRow<T>(
  byPfaId: Map<string, Map<number, T[]>>,
  pfaId: string,
  season: number,
  buildRow: (gameNum: number) => T,
): void {
  let bySeason = byPfaId.get(pfaId);
  if (!bySeason) {
    bySeason = new Map();
    byPfaId.set(pfaId, bySeason);
  }
  let rows = bySeason.get(season);
  if (!rows) {
    rows = [];
    bySeason.set(season, rows);
  }
  rows.push(buildRow(rows.length + 1));
}

/**
 * Folds one parsed box score's per-player stat lines into the accumulator.
 * Only categories with a `game_football_*` destination table are staged
 * (passing/rushing/receiving) — see `s3-payload.ts`'s doc comment for why
 * punting/returns/interceptions are parsed but not stored.
 *
 * `fumbles` is always written `null`, never computed — PFA carries no
 * fumbles data in any table for any era (confirmed permanent gap, accepted
 * 2026-09-09 on LS-9948), so there is nothing to derive it from.
 */
export function accumulateBoxScore(
  acc: PfaIngestAccumulator,
  boxScore: PfaBoxScore,
): void {
  const { gameIdentifier, season } = boxScore;

  for (const player of boxScore.players) {
    const { pfaId } = player;

    if (player.passing) {
      const { passing } = player;
      pushRow(acc.passing, pfaId, season, (gameNum) => ({
        season,
        gameNum,
        gameIdentifier,
        cmp: passing.com,
        att: passing.att,
        yds: passing.yds,
        td: passing.td,
        int: passing.int,
        sacked: passing.ts,
        sackYds: passing.yl,
        rating: passing.rtg,
      }));
    }

    if (player.rushing) {
      const { rushing } = player;
      pushRow(acc.rushing, pfaId, season, (gameNum) => ({
        season,
        gameNum,
        gameIdentifier,
        att: rushing.att,
        yds: rushing.yds,
        td: rushing.td,
        lng: rushing.lng,
        fumbles: null,
      }));
    }

    if (player.receiving) {
      const { receiving } = player;
      pushRow(acc.receiving, pfaId, season, (gameNum) => ({
        season,
        gameNum,
        gameIdentifier,
        rec: receiving.no,
        tgt: null, // PFA does not carry targets, only receptions
        yds: receiving.yds,
        td: receiving.td,
        lng: receiving.lng,
        fumbles: null,
      }));
    }
  }
}

/**
 * Folds one kicker's full career game-log (already filtered to
 * regular-season rows by `KickerGameLogParser`) into the accumulator,
 * restricted to `seasonFilter` (the ingest command's `--from`/`--to`
 * range) so a kicker whose career spans outside the requested range doesn't
 * pull in seasons nobody asked to ingest.
 *
 * Per-season `gameNum` numbering restarts at 1 for kicking specifically
 * (independent of passing/rushing/receiving numbering for the same
 * player-season, matching how each category is numbered independently in
 * `transform.ts`'s nflverse builders).
 */
export function accumulateKickerGameLog(
  acc: PfaIngestAccumulator,
  pfaId: string,
  rows: PfaKickerGameLogRow[],
  seasonFilter: (season: number) => boolean,
): void {
  for (const row of rows) {
    if (!seasonFilter(row.season)) continue;
    const { season, gameIdentifier } = row;
    pushRow(acc.kicking, pfaId, season, (gameNum) => ({
      season,
      gameNum,
      gameIdentifier,
      fgm: row.fgMade,
      fga: row.fgAtt,
      fg019m: null,
      fg019a: null,
      fg2029m: null,
      fg2029a: null,
      fg3039m: null,
      fg3039a: null,
      fg4049m: null,
      fg4049a: null,
      fg50m: null,
      fg50a: null,
      xpm: row.xpMade,
      xpa: row.xpAtt,
      lng: null, // not carried by the SCORING table
    }));
  }
}

/** Every distinct (pfaId, season) pair with at least one accumulated row. */
export function accumulatedPlayerSeasons(
  acc: PfaIngestAccumulator,
): { pfaId: string; season: number }[] {
  const seen = new Set<string>();
  const out: { pfaId: string; season: number }[] = [];
  for (const byPfaId of [
    acc.passing,
    acc.rushing,
    acc.receiving,
    acc.kicking,
  ]) {
    for (const [pfaId, bySeason] of byPfaId) {
      for (const season of bySeason.keys()) {
        const key = `${pfaId}:${season}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ pfaId, season });
      }
    }
  }
  return out;
}
