import React from 'react';
import { Card, H4, Separator, Text, XStack, YStack } from 'tamagui';
import { BRAND_GOLD_LIGHT, BRAND_NAVY_LIGHT } from '../../constants/colors';

export interface PlayerProjection {
  playerId: number;
  playerName: string;
  matchupProjection: number;
  careerProjection: number;
  selectedGamesCount: number;
  accumulatedStats?: Record<string, number>;
}

export interface PlayerProjectionsProps {
  projections: PlayerProjection[];
  gamesRemaining: number;
  loading?: boolean;
  error?: Error | null;
}

/**
 * PlayerProjections - Displays both matchup and career projections side-by-side
 * Shows accumulated stats for selected games and games remaining counter
 */
export function PlayerProjections({
  projections,
  gamesRemaining,
  loading = false,
  error = null,
}: PlayerProjectionsProps) {
  if (loading) {
    return (
      <Card padding="$4">
        <Text color="$gray11">Loading projections...</Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card padding="$4">
        <Text color="$red10">Error: {error.message}</Text>
      </Card>
    );
  }

  if (projections.length === 0) {
    return (
      <Card padding="$4">
        <Text color="$gray11">No player projections available</Text>
      </Card>
    );
  }

  return (
    <Card elevate bordered padding="$4" width="100%">
      <YStack space="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <H4>Roster Projections</H4>
          {gamesRemaining > 0 && (
            <Text fontSize="$3" color="$orange10" fontWeight="bold">
              {gamesRemaining} games remaining
            </Text>
          )}
        </XStack>

        <Separator />

        {/* Header Row */}
        <XStack
          paddingVertical="$2"
          paddingHorizontal="$2"
          borderBottomWidth={1}
          borderBottomColor="$gray6"
          gap="$2"
        >
          <YStack flex={1}>
            <Text fontSize="$2" fontWeight="bold" color="$gray11">
              Player
            </Text>
          </YStack>
          <YStack width={80} alignItems="center">
            <Text fontSize="$2" fontWeight="bold" color={BRAND_GOLD_LIGHT}>
              Matchup
            </Text>
          </YStack>
          <YStack width={80} alignItems="center">
            <Text fontSize="$2" fontWeight="bold" color="$gray11">
              Career
            </Text>
          </YStack>
          <YStack
            width={60}
            alignItems="center"
            display="none"
            $gtSm={{ display: 'flex' }}
          >
            <Text fontSize="$2" fontWeight="bold" color="$gray11">
              Games
            </Text>
          </YStack>
        </XStack>

        {/* Player Rows */}
        <YStack>
          {projections.map((player, index) => (
            <XStack
              key={player.playerId}
              paddingVertical="$3"
              paddingHorizontal="$2"
              backgroundColor={index % 2 === 0 ? '$background' : '$gray2'}
              gap="$2"
              alignItems="center"
            >
              <YStack flex={1}>
                <Text fontSize="$3" fontWeight="600">
                  {player.playerName}
                </Text>
              </YStack>
              <YStack width={80} alignItems="center">
                <Text fontSize="$4" fontWeight="bold" color={BRAND_GOLD_LIGHT}>
                  {player.matchupProjection.toFixed(2)}
                </Text>
              </YStack>
              <YStack width={80} alignItems="center">
                <Text fontSize="$4" color="$gray11">
                  {player.careerProjection.toFixed(2)}
                </Text>
              </YStack>
              <YStack
                width={60}
                alignItems="center"
                display="none"
                $gtSm={{ display: 'flex' }}
              >
                <Text fontSize="$3" color="$gray10">
                  {player.selectedGamesCount}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>

        {/* Legend */}
        <XStack
          space="$4"
          justifyContent="center"
          paddingTop="$2"
          flexWrap="wrap"
        >
          <XStack space="$1" alignItems="center">
            <YStack
              width={12}
              height={12}
              backgroundColor={BRAND_NAVY_LIGHT}
              borderRadius="$2"
            />
            <Text fontSize="$2" color="$gray11">
              Matchup Projection (selected season)
            </Text>
          </XStack>
          <XStack space="$1" alignItems="center">
            <YStack
              width={12}
              height={12}
              backgroundColor="$gray10"
              borderRadius="$2"
            />
            <Text fontSize="$2" color="$gray11">
              Career Average
            </Text>
          </XStack>
        </XStack>

        {/* Real-time update note */}
        <Text
          fontSize="$2"
          color="$gray10"
          textAlign="center"
          fontStyle="italic"
        >
          Updates in real-time as games are selected
        </Text>
      </YStack>
    </Card>
  );
}
