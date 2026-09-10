import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { eq, max, min } from 'drizzle-orm';
import type {
  FootballPlayerCandidate,
  PfaCrosswalkRow,
  PfaLeague,
  PfaPlayerIndexEntry,
} from './types';

// One (table, label) pair per football season-stat table — every table
// shares the same (playerId, season) shape for this purpose, so the season
// range is the union of all six rather than any single stat category (a
// receiver with only receiving rows shouldn't look like a shorter career
// than a two-way player with rows in multiple tables).
const SEASON_TABLES = [
  PublicSchema.footballSeasonPassing,
  PublicSchema.footballSeasonRushing,
  PublicSchema.footballSeasonReceiving,
  PublicSchema.footballSeasonKicking,
  PublicSchema.footballSeasonDefense,
  PublicSchema.footballSeasonDefenseIdp,
];

/**
 * Loads every football players-table row as a crosswalk candidate, with
 * each player's active-season range derived as MIN/MAX(season) across all
 * six football_season_* tables (there is no career-year column on `players`
 * itself). A player with no season rows at all gets seasonMin/seasonMax =
 * null — the resolver treats that as "nothing to contradict a name match
 * with", not as a mismatch.
 */
export async function fetchFootballPlayerCandidates(
  db: PublicDb,
): Promise<FootballPlayerCandidate[]> {
  const seasonRangeByPlayerId = new Map<
    number,
    { seasonMin: number; seasonMax: number }
  >();

  for (const table of SEASON_TABLES) {
    const rows = await db
      .select({
        playerId: table.playerId,
        seasonMin: min(table.season),
        seasonMax: max(table.season),
      })
      .from(table)
      .groupBy(table.playerId);

    for (const row of rows) {
      if (row.seasonMin === null || row.seasonMax === null) continue;
      const existing = seasonRangeByPlayerId.get(row.playerId);
      seasonRangeByPlayerId.set(row.playerId, {
        seasonMin: existing
          ? Math.min(existing.seasonMin, row.seasonMin)
          : row.seasonMin,
        seasonMax: existing
          ? Math.max(existing.seasonMax, row.seasonMax)
          : row.seasonMax,
      });
    }
  }

  const players = await db
    .select({
      id: PublicSchema.players.id,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
      position: PublicSchema.players.position,
    })
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.sport, 'football'));

  return players.map((player) => {
    const range = seasonRangeByPlayerId.get(player.id);
    return {
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      seasonMin: range?.seasonMin ?? null,
      seasonMax: range?.seasonMax ?? null,
    };
  });
}

/**
 * Normalizes a player name for matching: strips diacritics, lowercases,
 * drops generational suffixes (Jr/Sr/II/III/IV) and punctuation, and
 * collapses whitespace. Both the PFA name and the players-table
 * firstName+lastName go through this before comparison.
 */
export function normalizePlayerName(name: string): string {
  const withoutDiacritics = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return withoutDiacritics
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// PFA's league split gives a coarse era window for two of the three leagues
// — the AAFC and AFL operated as separate leagues for a fixed span before
// merging into the NFL, so a PFA `league` value alone constrains the era
// even though the player-index page carries no explicit year range (that's
// the only era signal LS-9991's PlayerIndexParser extracts). `nfl` covers
// 1920-present and so implies no useful window.
const ERA_WINDOW_BY_LEAGUE: Record<
  PfaLeague,
  { start: number; end: number } | null
> = {
  aafc: { start: 1946, end: 1949 },
  afl: { start: 1960, end: 1969 },
  nfl: null,
};

function seasonRangeOverlapsWindow(
  candidate: FootballPlayerCandidate,
  window: { start: number; end: number } | null,
): boolean {
  // No window to check against (nfl), or no known season data to check —
  // treated as "not disqualified" rather than "confirmed", since there is
  // nothing to contradict the name match.
  if (window === null) return true;
  if (candidate.seasonMin === null || candidate.seasonMax === null) {
    return true;
  }
  return (
    candidate.seasonMin <= window.end && candidate.seasonMax >= window.start
  );
}

/**
 * Resolves PFA player-index entries against this repo's football players,
 * joined by normalized name and (for afl/aafc) era. Every input entry
 * produces exactly one output row, matched or not — never silently dropped
 * — with a confidence score and matchMethod recorded per LS-9993 AC.
 *
 * `candidates` should be every players-table row with sport='football',
 * with each candidate's active-season range pre-derived by the caller (see
 * `fetchFootballPlayerCandidates`). This function does no I/O so it can be
 * unit-tested without a database.
 */
export function resolvePfaCrosswalk(
  entries: PfaPlayerIndexEntry[],
  candidates: FootballPlayerCandidate[],
): PfaCrosswalkRow[] {
  const candidatesByName = new Map<string, FootballPlayerCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizePlayerName(
      `${candidate.firstName} ${candidate.lastName}`,
    );
    const bucket = candidatesByName.get(key);
    if (bucket) {
      bucket.push(candidate);
    } else {
      candidatesByName.set(key, [candidate]);
    }
  }

  return entries.map((entry) => resolveOne(entry, candidatesByName));
}

function resolveOne(
  entry: PfaPlayerIndexEntry,
  candidatesByName: Map<string, FootballPlayerCandidate[]>,
): PfaCrosswalkRow {
  const base = {
    pfaId: entry.pfaId,
    pfaName: entry.name,
    pfaCollege: entry.college,
    pfaLeague: entry.league,
  };

  const nameKey = normalizePlayerName(entry.name);
  const nameMatches = candidatesByName.get(nameKey) ?? [];
  const candidateCount = nameMatches.length;

  if (candidateCount === 0) {
    return {
      ...base,
      playerId: null,
      confidence: 0,
      matchMethod: 'no_match',
      candidateCount: 0,
      matchedFinalSeason: null,
    };
  }

  const window = ERA_WINDOW_BY_LEAGUE[entry.league];

  if (candidateCount === 1) {
    const [only] = nameMatches;
    const overlaps = seasonRangeOverlapsWindow(only, window);
    if (overlaps) {
      return {
        ...base,
        playerId: only.id,
        confidence: 0.9,
        matchMethod: 'exact_name_unique',
        candidateCount,
        matchedFinalSeason: only.seasonMax,
      };
    }
    LOGGER.warn(
      `PFA crosswalk: ${entry.pfaId} (${entry.name}, ${entry.league}) matched player ${only.id} by name, but that player's season range does not overlap the ${entry.league} era window`,
    );
    return {
      ...base,
      playerId: only.id,
      confidence: 0.4,
      matchMethod: 'exact_name_era_mismatch',
      candidateCount,
      matchedFinalSeason: only.seasonMax,
    };
  }

  // Multiple same-name candidates — try to narrow by era window (only
  // possible for afl/aafc, since nfl implies no window).
  const eraFiltered =
    window === null
      ? nameMatches
      : nameMatches.filter((c) => seasonRangeOverlapsWindow(c, window));

  if (eraFiltered.length === 1) {
    const [only] = eraFiltered;
    return {
      ...base,
      playerId: only.id,
      confidence: 0.65,
      matchMethod: 'name_era_disambiguated',
      candidateCount,
      matchedFinalSeason: only.seasonMax,
    };
  }

  LOGGER.warn(
    `PFA crosswalk: ${entry.pfaId} (${entry.name}, ${entry.league}) has ${candidateCount} same-name candidates and could not be disambiguated by era — left unresolved rather than guessing`,
  );
  return {
    ...base,
    playerId: null,
    confidence: 0,
    matchMethod: 'ambiguous_unresolved',
    candidateCount,
    matchedFinalSeason: null,
  };
}
