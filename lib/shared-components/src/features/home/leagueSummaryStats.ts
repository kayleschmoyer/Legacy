// Shared, presentation-free derivations over a user's league summaries.
// Lifted out of `HomeScreen.tsx` (LS-8795) so the Leagues ledger and the Home
// dashboard compute urgency ordering, records, and aggregate stats from one
// implementation instead of two that can drift apart.

/**
 * Presentational league-summary shape consumed by the dashboard and the
 * Leagues ledger. Structurally compatible with each app's `UserLeagueSummary`
 * GraphQL fragment so web and mobile can pass their own generated arrays
 * directly.
 *
 * The standings fields (`wins`/`losses`/`ties`/`rank`/`totalTeams`) arrive on a
 * separate, slower query and are merged in by {@link mergeLeagueStandings}
 * (LS-9528). Until then they are absent — which is why every derivation over
 * them distinguishes "unknown" from a real 0-0 record.
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

/**
 * Aggregate stats shown in the returning-user header. Derived from `leagues`
 * when omitted.
 *
 * `aggregateRecord` and `firstPlaceCount` are both tri-state: `null`/`undefined`
 * means "standings have not arrived yet", which the header renders as absence
 * rather than as a zero (LS-9528).
 */
export interface HomeUserStats {
  leagueCount: number;
  aggregateRecord?: string | null;
  firstPlaceCount?: number;
}

/**
 * One row of the bulk `getUserLeagueStandings` response. Structurally
 * compatible with each app's generated type so callers can pass it straight
 * through.
 */
export interface LeagueStandingsEntry {
  leagueId?: number | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  rank?: number | null;
  totalTeams?: number | null;
}

/**
 * Merges the bulk standings response into the league summaries on `leagueId`
 * (LS-9528). Summaries with no matching standings row are returned untouched,
 * so their record and rank stay "unknown" rather than becoming 0.
 *
 * Returns the original array when there is nothing to merge, so callers'
 * `useMemo` results stay referentially stable while standings are in flight.
 */
export function mergeLeagueStandings<T extends HomeLeagueSummary>(
  summaries: T[],
  standings: readonly LeagueStandingsEntry[] | null | undefined,
): T[] {
  if (!standings || standings.length === 0) return summaries;

  const byLeagueId = new Map<number, LeagueStandingsEntry>();
  for (const entry of standings) {
    if (entry.leagueId != null) byLeagueId.set(entry.leagueId, entry);
  }
  if (byLeagueId.size === 0) return summaries;

  return summaries.map((summary) => {
    const entry =
      summary.leagueId != null ? byLeagueId.get(summary.leagueId) : undefined;
    if (!entry) return summary;
    return {
      ...summary,
      wins: entry.wins,
      losses: entry.losses,
      ties: entry.ties,
      rank: entry.rank,
      totalTeams: entry.totalTeams,
    };
  });
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

/**
 * Rendered in place of a record that has not been loaded yet. Deliberately not
 * exported — callers that need to branch on "unknown" should test
 * `recordOf(s) === null` rather than string-compare a display glyph.
 */
const UNKNOWN_STAT = '—';

/**
 * True once the standings query has supplied this league's record. A league
 * that has genuinely played no games still reports 0/0/0, so "all three null"
 * unambiguously means "not loaded".
 */
export function hasKnownRecord(s: HomeLeagueSummary): boolean {
  return s.wins != null || s.losses != null || s.ties != null;
}

/**
 * "6-2", or "6-2-1" when the league has ties. Returns `null` while the standings
 * query is still in flight, so callers can render a placeholder instead of a
 * fabricated "0-0" that corrects itself a second later (LS-9528).
 */
export function recordOf(s: HomeLeagueSummary): string | null {
  if (!hasKnownRecord(s)) return null;
  const wins = s.wins ?? 0;
  const losses = s.losses ?? 0;
  const ties = s.ties ?? 0;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/**
 * Display form of {@link recordOf} — the record, or an em dash while standings
 * are loading. Use this at render sites that need a plain string.
 */
export function recordLabel(s: HomeLeagueSummary): string {
  return recordOf(s) ?? UNKNOWN_STAT;
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
 *
 * Also null until **every** active league's standings have loaded (LS-9528).
 * Summing only the leagues that have arrived would show a real-looking total
 * that silently grows as the rest land — worse than showing nothing.
 */
export function aggregateActiveRecord(
  summaries: HomeLeagueSummary[],
): string | null {
  const active = summaries.filter((s) => s.leaguePhase === 'active');
  if (active.length === 0) return null;
  if (!active.every(hasKnownRecord)) return null;
  const wins = active.reduce((a, s) => a + (s.wins ?? 0), 0);
  const losses = active.reduce((a, s) => a + (s.losses ?? 0), 0);
  const ties = active.reduce((a, s) => a + (s.ties ?? 0), 0);
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/**
 * Header stats for a returning user: league count, aggregate record, firsts.
 *
 * `firstPlaceCount` is `undefined` — not `0` — until every active league's rank
 * is known, so the "N first place" badge stays hidden rather than reading zero
 * and then popping in (LS-9528). `leagueCount` comes from the fast summaries
 * query and is always available.
 */
export function deriveHomeUserStats(
  summaries: HomeLeagueSummary[],
): HomeUserStats {
  // "Standings have landed" is keyed off the record rather than off `rank`
  // itself: a league can legitimately come back ranked `null` (the user has no
  // team in it), and gating on a non-null rank would hide the badge forever in
  // that case. Once records are known, a null rank means genuinely unranked.
  const standingsLoaded = summaries
    .filter((s) => s.leaguePhase === 'active')
    .every(hasKnownRecord);
  return {
    leagueCount: summaries.length,
    aggregateRecord: aggregateActiveRecord(summaries),
    firstPlaceCount: standingsLoaded
      ? summaries.filter((s) => s.rank === 1).length
      : undefined,
  };
}
