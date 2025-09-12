import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  FlatList,
} from '../../platform-components';
import { safeStyle } from '../../utils/styles';
import {
  canPlayerPlayPosition,
  getPositionDisplayName,
  LeaguePosition,
  TeamMember,
  TeamMemberWithPositions,
} from '../../utils/PositionModels';

// Helper function to humanize strings (replacing the humanize-string dependency)
function humanizeString(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface LineupEditorProps {
  availableRosterSlots: readonly LeaguePosition[];
  onPlayerAdded: (player: TeamMember, position: LeaguePosition) => void;
  onPlayerMoved: (playerOne: TeamMember, playerTwo: TeamMember) => void;
  onPlayerRemoved: (position: LeaguePosition) => void;
  team: readonly TeamMemberWithPositions[];
  projections: Record<number, number>;
  actual: Record<number, number>;
}

interface EmptySlotData {
  type: 'empty-slot-data';
}

interface BenchPlayerData {
  type: 'bench-player-data';
  playerId: number;
}

interface StarterData {
  type: 'starter-data';
  playerId: number | undefined;
  positionMappingId: number;
}

type PlayerData = StarterData | BenchPlayerData | EmptySlotData;

function LineupEditor(props: LineupEditorProps) {
  const {
    availableRosterSlots,
    onPlayerAdded,
    onPlayerMoved,
    projections,
    onPlayerRemoved,
    actual,
    team,
  } = props;

  const [selectedPlayerData, setSelectedPlayerData] = useState<
    BenchPlayerData | StarterData | undefined
  >(undefined);

  const selectedPositionMapping = useMemo(() => {
    switch (selectedPlayerData?.type) {
      case 'starter-data':
        return availableRosterSlots.find(
          (r) => r.id === selectedPlayerData.positionMappingId,
        );
      case 'bench-player-data':
      default:
        return undefined;
    }
  }, [selectedPlayerData, availableRosterSlots]);

  const selectedPlayer = useMemo(() => {
    switch (selectedPlayerData?.type) {
      case 'starter-data':
        return team.find(
          (t) => t.positionId === selectedPlayerData.positionMappingId,
        );
      case 'bench-player-data':
        return team.find((t) => t.playerId === selectedPlayerData.playerId);
      default:
        return undefined;
    }
  }, [selectedPlayerData, team]);

  const onBenchPlayerClicked = useCallback(
    (benchPlayer: TeamMember) => {
      // If no player is selected, return
      if (selectedPlayerData === undefined) {
        setSelectedPlayerData({
          playerId: benchPlayer.playerId,
          type: 'bench-player-data',
        });
        return;
      }

      if (selectedPlayer === benchPlayer) {
        setSelectedPlayerData(undefined);
        return;
      }

      // If a rostered player is selected, insert this player and remove the other player
      if (!selectedPositionMapping) {
        return;
      }

      if (selectedPlayer === undefined) {
        onPlayerAdded(benchPlayer, selectedPositionMapping);
      } else {
        onPlayerMoved(selectedPlayer, benchPlayer);
      }

      setSelectedPlayerData(undefined);
    },
    [
      selectedPlayerData,
      onPlayerMoved,
      selectedPlayer,
      selectedPositionMapping,
      onPlayerAdded,
    ],
  );

  const onRosterSlotClicked = useCallback(
    (positionId: number, playerId: number | undefined) => {
      if (selectedPlayerData === undefined) {
        setSelectedPlayerData({
          playerId: playerId,
          positionMappingId: positionId,
          type: 'starter-data',
        });
        return;
      }

      const thisPlayer = team.find((t) => t.playerId === playerId);
      const thisPositionMapping = availableRosterSlots.find(
        (s) => s.id === positionId,
      );

      // Swap with the existing player
      if (selectedPlayer !== undefined && thisPlayer !== undefined) {
        onPlayerMoved(selectedPlayer, thisPlayer);
      } else if (selectedPlayer && thisPositionMapping) {
        // Move a player to this empty spot
        onPlayerAdded(selectedPlayer, thisPositionMapping);
      } else if (thisPlayer && selectedPositionMapping) {
        // Move this player to an already selected empty spot
        onPlayerAdded(thisPlayer, selectedPositionMapping);
      }
      // Otherwise, neither some piece of data was missing, so skip

      setSelectedPlayerData(undefined);
    },
    [
      availableRosterSlots,
      onPlayerAdded,
      onPlayerMoved,
      selectedPlayer,
      selectedPlayerData,
      selectedPositionMapping,
      team,
    ],
  );

  const rosterSlots = useMemo<Array<PlayerData>>(() => {
    const result: Array<StarterData | BenchPlayerData | EmptySlotData> = [];

    for (const rosterSlot of availableRosterSlots) {
      const teamMember = team.find((t) => t.positionId === rosterSlot.id);

      result.push({
        playerId: teamMember?.playerId,
        positionMappingId: rosterSlot.id,
        type: 'starter-data',
      });
    }

    for (const teamMember of team) {
      if (teamMember.positionId !== null) {
        continue;
      }

      result.push({
        playerId: teamMember.playerId,
        type: 'bench-player-data',
      });
    }

    if (selectedPlayer !== undefined && selectedPositionMapping !== undefined) {
      result.push({
        type: 'empty-slot-data',
      });
    }

    return result;
  }, [team, availableRosterSlots, selectedPlayer, selectedPositionMapping]);

  const onClick = useCallback(
    (item: StarterData | BenchPlayerData | EmptySlotData) => {
      let mapping: LeaguePosition | undefined;
      let teamMember: TeamMember | undefined;

      switch (item.type) {
        case 'starter-data':
          mapping = availableRosterSlots.find(
            (m) => m.id === item.positionMappingId,
          );
          teamMember = team.find((t) => t.positionId === mapping?.id);

          if (mapping) {
            onRosterSlotClicked(mapping?.id, teamMember?.playerId);
          }
          break;
        case 'bench-player-data':
          teamMember = team.find((t) => t.playerId === item.playerId);

          if (teamMember) {
            onBenchPlayerClicked(teamMember);
          }
          break;
        case 'empty-slot-data':
          if (selectedPositionMapping) {
            onPlayerRemoved(selectedPositionMapping);
            setSelectedPlayerData(undefined);
          }
          break;
      }
    },
    [
      availableRosterSlots,
      onBenchPlayerClicked,
      onPlayerRemoved,
      onRosterSlotClicked,
      selectedPositionMapping,
      team,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: PlayerData }) => {
      const positionSlot = availableRosterSlots.find(
        (s) => item.type === 'starter-data' && s.id === item.positionMappingId,
      );
      const teamMember = team.find(
        (t) =>
          (item.type === 'bench-player-data' || item.type === 'starter-data') &&
          t.playerId === item.playerId,
      );

      const projValue = teamMember
        ? projections[teamMember.playerId]
        : undefined;
      const actualValue = teamMember ? actual[teamMember.playerId] : undefined;

      const isSelected = item === selectedPlayerData;
      const isDisabled =
        !canPlayerPlayPosition(selectedPlayer, positionSlot) ||
        !canPlayerPlayPosition(teamMember, selectedPositionMapping) ||
        // This prevents bench players from being assigned to one another
        (selectedPositionMapping === undefined &&
          positionSlot === undefined &&
          selectedPlayer !== undefined &&
          selectedPlayer !== teamMember);

      const getStatusColor = () => {
        if (actualValue === undefined) return '#CCCCCC';
        if (actualValue === projValue) return '#4A90E2';
        if (actualValue > (projValue || 0)) return '#7ED321';
        return '#D0021B';
      };

      return (
        <TouchableOpacity
          style={safeStyle([
            styles.listItem,
            isSelected && styles.selectedItem,
            isDisabled && styles.disabledItem,
          ])}
          onPress={() => onClick(item)}
          disabled={isDisabled}
        >
          {/* Position Button */}
          <View style={styles.positionContainer}>
            <TouchableOpacity
              style={safeStyle([
                styles.positionButton,
                isDisabled && styles.positionButtonDisabled,
              ])}
              onPress={() => onClick(item)}
              disabled={isDisabled}
            >
              <Text style={styles.positionText}>
                {positionSlot?.positionType
                  ? getPositionDisplayName(positionSlot.positionType)
                  : 'BE'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Player Info */}
          <View style={styles.playerInfo}>
            <Text style={styles.playerName}>
              {teamMember?.player
                ? `${teamMember.player.firstName} ${teamMember.player.lastName}`
                : 'Empty'}
            </Text>
            {teamMember?.player?.eligiblePositions && (
              <Text style={styles.eligiblePositions}>
                {teamMember.player.eligiblePositions.join(', ')}
              </Text>
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <Text
              style={safeStyle([styles.statsText, { color: getStatusColor() }])}
            >
              {actualValue
                ? `${actualValue.toFixed(2)} (${
                    projValue?.toFixed(2) || '0.00'
                  })`
                : projValue
                  ? projValue.toFixed(2)
                  : '--'}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [
      actual,
      availableRosterSlots,
      onClick,
      projections,
      selectedPlayer,
      selectedPlayerData,
      selectedPositionMapping,
      team,
    ],
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Lineup Editor</Text>

        <FlatList
          data={rosterSlots}
          renderItem={renderItem}
          keyExtractor={(item, index) => {
            if (item.type === 'starter-data') {
              return `starter-${item.positionMappingId}`;
            } else if (item.type === 'bench-player-data') {
              return `bench-${item.playerId}`;
            } else {
              return `empty-${index}`;
            }
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          scrollEnabled={false}
        />

        {selectedPlayer && (
          <View style={styles.selectedPlayerInfo}>
            <Text style={styles.selectedPlayerText}>
              Selected:{' '}
              {selectedPlayer.player
                ? `${selectedPlayer.player.firstName} ${selectedPlayer.player.lastName}`
                : 'Unknown'}
              {selectedPositionMapping && (
                <Text style={styles.selectedPositionText}>
                  {' '}
                  →{' '}
                  {getPositionDisplayName(selectedPositionMapping.positionType)}
                </Text>
              )}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 20,
    textAlign: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    marginVertical: 2,
  },
  selectedItem: {
    backgroundColor: '#3A4A5C',
    borderColor: '#FFD700',
    borderWidth: 2,
  },
  disabledItem: {
    opacity: 0.5,
  },
  separator: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 1,
  },
  positionContainer: {
    width: 60,
    marginRight: 12,
  },
  positionButton: {
    backgroundColor: '#7ED321',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  positionButtonDisabled: {
    backgroundColor: '#666',
  },
  positionText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  playerInfo: {
    flex: 1,
    marginRight: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  eligiblePositions: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  statsContainer: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  statsText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedPlayerInfo: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderColor: '#FFD700',
    borderWidth: 1,
  },
  selectedPlayerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedPositionText: {
    color: '#FFD700',
  },
});

export { humanizeString };
export { LineupEditor };
