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

// How far (in seasons) a candidate's known season range may sit from the
// seasons a PFA id was observed in and still count as the same player.
// Pre-1974 rows in the football_season_* tables are often partial (Bruce
// Alford kicked 1967-1976 but has rows for 1967-1969 only), so an exact
// overlap test would miss real matches in a later --from/--to range. A
// same-name pair inside this gap of each other stays ambiguous, because the
// match must still be unique.
export const SEASON_DISAMBIGUATION_GAP = 5;

/** Seasons between a candidate's range and the observed seasons; 0 = overlap. */
function seasonGap(
  candidate: FootballPlayerCandidate,
  observed: ReadonlySet<number>,
): number | null {
  if (candidate.seasonMin === null || candidate.seasonMax === null) {
    return null;
  }
  let gap = Infinity;
  for (const season of observed) {
    if (season < candidate.seasonMin) {
      gap = Math.min(gap, candidate.seasonMin - season);
    } else if (season > candidate.seasonMax) {
      gap = Math.min(gap, season - candidate.seasonMax);
    } else {
      return 0;
    }
  }
  return gap;
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
 *
 * `observedSeasons` (optional) maps a PFA id to the seasons it appeared in
 * crawled box scores. When same-name candidates survive the league era
 * window — always, for nfl entries — the one candidate whose season range
 * lies within {@link SEASON_DISAMBIGUATION_GAP} of those seasons is picked
 * (LS-11064). A candidate with no season data is never picked this way, and
 * a row claimed by more than one PFA id this way is left unresolved for all
 * of them.
 */
export function resolvePfaCrosswalk(
  entries: PfaPlayerIndexEntry[],
  candidates: FootballPlayerCandidate[],
  observedSeasons?: ReadonlyMap<string, ReadonlySet<number>>,
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

  const rows = entries.map((entry) =>
    resolveOne(entry, candidatesByName, observedSeasons?.get(entry.pfaId)),
  );

  // Season disambiguation picks per entry, so two PFA ids with the same name
  // and nearby careers could both land on one row. Neither is trustworthy
  // then: undo both rather than attach one player's stats to the other.
  const seasonClaims = new Map<number, number>();
  for (const row of rows) {
    if (
      row.matchMethod === 'name_season_disambiguated' &&
      row.playerId !== null
    ) {
      seasonClaims.set(row.playerId, (seasonClaims.get(row.playerId) ?? 0) + 1);
    }
  }
  return rows.map((row) => {
    if (
      row.matchMethod !== 'name_season_disambiguated' ||
      row.playerId === null ||
      (seasonClaims.get(row.playerId) ?? 0) < 2
    ) {
      return row;
    }
    LOGGER.warn(
      `PFA crosswalk: ${row.pfaId} (${row.pfaName}) and another PFA id both season-matched player ${row.playerId} — left unresolved rather than guessing`,
    );
    return {
      ...row,
      playerId: null,
      confidence: 0,
      matchMethod: 'ambiguous_unresolved' as const,
      matchedFinalSeason: null,
    };
  });
}

function resolveOne(
  entry: PfaPlayerIndexEntry,
  candidatesByName: Map<string, FootballPlayerCandidate[]>,
  observed: ReadonlySet<number> | undefined,
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

  if (eraFiltered.length > 1 && observed && observed.size > 0) {
    const seasonFiltered = eraFiltered.filter((c) => {
      const gap = seasonGap(c, observed);
      return gap !== null && gap <= SEASON_DISAMBIGUATION_GAP;
    });
    if (seasonFiltered.length === 1) {
      const [only] = seasonFiltered;
      return {
        ...base,
        playerId: only.id,
        confidence: 0.6,
        matchMethod: 'name_season_disambiguated',
        candidateCount,
        matchedFinalSeason: only.seasonMax,
      };
    }
  }

  LOGGER.warn(
    `PFA crosswalk: ${entry.pfaId} (${entry.name}, ${entry.league}) has ${candidateCount} same-name candidates and could not be disambiguated by era or box-score seasons — left unresolved rather than guessing`,
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
