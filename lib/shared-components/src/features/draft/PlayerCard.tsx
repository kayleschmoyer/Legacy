import React, { useCallback, useRef } from 'react';
import { Button, Card, Text, XStack, YStack } from 'tamagui';
import { Animated } from '../../platform-components';

// Types
export interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  adp?: number;
  rank?: number;
  ownership?: number;
  trending?: 'up' | 'down' | 'stable';
  injury?: 'healthy' | 'questionable' | 'doubtful' | 'out';
  stats?: Record<string, unknown>;
  faabValue?: number;
  isWatched?: boolean;
}

export interface PlayerCardProps {
  player: Player;
  onSelect: () => void;
  onWatch?: () => void;
  onAction?: () => void;
  isSelected?: boolean;
  sport?: 'baseball' | 'football' | 'basketball' | 'hockey';
  variant?: 'draft' | 'freeagent' | 'roster' | 'compact';
  showStats?: boolean;
  showOwnership?: boolean;
  actionLabel?: string;
  onMultiSelect?: (id: string) => void;
  multiSelected?: boolean;
  comparisonMode?: boolean;
  onShowStats?: () => void;
  hapticFeedback?: boolean;
}

// Utility function to get position colors
const getPositionColor = (position: string, sport: string): string => {
  const colorMaps: Record<string, Record<string, string>> = {
    baseball: {
      C: '#ef4444',
      '1B': '#f97316',
      '2B': '#eab308',
      '3B': '#22c55e',
      SS: '#06b6d4',
      OF: '#3b82f6',
      P: '#8b5cf6',
    },
    football: {
      QB: '#ef4444',
      RB: '#f97316',
      WR: '#eab308',
      TE: '#22c55e',
      K: '#06b6d4',
      DEF: '#8b5cf6',
    },
  };

  return colorMaps[sport]?.[position] || '#6b7280';
};

// Injury status colors
const getInjuryColor = (injury?: string): string => {
  switch (injury) {
    case 'out':
      return '#ef4444';
    case 'doubtful':
      return '#f97316';
    case 'questionable':
      return '#eab308';
    default:
      return '#22c55e';
  }
};

// Trending indicator
const TrendingIndicator: React.FC<{ trending?: string }> = ({ trending }) => {
  if (!trending || trending === 'stable') return null;

  return (
    <Text
      fontSize="$3"
      color={trending === 'up' ? '$green10' : '$red10'}
      fontWeight="bold"
    >
      {trending === 'up' ? '↗' : '↘'}
    </Text>
  );
};

/**
 * Reusable Player Card Component
 * Supports multiple variants for different contexts (draft, free agents, roster)
 */
function PlayerCard({
  player,
  onSelect,
  onWatch,
  onAction,
  isSelected = false,
  sport = 'baseball',
  variant = 'draft',
  showStats = false,
  showOwnership = false,
  actionLabel = 'Select',
}: PlayerCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // Variant-specific height mappings
  const getMinHeight = () => {
    switch (variant) {
      case 'freeagent':
        return '$12'; // ~160px
      case 'roster':
        return '$10'; // ~120px
      case 'compact':
        return '$8'; // ~100px
      default:
        return '$11'; // ~140px for draft
    }
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
      }}
    >
      <Card
        borderRadius="$4"
        marginHorizontal="$1.5"
        marginVertical="$1"
        elevation={3}
        shadowColor="$gray12"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.25}
        shadowRadius={4}
        borderWidth={isSelected ? 2 : 1}
        borderColor={isSelected ? '$blue8' : '$gray6'}
        backgroundColor={isSelected ? '$blue2' : '$gray3'}
        minHeight={getMinHeight()}
        pressStyle={{
          scale: 0.98,
        }}
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        cursor="pointer"
        padding="$3"
      >
        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="flex-start"
          marginBottom="$2"
        >
          <YStack flex={1} marginRight="$2">
            <Text
              fontSize="$4"
              fontWeight="bold"
              color="$gray12"
              marginBottom="$1"
              numberOfLines={1}
            >
              {player.name}
            </Text>
            <Text fontSize="$2" color="$gray10">
              {player.team}
            </Text>
          </YStack>

          <XStack alignItems="center" space="$1">
            <YStack
              backgroundColor={getPositionColor(player.position, sport)}
              borderRadius="$2"
              paddingHorizontal="$2"
              paddingVertical="$1"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="$1" fontWeight="bold" color="white">
                {player.position}
              </Text>
            </YStack>

            {player.injury && player.injury !== 'healthy' && (
              <YStack
                backgroundColor={getInjuryColor(player.injury)}
                borderRadius="$2"
                paddingHorizontal="$2"
                paddingVertical="$1"
                alignItems="center"
                justifyContent="center"
                marginLeft="$1"
              >
                <Text fontSize="$1" fontWeight="bold" color="white">
                  {player.injury.charAt(0).toUpperCase()}
                </Text>
              </YStack>
            )}
          </XStack>
        </XStack>

        {/* Stats Row */}
        {showStats && player.stats && (
          <XStack justifyContent="space-between" marginBottom="$2">
            {Object.entries(player.stats)
              .slice(0, 3)
              .map(([key, value]) => (
                <YStack key={key} alignItems="center" flex={1}>
                  <Text fontSize="$1" color="$gray9" fontWeight="600">
                    {key}
                  </Text>
                  <Text fontSize="$3" color="$gray12" fontWeight="bold">
                    {typeof value === 'string' || typeof value === 'number'
                      ? value
                      : value != null
                        ? JSON.stringify(value)
                        : '-'}
                  </Text>
                </YStack>
              ))}
          </XStack>
        )}

        {/* Footer */}
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" space="$2">
            {player.rank && (
              <Text fontSize="$2" color="$blue10" fontWeight="600">
                #{player.rank}
              </Text>
            )}
            {player.adp && (
              <Text fontSize="$2" color="$gray10">
                ADP: {player.adp}
              </Text>
            )}
            {showOwnership && player.ownership !== undefined && (
              <Text fontSize="$2" color="$gray10">
                {player.ownership}% owned
              </Text>
            )}
          </XStack>

          <XStack alignItems="center" space="$2">
            <TrendingIndicator trending={player.trending} />

            {variant === 'freeagent' && player.faabValue && (
              <Text fontSize="$2" color="$green10" fontWeight="600">
                ${player.faabValue}
              </Text>
            )}
          </XStack>
        </XStack>

        {/* Action Buttons */}
        {(onWatch || onAction) && (
          <XStack space="$2" marginTop="$2">
            {onWatch && (
              <Button
                size="$2"
                variant={player.isWatched ? 'outlined' : 'outlined'}
                backgroundColor={player.isWatched ? '$yellow3' : 'transparent'}
                borderColor={player.isWatched ? '$yellow8' : '$gray6'}
                color={player.isWatched ? '$yellow11' : '$gray10'}
                onPress={onWatch}
                flex={1}
                aria-label={
                  player.isWatched
                    ? 'Remove from watch list'
                    : 'Add to watch list'
                }
              >
                {player.isWatched ? '★' : '☆'}
              </Button>
            )}

            {onAction && (
              <Button
                size="$2"
                backgroundColor="$blue9"
                color="white"
                fontWeight="600"
                onPress={onAction}
                flex={2}
              >
                {actionLabel}
              </Button>
            )}
          </XStack>
        )}
      </Card>
    </Animated.View>
  );
}

export { PlayerCard };
