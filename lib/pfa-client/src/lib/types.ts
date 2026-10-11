// Per LS-9948's SOURCE SHAPE section: exact column headers as they appear on
// a PFA box-score page. `lng` strips the trailing "t" touchdown marker
// (e.g. "57t" -> lng=57, lngTd=true) per the documented parser gotcha.

export interface PfaRushingLine {
  att: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  td: number | null;
}

export interface PfaPassingLine {
  att: number | null;
  com: number | null;
  pct: number | null;
  int: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  td: number | null;
  // Times Sacked / Yards Lost to sacks — PFA-only fields nflverse does not
  // carry (LS-9948 mapping notes). Complete guarantee only 1981-2021/2024;
  // patchier before that (see LS-9948 comment 20612 measured-population table).
  ts: number | null;
  yl: number | null;
  rtg: number | null;
}

export interface PfaReceivingLine {
  no: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  td: number | null;
}

export interface PfaInterceptionsLine {
  no: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  td: number | null;
}

export interface PfaPuntingLine {
  no: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  bl: number | null;
}

// Pre-1970 tables often carry no FC data behind the FC header column — the
// column is still present and must be parsed as null, never dropped (dropping
// it silently shifts every later column left; this exact bug is documented on
// LS-9948 comment 20612, section 5).
export interface PfaPuntReturnLine {
  no: number | null;
  fc: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  td: number | null;
}

export interface PfaKickoffReturnLine {
  no: number | null;
  fc: number | null;
  yds: number | null;
  avg: number | null;
  lng: number | null;
  lngTd: boolean;
  td: number | null;
}

export interface PfaPlayerBoxScoreStats {
  pfaId: string;
  name: string;
  rushing: PfaRushingLine | null;
  passing: PfaPassingLine | null;
  receiving: PfaReceivingLine | null;
  interceptions: PfaInterceptionsLine | null;
  punting: PfaPuntingLine | null;
  puntReturns: PfaPuntReturnLine | null;
  kickoffReturns: PfaKickoffReturnLine | null;
}

export interface PfaScoringPlay {
  quarter: number | null;
  text: string;
}

export interface PfaBoxScore {
  // Derived from the URL, e.g. "1960nfl001" from /nflboxscores1/1960nfl001.html
  gameIdentifier: string;
  season: number;
  players: PfaPlayerBoxScoreStats[];
  scoringPlays: PfaScoringPlay[];
  // Quarter-by-quarter score, home and away, as rendered on the page —
  // used downstream to derive DST points-allowed (LS-9948 mapping notes).
  quarterScores: {
    away: number[];
    home: number[];
  } | null;
}

export type PfaLeague = 'nfl' | 'afl' | 'aafc';

export interface PfaPlayerIndexEntry {
  pfaId: string;
  name: string;
  college: string | null;
  league: PfaLeague;
}

// The kicking table never appears in box scores (0% across 4,942 crawled
// games per LS-9948 comment 20612) — fgm/fga/xpm/xpa live only on this
// per-kicker SCORING game log route instead.
// One row of the player-index crawl's source table (LS-9993) — the raw
// input to the crosswalk resolver, keyed by page so a partial crawl failure
// is visible rather than silently dropped.
export interface PfaPlayerIndexCrawlError {
  url: string;
  message: string;
}

export interface PfaPlayerIndexSourceTable {
  crawledAt: string;
  entries: PfaPlayerIndexEntry[];
  errors: PfaPlayerIndexCrawlError[];
}

// A candidate football player from this repo's `players` table, joined with
// its derived active-season range (min/max `season` across the
// football_season_* tables — `players` itself carries no career-year or
// college column, per LS-9993's crosswalk-resolver research). `seasonMin`/
// `seasonMax` are null when the player has no season stat rows at all (the
// join has nothing to disambiguate against).
export interface FootballPlayerCandidate {
  id: number;
  firstName: string;
  lastName: string;
  position: string | null;
  seasonMin: number | null;
  seasonMax: number | null;
}

// How a crosswalk row was resolved, in increasing order of ambiguity/risk —
// recorded per row per LS-9993 AC ("not a silent best-guess").
export type PfaCrosswalkMatchMethod =
  // Exactly one players-table candidate shares the PFA entry's normalized
  // name, and (when the PFA league implies an era window) that candidate's
  // known season range overlaps it, or the candidate has no season data to
  // check against.
  | 'exact_name_unique'
  // Exactly one players-table candidate shares the normalized name, but its
  // known season range does NOT overlap the era window implied by the PFA
  // entry's league (afl: 1960-1969, aafc: 1946-1949) — still the only name
  // match, but flagged rather than trusted at full confidence.
  | 'exact_name_era_mismatch'
  // Multiple candidates shared the normalized name; era-window filtering
  // (afl/aafc only) narrowed it to exactly one.
  | 'name_era_disambiguated'
  // Multiple candidates shared the normalized name and the league era window
  // could not narrow them (always the case for nfl); the seasons this PFA id
  // was actually seen in box scores narrowed it to exactly one (LS-11064).
  | 'name_season_disambiguated'
  // Multiple candidates remain after any available disambiguation — no
  // match is emitted; `playerId` is null.
  | 'ambiguous_unresolved'
  // No players-table candidate shares the normalized name at all.
  | 'no_match';

export interface PfaCrosswalkRow {
  pfaId: string;
  pfaName: string;
  pfaCollege: string | null;
  pfaLeague: PfaLeague;
  playerId: number | null;
  // 0-1. Not calibrated against measured accuracy (no ground truth exists
  // yet) — a relative ranking of match methods, not a probability.
  confidence: number;
  matchMethod: PfaCrosswalkMatchMethod;
  // Count of same-normalized-name candidates before any era filtering, for
  // ambiguous_unresolved rows (and for auditing exact_name_unique rows).
  candidateCount: number;
  // The matched candidate's derived final season (seasonMax), used to
  // bucket the coverage report by decade. Null when unresolved or when the
  // matched player has no season data.
  matchedFinalSeason: number | null;
}

export interface PfaKickerGameLogRow {
  date: string;
  // Read from the DATE cell's own link to the box score — a direct,
  // unambiguous join key (matches PfaBoxScore.gameIdentifier), not derived
  // from date+team matching.
  gameIdentifier: string;
  season: number;
  team: string;
  // "A" (away) / "H" (home) — PFA's AHN column. Neutral-site games may carry
  // a distinct marker; treated as null when not recognized.
  homeAway: 'A' | 'H' | null;
  opponent: string;
  score: string;
  result: 'W' | 'L' | 'T' | null;
  td: number | null;
  xpMade: number | null;
  xpAtt: number | null;
  twoPtMade: number | null;
  twoPtAtt: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  safeties: number | null;
  points: number | null;
}
