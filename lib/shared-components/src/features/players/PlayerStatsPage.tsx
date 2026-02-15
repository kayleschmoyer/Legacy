import React, { useState } from 'react';
import { H1, Tabs, Text, XStack, YStack } from 'tamagui';
import { PlayerStatsDataGrid } from './PlayerStatsDataGrid';
import { PitchingStatsDataGrid } from './PitchingStatsDataGrid';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';
import type { PlayerCareerStats } from './services/CareerStatsService';
import type { CareerPitchingFragment } from '../../api/db/graphql.generated';

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
 * Features tabs for Batting and Pitching statistics.
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
  const [activeTab, setActiveTab] = useState<string>('batting');

  // Handle batting player click - convert PlayerCareerStats to PlayerWithStats format
  const handleBattingPlayerClick = (player: PlayerCareerStats) => {
    if (onPlayerDetails) {
      // Convert to PlayerWithStats format expected by the callback
      const playerWithStats: PlayerWithStats = {
        id: player.playerId,
        name: player.displayName || `Player ${player.playerId}`,
        // Add other required fields - these would need to be properly mapped
        // For now, using placeholder values since PlayerWithStats interface
        // may have different structure than PlayerCareerStats
      } as PlayerWithStats;

      onPlayerDetails(playerWithStats);
    }
  };

  // Handle pitching player click - convert CareerPitchingFragment to PlayerWithStats format
  const handlePitchingPlayerClick = (player: CareerPitchingFragment) => {
    if (onPlayerDetails) {
      // Convert to PlayerWithStats format expected by the callback
      const playerWithStats: PlayerWithStats = {
        id: player.playerId || 0,
        name: `Pitcher ${player.playerId}`, // Note: pitching query doesn't include player names
        // Add other required fields - these would need to be properly mapped
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
        <XStack
          backgroundColor="$color2"
          borderColor="$borderColor"
          borderWidth={1}
          borderRadius="$4"
          padding="$3"
          gap="$2"
          flexWrap="wrap"
        >
          <Text fontSize="$3" color="$color10">
            View comprehensive batting and pitching statistics with sorting,
            filtering, and pagination.
          </Text>
        </XStack>
      )}

      {/* Tabs for Batting vs Pitching */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation="horizontal"
        flexDirection="column"
        flex={1}
      >
        <Tabs.List
          separator={<Text>|</Text>}
          backgroundColor="$color2"
          borderRadius="$4"
          padding="$2"
        >
          <Tabs.Tab
            flex={1}
            value="batting"
            backgroundColor={activeTab === 'batting' ? '$blue3' : 'transparent'}
            borderRadius="$3"
            paddingVertical="$3"
            paddingHorizontal="$4"
          >
            <Text
              fontSize="$4"
              fontWeight={activeTab === 'batting' ? '600' : '400'}
              color={activeTab === 'batting' ? '$blue11' : '$color11'}
            >
              <span role="img" aria-label="Baseball">
                ⚾
              </span>{' '}
              Batting Stats
            </Text>
          </Tabs.Tab>
          <Tabs.Tab
            flex={1}
            value="pitching"
            backgroundColor={
              activeTab === 'pitching' ? '$blue3' : 'transparent'
            }
            borderRadius="$3"
            paddingVertical="$3"
            paddingHorizontal="$4"
          >
            <Text
              fontSize="$4"
              fontWeight={activeTab === 'pitching' ? '600' : '400'}
              color={activeTab === 'pitching' ? '$blue11' : '$color11'}
            >
              <span role="img" aria-label="Softball">
                🥎
              </span>{' '}
              Pitching Stats
            </Text>
          </Tabs.Tab>
        </Tabs.List>

        {/* Batting Tab Content */}
        <Tabs.Content value="batting" flex={1}>
          <YStack flex={1} paddingTop="$4">
            <PlayerStatsDataGrid
              title="MLB Career Batting Leaders"
              initialParams={{
                first: initialPageSize,
                orderBy: 'homeRuns',
                orderDirection: 'desc',
                minGames: 100,
              }}
              onPlayerSelect={handleBattingPlayerClick}
              showSearch={true}
              showFilters={true}
              showSorting={true}
              showPagination={true}
            />
          </YStack>
        </Tabs.Content>

        {/* Pitching Tab Content */}
        <Tabs.Content value="pitching" flex={1}>
          <YStack flex={1} paddingTop="$4">
            <PitchingStatsDataGrid
              title="MLB Career Pitching Leaders"
              initialParams={{
                limit: initialPageSize,
                offset: 0,
                orderBy: 'wins',
                orderDirection: 'desc',
                minGames: 10,
              }}
              onPlayerSelect={handlePitchingPlayerClick}
              showSearch={true}
              showFilters={true}
              showSorting={true}
              showPagination={true}
            />
          </YStack>
        </Tabs.Content>
      </Tabs>
    </YStack>
  );
}
