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
export interface PfaKickerGameLogRow {
  date: string;
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
