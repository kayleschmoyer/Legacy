import React from 'react';
import { Text } from 'tamagui';
import { type GetLeagueStandingsQuery } from '@legacy-sports/graphql';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  GRAY,
  GREEN,
  RANK_SILVER,
  SLATE_400,
} from '../../utils/colors';

/**
 * Data model, sorting and small presentational pieces shared by the wide
 * (`StandingsTable`, ≥980) and narrow (`StandingsScrollTable`, <980) standings
 * layouts, so both render identical values in identical order.
 */

export type StandingRecord = NonNullable<
  GetLeagueStandingsQuery['getLeagueStandings']
>[0];

export type SortKey =
  | 'rank'
  | 'team'
  | 'wins'
  | 'losses'
  | 'ties'
  | 'winPct'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'diff'
  | 'waiverOrder'
  | 'medianRecord';
export type SortDirection = 'asc' | 'desc';

export function rankBadgeColor(rank: number): string {
  if (rank === 1 || rank === 3) return BRAND_GOLD;
  if (rank === 2) return RANK_SILVER;
  return GRAY;
}

/** Playoff seeding badge shown late in the season (LS-6345). */
const CLINCH_BADGE_CONFIG = {
  CLINCHED: { label: 'CLINCHED', color: GREEN },
  IN: { label: 'IN', color: BRAND_GOLD_LIGHT },
  OUT: { label: 'OUT', color: SLATE_400 },
} as const;

export function ClinchBadge({
  status,
}: {
  status: keyof typeof CLINCH_BADGE_CONFIG;
}) {
  const { label, color } = CLINCH_BADGE_CONFIG[status];
  return (
    <Text
      flexShrink={0}
      fontSize={10}
      fontWeight="800"
      color={color}
      borderColor={color}
      borderWidth={1}
      borderRadius="$2"
      paddingHorizontal="$1.5"
      paddingVertical={1}
      letterSpacing={0.4}
    >
      {label}
    </Text>
  );
}

export const diffOf = (s: StandingRecord): number | null =>
  s.pointsFor != null && s.pointsAgainst != null
    ? s.pointsFor - s.pointsAgainst
    : null;

export const formatDiff = (diff: number | null): string =>
  diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`;

export const formatWinPct = (s: StandingRecord): string =>
  `${((s.winPercentage ?? 0) * 100).toFixed(1)}%`;

export const formatMedianRecord = (s: StandingRecord): string =>
  s.medianWins != null && s.medianLosses != null
    ? `${s.medianWins}-${s.medianLosses}`
    : '—';

export const teamDisplayName = (s: StandingRecord): string =>
  s.teamName ?? `Team ${s.teamId}`;

export function sortStandings(
  list: StandingRecord[],
  sortKey: SortKey,
  sortDirection: SortDirection,
  waiverOrders?: Record<string, number>,
): StandingRecord[] {
  return [...list].sort((a, b) => {
    let aValue: number | string;
    let bValue: number | string;

    switch (sortKey) {
      case 'rank':
      case 'winPct':
        aValue = a.winPercentage ?? 0;
        bValue = b.winPercentage ?? 0;
        break;
      case 'team':
        aValue = a.teamName ?? '';
        bValue = b.teamName ?? '';
        break;
      case 'wins':
        aValue = a.wins ?? 0;
        bValue = b.wins ?? 0;
        break;
      case 'losses':
        aValue = a.losses ?? 0;
        bValue = b.losses ?? 0;
        break;
      case 'ties':
        aValue = a.ties ?? 0;
        bValue = b.ties ?? 0;
        break;
      case 'pointsFor':
        aValue = a.pointsFor ?? 0;
        bValue = b.pointsFor ?? 0;
        break;
      case 'pointsAgainst':
        aValue = a.pointsAgainst ?? 0;
        bValue = b.pointsAgainst ?? 0;
        break;
      case 'diff':
        aValue = diffOf(a) ?? 0;
        bValue = diffOf(b) ?? 0;
        break;
      case 'waiverOrder':
        aValue =
          (a.teamId != null ? waiverOrders?.[a.teamId] : undefined) ??
          Number.MAX_SAFE_INTEGER;
        bValue =
          (b.teamId != null ? waiverOrders?.[b.teamId] : undefined) ??
          Number.MAX_SAFE_INTEGER;
        break;
      case 'medianRecord':
        aValue = a.medianWins ?? 0;
        bValue = b.medianWins ?? 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}
