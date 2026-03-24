import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  canPlayerPlayPosition,
  getPositionDisplayName,
  isBatter,
  isPitcher,
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
        if (actualValue === undefined) return '$gray10';
        if (actualValue === projValue) return '$blue10';
        if (actualValue > (projValue || 0)) return '$green10';
        return '$red10';
      };

      return (
        <Card
          backgroundColor={isSelected ? '$blue3' : '$gray3'}
          borderColor={isSelected ? '$yellow10' : '$gray6'}
          borderWidth={isSelected ? 2 : 1}
          padding="$3"
          marginVertical="$1"
          opacity={isDisabled ? 0.5 : 1}
          pressStyle={{ scale: 0.98 }}
          onPress={() => onClick(item)}
          disabled={isDisabled}
          cursor="pointer"
        >
          <XStack alignItems="center" space="$3">
            {/* Position Button */}
            <Button
              backgroundColor={isDisabled ? '$gray7' : '$green9'}
              width={60}
              minHeight={36}
              borderRadius="$2"
              pressStyle={{ scale: 0.95 }}
              onPress={() => onClick(item)}
              disabled={isDisabled}
            >
              <Text
                color="$gray12"
                fontWeight="bold"
                fontSize="$2"
                textAlign="center"
              >
                {positionSlot?.positionType
                  ? getPositionDisplayName(positionSlot.positionType)
                  : teamMember && isPitcher(teamMember) && !isBatter(teamMember)
                    ? 'BP'
                    : 'BE'}
              </Text>
            </Button>

            {/* Player Info */}
            <YStack flex={1} marginRight="$3">
              <Text
                fontSize="$4"
                fontWeight="600"
                color="$gray12"
                marginBottom="$1"
              >
                {teamMember?.player
                  ? teamMember.nickname ||
                    `${teamMember.player.firstName} ${teamMember.player.lastName}`
                  : 'Empty'}
              </Text>
              {teamMember?.player?.eligiblePositions && (
                <Text fontSize="$2" color="$gray10">
                  {teamMember.player.eligiblePositions.join(', ')}
                </Text>
              )}
            </YStack>

            {/* Stats */}
            <YStack alignItems="flex-end" minWidth={80}>
              <Text fontSize="$3" fontWeight="500" color={getStatusColor()}>
                {actualValue
                  ? `${actualValue.toFixed(2)} (${
                      projValue?.toFixed(2) || '0.00'
                    })`
                  : projValue
                    ? projValue.toFixed(2)
                    : '--'}
              </Text>
            </YStack>
          </XStack>
        </Card>
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
    <ScrollView flex={1} backgroundColor="$gray1">
      <YStack padding="$4">
        <Text
          fontSize="$8"
          fontWeight="bold"
          color="$yellow10"
          marginBottom="$5"
          textAlign="center"
        >
          Lineup Editor
        </Text>

        <YStack space="$1">
          {rosterSlots.map((item, index) => (
            <React.Fragment
              key={
                item.type === 'starter-data'
                  ? `starter-${item.positionMappingId}`
                  : item.type === 'bench-player-data'
                    ? `bench-${item.playerId}`
                    : `empty-${index}`
              }
            >
              {renderItem({ item })}
              {index < rosterSlots.length - 1 && (
                <Separator borderColor="$gray6" />
              )}
            </React.Fragment>
          ))}
        </YStack>

        {selectedPlayer && (
          <Card
            marginTop="$5"
            padding="$4"
            backgroundColor="$gray3"
            borderColor="$yellow10"
            borderWidth={1}
          >
            <Text color="$gray12" fontSize="$4" fontWeight="600">
              Selected:{' '}
              {selectedPlayer.player
                ? selectedPlayer.nickname ||
                  `${selectedPlayer.player.firstName} ${selectedPlayer.player.lastName}`
                : 'Unknown'}
              {selectedPositionMapping && (
                <Text color="$yellow10">
                  {' '}
                  →{' '}
                  {getPositionDisplayName(selectedPositionMapping.positionType)}
                </Text>
              )}
            </Text>
          </Card>
        )}
      </YStack>
    </ScrollView>
  );
}

export { humanizeString };
export { LineupEditor };
