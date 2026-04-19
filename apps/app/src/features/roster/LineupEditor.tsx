import { memo, useCallback, useMemo, useState } from 'react';
import humanizeString from 'humanize-string';
import { Button, Separator, Text, YStack } from 'tamagui';
import { ScrollView } from 'react-native';
import {
  ALLOWED_POSITIONS,
  PITCHING_POSITIONS,
} from '@legacy-sports/shared-components';
import { normalizeNumericIdentifier } from '../../common/types/app-types';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';

const getEligiblePositions = (player: TeamMemberFragment): string[] =>
  player.player?.eligiblePositions ?? [];

const isPlayerPitcher = (player: TeamMemberFragment): boolean =>
  getEligiblePositions(player).some((pos) => PITCHING_POSITIONS.has(pos));

const isPlayerBatter = (player: TeamMemberFragment): boolean =>
  getEligiblePositions(player).some((pos) => !PITCHING_POSITIONS.has(pos));

const canPlayerPlayPosition = (
  player: TeamMemberFragment | undefined,
  position: LeaguePositionFragment | undefined,
): boolean => {
  if (!player || !position) return true;
  const eligible = getEligiblePositions(player);
  if (eligible.length === 0) return true;
  const allowed = ALLOWED_POSITIONS[position.positionType ?? ''];
  if (!allowed) return false;
  return eligible.some((pos) => allowed.includes(pos));
};

type MaybeNumber = number | null | undefined;

const getPlayerName = (teamMember: TeamMemberFragment | undefined): string => {
  if (!teamMember?.player) {
    return 'Empty';
  }

  const { firstName, lastName } = teamMember.player;
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.trim();

  return combined.length > 0 ? combined : 'Unknown Player';
};

const computeScoreColor = (
  actualValue: MaybeNumber,
  projectedValue: MaybeNumber,
): string => {
  if (!Number.isFinite(actualValue ?? NaN) || actualValue === null) {
    return '$color';
  }

  if (!Number.isFinite(projectedValue ?? NaN) || projectedValue === null) {
    return '$color';
  }

  const actual = Number(actualValue);
  const projected = Number(projectedValue);

  if (Math.abs(actual - projected) < 0.005) {
    return '$blue10';
  }

  return actual > projected ? '$green10' : '$red10';
};

const formatScoreDisplay = (
  actualValue: MaybeNumber,
  projectedValue: MaybeNumber,
): string => {
  const hasActual = Number.isFinite(actualValue ?? NaN) && actualValue !== null;
  const hasProjection =
    Number.isFinite(projectedValue ?? NaN) && projectedValue !== null;

  if (hasActual && hasProjection) {
    return `${Number(actualValue).toFixed(2)} (${Number(projectedValue).toFixed(2)})`;
  }

  if (hasActual) {
    return Number(actualValue).toFixed(2);
  }

  if (hasProjection) {
    return `Projected: ${Number(projectedValue).toFixed(2)} pts`;
  }

  return '';
};

interface PlayerRowProps {
  item: PlayerData;
  isSelected: boolean;
  teamMember: TeamMemberFragment | undefined;
  positionSlot: LeaguePositionFragment | undefined;
  projValue: number | undefined;
  actualValue: number | undefined;
  selectedPlayer: TeamMemberFragment | undefined;
  selectedPositionMapping: LeaguePositionFragment | undefined;
  onClick: (item: PlayerData) => void;
}

const PlayerRow = memo(
  ({
    item,
    isSelected,
    teamMember,
    positionSlot,
    projValue,
    actualValue,
    selectedPlayer,
    selectedPositionMapping,
    onClick,
  }: PlayerRowProps): React.JSX.Element => {
    const scoreColor = computeScoreColor(actualValue, projValue);
    const scoreDisplay = formatScoreDisplay(actualValue, projValue);

    return (
      <YStack
        backgroundColor={isSelected ? '$primary' : '$background'}
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
            : teamMember &&
                isPlayerPitcher(teamMember) &&
                !isPlayerBatter(teamMember)
              ? 'BP'
              : 'BE'}
        </Button>

        <Text flex={1} textAlign="center">
          {getPlayerName(teamMember)}
        </Text>

        <Text color={scoreColor}>{scoreDisplay}</Text>
      </YStack>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.isSelected === next.isSelected &&
    prev.teamMember === next.teamMember &&
    prev.positionSlot === next.positionSlot &&
    prev.projValue === next.projValue &&
    prev.actualValue === next.actualValue &&
    prev.selectedPlayer === next.selectedPlayer &&
    prev.selectedPositionMapping === next.selectedPositionMapping &&
    prev.onClick === next.onClick,
);

export interface LineupEditorProps {
  availableRosterSlots: readonly LeaguePositionFragment[];
  onPlayerAdded: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerMoved: (
    playerOne: TeamMemberFragment,
    playerTwo: TeamMemberFragment,
  ) => void;
  onPlayerRemoved: (position: LeaguePositionFragment) => void;
  team: readonly TeamMemberFragment[];
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

export function LineupEditor(props: LineupEditorProps): React.JSX.Element {
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

  const rosterSlotById = useMemo(() => {
    const map = new Map<number, LeaguePositionFragment>();
    for (const slot of availableRosterSlots) {
      const id = normalizeNumericIdentifier(slot.id);
      if (id !== undefined) map.set(id, slot);
    }
    return map;
  }, [availableRosterSlots]);

  const teamMemberByPlayerId = useMemo(() => {
    const map = new Map<number, TeamMemberFragment>();
    for (const member of team) {
      const id = normalizeNumericIdentifier(member.playerId);
      if (id !== undefined) map.set(id, member);
    }
    return map;
  }, [team]);

  const teamMemberByPositionId = useMemo(() => {
    const map = new Map<number, TeamMemberFragment>();
    for (const member of team) {
      const id = normalizeNumericIdentifier(member.positionId);
      if (id !== undefined) map.set(id, member);
    }
    return map;
  }, [team]);

  const selectedPositionMapping = useMemo(() => {
    switch (selectedPlayerData?.type) {
      case 'starter-data':
        return availableRosterSlots.find(
          (r) =>
            normalizeNumericIdentifier(r.id) ===
            selectedPlayerData.positionMappingId,
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
          (t) =>
            normalizeNumericIdentifier(t.positionId) ===
            selectedPlayerData.positionMappingId,
        );
      case 'bench-player-data':
        return team.find(
          (t) =>
            normalizeNumericIdentifier(t.playerId) ===
            selectedPlayerData.playerId,
        );
      default:
        return undefined;
    }
  }, [selectedPlayerData, team]);

  const onBenchPlayerClicked = useCallback(
    (benchPlayer: TeamMemberFragment) => {
      const benchPlayerId = normalizeNumericIdentifier(benchPlayer.playerId);

      if (benchPlayerId === undefined) {
        return;
      }

      if (selectedPlayerData === undefined) {
        setSelectedPlayerData({
          playerId: benchPlayerId,
          type: 'bench-player-data',
        });
        return;
      }

      if (
        normalizeNumericIdentifier(selectedPlayer?.playerId) === benchPlayerId
      ) {
        setSelectedPlayerData(undefined);
        return;
      }

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
    (
      positionId: number | null | undefined,
      playerId: number | null | undefined,
    ) => {
      const normalizedPositionId = normalizeNumericIdentifier(positionId);
      const normalizedPlayerId = normalizeNumericIdentifier(playerId);

      if (normalizedPositionId === undefined) {
        setSelectedPlayerData(undefined);
        return;
      }

      if (selectedPlayerData === undefined) {
        setSelectedPlayerData({
          playerId: normalizedPlayerId,
          positionMappingId: normalizedPositionId,
          type: 'starter-data',
        });
        return;
      }

      const thisPlayer = team.find(
        (t) => normalizeNumericIdentifier(t.playerId) === normalizedPlayerId,
      );
      const thisPositionMapping = availableRosterSlots.find(
        (s) => normalizeNumericIdentifier(s.id) === normalizedPositionId,
      );

      if (selectedPlayer !== undefined && thisPlayer !== undefined) {
        onPlayerMoved(selectedPlayer, thisPlayer);
      } else if (selectedPlayer && thisPositionMapping) {
        onPlayerAdded(selectedPlayer, thisPositionMapping);
      } else if (thisPlayer && selectedPositionMapping) {
        onPlayerAdded(thisPlayer, selectedPositionMapping);
      }

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
      const mappingId = normalizeNumericIdentifier(rosterSlot?.id);

      if (mappingId === undefined) {
        continue;
      }

      const teamMember = teamMemberByPositionId.get(mappingId);

      result.push({
        playerId: normalizeNumericIdentifier(teamMember?.playerId),
        positionMappingId: mappingId,
        type: 'starter-data',
      });
    }

    for (const teamMember of team) {
      if (teamMember.positionId !== null) {
        continue;
      }

      const benchPlayerId = normalizeNumericIdentifier(teamMember.playerId);

      if (benchPlayerId === undefined) {
        continue;
      }

      result.push({
        playerId: benchPlayerId,
        type: 'bench-player-data',
      });
    }

    if (selectedPlayer !== undefined && selectedPositionMapping !== undefined) {
      result.push({
        type: 'empty-slot-data',
      });
    }

    return result;
  }, [
    team,
    availableRosterSlots,
    teamMemberByPositionId,
    selectedPlayer,
    selectedPositionMapping,
  ]);

  const onClick = useCallback(
    (item: PlayerData) => {
      let mapping: LeaguePositionFragment | undefined;
      let teamMember: TeamMemberFragment | undefined;

      switch (item.type) {
        case 'starter-data':
          mapping = availableRosterSlots.find(
            (m) => normalizeNumericIdentifier(m.id) === item.positionMappingId,
          );
          teamMember = team.find(
            (t) =>
              normalizeNumericIdentifier(t.positionId) ===
              item.positionMappingId,
          );

          if (mapping) {
            const mappingId = normalizeNumericIdentifier(mapping?.id);
            const playerId = normalizeNumericIdentifier(teamMember?.playerId);

            if (mappingId === undefined) {
              break;
            }

            onRosterSlotClicked(mappingId, playerId);
          }
          break;
        case 'bench-player-data':
          teamMember = team.find(
            (t) => normalizeNumericIdentifier(t.playerId) === item.playerId,
          );

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

  const renderPlayerRow = useCallback(
    (item: PlayerData) => {
      const positionSlot =
        item.type === 'starter-data'
          ? rosterSlotById.get(item.positionMappingId)
          : undefined;
      const normalizedItemPlayerId =
        item.type === 'bench-player-data' || item.type === 'starter-data'
          ? item.playerId
          : undefined;
      const teamMember =
        normalizedItemPlayerId !== undefined
          ? teamMemberByPlayerId.get(normalizedItemPlayerId)
          : undefined;
      const playerId = normalizeNumericIdentifier(teamMember?.playerId);
      const projValue =
        playerId !== undefined ? projections[playerId] : undefined;
      const actualValue = playerId !== undefined ? actual[playerId] : undefined;

      return (
        <PlayerRow
          item={item}
          isSelected={item === selectedPlayerData}
          teamMember={teamMember}
          positionSlot={positionSlot}
          projValue={projValue}
          actualValue={actualValue}
          selectedPlayer={selectedPlayer}
          selectedPositionMapping={selectedPositionMapping}
          onClick={onClick}
        />
      );
    },
    [
      actual,
      rosterSlotById,
      teamMemberByPlayerId,
      onClick,
      projections,
      selectedPlayer,
      selectedPlayerData,
      selectedPositionMapping,
    ],
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
            {renderPlayerRow(item)}
            {index < rosterSlots.length - 1 && <Separator />}
          </YStack>
        ))}
      </YStack>
    </ScrollView>
  );
}
