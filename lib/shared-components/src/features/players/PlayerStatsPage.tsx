import React from 'react';
import { H1, Text, YStack } from 'tamagui';
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from './PlayerStatsTypes';

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
 * This is a stub implementation that will be enhanced with actual functionality.
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
  return (
    <YStack padding="$4" space="$4">
      {showHeader && <H1>{title}</H1>}

      <Text>Player Statistics Page - Implementation in progress</Text>

      <Text fontSize="$3" color="$gray10">
        View Mode: {initialViewMode} | Page Size: {initialPageSize}
      </Text>

      {showActions && (
        <YStack space="$2">
          <Text fontSize="$2" color="$gray8">
            Available actions: Player Details, Export, Share
          </Text>
        </YStack>
      )}

      {/* TODO: Implement actual player statistics table */}
      {/* TODO: Implement filtering functionality */}
      {/* TODO: Implement sorting and pagination */}
      {/* TODO: Integrate with GraphQL career statistics API */}
    </YStack>
  );
}
