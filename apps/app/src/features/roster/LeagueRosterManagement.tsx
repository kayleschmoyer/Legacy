/* eslint-disable */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H4,
  H5,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';
import { normalizeNumericIdentifier } from '../../common/types/app-types';
import { useTeamMemberProjections } from '../scoring';
import {
  PITCHING_POSITIONS,
  ALLOWED_POSITIONS,
  getPositionDisplayName,
} from '@legacy-sports/shared-components';
import { getPlayerName } from '@legacy-sports/shared-components';

/** Returns the list of eligible position strings for a team member */
const getEligiblePositions = (player: TeamMemberFragment): string[] =>
  player.player?.eligiblePositions ?? [];

/** True when the player has at least one pitching-eligible position (SP / RP) */
const isPlayerPitcher = (player: TeamMemberFragment): boolean =>
  getEligiblePositions(player).some((pos) => PITCHING_POSITIONS.has(pos));

/** True when the player has at least one non-pitching position */
const isPlayerBatter = (player: TeamMemberFragment): boolean =>
  getEligiblePositions(player).some((pos) => !PITCHING_POSITIONS.has(pos));

/** True when the player qualifies as both a pitcher and a position player */
const isDualEligible = (player: TeamMemberFragment): boolean =>
  isPlayerPitcher(player) && isPlayerBatter(player);

const canPlayerPlayPosition = (
  player: TeamMemberFragment,
  position: LeaguePositionFragment,
): boolean => {
  const eligible = getEligiblePositions(player);
  if (eligible.length === 0) return true; // fallback if no data
  const allowed = ALLOWED_POSITIONS[position.positionType ?? ''];
  if (!allowed) return false;
  return eligible.some((pos) => allowed.includes(pos));
};

interface RosterSlotProps {
  position: LeaguePositionFragment;
  assignedPlayer?: TeamMemberFragment | null;
  availablePlayers: readonly TeamMemberFragment[];
  selectedPlayer?: TeamMemberFragment | null;
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  isSelected?: boolean;
  projectionValue?: number;
  isProjectionLoading?: boolean;
}

function RosterSlot({
  position,
  assignedPlayer,
  availablePlayers,
  selectedPlayer,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSelect,
  isSelected = false,
  projectionValue,
  isProjectionLoading = false,
}: RosterSlotProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const eligiblePlayers = useMemo(() => {
    return availablePlayers.filter(
      (player) => player && canPlayerPlayPosition(player, position),
    );
  }, [availablePlayers, position]);

  const handleSlotPress = useCallback(() => {
    if (assignedPlayer) {
      // If there's an assigned player, select it
      onPlayerSelect(assignedPlayer);
    } else if (
      selectedPlayer &&
      canPlayerPlayPosition(selectedPlayer, position)
    ) {
      // If we have a selected player and they can play this position, assign them
      onPlayerAssign(selectedPlayer, position);
      onPlayerSelect(null);
    }
  }, [
    assignedPlayer,
    selectedPlayer,
    position,
    onPlayerAssign,
    onPlayerSelect,
  ]);

  const handleRemovePlayer = useCallback(() => {
    if (assignedPlayer) {
      onPlayerRemove(position);
    }
  }, [assignedPlayer, position, onPlayerRemove]);

  const canAcceptSelectedPlayer =
    selectedPlayer && canPlayerPlayPosition(selectedPlayer, position);

  return (
    <Card
      padding="$3"
      margin="$1"
      borderWidth={1}
      borderColor={
        isSelected
          ? '$blue8'
          : canAcceptSelectedPlayer
            ? '$green8'
            : assignedPlayer
              ? '$gray6'
              : '$gray4'
      }
      backgroundColor={
        isSelected
          ? '$blue2'
          : canAcceptSelectedPlayer
            ? '$green2'
            : assignedPlayer
              ? '$gray2'
              : '$gray1'
      }
      pressStyle={{
        scale: 0.98,
        borderColor: '$blue10',
      }}
      onPress={handleSlotPress}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <YStack flex={1}>
          <Text fontSize="$3" fontWeight="600" color="$gray12">
            {getPositionDisplayName(position.positionType || '')}
          </Text>
          <Text fontSize="$4" color={assignedPlayer ? '$gray12' : '$gray8'}>
            {assignedPlayer ? getPlayerName(assignedPlayer) : 'Empty'}
          </Text>
          {assignedPlayer && (
            <Text fontSize="$2" color="$gray10">
              Team Member ID: {assignedPlayer.id}
            </Text>
          )}
          {assignedPlayer && (
            <Text fontSize="$2" color="$gray10">
              {isProjectionLoading
                ? 'Calculating projection...'
                : projectionValue !== undefined
                  ? `Projected: ${projectionValue.toFixed(2)} pts`
                  : 'Projected: N/A'}
            </Text>
          )}
        </YStack>

        {assignedPlayer && (
          <Button
            size="$2"
            theme="red"
            onPress={handleRemovePlayer}
            marginLeft="$2"
          >
            Remove
          </Button>
        )}
      </XStack>
    </Card>
  );
}

interface PlayerPoolProps {
  title: string;
  players: readonly TeamMemberFragment[];
  selectedPlayer?: TeamMemberFragment | null;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  projections: Record<number, number>;
  isLoading: boolean;
  emptyText: string;
}

function PlayerPool({
  title,
  players,
  selectedPlayer,
  onPlayerSelect,
  projections,
  isLoading,
  emptyText,
}: PlayerPoolProps): React.JSX.Element {
  return (
    <YStack space="$2">
      <XStack justifyContent="space-between" alignItems="center">
        <H5>{title}</H5>
        <Text fontSize="$2" color="$gray10">
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </Text>
      </XStack>
      {players.length === 0 ? (
        <Text color="$gray10" fontSize="$3" textAlign="center" padding="$4">
          {emptyText}
        </Text>
      ) : (
        players.map((player) => {
          const playerId = normalizeNumericIdentifier(player.playerId);
          const projection =
            playerId === undefined ? undefined : projections[playerId];
          const eligible = getEligiblePositions(player);
          const dual = isDualEligible(player);

          return (
            <Card
              key={player.id}
              padding="$3"
              borderWidth={1}
              borderColor={
                selectedPlayer?.id === player.id ? '$blue8' : '$gray4'
              }
              backgroundColor={
                selectedPlayer?.id === player.id ? '$blue2' : '$background'
              }
              pressStyle={{
                scale: 0.98,
                borderColor: '$blue10',
              }}
              onPress={() =>
                onPlayerSelect(selectedPlayer?.id === player.id ? null : player)
              }
            >
              <XStack justifyContent="space-between" alignItems="center">
                <YStack space="$1">
                  <Text fontSize="$4" fontWeight="500">
                    {getPlayerName(player)}
                  </Text>
                  {eligible.length > 0 && (
                    <XStack gap="$1" flexWrap="wrap">
                      {eligible.map((pos) => (
                        <Text
                          key={pos}
                          fontSize="$1"
                          fontWeight="600"
                          color={
                            PITCHING_POSITIONS.has(pos) ? '$blue10' : '$green10'
                          }
                        >
                          {pos}
                        </Text>
                      ))}
                      {dual && (
                        <Text fontSize="$1" fontWeight="700" color="$yellow10">
                          2-WAY
                        </Text>
                      )}
                    </XStack>
                  )}
                  <Text fontSize="$2" color="$gray10">
                    {isLoading
                      ? 'Calculating projection...'
                      : projection !== undefined
                        ? `Projected: ${projection.toFixed(2)} pts`
                        : 'Projected: N/A'}
                  </Text>
                </YStack>
                {selectedPlayer?.id === player.id && (
                  <Text color="$blue10" fontSize="$3" fontWeight="600">
                    Selected
                  </Text>
                )}
              </XStack>
            </Card>
          );
        })
      )}
    </YStack>
  );
}

export interface LeagueRosterManagementProps {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly TeamMemberFragment[];
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  loading?: boolean;
  leagueId?: number | null;
}

export function LeagueRosterManagement({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  loading = false,
  leagueId,
}: LeagueRosterManagementProps): React.JSX.Element {
  const [selectedPlayer, setSelectedPlayer] =
    useState<TeamMemberFragment | null>(null);

  const {
    projections,
    loading: loadingProjections,
    error: projectionError,
  } = useTeamMemberProjections(
    teamPlayers,
    leagueId ?? teamPlayers[0]?.leagueId ?? null,
  );

  const getProjectionForPlayer = useCallback(
    (player: TeamMemberFragment | null | undefined) => {
      const playerId = normalizeNumericIdentifier(player?.playerId);
      if (playerId === undefined) {
        return undefined;
      }

      return projections[playerId];
    },
    [projections],
  );

  // Group positions by type for better organization
  const groupedPositions = useMemo(() => {
    const pitchingPositions = positions.filter(
      (p) => p.positionType === 'SP' || p.positionType === 'RP',
    );
    const battingPositions = positions.filter(
      (p) =>
        p.positionType && !['SP', 'RP', 'IF', 'XDH'].includes(p.positionType),
    );
    const utilityPositions = positions.filter(
      (p) => p.positionType === 'IF' || p.positionType === 'XDH',
    );

    return {
      pitching: pitchingPositions,
      batting: battingPositions,
      utility: utilityPositions,
    };
  }, [positions]);

  // Get assigned players for each position
  const getAssignedPlayer = useCallback(
    (position: LeaguePositionFragment) => {
      return teamPlayers.find((player) => player.positionId === position.id);
    },
    [teamPlayers],
  );

  // Split unassigned players into bullpen (pitchers) and bench (fielders)
  const benchPlayers = useMemo(
    () => teamPlayers.filter((player) => !player.positionId),
    [teamPlayers],
  );

  const bullpenPlayers = useMemo(
    () => benchPlayers.filter((p) => isPlayerPitcher(p) && !isPlayerBatter(p)),
    [benchPlayers],
  );

  const benchFielders = useMemo(
    () => benchPlayers.filter((p) => isPlayerBatter(p) && !isPlayerPitcher(p)),
    [benchPlayers],
  );

  const dualEligiblePlayers = useMemo(
    () => benchPlayers.filter((p) => isDualEligible(p)),
    [benchPlayers],
  );

  const unclassifiedPlayers = useMemo(
    () => benchPlayers.filter((p) => getEligiblePositions(p).length === 0),
    [benchPlayers],
  );

  const handlePlayerAssign = useCallback(
    (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      onPlayerAssign(player, position);
      setSelectedPlayer(null);
    },
    [onPlayerAssign],
  );

  const handlePlayerRemove = useCallback(
    (position: LeaguePositionFragment) => {
      onPlayerRemove(position);
    },
    [onPlayerRemove],
  );

  if (loading || loadingProjections) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text>Loading roster...</Text>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack padding="$4" space="$4">
        <H4>Roster Management</H4>

        {projectionError && (
          <Card
            padding="$3"
            backgroundColor="$red2"
            borderColor="$red8"
            borderWidth={1}
          >
            <Text fontSize="$3" color="$red11">
              Unable to calculate projections: {projectionError.message}
            </Text>
          </Card>
        )}

        {selectedPlayer && (
          <Card
            padding="$3"
            backgroundColor="$blue2"
            borderColor="$blue8"
            borderWidth={1}
          >
            <Text fontSize="$4" fontWeight="600" color="$blue12">
              Selected: {getPlayerName(selectedPlayer)}
            </Text>
            <Text fontSize="$3" color="$blue11">
              Click on an available position to assign this player
            </Text>
          </Card>
        )}

        {/* Pitching Positions */}
        <YStack space="$2">
          <H5>Pitchers</H5>
          <XStack flexWrap="wrap" justifyContent="space-between">
            {groupedPositions.pitching.map((position) => {
              const assigned = getAssignedPlayer(position);
              return (
                <RosterSlot
                  key={position.id}
                  position={position}
                  assignedPlayer={assigned}
                  availablePlayers={teamPlayers}
                  selectedPlayer={selectedPlayer}
                  onPlayerAssign={handlePlayerAssign}
                  onPlayerRemove={handlePlayerRemove}
                  onPlayerSelect={setSelectedPlayer}
                  isSelected={assigned?.id === selectedPlayer?.id}
                  projectionValue={getProjectionForPlayer(assigned)}
                  isProjectionLoading={loadingProjections}
                />
              );
            })}
          </XStack>
        </YStack>

        <Separator />

        {/* Batting Positions */}
        <YStack space="$2">
          <H5>Position Players</H5>
          <XStack flexWrap="wrap" justifyContent="space-between">
            {groupedPositions.batting.map((position) => {
              const assigned = getAssignedPlayer(position);
              return (
                <RosterSlot
                  key={position.id}
                  position={position}
                  assignedPlayer={assigned}
                  availablePlayers={teamPlayers}
                  selectedPlayer={selectedPlayer}
                  onPlayerAssign={handlePlayerAssign}
                  onPlayerRemove={handlePlayerRemove}
                  onPlayerSelect={setSelectedPlayer}
                  isSelected={assigned?.id === selectedPlayer?.id}
                  projectionValue={getProjectionForPlayer(assigned)}
                  isProjectionLoading={loadingProjections}
                />
              );
            })}
          </XStack>
        </YStack>

        <Separator />

        {/* Utility Positions */}
        {groupedPositions.utility.length > 0 && (
          <YStack space="$2">
            <H5>Utility</H5>
            <XStack flexWrap="wrap" justifyContent="space-between">
              {groupedPositions.utility.map((position) => {
                const assigned = getAssignedPlayer(position);
                return (
                  <RosterSlot
                    key={position.id}
                    position={position}
                    assignedPlayer={assigned}
                    availablePlayers={teamPlayers}
                    selectedPlayer={selectedPlayer}
                    onPlayerAssign={handlePlayerAssign}
                    onPlayerRemove={handlePlayerRemove}
                    onPlayerSelect={setSelectedPlayer}
                    isSelected={assigned?.id === selectedPlayer?.id}
                    projectionValue={getProjectionForPlayer(assigned)}
                    isProjectionLoading={loadingProjections}
                  />
                );
              })}
            </XStack>
          </YStack>
        )}

        <Separator />

        {/* Bullpen - Pitchers */}
        <PlayerPool
          title="Bullpen"
          players={[...bullpenPlayers, ...dualEligiblePlayers]}
          projections={projections}
          isLoading={loadingProjections}
          selectedPlayer={selectedPlayer}
          onPlayerSelect={setSelectedPlayer}
          emptyText="No pitchers in the bullpen"
        />

        <Separator />

        {/* Bench - Position Players */}
        <PlayerPool
          title="Bench"
          players={[
            ...benchFielders,
            ...dualEligiblePlayers,
            ...unclassifiedPlayers,
          ]}
          projections={projections}
          isLoading={loadingProjections}
          selectedPlayer={selectedPlayer}
          onPlayerSelect={setSelectedPlayer}
          emptyText="No position players on the bench"
        />
      </YStack>
    </ScrollView>
  );
}
