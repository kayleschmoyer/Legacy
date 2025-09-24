import React, { useRef } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { Button, Text, XStack, YStack } from '@tamagui/core';

// Types
interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  rank: number;
  ownership: number;
  trending: 'up' | 'down' | 'stable';
  injury: 'healthy' | 'questionable' | 'doubtful' | 'out';
  stats: Record<string, number>;
  projections: Record<string, number>;
  isWatched: boolean;
  faabValue: number;
}

interface SportConfig {
  colors: {
    accent: string;
    primary: string;
    secondary: string;
  };
  positions: string[];
  sortOptions: string[];
  stats: string[];
}

const SPORT_CONFIGS: Record<string, SportConfig> = {
  baseball: {
    colors: { accent: '#ff6b35', primary: '#1a1a1a', secondary: '#2d2d2d' },
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
    sortOptions: ['Rank', 'AVG', 'HR', 'RBI', 'ERA', 'WHIP', 'Ownership%'],
    stats: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K', 'SV', 'OBP'],
  },
  football: {
    colors: { accent: '#f97316', primary: '#7c2d12', secondary: '#ea580c' },
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    sortOptions: [
      'Rank',
      'PassYds',
      'PassTDs',
      'RushYds',
      'RushTDs',
      'RecYds',
      'RecTDs',
      'Ownership%',
    ],
    stats: ['PassYds', 'PassTDs', 'RushYds', 'RushTDs', 'RecYds', 'RecTDs'],
  },
};

const getPositionColor = (position: string, sport: string): string => {
  const baseballColors: Record<string, string> = {
    '1B': '#ff8c42',
    '2B': '#ffa726',
    '3B': '#ffb74d',
    C: '#ff6b35',
    OF: '#ffe0b2',
    P: '#e65100',
    SS: '#ffcc80',
  };
  const footballColors: Record<string, string> = {
    DEF: '#ffedd5',
    K: '#fed7aa',
    QB: '#ea580c',
    RB: '#f97316',
    TE: '#fdba74',
    WR: '#fb923c',
  };
  const colors = sport === 'baseball' ? baseballColors : footballColors;
  return colors[position] || '#6b7280';
};

export const PlayerCard: React.FC<{
  player: Player;
  sport: string;
  onSelect: () => void;
  onWatch: () => void;
  onClaim: () => void;
  isSelected?: boolean;
}> = ({ player, sport, onSelect, onWatch, onClaim, isSelected }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const sportConfig = SPORT_CONFIGS[sport];

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const getTrendingIcon = () => {
    switch (player.trending) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getInjuryColor = () => {
    switch (player.injury) {
      case 'healthy':
        return '#22c55e';
      case 'questionable':
        return '#f59e0b';
      case 'doubtful':
        return '#f97316';
      case 'out':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        flex: 1,
        margin: 8,
      }}
    >
      <YStack
        backgroundColor="rgba(255,255,255,0.1)"
        borderColor={
          isSelected ? sportConfig.colors.accent : 'rgba(255,255,255,0.2)'
        }
        borderRadius="$4"
        borderWidth={isSelected ? 2 : 1}
        padding="$4"
        shadowColor="#000"
        shadowOffset={{ height: 4, width: 0 }}
        shadowOpacity={0.3}
        shadowRadius={8}
        elevation={8}
      >
        <TouchableOpacity
          onPress={onSelect}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
        >
          {/* Header */}
          <XStack justifyContent="space-between" marginBottom="$3">
            <YStack flex={1}>
              <Text
                color="#ffffff"
                fontSize="$6"
                fontWeight="700"
                marginBottom="$1"
              >
                {player.name}
              </Text>
              <XStack alignItems="center" gap="$2">
                <Text color="rgba(255,255,255,0.7)" fontSize="$4">
                  {player.team}
                </Text>
                <YStack
                  backgroundColor={getPositionColor(player.position, sport)}
                  borderRadius="$2"
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                >
                  <Text color="#ffffff" fontSize="$2" fontWeight="700">
                    {player.position}
                  </Text>
                </YStack>
                <YStack
                  backgroundColor={getInjuryColor()}
                  borderRadius="$1"
                  paddingHorizontal="$1.5"
                  paddingVertical="$1"
                >
                  <Text color="#ffffff" fontSize="$1" fontWeight="700">
                    {player.injury.toUpperCase()}
                  </Text>
                </YStack>
              </XStack>
            </YStack>
            <XStack alignItems="center" gap="$2">
              <TouchableOpacity onPress={onWatch}>
                <Text fontSize="$5">{player.isWatched ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
              <Text fontSize="$4">{getTrendingIcon()}</Text>
            </XStack>
          </XStack>

          {/* Stats */}
          <XStack justifyContent="space-between" marginBottom="$3">
            <YStack alignItems="center">
              <Text color="rgba(255,255,255,0.6)" fontSize="$3">
                Rank:
              </Text>
              <Text color="#ffffff" fontSize="$4" fontWeight="600">
                #{player.rank}
              </Text>
            </YStack>
            <YStack alignItems="center">
              <Text color="rgba(255,255,255,0.6)" fontSize="$3">
                Own%:
              </Text>
              <Text color="#ffffff" fontSize="$4" fontWeight="600">
                {player.ownership}%
              </Text>
            </YStack>
            <YStack alignItems="center">
              <Text color="rgba(255,255,255,0.6)" fontSize="$3">
                FAAB:
              </Text>
              <Text
                color={sportConfig.colors.accent}
                fontSize="$4"
                fontWeight="600"
              >
                ${player.faabValue}
              </Text>
            </YStack>
          </XStack>

          {/* Action Button */}
          <Button
            backgroundColor={sportConfig.colors.accent}
            borderRadius="$2"
            onPress={onClaim}
            pressStyle={{ opacity: 0.8 }}
          >
            <Text color="#ffffff" fontSize="$4" fontWeight="600">
              Add Waiver Claim
            </Text>
          </Button>
        </TouchableOpacity>
      </YStack>
    </Animated.View>
  );
};
