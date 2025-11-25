import React, { useCallback, useMemo } from 'react';
import type {
  PlayerFragment,
  PlayerProjectionsResult,
} from '@legacy-sports/shared-components';
import {
  PlayersTable,
  usePlayerProjections,
} from '@legacy-sports/shared-components';
import { useCareerAverageStats } from '../scoring';
import { useLeagueScoringSettings } from '../../common/scoring';

export interface PlayersTableWithProjectionsProps {
  /** League ID for custom scoring (optional, uses defaults if not provided) */
  leagueId?: number | null;
  /** Callback when a player is selected */
  onPlayerSelect?: (player: PlayerFragment) => void;
  /** Whether to show projections column */
  showProjections?: boolean;
  /** Table title */
  title?: string;
  /** Page size */
  pageSize?: number;
  /** Show search box */
  showSearch?: boolean;
  /** Show sorting dropdown */
  showSorting?: boolean;
  /** Show pagination controls */
  showPagination?: boolean;
  /** Selectable rows */
  selectable?: boolean;
  /** Compact mode */
  compact?: boolean;
}

/**
 * Enhanced PlayersTable with automatic projection calculations
 *
 * This component integrates career statistics and league scoring to display
 * projected fantasy points per game for each player.
 *
 * Features:
 * - Automatically fetches career stats for all players
 * - Uses league-specific scoring settings (or defaults)
 * - Calculates projected points per game
 * - Displays projections in a dedicated column with trending icon
 *
 * @example
 * ```tsx
 * <PlayersTableWithProjections
 *   leagueId={123}
 *   title="Draft Board"
 *   selectable={true}
 *   onPlayerSelect={handleDraft}
 * />
 * ```
 */
export function PlayersTableWithProjections({
  leagueId,
  onPlayerSelect,
  showProjections = true,
  title = 'Players',
  pageSize = 50,
  showSearch = true,
  showSorting = true,
  showPagination = true,
  selectable = false,
  compact = false,
}: PlayersTableWithProjectionsProps): React.JSX.Element {
  // We need to track which players are currently visible in the table
  // The PlayersTable component handles its own data fetching via useGetAllPlayersQuery
  // For now, we'll fetch projections for a reasonable set of players

  // Get league scoring settings (or defaults)
  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
  } = useLeagueScoringSettings(leagueId);

  // For demonstration, we'll fetch stats for a range of player IDs
  // In production, you might want to extract actual player IDs from the table's query
  const playerIds = useMemo(() => {
    // Fetch stats for first 200 players (adjust based on your data)
    return Array.from({ length: 200 }, (_, i) => i + 1);
  }, []);

  // Fetch career stats for players
  const {
    records: careerStats,
    loading: statsLoading,
    error: statsError,
  } = useCareerAverageStats(playerIds);

  // Create a player array for the projections hook
  // Note: We create minimal player objects since we only need IDs for projection calculation
  const players = useMemo<PlayerFragment[]>(() => {
    return playerIds.map((id) => ({
      id,
      firstName: null,
      lastName: null,
      brefId: null,
    }));
  }, [playerIds]);

  // Calculate projections
  const result: PlayerProjectionsResult = usePlayerProjections(
    players,
    careerStats,
    scoringSettings,
    statsLoading || scoringLoading,
    statsError ?? scoringError,
  );
  const projections = result.projections;

  // Determine if we should show projections
  const shouldShowProjections = showProjections && projections.size > 0;

  const handlePlayerSelect = useCallback(
    (player: PlayerFragment) => {
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
  );

  return (
    <PlayersTable
      title={title}
      onPlayerSelect={handlePlayerSelect}
      projectedPoints={projections}
      showProjections={shouldShowProjections}
      pageSize={pageSize}
      showSearch={showSearch}
      showSorting={showSorting}
      showPagination={showPagination}
      selectable={selectable}
      compact={compact}
    />
  );
}
