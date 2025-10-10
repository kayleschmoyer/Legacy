import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { H4, H5, Text } from 'tamagui';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';

// Helper function to get player name from TeamMember's player field
const getPlayerName = (teamMember: TeamMemberFragment | null | undefined): string => {
  if (!teamMember?.player) return 'Unknown Player';
  
  const { firstName, lastName } = teamMember.player;
  return `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown Player';
};

// Simple position validation for web app - for demo purposes, allow all players to play all positions
const canPlayerPlayPosition = (player: TeamMemberFragment, position: LeaguePositionFragment): boolean => {
  // In a real app, you'd check player eligible positions against league position requirements
  // For now, always return true for demo purposes
  return true;
};

interface RosterSlotProps {
  position: LeaguePositionFragment;
  assignedPlayer?: TeamMemberFragment | null;
  availablePlayers: readonly TeamMemberFragment[];
  selectedPlayer?: TeamMemberFragment | null;
  onPlayerAssign: (player: TeamMemberFragment, position: LeaguePositionFragment) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  isSelected?: boolean;
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
}: RosterSlotProps): React.JSX.Element {
  const eligiblePlayers = useMemo(() => {
    return availablePlayers.filter(player => 
      player && player.id && canPlayerPlayPosition(player, position)
    );
  }, [availablePlayers, position]);

  const handleSlotPress = useCallback(() => {
    if (assignedPlayer) {
      // If there's an assigned player, select it
      onPlayerSelect(assignedPlayer);
    } else if (selectedPlayer && selectedPlayer.id && canPlayerPlayPosition(selectedPlayer, position)) {
      // If we have a selected player and they can play this position, assign them
      onPlayerAssign(selectedPlayer, position);
      onPlayerSelect(null);
    }
  }, [assignedPlayer, selectedPlayer, position, onPlayerAssign, onPlayerSelect]);

  const handleRemovePlayer = useCallback(() => {
    if (assignedPlayer) {
      onPlayerRemove(position);
    }
  }, [assignedPlayer, position, onPlayerRemove]);

  const getPositionDisplayName = (positionType: string) => {
    const displayNames: Record<string, string> = {
      SP: 'SP',
      RP: 'RP', 
      C: 'C',
      '1B': '1B',
      '2B': '2B',
      '3B': '3B',
      SS: 'SS',
      LF: 'LF',
      CF: 'CF', 
      RF: 'RF',
      OF: 'OF',
      IF: 'IF',
      DH: 'DH',
      XDH: 'DH',
    };
    return displayNames[positionType] || positionType;
  };

  const canAcceptSelectedPlayer = selectedPlayer && selectedPlayer.id && canPlayerPlayPosition(selectedPlayer, position);

  return (
    <Card 
      padding="$3"
      margin="$1"
      borderWidth={1}
      borderColor={
        isSelected 
          ? "$blue8" 
          : canAcceptSelectedPlayer 
            ? "$green8"
            : assignedPlayer 
              ? "$gray6" 
              : "$orange6"
      }
      backgroundColor={
        isSelected 
          ? "$blue2" 
          : canAcceptSelectedPlayer 
            ? "$green2"
            : assignedPlayer 
              ? "$gray2" 
              : "$orange1"
      }
      cursor="pointer"
      hoverStyle={{
        scale: 0.98,
        borderColor: "$blue10"
      }}
      onPress={handleSlotPress}
      minWidth={120}
      maxWidth={200}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <YStack flex={1}>
          <Text fontSize="$3" fontWeight="600" color="$gray12">
            {getPositionDisplayName(position.positionType || '')}
          </Text>
          <Text fontSize="$4" color={assignedPlayer ? "$gray12" : "$gray8"}>
            {assignedPlayer
              ? getPlayerName(assignedPlayer)
              : 'Empty Slot'
            }
          </Text>
          {assignedPlayer ? (
            <Text fontSize="$2" color="$gray10">
              Team Member ID: {assignedPlayer.id}
            </Text>
          ) : (
            <Text fontSize="$2" color="$gray8" fontStyle="italic">
              Click to assign player
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

interface AvailablePlayerListProps {
  players: readonly TeamMemberFragment[];
  selectedPlayer?: TeamMemberFragment | null;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
}

function AvailablePlayerList({ 
  players, 
  selectedPlayer, 
  onPlayerSelect 
}: AvailablePlayerListProps): React.JSX.Element {
  const unassignedPlayers = useMemo(() => {
    return players.filter(player => !player.positionId);
  }, [players]);

  return (
    <YStack space="$2">
      <H5>Available Players</H5>
      {unassignedPlayers.length === 0 ? (
        <Text color="$gray10" fontSize="$3" textAlign="center" padding="$4">
          No unassigned players
        </Text>
      ) : (
        <YStack space="$2">
          {unassignedPlayers.map((player) => (
            <Card
              key={player.id}
              padding="$3"
              borderWidth={1}
              borderColor={selectedPlayer?.id === player.id ? "$blue8" : "$gray4"}
              backgroundColor={selectedPlayer?.id === player.id ? "$blue2" : "$background"}
              cursor="pointer"
              hoverStyle={{
                scale: 0.98,
                borderColor: "$blue10"
              }}
              onPress={() => onPlayerSelect(selectedPlayer?.id === player.id ? null : player)}
            >
              <XStack justifyContent="space-between" alignItems="center">
                <YStack>
                  <Text fontSize="$4" fontWeight="500">
                    {getPlayerName(player)}
                  </Text>
                  <Text fontSize="$3" color="$gray10">
                    Team Member ID: {player.id}
                  </Text>
                </YStack>
                {selectedPlayer?.id === player.id && (
                  <Text color="$blue10" fontSize="$3" fontWeight="600">
                    Selected
                  </Text>
                )}
              </XStack>
            </Card>
          ))}
        </YStack>
      )}
    </YStack>
  );
}

export interface LeagueRosterManagementProps {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly TeamMemberFragment[];
  onPlayerAssign: (player: TeamMemberFragment, position: LeaguePositionFragment) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  loading?: boolean;
}

export function LeagueRosterManagement({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  loading = false,
}: LeagueRosterManagementProps): React.JSX.Element {
  const [selectedPlayer, setSelectedPlayer] = useState<TeamMemberFragment | null>(null);

  // Group positions by type for better organization
  const groupedPositions = useMemo(() => {
    const pitchingPositions = positions.filter(p => 
      p.positionType === 'SP' || p.positionType === 'RP'
    );
    const battingPositions = positions.filter(p => 
      p.positionType && !['SP', 'RP', 'IF', 'XDH'].includes(p.positionType)
    );
    const utilityPositions = positions.filter(p => 
      p.positionType === 'IF' || p.positionType === 'XDH'
    );

    return {
      pitching: pitchingPositions,
      batting: battingPositions,
      utility: utilityPositions,
    };
  }, [positions]);

  // Get assigned players for each position
  const getAssignedPlayer = useCallback((position: LeaguePositionFragment) => {
    return teamPlayers.find(player => player.positionId === position.id);
  }, [teamPlayers]);

  const handlePlayerAssign = useCallback((player: TeamMemberFragment, position: LeaguePositionFragment) => {
    onPlayerAssign(player, position);
    setSelectedPlayer(null);
  }, [onPlayerAssign]);

  const handlePlayerRemove = useCallback((position: LeaguePositionFragment) => {
    onPlayerRemove(position);
  }, [onPlayerRemove]);

  if (loading) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text>Loading roster...</Text>
      </YStack>
    );
  }

  const filledPositions = positions.filter(position => getAssignedPlayer(position));
  const emptyPositions = positions.filter(position => !getAssignedPlayer(position));

  return (
    <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
      <YStack padding="$4" space="$4" maxWidth={1200} alignSelf="center">
        <H4>Roster Management</H4>
        
        {/* Roster Status Summary */}
        <Card padding="$3" backgroundColor="$gray2" borderColor="$gray6" borderWidth={1}>
          <XStack justifyContent="space-between" alignItems="center">
            <YStack>
              <Text fontSize="$5" fontWeight="600" color="$gray12">
                Roster Status
              </Text>
              <Text fontSize="$3" color="$gray10">
                {filledPositions.length} of {positions.length} positions filled
              </Text>
            </YStack>
            <XStack space="$4">
              <YStack alignItems="center">
                <Text fontSize="$6" fontWeight="bold" color="$green10">
                  {filledPositions.length}
                </Text>
                <Text fontSize="$2" color="$gray10">Filled</Text>
              </YStack>
              <YStack alignItems="center">
                <Text fontSize="$6" fontWeight="bold" color="$orange10">
                  {emptyPositions.length}
                </Text>
                <Text fontSize="$2" color="$gray10">Empty</Text>
              </YStack>
            </XStack>
          </XStack>
        </Card>
        
        {selectedPlayer && (
          <Card padding="$3" backgroundColor="$blue2" borderColor="$blue8" borderWidth={1}>
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
          <XStack alignItems="center" justifyContent="space-between">
            <H5>Pitchers</H5>
            <Text fontSize="$3" color="$gray10">
              {groupedPositions.pitching.filter(p => getAssignedPlayer(p)).length} / {groupedPositions.pitching.length} filled
            </Text>
          </XStack>
          <XStack flexWrap="wrap" gap="$2">
            {groupedPositions.pitching.map((position) => (
              <RosterSlot
                key={position.id}
                position={position}
                assignedPlayer={getAssignedPlayer(position)}
                availablePlayers={teamPlayers}
                selectedPlayer={selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerRemove={handlePlayerRemove}
                onPlayerSelect={setSelectedPlayer}
                isSelected={getAssignedPlayer(position)?.id === selectedPlayer?.id}
              />
            ))}
          </XStack>
        </YStack>

        <Separator />

        {/* Batting Positions */}
        <YStack space="$2">
          <XStack alignItems="center" justifyContent="space-between">
            <H5>Position Players</H5>
            <Text fontSize="$3" color="$gray10">
              {groupedPositions.batting.filter(p => getAssignedPlayer(p)).length} / {groupedPositions.batting.length} filled
            </Text>
          </XStack>
          <XStack flexWrap="wrap" gap="$2">
            {groupedPositions.batting.map((position) => (
              <RosterSlot
                key={position.id}
                position={position}
                assignedPlayer={getAssignedPlayer(position)}
                availablePlayers={teamPlayers}
                selectedPlayer={selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerRemove={handlePlayerRemove}
                onPlayerSelect={setSelectedPlayer}
                isSelected={getAssignedPlayer(position)?.id === selectedPlayer?.id}
              />
            ))}
          </XStack>
        </YStack>

        <Separator />

        {/* Utility Positions */}
        {groupedPositions.utility.length > 0 && (
          <YStack space="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <H5>Utility</H5>
              <Text fontSize="$3" color="$gray10">
                {groupedPositions.utility.filter(p => getAssignedPlayer(p)).length} / {groupedPositions.utility.length} filled
              </Text>
            </XStack>
            <XStack flexWrap="wrap" gap="$2">
              {groupedPositions.utility.map((position) => (
                <RosterSlot
                  key={position.id}
                  position={position}
                  assignedPlayer={getAssignedPlayer(position)}
                  availablePlayers={teamPlayers}
                  selectedPlayer={selectedPlayer}
                  onPlayerAssign={handlePlayerAssign}
                  onPlayerRemove={handlePlayerRemove}
                  onPlayerSelect={setSelectedPlayer}
                  isSelected={getAssignedPlayer(position)?.id === selectedPlayer?.id}
                />
              ))}
            </XStack>
          </YStack>
        )}

        <Separator />

        {/* Available Players */}
        <AvailablePlayerList
          players={teamPlayers}
          selectedPlayer={selectedPlayer}
          onPlayerSelect={setSelectedPlayer}
        />
      </YStack>
    </div>
  );
}
