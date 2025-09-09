import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

// Generic player interface for baseball cards
export interface BaseballPlayer {
  id: number;
  name: string;
  position: string;
  team: string;
  battingAvg?: number;
  homeRuns?: number;
  rbi?: number;
  era?: number;
  wins?: number;
  saves?: number;
  jerseyNumber?: number;
  age?: number;
  fantasyPoints?: number;
}

export interface PlayerCardProps {
  player: BaseballPlayer;
  onPress?: (player: BaseballPlayer) => void;
  showStats?: 'batting' | 'pitching' | 'both';
  compact?: boolean;
  style?: object;
}

export function PlayerCard({
  player,
  onPress,
  showStats = 'both',
  compact = false,
  style,
}: PlayerCardProps): JSX.Element {
  const isPitcher =
    player.position === 'P' ||
    player.position === 'SP' ||
    player.position === 'RP';

  const handlePress = () => {
    onPress?.(player);
  };

  const formatStat = (stat: number | undefined): string => {
    if (stat === undefined || stat === null) return '-';
    return stat.toString();
  };

  const formatAverage = (avg: number | undefined): string => {
    if (avg === undefined || avg === null) return '.---';
    return avg.toFixed(3);
  };

  const formatERA = (era: number | undefined): string => {
    if (era === undefined || era === null) return '-.--';
    return era.toFixed(2);
  };

  const CardComponent = onPress ? TouchableOpacity : View;

  return (
    <CardComponent
      style={[styles.card, compact && styles.compactCard, style]}
      onPress={onPress ? handlePress : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.playerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {player.name}
          </Text>
          <View style={styles.positionTeam}>
            <Text style={styles.position}>{player.position}</Text>
            <Text style={styles.separator}>•</Text>
            <Text style={styles.team}>{player.team}</Text>
          </View>
        </View>

        {player.jerseyNumber && (
          <View style={styles.jerseyContainer}>
            <Text style={styles.jerseyNumber}>#{player.jerseyNumber}</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      {!compact && (
        <View style={styles.statsContainer}>
          {/* Batting Stats */}
          {(showStats === 'batting' || showStats === 'both') && !isPitcher && (
            <View style={styles.statRow}>
              {player.battingAvg !== undefined && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>AVG</Text>
                  <Text style={styles.statValue}>
                    {formatAverage(player.battingAvg)}
                  </Text>
                </View>
              )}
              {player.homeRuns !== undefined && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>HR</Text>
                  <Text style={styles.statValue}>
                    {formatStat(player.homeRuns)}
                  </Text>
                </View>
              )}
              {player.rbi !== undefined && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>RBI</Text>
                  <Text style={styles.statValue}>{formatStat(player.rbi)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Pitching Stats */}
          {(showStats === 'pitching' || showStats === 'both') && isPitcher && (
            <View style={styles.statRow}>
              {player.era !== undefined && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>ERA</Text>
                  <Text style={styles.statValue}>{formatERA(player.era)}</Text>
                </View>
              )}
              {player.wins !== undefined && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>W</Text>
                  <Text style={styles.statValue}>
                    {formatStat(player.wins)}
                  </Text>
                </View>
              )}
              {player.saves !== undefined && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>SV</Text>
                  <Text style={styles.statValue}>
                    {formatStat(player.saves)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Fantasy Points */}
          {player.fantasyPoints !== undefined && (
            <View style={styles.fantasyContainer}>
              <Text style={styles.fantasyLabel}>Fantasy Points</Text>
              <Text style={styles.fantasyValue}>
                {formatStat(player.fantasyPoints)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Compact mode - just key stats */}
      {compact && (
        <View style={styles.compactStats}>
          {isPitcher ? (
            <Text style={styles.compactText}>
              ERA: {formatERA(player.era)} | W: {formatStat(player.wins)}
            </Text>
          ) : (
            <Text style={styles.compactText}>
              AVG: {formatAverage(player.battingAvg)} | HR:{' '}
              {formatStat(player.homeRuns)}
            </Text>
          )}
        </View>
      )}

      {/* Age indicator */}
      {player.age && (
        <View style={styles.ageContainer}>
          <Text style={styles.ageText}>Age {player.age}</Text>
        </View>
      )}
    </CardComponent>
  );
}

// Compact list version
export interface PlayerCardListProps {
  players: BaseballPlayer[];
  onPlayerPress?: (player: BaseballPlayer) => void;
  showStats?: 'batting' | 'pitching' | 'both';
}

export function PlayerCardList({
  players,
  onPlayerPress,
  showStats = 'both',
}: PlayerCardListProps): JSX.Element {
  return (
    <View style={styles.listContainer}>
      {players.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          onPress={onPlayerPress}
          showStats={showStats}
          compact={true}
          style={styles.listItem}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  compactCard: {
    padding: 12,
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  playerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  positionTeam: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  position: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  separator: {
    color: '#666',
    marginHorizontal: 6,
  },
  team: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  jerseyContainer: {
    backgroundColor: '#FFD700',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  jerseyNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  statsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#3A3A3A',
    paddingTop: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  fantasyContainer: {
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    borderRadius: 8,
    padding: 8,
  },
  fantasyLabel: {
    fontSize: 11,
    color: '#87CEEB',
    marginBottom: 2,
  },
  fantasyValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#87CEEB',
  },
  compactStats: {
    marginTop: 8,
  },
  compactText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  ageContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#444',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ageText: {
    fontSize: 10,
    color: '#CCCCCC',
  },
  listContainer: {
    flex: 1,
  },
  listItem: {
    marginHorizontal: 0,
  },
});
