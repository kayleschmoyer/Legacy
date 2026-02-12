import { useLazyQuery, useQuery } from '@apollo/client/react';
import {
  GetAllPlayers,
  type GetAllPlayersQuery,
  type GetAllPlayersQueryVariables,
} from '../../api/db/graphql.generated';

// Local interface definition (TODO: Import from PlayerStatsTypes when import issue is resolved)
interface PlayerStatsColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

// Re-export existing types and hooks from the base PlayersApi
export {
  type PlayerFragment,
  type GetAllPlayersQuery,
  type GetAllPlayersQueryVariables,
  PLAYER_FRAGMENT,
  GET_ALL_PLAYERS,
  useGetAllPlayersQuery,
  useGetAllPlayersLazyQuery,
} from './PlayersApi';

// Re-export additional GraphQL types for career batting stats
export {
  type GetCareerBattingStatsQuery,
  type GetCareerBattingStatsQueryVariables,
  useGetCareerBattingStatsQuery,
  useGetCareerBattingStatsLazyQuery,
} from '../../api/db/graphql.generated';

// Extract Player type from GraphQL query result
type PlayerFromQuery = NonNullable<GetAllPlayersQuery['players']>[number];

// Basic Player type matching current Pothos schema
export interface BasicPlayer {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  displayName?: string;
}

// Hook for getting players with the stats table query (currently just basic data)
export function usePlayerStatsQuery(variables?: {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: string;
}) {
  const { data, loading, error, refetch, fetchMore } = useQuery<
    GetAllPlayersQuery,
    GetAllPlayersQueryVariables
  >(GetAllPlayers, {
    variables,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  // Transform to consistent format with display name
  const transformedData =
    data?.players?.map((player: PlayerFromQuery) => ({
      id: player?.id ?? 0,
      firstName: player?.firstName ?? '',
      lastName: player?.lastName ?? '',
      brefId: player?.brefId ?? '',
      displayName:
        `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() ||
        'Unknown Player',
    })) ?? [];

  return {
    data: transformedData,
    loading,
    error,
    refetch,
    fetchMore,
    totalCount: transformedData.length,
  };
}

// Lazy query version for on-demand loading
export function usePlayerStatsLazyQuery() {
  const [executeQuery, { data, loading, error }] = useLazyQuery<
    GetAllPlayersQuery,
    GetAllPlayersQueryVariables
  >(GetAllPlayers, {
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const loadPlayers = (variables?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: string;
  }) => {
    return executeQuery({ variables });
  };

  // Transform data to consistent format
  const transformedData =
    data?.players?.map((player: PlayerFromQuery) => ({
      id: player?.id ?? 0,
      firstName: player?.firstName ?? '',
      lastName: player?.lastName ?? '',
      brefId: player?.brefId ?? '',
      displayName:
        `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() ||
        'Unknown Player',
    })) ?? [];

  return {
    loadPlayers,
    data: transformedData,
    totalCount: transformedData.length,
    loading,
    error,
  };
}

// Utility function for basic sorting options
export function getAvailableSortOptions() {
  return [
    { field: 'firstName', direction: 'ASC', label: 'First Name (A-Z)' },
    { field: 'firstName', direction: 'DESC', label: 'First Name (Z-A)' },
    { field: 'lastName', direction: 'ASC', label: 'Last Name (A-Z)' },
    { field: 'lastName', direction: 'DESC', label: 'Last Name (Z-A)' },
  ];
}

// Basic types for simple filtering (for future expansion)
export interface BasicPlayerFilters {
  firstName?: string;
  lastName?: string;
  brefId?: string;
}

export interface BasicSortOption {
  field: string;
  direction: 'ASC' | 'DESC';
  label: string;
}

// Basic column definitions for the current simple schema
export const BASIC_COLUMNS: PlayerStatsColumn[] = [
  {
    key: 'firstName',
    label: 'First Name',
    sortable: true,
    align: 'left',
    width: 150,
  },
  {
    key: 'lastName',
    label: 'Last Name',
    sortable: true,
    align: 'left',
    width: 150,
  },
  {
    key: 'brefId',
    label: 'Baseball Reference ID',
    sortable: false,
    align: 'left',
    width: 200,
  },
];

// For backward compatibility with existing components
export const BATTING_FOCUSED_COLUMNS = BASIC_COLUMNS;
export const PITCHING_FOCUSED_COLUMNS = BASIC_COLUMNS;
export const COMBINED_COLUMNS = BASIC_COLUMNS;
export const PLAYER_STATS_SORT_OPTIONS = getAvailableSortOptions();
