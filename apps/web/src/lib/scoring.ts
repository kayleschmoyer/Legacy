import { useEffect, useMemo } from 'react';
import {
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from '@legacy-sports/scoring';
import {
  type GetLeagueScoringProfileQuery,
  ScoringStatGroup,
  useGetLeagueScoringProfileQuery,
} from '../api/db/graphql.generated';

export type ScoringSettings = {
  batting: Partial<Record<string, number>>;
  fielding: Partial<Record<string, number>>;
  pitching: Partial<Record<string, number>>;
};

type LeagueScoringProfileResult = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

type MultiplierGroup =
  | LeagueScoringProfileResult['multiplierGroups']
  | null
  | undefined;

export function createDefaultScoringSettings(): ScoringSettings {
  return {
    batting: { ...DEFAULT_BATTING_SCORING },
    fielding: { ...DEFAULT_FIELDING_SCORING },
    pitching: { ...DEFAULT_PITCHING_SCORING },
  };
}

export function applyMultiplierGroups(
  groups: MultiplierGroup,
  base?: ScoringSettings,
): ScoringSettings {
  const result: ScoringSettings = base
    ? {
        batting: { ...base.batting },
        fielding: { ...base.fielding },
        pitching: { ...base.pitching },
      }
    : createDefaultScoringSettings();

  if (!groups) {
    return result;
  }

  for (const group of groups) {
    if (!group?.group || !group.values) {
      continue;
    }

    let target: Partial<Record<string, number>> | undefined;

    switch (group.group) {
      case ScoringStatGroup.Batting:
        target = result.batting;
        break;
      case ScoringStatGroup.Fielding:
        target = result.fielding;
        break;
      case ScoringStatGroup.Pitching:
        target = result.pitching;
        break;
      default:
        target = undefined;
    }

    if (!target) {
      continue;
    }

    for (const entry of group.values) {
      if (
        entry?.sourceColumn &&
        typeof entry.multiplier === 'number' &&
        Number.isFinite(entry.multiplier)
      ) {
        // Normalize snake_case DB column names (e.g. "e_def") to
        // camelCase keys (e.g. "eDef") so API overrides replace defaults.
        const key = entry.sourceColumn.replace(/_([a-z])/g, (_, c: string) =>
          c.toUpperCase(),
        );
        target[key] = entry.multiplier;
      }
    }
  }

  return result;
}

export function useLeagueScoringSettings(leagueId?: number) {
  const numericLeagueId = typeof leagueId === 'number' ? leagueId : NaN;
  const shouldSkip = !Number.isFinite(numericLeagueId) || numericLeagueId <= 0;

  const query = useGetLeagueScoringProfileQuery({
    variables: { leagueId: numericLeagueId || 0 },
    skip: shouldSkip,
    fetchPolicy: 'cache-and-network',
  });

  // Refetch when the tab becomes visible again. `cache-and-network` only fetches
  // on initial mount, so a commissioner editing multipliers in another tab or
  // session would otherwise leave a long-mounted MatchupScoreboard showing
  // stale projections until the user manually reloaded the page (LS-4039).
  const { refetch } = query;
  useEffect(() => {
    if (shouldSkip || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [shouldSkip, refetch]);

  const settings = useMemo(
    () =>
      applyMultiplierGroups(query.data?.leagueScoringProfile?.multiplierGroups),
    [query.data?.leagueScoringProfile?.multiplierGroups],
  );

  const profile = query.data?.leagueScoringProfile ?? null;

  return {
    loading: query.loading,
    error: query.error,
    settings,
    profileName: profile?.profileName ?? 'Default',
    profile,
    refetch: query.refetch,
  } as const;
}
