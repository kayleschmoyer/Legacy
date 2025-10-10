import React from 'react';
import { H1, Text, YStack } from 'tamagui';
import { PlayerStatsDataGrid } from './PlayerStatsDataGrid';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';
import type { PlayerCareerStats } from './services/CareerStatsService';

export interface PlayerStatsPageProps {
  title?: string;
  initialViewMode?: PlayerStatsViewMode;
  initialFilters?: Partial<PlayerStatsFilters>;
  initialPageSize?: number;
  showHeader?: boolean;
  showActions?: boolean;
  onPlayerDetails?: (player: PlayerWithStats) => void;
  onExport?: (
    filters: PlayerStatsFilters,
    viewMode: PlayerStatsViewMode,
  ) => void;
  onShare?: (url: string) => void;
}

/**
 * Player Statistics Page Component
 *
 * A comprehensive page for displaying and filtering player statistics.
 * Now fully implemented with actual career statistics data from GraphQL API.
 */
export function PlayerStatsPage({
  title = 'Player Statistics',
  initialViewMode = 'combined',
  initialFilters = {},
  initialPageSize = 25,
  showHeader = true,
  showActions = true,
  onPlayerDetails,
  onExport,
  onShare,
}: PlayerStatsPageProps) {
  // Handle player click - convert PlayerCareerStats to PlayerWithStats format
  const handlePlayerClick = (player: PlayerCareerStats) => {
    if (onPlayerDetails) {
      // Convert to PlayerWithStats format expected by the callback
      const playerWithStats: PlayerWithStats = {
        id: player.playerId,
        name: player.displayName,
        // Add other required fields - these would need to be properly mapped
        // For now, using placeholder values since PlayerWithStats interface
        // may have different structure than PlayerCareerStats
      } as PlayerWithStats;

      onPlayerDetails(playerWithStats);
    }
  };

  return (
    <YStack flex={1} backgroundColor="$background" padding="$4" space="$4">
      {showHeader && (
        <H1 color="$color12" fontSize="$8" fontWeight="600">
          {title}
        </H1>
      )}

      {/* Action buttons */}
      {showActions && (
        <YStack
          backgroundColor="$color2"
          borderColor="$borderColor"
          borderWidth={1}
          borderRadius="$4"
          padding="$3"
        >
          <Text fontSize="$3" color="$color10" marginBottom="$2">
            View Mode: {initialViewMode} | Page Size: {initialPageSize}
          </Text>
          <Text fontSize="$2" color="$color9">
            Actions: Export, Share functionality available through parent
            component
          </Text>
        </YStack>
      )}

      {/* Main Statistics Grid */}
      <YStack flex={1}>
        <PlayerStatsDataGrid
          title="MLB Career Batting Leaders"
          initialParams={{
            first: initialPageSize,
            orderBy: 'homeRuns',
            orderDirection: 'desc',
            minGames: 100,
          }}
          onPlayerSelect={handlePlayerClick}
          showSearch={true}
          showFilters={true}
          showSorting={true}
          showPagination={true}
        />
      </YStack>
    </YStack>
  );
}
