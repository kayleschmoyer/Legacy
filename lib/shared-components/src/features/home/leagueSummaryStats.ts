// Shared, presentation-free derivations over a user's league summaries.
// Lifted out of `HomeScreen.tsx` (LS-8795) so the Leagues ledger and the Home
// dashboard compute urgency ordering, records, and aggregate stats from one
// implementation instead of two that can drift apart.

/**
 * Presentational league-summary shape consumed by the dashboard and the
 * Leagues ledger. Structurally compatible with each app's `UserLeagueSummary`
 * GraphQL fragment so web and mobile can pass their own generated arrays
 * directly.
 */
export interface HomeLeagueSummary {
  leagueId?: number | null;
  leagueName?: string | null;
  sport?: string | null;
  leaguePhase?: string | null;
  seasonNumber?: number | null;
  draftStatus?: string | null;
  draftScheduledAt?: string | null;
  draftMode?: string | null;
  selectionMethod?: string | null;
  teamCount?: number | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  rank?: number | null;
  totalTeams?: number | null;
  pointsFor?: number | null;
  currentWeekNumber?: number | null;
  totalMatchups?: number | null;
  matchupId?: number | null;
  matchupStatus?: string | null;
  matchupEndTime?: string | null;
  userScore?: number | null;
  opponentScore?: number | null;
  opponentTeamName?: string | null;
  eraFilter?: string | null;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  isCommissioner?: boolean | null;
}

/** Aggregate stats shown in the returning-user header. Derived from `leagues` when omitted. */
export interface HomeUserStats {
  leagueCount: number;
  aggregateRecord?: string | null;
  firstPlaceCount?: number;
}

/**
 * The sport the user is most engaged in, derived from league counts (LS-6285)
 * so the returning-user dashboard can badge that sport's card without a new
 * backend field. `null` when the user has no leagues yet, or leagues are
 * split evenly between sports — a tie carries no reliable signal.
 */
export function computePrimarySport(
  leagues: HomeLeagueSummary[],
): 'baseball' | 'football' | null {
  let baseballCount = 0;
  let footballCount = 0;
  for (const league of leagues) {
    if (league.sport === 'baseball') baseballCount += 1;
    else if (league.sport === 'football') footballCount += 1;
  }
  if (baseballCount === footballCount) return null;
  return baseballCount > footballCount ? 'baseball' : 'football';
}

/* ─── Urgency sort ─── */

/** Lower is more urgent: live draft, then active season, then pre-draft. */
export function urgencyKey(s: HomeLeagueSummary): number {
  if (s.draftStatus === 'in-progress') return 0;
  if (s.leaguePhase === 'active') return 1;
  if (s.leaguePhase === 'pre-draft') return 2;
  return 3;
}

export function sortByUrgency(
  summaries: HomeLeagueSummary[],
): HomeLeagueSummary[] {
  return [...summaries].sort((a, b) => urgencyKey(a) - urgencyKey(b));
}

/* ─── Phase predicates ─── */

/** True when the league has a matchup currently being scored. */
export function isLiveMatchup(s: HomeLeagueSummary): boolean {
  return s.matchupId != null && s.matchupStatus === 'in_progress';
}

/** True when the league has not drafted yet. */
export function isPreDraft(s: HomeLeagueSummary): boolean {
  return s.leaguePhase === 'pre-draft';
}

/* ─── Records ─── */

/** "6-2" or "6-2-1" when the league has ties. */
export function recordOf(s: HomeLeagueSummary): string {
  const wins = s.wins ?? 0;
  const losses = s.losses ?? 0;
  const ties = s.ties ?? 0;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/**
 * Coerces a matchup score to a finite number, defaulting to 0. Guards
 * `.toFixed()` call sites against a non-numeric value reaching the client
 * (e.g. a malformed cache entry) — such a value would otherwise throw
 * "TypeError: undefined is not a function" during render (LS-8668).
 */
export function safeScore(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Combined W-L(-T) across **active** leagues only, or null when the user has
 * none. Pre-draft and completed leagues are deliberately excluded so the
 * headline record reflects the season actually being played.
 */
export function aggregateActiveRecord(
  summaries: HomeLeagueSummary[],
): string | null {
  const active = summaries.filter((s) => s.leaguePhase === 'active');
  if (active.length === 0) return null;
  const wins = active.reduce((a, s) => a + (s.wins ?? 0), 0);
  const losses = active.reduce((a, s) => a + (s.losses ?? 0), 0);
  const ties = active.reduce((a, s) => a + (s.ties ?? 0), 0);
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/** Header stats for a returning user: league count, aggregate record, firsts. */
export function deriveHomeUserStats(
  summaries: HomeLeagueSummary[],
): HomeUserStats {
  return {
    leagueCount: summaries.length,
    aggregateRecord: aggregateActiveRecord(summaries),
    firstPlaceCount: summaries.filter((s) => s.rank === 1).length,
  };
}
