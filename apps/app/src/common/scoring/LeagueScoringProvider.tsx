import React, { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from '@legacy-sports/scoring';
import {
  type GetLeagueScoringProfileQuery,
  ScoringStatGroup,
  useGetLeagueScoringProfileQuery,
} from '../../api/db/graphql.generated';

export type ScoringSettings = {
  batting: Partial<Record<string, number>>;
  fielding: Partial<Record<string, number>>;
  pitching: Partial<Record<string, number>>;
};

interface LeagueScoringState {
  readonly loading: boolean;
  readonly error: Error | undefined;
  readonly settings: ScoringSettings;
  readonly profileName: string;
  readonly profile: LeagueScoringProfileResult | null;
  readonly refetch: () => Promise<unknown>;
}

type LeagueScoringProfileResult = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

type MultiplierGroup =
  | LeagueScoringProfileResult['multiplierGroups']
  | null
  | undefined;

const LeagueScoringContext = createContext<LeagueScoringState | undefined>(
  undefined,
);

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
        target[entry.sourceColumn] = entry.multiplier;
      }
    }
  }

  return result;
}

export function useLeagueScoringSettings(
  leagueId?: number | null,
): LeagueScoringState {
  const numericLeagueId = Number.isFinite(leagueId ?? NaN)
    ? Number(leagueId)
    : undefined;
  const shouldSkip = !Number.isFinite(numericLeagueId) || (numericLeagueId ?? 0) <= 0;

  const query = useGetLeagueScoringProfileQuery({
    variables: { leagueId: numericLeagueId || 0 },
    skip: shouldSkip,
    fetchPolicy: 'cache-and-network',
  });

  const settings = useMemo(
    () =>
      applyMultiplierGroups(
        query.data?.leagueScoringProfile?.multiplierGroups,
      ),
    [query.data?.leagueScoringProfile?.multiplierGroups],
  );

  const profile = query.data?.leagueScoringProfile ?? null;

  return {
    loading: query.loading,
    error: query.error ?? undefined,
    settings,
    profileName: profile?.profileName ?? 'Default',
    profile,
    refetch: query.refetch,
  } as const;
}

export interface LeagueScoringProviderProps {
  readonly leagueId?: number | null;
  readonly children: React.ReactNode;
}

export function LeagueScoringProvider({
  leagueId,
  children,
}: LeagueScoringProviderProps): React.ReactElement {
  const value = useLeagueScoringSettings(leagueId);

  return (
    <LeagueScoringContext.Provider value={value}>
      {children}
    </LeagueScoringContext.Provider>
  );
}

export function useLeagueScoringContext(): LeagueScoringState {
  const context = useContext(LeagueScoringContext);

  if (!context) {
    throw new Error(
      'useLeagueScoringContext must be used within a LeagueScoringProvider',
    );
  }

  return context;
}
