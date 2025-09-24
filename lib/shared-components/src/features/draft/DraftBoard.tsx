import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import { DraftState, DraftTeam, Filter, Player } from '../../types';
import { SPORT_CONFIGS } from '../../config/sports';

// Utility function for position colors
const getPositionColor = (position: string, sport: string): string => {
  const colors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#F97316',
  ];
  const sportConfig = SPORT_CONFIGS[sport];
  const index = sportConfig?.positions.indexOf(position) ?? 0;
  return colors[index % colors.length];
};

/**
 * Custom hook for draft timer
 */
const useTimer = (initialTime: number) => {
  const [time, setTime] = useState(initialTime);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive && time > 0) {
      interval = setInterval(() => {
        setTime((t) => Math.max(0, t - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, time]);

  const start = useCallback(() => setIsActive(true), []);
  const pause = useCallback(() => setIsActive(false), []);
  const reset = useCallback(
    (newTime: number = initialTime) => {
      setTime(newTime);
      setIsActive(false);
    },
    [initialTime],
  );

  return { time, isActive, start, pause, reset };
};

/**
 * Player card component
 */
interface PlayerCardProps {
  player: Player;
  onSelect: () => void;
  isSelected?: boolean;
  sport?: string;
  isDrafted?: boolean;
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  onSelect,
  isSelected,
  sport = 'baseball',
  isDrafted = false,
}) => {
  return (
    <Card
      backgroundColor={isSelected ? '$blue4' : isDrafted ? '$gray4' : '$gray2'}
      borderColor={isSelected ? '$blue8' : isDrafted ? '$gray6' : '$gray6'}
      borderWidth={isSelected ? 2 : 1}
      borderRadius="$3"
      padding="$3"
      margin="$1"
      pressStyle={{
        scale: isDrafted ? 1 : 0.98,
        borderColor: '$blue10',
      }}
      onPress={isDrafted ? undefined : onSelect}
      opacity={isDrafted ? 0.6 : 1}
      cursor={isDrafted ? 'default' : 'pointer'}
      position="relative"
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
      >
        <Text
          fontSize="$4"
          fontWeight="600"
          color={isDrafted ? '$gray10' : '$gray12'}
          numberOfLines={1}
        >
          {`${player.firstName} ${player.lastName}`}
        </Text>
        <YStack
          backgroundColor={getPositionColor(player.position, sport)}
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$2"
          opacity={isDrafted ? 0.7 : 1}
        >
          <Text fontSize="$2" fontWeight="600" color="white">
            {player.position}
          </Text>
        </YStack>
      </XStack>

      <Text
        fontSize="$3"
        color={isDrafted ? '$gray9' : '$gray11'}
        marginBottom="$2"
      >
        {player.team}
      </Text>

      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$2" color={isDrafted ? '$gray8' : '$gray10'}>
          ADP: {player.adp}
        </Text>
        <Text
          fontSize="$2"
          fontWeight="600"
          color={isDrafted ? '$gray8' : '$gray11'}
        >
          #{player.rank}
        </Text>
      </XStack>

      {isDrafted && (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor="$gray5"
          opacity={0.8}
          justifyContent="center"
          alignItems="center"
          borderRadius="$3"
        >
          <Text
            fontSize="$5"
            fontWeight="700"
            color="$red10"
            textTransform="uppercase"
          >
            DRAFTED
          </Text>
        </YStack>
      )}
    </Card>
  );
};

/**
 * Timer component
 */
interface TimerProps {
  time: number;
  isActive: boolean;
}

const Timer: React.FC<TimerProps> = ({ time, isActive }) => {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  const getTimerColor = () => {
    if (time > 30) return '$green10';
    if (time > 10) return '$orange10';
    return '$red10';
  };

  return (
    <YStack
      backgroundColor={getTimerColor()}
      borderRadius="$3"
      padding="$3"
      alignItems="center"
      justifyContent="center"
      minWidth={120}
    >
      <Text fontSize="$6" fontWeight="700" color="white" fontFamily="$mono">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </Text>
      <Text fontSize="$2" color="white" opacity={0.9} marginTop="$1">
        {isActive ? 'Time Remaining' : 'Paused'}
      </Text>
    </YStack>
  );
};

/**
 * Filter controls
 */
interface FilterControlsProps {
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  positions: string[];
  searchText: string;
  onSearchChange: (text: string) => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  onFiltersChange,
  positions,
  searchText,
  onSearchChange,
}) => {
  const allPositions = ['ALL', ...positions];

  return (
    <YStack gap="$3" padding="$3" backgroundColor="$gray2">
      <Input
        placeholder="Search players..."
        value={searchText}
        onChangeText={onSearchChange}
        backgroundColor="$gray3"
        borderColor="$gray6"
        borderRadius="$2"
        padding="$3"
        fontSize="$3"
        color="$gray12"
      />

      <XStack gap="$2" flexWrap="wrap">
        {allPositions.map((position) => (
          <Button
            key={position}
            size="$2"
            backgroundColor={
              filters.position === position ? '$blue10' : '$gray4'
            }
            borderColor={filters.position === position ? '$blue10' : '$gray6'}
            pressStyle={{
              backgroundColor: '$blue8',
              scale: 0.98,
            }}
            onPress={() => onFiltersChange({ ...filters, position })}
          >
            <Text
              fontSize="$2"
              fontWeight="600"
              color={filters.position === position ? 'white' : '$gray11'}
            >
              {position}
            </Text>
          </Button>
        ))}
      </XStack>
    </YStack>
  );
};

/**
 * Draft status bar
 */
interface DraftStatusProps {
  draft: DraftState;
  currentTeam?: DraftTeam;
}

const DraftStatus: React.FC<DraftStatusProps> = ({ draft, currentTeam }) => {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      padding="$3"
      backgroundColor="$gray3"
      borderBottomWidth={1}
      borderBottomColor="$gray6"
    >
      <Text fontSize="$5" fontWeight="700" color="$gray12">
        {draft.name}
      </Text>

      <Text fontSize="$3" color="$gray11">
        Pick #{draft.currentPick}
        {currentTeam && ` - ${currentTeam.name}`}
      </Text>

      <YStack
        backgroundColor={
          draft.status === 'active'
            ? '$green10'
            : draft.status === 'paused'
              ? '$orange10'
              : '$gray8'
        }
        paddingHorizontal="$3"
        paddingVertical="$1"
        borderRadius="$2"
      >
        <Text fontSize="$2" fontWeight="600" color="white">
          {draft.status.toUpperCase()}
        </Text>
      </YStack>
    </XStack>
  );
};

/**
 * Main DraftBoard component
 */
export interface DraftBoardProps {
  draft: DraftState;
  availablePlayers: Player[];
  onPlayerDraft: (player: Player) => void;
  onTimerControl?: (action: 'start' | 'pause' | 'reset') => void;
  draftedPlayerIds?: Set<string>;
}

function DraftBoard({
  draft,
  availablePlayers,
  onPlayerDraft,
  onTimerControl,
  draftedPlayerIds = new Set(),
}: DraftBoardProps) {
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Filter>({ position: 'ALL' });
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { time, isActive, start, pause, reset } = useTimer(draft.timeRemaining);

  const sportConfig = SPORT_CONFIGS[draft.sport] || SPORT_CONFIGS.baseball;
  const currentTeam = draft.teams.find(
    (team) =>
      team.picks.length ===
      Math.floor((draft.currentPick - 1) / draft.teams.length),
  );

  // Filter players
  const filteredPlayers = availablePlayers.filter((player) => {
    const playerName =
      player.player || `${player.firstName} ${player.lastName}`;
    const matchesSearch =
      searchText === '' ||
      playerName.toLowerCase().includes(searchText.toLowerCase());
    const matchesPosition =
      filters.position === 'ALL' || player.position === filters.position;
    const isAvailable = !draftedPlayerIds.has(player.id);

    return matchesSearch && matchesPosition && isAvailable;
  });

  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player);
    setShowConfirmModal(true);
  };

  const handleConfirmDraft = () => {
    if (selectedPlayer) {
      onPlayerDraft(selectedPlayer);
      setSelectedPlayer(null);
      setShowConfirmModal(false);
    }
  };

  const handleTimerControl = (action: 'start' | 'pause' | 'reset') => {
    switch (action) {
      case 'start':
        start();
        break;
      case 'pause':
        pause();
        break;
      case 'reset':
        reset();
        break;
    }
    onTimerControl?.(action);
  };

  return (
    <YStack flex={1} backgroundColor="$gray1">
      {/* Draft Status */}
      <DraftStatus draft={draft} currentTeam={currentTeam} />

      {/* Timer */}
      <XStack justifyContent="center" padding="$3">
        <Timer time={time} isActive={isActive} />
      </XStack>

      {/* Timer Controls */}
      <XStack gap="$2" justifyContent="center" padding="$3">
        <Button
          size="$3"
          backgroundColor="$blue10"
          onPress={() => handleTimerControl(isActive ? 'pause' : 'start')}
        >
          <Text color="white" fontWeight="600">
            {isActive ? 'Pause' : 'Start'}
          </Text>
        </Button>
        <Button
          size="$3"
          backgroundColor="$gray8"
          onPress={() => handleTimerControl('reset')}
        >
          <Text color="white" fontWeight="600">
            Reset
          </Text>
        </Button>
      </XStack>

      {/* Filters */}
      <FilterControls
        filters={filters}
        onFiltersChange={setFilters}
        positions={sportConfig.positions}
        searchText={searchText}
        onSearchChange={setSearchText}
      />

      {/* Player List */}
      <ScrollView flex={1} padding="$3">
        <YStack gap="$2">
          {filteredPlayers.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              onSelect={() => handlePlayerSelect(player)}
              isSelected={selectedPlayer?.id === player.id}
              sport={draft.sport}
              isDrafted={draftedPlayerIds.has(player.id)}
            />
          ))}
        </YStack>
      </ScrollView>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedPlayer && (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor="rgba(0, 0, 0, 0.7)"
          justifyContent="center"
          alignItems="center"
          zIndex={1000}
        >
          <YStack
            backgroundColor="$gray2"
            borderRadius="$4"
            padding="$4"
            margin="$4"
            gap="$3"
            minWidth={300}
            alignItems="center"
          >
            <Text fontSize="$6" fontWeight="700" color="$gray12">
              Confirm Draft Pick
            </Text>

            <YStack alignItems="center" gap="$2">
              <Text fontSize="$5" fontWeight="600" color="$gray12">
                {`${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
              </Text>
              <Text fontSize="$3" color="$gray11">
                {selectedPlayer.position} - {selectedPlayer.team}
              </Text>
              <Text fontSize="$3" color="$gray10">
                Rank: #{selectedPlayer.rank}
              </Text>
            </YStack>

            <XStack gap="$3" justifyContent="center">
              <Button
                backgroundColor="$gray8"
                onPress={() => setShowConfirmModal(false)}
              >
                <Text color="white" fontWeight="600">
                  Cancel
                </Text>
              </Button>
              <Button backgroundColor="$blue10" onPress={handleConfirmDraft}>
                <Text color="white" fontWeight="600">
                  Draft Player
                </Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}
    </YStack>
  );
}

export { DraftBoard };
