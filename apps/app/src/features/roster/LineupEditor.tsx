import { useCallback, useMemo, useState } from 'react';
import humanizeString from 'humanize-string';
import { Button, Separator, Text, YStack } from 'tamagui';
import { ListRenderItem, ScrollView } from 'react-native';
import { canPlayerPlayPosition } from '../../common/temporary_models/Models';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
  TeamMemberWithPositionsFragment,
} from '../../api/db/graphql.generated';

export interface LineupEditorProps {
  availableRosterSlots: readonly LeaguePositionFragment[];
  onPlayerAdded: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment
  ) => void;
  onPlayerMoved: (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment
  ) => void;
  onPlayerRemoved: (position: LeaguePositionFragment) => void;
  team: readonly TeamMemberWithPositionsFragment[];
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

export function LineupEditor(props: LineupEditorProps): JSX.Element {
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call

  const selectedPositionMapping = useMemo(() => {
    switch (selectedPlayerData?.type) {
      case 'starter-data':
        return availableRosterSlots.find(
          (r) => r.id === selectedPlayerData.positionMappingId
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
          (t) => t.positionId === selectedPlayerData.positionMappingId
        );
      case 'bench-player-data':
        return team.find((t) => t.playerId === selectedPlayerData.playerId);
      default:
        return undefined;
    }
  }, [selectedPlayerData, team]);

  const onBenchPlayerClicked = useCallback(
    (benchPlayer: TeamMemberFragment) => {
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
    ]
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
        (s) => s.id === positionId
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
    ]
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
      let mapping: LeaguePositionFragment | undefined;
      let teamMember: TeamMemberFragment | undefined;

      switch (item.type) {
        case 'starter-data':
          mapping = availableRosterSlots.find(
            (m) => m.id === item.positionMappingId
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
    ]
  );

  const onRenderItem = useCallback<ListRenderItem<PlayerData>>(
    ({ item }) => {
      const positionSlot = availableRosterSlots.find(
        (s) => item.type === 'starter-data' && s.id === item.positionMappingId
      );
      const teamMember = team.find(
        (t) =>
          (item.type === 'bench-player-data' || item.type === 'starter-data') &&
          t.playerId === item.playerId
      );

      const projValue = teamMember
        ? projections[teamMember.playerId]
        : undefined;
      const actualValue = teamMember ? actual[teamMember.playerId] : undefined;

      return (
        <YStack
          backgroundColor={
            item === selectedPlayerData ? '$primary' : '$background'
          }
          padding="$3"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Button
            size="$2"
            onPress={() => onClick(item)}
            disabled={
              !canPlayerPlayPosition(selectedPlayer, positionSlot) ||
              !canPlayerPlayPosition(teamMember, selectedPositionMapping) ||
              // This prevents bench players from being assigned to one another
              (selectedPositionMapping === undefined &&
                positionSlot === undefined &&
                selectedPlayer !== undefined &&
                selectedPlayer !== teamMember)
            }
            theme="active"
          >
            {positionSlot?.positionType
              ? humanizeString(positionSlot.positionType)
                  .toUpperCase()
                  .replace(' ', '')
              : 'BE'}
          </Button>

          <Text flex={1} textAlign="center">
            {teamMember?.player?.name || 'Empty'}
          </Text>

          <Text
            color={
              actualValue === undefined
                ? '$color'
                : actualValue === projValue
                ? '$blue10'
                : actualValue > (projValue || 0)
                ? '$green10'
                : '$red10'
            }
          >
            {actualValue
              ? `${actualValue.toFixed(2)} (${projValue?.toFixed(2)})`
              : projValue
              ? projValue.toFixed(2)
              : ''}
          </Text>
        </YStack>
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
    ]
  );

  return (
    <ScrollView>
      <YStack
        alignItems="center"
        justifyContent="center"
        data-testId="lineup-editor"
      >
        {rosterSlots.map((item, index) => (
          <YStack key={index}>
            {onRenderItem({ item, index })}
            {index < rosterSlots.length - 1 && <Separator />}
          </YStack>
        ))}
      </YStack>
    </ScrollView>
  );
}
