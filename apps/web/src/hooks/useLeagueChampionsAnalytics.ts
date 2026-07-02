import { useMemo } from 'react';

interface SeasonWithChampion {
  leagueId?: number | null;
  seasonNumber?: number | null;
  frozenAt?: string | null;
  championTeamName?: string | null;
  runnerUpTeamName?: string | null;
  championScore?: number | null;
  runnerUpScore?: number | null;
}

export interface ChampionshipLeaderboardEntry {
  teamName: string;
  titles: number;
}

export interface LeagueChampionsAnalytics {
  champions: SeasonWithChampion[];
  championshipLeaderboard: ChampionshipLeaderboardEntry[];
}

export function filterChampions(seasons: SeasonWithChampion[]) {
  return seasons.filter((s) => s.frozenAt);
}

export function buildLeaderboard(
  champions: SeasonWithChampion[],
): ChampionshipLeaderboardEntry[] {
  const counts = new Map<string, number>();
  for (const s of champions) {
    const name = s.championTeamName ?? '';
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([teamName, titles]) => ({ teamName, titles }))
    .sort((a, b) => b.titles - a.titles);
}

/**
 * Derives championship analytics from a list of league seasons.
 * Used by both the v1 LeagueHistory (Tamagui) and v2 HistoryTab components.
 */
export function useLeagueChampionsAnalytics(
  seasons: SeasonWithChampion[],
): LeagueChampionsAnalytics {
  const champions = useMemo(() => filterChampions(seasons), [seasons]);
  const championshipLeaderboard = useMemo(
    () => buildLeaderboard(champions),
    [champions],
  );
  return { champions, championshipLeaderboard };
}
