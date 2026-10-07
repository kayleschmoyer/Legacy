import { useEffect, useMemo } from 'react';
import {
  applyMultiplierGroups as applyMultiplierGroupsShared,
  createDefaultScoringSettings,
  type ScoringSettings,
} from '@legacy-sports/scoring';
import {
  type GetLeagueScoringProfileQuery,
  useGetLeagueScoringProfileQuery,
} from '@legacy-sports/graphql';

export type { ScoringSettings };
export { createDefaultScoringSettings };

type LeagueScoringProfileResult = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

type MultiplierGroup =
  | LeagueScoringProfileResult['multiplierGroups']
  | null
  | undefined;

export function applyMultiplierGroups(
  groups: MultiplierGroup,
  base?: ScoringSettings,
): ScoringSettings {
  return applyMultiplierGroupsShared(groups, base);
}

export function useLeagueScoringSettings(leagueId?: number) {
  const numericLeagueId = typeof leagueId === 'number' ? leagueId : NaN;
  const shouldSkip = !Number.isFinite(numericLeagueId) || numericLeagueId <= 0;

  const query = useGetLeagueScoringProfileQuery({
    variables: { leagueId: numericLeagueId || 0 },
    skip: shouldSkip,
    fetchPolicy: 'cache-and-network',
    // Poll every 5 minutes so projections update when a commissioner changes
    // multipliers mid-week without requiring a manual page refresh (LS-4053).
    pollInterval: 5 * 60 * 1000,
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
  const profileName = profile?.profileName ?? 'Default';

  // Saving custom multipliers updates the profile's entries, never its name,
  // so the name stays "Default". The server sets isOverride only when a stat
  // differs from its default, so reverting every value restores the profile
  // name (LS-10744).
  const scoringLabel = profile?.stats?.some((stat) => stat.isOverride)
    ? 'Custom'
    : profileName;

  return {
    loading: query.loading,
    error: query.error,
    settings,
    profileName,
    scoringLabel,
    profile,
    refetch: query.refetch,
  } as const;
}
