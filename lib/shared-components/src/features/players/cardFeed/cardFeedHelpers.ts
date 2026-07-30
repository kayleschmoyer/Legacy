/**
 * Pure helpers, constants, and formatters for the Players tab card feed
 * (LS-8832 — "Players Tab — Card Feed Redesign", option 1c). No React/Tamagui
 * imports here so the logic is testable in isolation from rendering; the
 * presentational pieces (SportToggle, PositionChipRail, PlayerFeedCard, ...)
 * import from this module rather than duplicating the position lists or
 * stat-formatting rules.
 */

import type { Sport } from '../../../utils/colors';

// ── Position chip rail ──────────────────────────────────────────────────────

/**
 * Baseball chip set, in display order. Matches the design handoff's list
 * exactly and the GraphQL `position` arg values the existing stats toolbar
 * select already sends (`baseballStatsHelpers.POSITIONS`, minus `UT`, which
 * the handoff's chip list omits).
 */
export const BASEBALL_CARD_POSITIONS = [
  'ALL',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'DH',
  'SP',
  'RP',
] as const;

/**
 * Football chip set. The handoff's illustrated set is ALL/QB/RB/WR/TE; its
 * prose directs extending it with "K/DST per footballPositionBadges".
 */
export const FOOTBALL_CARD_POSITIONS = [
  'ALL',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST',
] as const;

export function cardPositionsForSport(sport: Sport): readonly string[] {
  return sport === 'baseball'
    ? BASEBALL_CARD_POSITIONS
    : FOOTBALL_CARD_POSITIONS;
}

/** GraphQL `position` filter value for a chip selection — `'ALL'` clears it. */
export function positionFilterParam(position: string): string | undefined {
  return position === 'ALL' ? undefined : position;
}

// ── Header safe-area padding ────────────────────────────────────────────────

/** The card feed header's page gutter, absent any safe-area inset. */
const HEADER_PAGE_PADDING = 16;

/**
 * Top padding for the card feed header: the page gutter plus the top
 * safe-area inset, so the "Players" title and search bar always clear the
 * status bar (LS-8834, the same status-bar-overlap regression class as
 * LS-8808/MobileHomeScreen's `homeContentTopPadding`). Non-finite or negative
 * insets are ignored so a missing safe-area provider degrades to the gutter
 * rather than collapsing or inflating the layout.
 */
export function playersCardFeedTopPadding(topInset: number): number {
  return (
    HEADER_PAGE_PADDING +
    (Number.isFinite(topInset) && topInset > 0 ? topInset : 0)
  );
}

// ── Stat formatting ─────────────────────────────────────────────────────────

/**
 * Format a batting-average-style stat without the leading zero (`.298`),
 * matching the existing grid formatter used by the sliders, PlayerComparison,
 * and PlayersStatsTable (`v.toFixed(3).replace(/^0/, '')`).
 */
export function formatDecimalNoLeadingZero(value: number): string {
  return value.toFixed(3).replace(/^0/, '');
}

export interface BaseballCardStatsInput {
  homeRuns: number;
  rbi: number;
  battingAverage: number;
}

/** `"HR 762 · RBI 1,996 · AVG .298"` — the card feed's baseball sub-stat line. */
export function formatBaseballCardSubStats({
  homeRuns,
  rbi,
  battingAverage,
}: BaseballCardStatsInput): string {
  return `HR ${homeRuns.toLocaleString()} · RBI ${rbi.toLocaleString()} · AVG ${formatDecimalNoLeadingZero(battingAverage)}`;
}

export interface FootballCardStatsInput {
  position?: string | null;
  nflTeam?: string | null;
  isDst?: boolean | null;
  careerStats?: {
    passing?: { yds?: number | null; td?: number | null } | null;
    rushing?: { yds?: number | null; td?: number | null } | null;
    receiving?: { yds?: number | null; td?: number | null } | null;
    kicking?: { fgm?: number | null; fga?: number | null } | null;
    defense?: { sacks?: number | null; int?: number | null } | null;
    idp?: {
      soloTkl?: number | null;
      astTkl?: number | null;
      sacks?: number | null;
    } | null;
  } | null;
}

function fmtCount(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString();
}

/**
 * `"BUF · YDS 4,587 · TD 42"` — the card feed's football sub-stat line. Picks
 * one primary stat category by position, mirroring `FootballPlayerCard`'s
 * category-gating convention (passing for QB, rushing for RB, receiving for
 * WR/TE/FLEX, kicking for K, defense for DST, idp for DL/LB/DB) rather than
 * the full multi-category breakdown that component renders — the card feed's
 * sub-stat line is a single compact row, not a stat block.
 */
export function formatFootballCardSubStats(
  player: FootballCardStatsInput,
): string {
  const team = player.nflTeam ?? '';
  const stats = player.careerStats;
  const isIdp =
    player.position === 'DL' ||
    player.position === 'LB' ||
    player.position === 'DB';

  const parts: string[] = [];
  if (player.isDst && stats?.defense) {
    parts.push(
      `SACKS ${fmtCount(stats.defense.sacks)}`,
      `INT ${fmtCount(stats.defense.int)}`,
    );
  } else if (isIdp && stats?.idp) {
    const tackles = (stats.idp.soloTkl ?? 0) + (stats.idp.astTkl ?? 0);
    parts.push(
      `TKL ${tackles.toLocaleString()}`,
      `SACKS ${fmtCount(stats.idp.sacks)}`,
    );
  } else if (player.position === 'QB' && stats?.passing) {
    parts.push(
      `YDS ${fmtCount(stats.passing.yds)}`,
      `TD ${fmtCount(stats.passing.td)}`,
    );
  } else if (player.position === 'RB' && stats?.rushing) {
    parts.push(
      `YDS ${fmtCount(stats.rushing.yds)}`,
      `TD ${fmtCount(stats.rushing.td)}`,
    );
  } else if (
    (player.position === 'WR' ||
      player.position === 'TE' ||
      player.position === 'FLEX') &&
    stats?.receiving
  ) {
    parts.push(
      `YDS ${fmtCount(stats.receiving.yds)}`,
      `TD ${fmtCount(stats.receiving.td)}`,
    );
  } else if (player.position === 'K' && stats?.kicking) {
    parts.push(
      `FG ${fmtCount(stats.kicking.fgm)}/${fmtCount(stats.kicking.fga)}`,
    );
  }

  return [team, ...parts].filter(Boolean).join(' · ');
}

// ── Trend ────────────────────────────────────────────────────────────────

/**
 * Card feed trend indicator direction. The design handoff's mockup shows a
 * per-player trend arrow, but its backing data (week-over-week or
 * season-over-season movement) has no equivalent in the all-time career
 * leaderboard this screen renders — the ticket's own State section omits a
 * trend field entirely. Screens wiring this feed should pass `'flat'` unless
 * a real trend signal becomes available; the type stays 3-valued so the
 * presentational component doesn't need to change when one does.
 */
export type CardTrendDirection = 'up' | 'down' | 'flat';
