import React, { useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';

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
}

// Utility function to get position colors
const getPositionColor = (position: string, sport: string): string => {
  const colorMaps = {
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
      style={[
        styles.trendingIcon,
        { color: trending === 'up' ? '#22c55e' : '#ef4444' },
      ]}
    >
      {trending === 'up' ? '↗' : '↘'}
    </Text>
  );
};

/**
 * Reusable Player Card Component
 * Supports multiple variants for different contexts (draft, free agents, roster)
 */
export function PlayerCard({
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
}: PlayerCardProps): JSX.Element {
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

  const cardStyle = [
    styles.playerCard,
    styles[`${variant}Card`],
    isSelected && styles.selectedCard,
  ];

  return (
    <Animated.View style={[cardStyle, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardContent}
        activeOpacity={1}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.playerInfo}>
            <Text style={styles.playerName} numberOfLines={1}>
              {player.name}
            </Text>
            <Text style={styles.teamText}>{player.team}</Text>
          </View>

          <View style={styles.badgeContainer}>
            <View
              style={[
                styles.positionBadge,
                { backgroundColor: getPositionColor(player.position, sport) },
              ]}
            >
              <Text style={styles.positionText}>{player.position}</Text>
            </View>

            {player.injury && player.injury !== 'healthy' && (
              <View
                style={[
                  styles.injuryBadge,
                  { backgroundColor: getInjuryColor(player.injury) },
                ]}
              >
                <Text style={styles.injuryText}>
                  {player.injury.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats Row */}
        {showStats && player.stats && (
          <View style={styles.statsRow}>
            {Object.entries(player.stats)
              .slice(0, 3)
              .map(([key, value]) => (
                <View key={key} style={styles.statItem}>
                  <Text style={styles.statLabel}>{key}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.footerLeft}>
            {player.rank && <Text style={styles.rankText}>#{player.rank}</Text>}
            {player.adp && (
              <Text style={styles.adpText}>ADP: {player.adp}</Text>
            )}
            {showOwnership && player.ownership !== undefined && (
              <Text style={styles.ownershipText}>
                {player.ownership}% owned
              </Text>
            )}
          </View>

          <View style={styles.footerRight}>
            <TrendingIndicator trending={player.trending} />

            {variant === 'freeagent' && player.faabValue && (
              <Text style={styles.faabText}>${player.faabValue}</Text>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        {(onWatch || onAction) && (
          <View style={styles.actionRow}>
            {onWatch && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.watchButton,
                  player.isWatched && styles.watchedButton,
                ]}
                onPress={onWatch}
              >
                <Text style={styles.actionButtonText}>
                  {player.isWatched ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            )}

            {onAction && (
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryAction]}
                onPress={onAction}
              >
                <Text style={styles.actionButtonText}>{actionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  playerCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    marginHorizontal: 6,
    marginVertical: 4,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  draftCard: {
    minHeight: 140,
  },

  freeagentCard: {
    minHeight: 160,
  },

  rosterCard: {
    minHeight: 120,
  },

  compactCard: {
    minHeight: 100,
    marginVertical: 2,
  },

  selectedCard: {
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: '#1e3a8a',
  },

  cardContent: {
    padding: 12,
    flex: 1,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },

  playerInfo: {
    flex: 1,
    marginRight: 8,
  },

  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },

  teamText: {
    fontSize: 12,
    color: '#9ca3af',
  },

  badgeContainer: {
    flexDirection: 'row',
    gap: 4,
  },

  positionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 32,
    alignItems: 'center',
  },

  positionText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  injuryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },

  injuryText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },

  statItem: {
    alignItems: 'center',
    flex: 1,
  },

  statLabel: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 2,
  },

  statValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },

  footerLeft: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },

  footerRight: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },

  rankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3b82f6',
  },

  adpText: {
    fontSize: 11,
    color: '#9ca3af',
  },

  ownershipText: {
    fontSize: 11,
    color: '#eab308',
  },

  faabText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#22c55e',
  },

  trendingIcon: {
    fontSize: 14,
    fontWeight: 'bold',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },

  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },

  watchButton: {
    backgroundColor: '#374151',
    flex: 1,
  },

  watchedButton: {
    backgroundColor: '#eab308',
  },

  primaryAction: {
    backgroundColor: '#3b82f6',
    flex: 2,
  },

  actionButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
