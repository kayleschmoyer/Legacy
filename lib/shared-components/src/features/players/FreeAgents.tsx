import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Input,
  ScrollView,
  Sheet,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Animated, Dimensions, FlatList } from '../../platform-components';
import { Filter, Player } from '../../types';
import { SPORT_CONFIGS } from '../../config/sports';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

// Extended Player interface for free agents
export interface FreeAgentPlayer extends Player {
  ownership: number;
  trending: 'up' | 'down' | 'stable';
  injury: 'healthy' | 'questionable' | 'doubtful' | 'out';
  projections: Record<string, number>;
  isWatched: boolean;
  faabValue: number;
}

export interface WaiverClaim {
  playerId: string;
  priority: number;
  faabBid: number;
  dropPlayerId?: string;
}

// Utility functions
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

const getTrendingIcon = (trending: FreeAgentPlayer['trending']): string => {
  switch (trending) {
    case 'up':
      return '📈';
    case 'down':
      return '📉';
    default:
      return '➡️';
  }
};

const getInjuryColor = (injury: FreeAgentPlayer['injury']): string => {
  switch (injury) {
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

/**
 * Enhanced Player Card for Free Agents
 */
interface FreeAgentCardProps {
  player: FreeAgentPlayer;
  sport: string;
  onSelect: () => void;
  onWatch: () => void;
  onClaim: () => void;
  isSelected?: boolean;
}

const FreeAgentCard: React.FC<FreeAgentCardProps> = ({
  player,
  sport,
  onSelect,
  onWatch,
  onClaim,
  isSelected,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
      }}
    >
      <Card
        backgroundColor="$gray3"
        borderRadius="$4"
        marginHorizontal="$2"
        marginVertical="$1"
        elevation={3}
        shadowColor="$gray12"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.25}
        shadowRadius={4}
        borderWidth={isSelected ? 2 : 1}
        borderColor={isSelected ? '$blue8' : '$gray6'}
        padding="$3"
        pressStyle={{ scale: 0.98 }}
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        cursor="pointer"
      >
        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="flex-start"
          marginBottom="$2"
        >
          <YStack flex={1} marginRight="$2">
            <Text
              fontSize="$4"
              fontWeight="bold"
              color="$gray12"
              marginBottom="$1"
            >
              {`${player.firstName} ${player.lastName}`}
            </Text>
            <XStack alignItems="center" space="$2">
              <Text fontSize="$2" color="$gray10">
                {player.team}
              </Text>
              <YStack
                backgroundColor={getPositionColor(player.position, sport)}
                borderRadius="$2"
                paddingHorizontal="$2"
                paddingVertical="$1"
                alignItems="center"
              >
                <Text fontSize="$1" fontWeight="bold" color="white">
                  {player.position}
                </Text>
              </YStack>
              <YStack
                backgroundColor={getInjuryColor(player.injury)}
                borderRadius="$2"
                paddingHorizontal="$2"
                paddingVertical="$1"
                alignItems="center"
              >
                <Text fontSize="$1" fontWeight="bold" color="white">
                  {player.injury.toUpperCase()}
                </Text>
              </YStack>
            </XStack>
          </YStack>
          <XStack alignItems="center" space="$2">
            <Button
              size="$2"
              variant="outlined"
              onPress={onWatch}
              color={player.isWatched ? '$yellow10' : '$gray9'}
            >
              {player.isWatched ? '⭐' : '☆'}
            </Button>
            <Text
              fontSize="$3"
              color={
                player.trending === 'up'
                  ? '$green10'
                  : player.trending === 'down'
                    ? '$red10'
                    : '$gray10'
              }
            >
              {getTrendingIcon(player.trending)}
            </Text>
          </XStack>
        </XStack>

        {/* Stats Preview */}
        <XStack justifyContent="space-between" marginBottom="$3">
          <Text fontSize="$2" color="$blue10" fontWeight="600">
            Rank: #{player.rank}
          </Text>
          <Text fontSize="$2" color="$gray10">
            Own: {player.ownership}%
          </Text>
          <Text fontSize="$2" color="$green10" fontWeight="600">
            FAAB: ${player.faabValue}
          </Text>
        </XStack>

        {/* Action Button */}
        <Button
          backgroundColor="$blue9"
          color="white"
          fontWeight="600"
          onPress={onClaim}
          borderRadius="$3"
        >
          Claim Player
        </Button>
      </Card>
    </Animated.View>
  );
};

/**
 * Sort and Filter Controls
 */
interface SortFilterControlsProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  positions: string[];
  sortOptions: string[];
}

const SortFilterControls: React.FC<SortFilterControlsProps> = ({
  searchText,
  onSearchChange,
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  positions,
  sortOptions,
}) => {
  const [showSortModal, setShowSortModal] = useState(false);

  const allPositions = ['ALL', ...positions];
  const trendingOptions = ['ALL', 'Up', 'Down', 'Stable'];

  return (
    <YStack space="$3" padding="$3" backgroundColor="$gray2">
      {/* Search Bar */}
      <Input
        placeholder="Search players..."
        value={searchText}
        onChangeText={onSearchChange}
        backgroundColor="$gray1"
        borderRadius="$3"
        fontSize="$4"
      />

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack space="$2" paddingHorizontal="$2">
          {/* Position Filter */}
          {allPositions.map((position) => (
            <Button
              key={position}
              size="$3"
              variant={filters.position === position ? 'outlined' : 'outlined'}
              backgroundColor={
                filters.position === position ? '$blue3' : '$gray1'
              }
              borderColor={filters.position === position ? '$blue7' : '$gray6'}
              color={filters.position === position ? '$blue11' : '$gray11'}
              onPress={() => onFiltersChange({ ...filters, position })}
              borderRadius="$6"
            >
              {position}
            </Button>
          ))}

          {/* Trending Filter */}
          {trendingOptions.map((trending) => (
            <Button
              key={trending}
              size="$3"
              variant={filters.trending === trending ? 'outlined' : 'outlined'}
              backgroundColor={
                filters.trending === trending ? '$green3' : '$gray1'
              }
              borderColor={filters.trending === trending ? '$green7' : '$gray6'}
              color={filters.trending === trending ? '$green11' : '$gray11'}
              onPress={() => onFiltersChange({ ...filters, trending })}
              borderRadius="$6"
            >
              {trending === 'ALL' ? 'All Trends' : `${trending} 📈`}
            </Button>
          ))}
        </XStack>
      </ScrollView>

      {/* Sort Button */}
      <Button
        variant="outlined"
        size="$4"
        onPress={() => setShowSortModal(true)}
        backgroundColor="$gray1"
        borderColor="$gray6"
        justifyContent="space-between"
      >
        <XStack alignItems="center" justifyContent="space-between" flex={1}>
          <Text color="$gray12">Sort: {sortBy}</Text>
          <Text color="$gray10">▼</Text>
        </XStack>
      </Button>

      {/* Sort Modal */}
      <Sheet
        modal
        open={showSortModal}
        onOpenChange={setShowSortModal}
        snapPoints={[40]}
      >
        <Sheet.Overlay />
        <Sheet.Frame backgroundColor="$gray2" borderRadius="$4">
          <Sheet.Handle />
          <YStack padding="$4" space="$2">
            <Text fontSize="$5" fontWeight="600" marginBottom="$2">
              Sort By
            </Text>
            {sortOptions.map((option) => (
              <Button
                key={option}
                variant={sortBy === option ? 'outlined' : 'outlined'}
                backgroundColor={sortBy === option ? '$blue3' : 'transparent'}
                borderColor={sortBy === option ? '$blue7' : 'transparent'}
                color={sortBy === option ? '$blue11' : '$gray11'}
                justifyContent="flex-start"
                onPress={() => {
                  onSortChange(option);
                  setShowSortModal(false);
                }}
              >
                {option}
              </Button>
            ))}
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
};

/**
 * Waiver Claim Modal
 */
interface WaiverClaimModalProps {
  visible: boolean;
  player: FreeAgentPlayer | null;
  onSubmit: (claim: WaiverClaim) => void;
  onClose: () => void;
  maxFaab: number;
  rosterPlayers: Player[];
}

const WaiverClaimModal: React.FC<WaiverClaimModalProps> = ({
  visible,
  player,
  onSubmit,
  onClose,
  maxFaab,
  rosterPlayers,
}) => {
  const [faabBid, setFaabBid] = useState('0');
  const [priority, setPriority] = useState('1');
  const [dropPlayerId, setDropPlayerId] = useState<string | undefined>();

  const handleSubmit = () => {
    if (!player) return;

    const claim: WaiverClaim = {
      playerId: player.id,
      priority: parseInt(priority, 10),
      faabBid: parseInt(faabBid, 10),
      dropPlayerId,
    };

    onSubmit(claim);
    onClose();

    // Reset form
    setFaabBid('0');
    setPriority('1');
    setDropPlayerId(undefined);
  };

  if (!player) return null;

  return (
    <Sheet
      modal
      open={visible}
      onOpenChange={(open: boolean) => !open && onClose()}
      snapPoints={[80]}
    >
      <Sheet.Overlay />
      <Sheet.Frame backgroundColor="$gray2" borderRadius="$4">
        <Sheet.Handle />
        <YStack padding="$4" space="$3">
          <Text fontSize="$5" fontWeight="600" textAlign="center">
            Submit Waiver Claim
          </Text>

          <Card backgroundColor="$blue2" padding="$3" borderRadius="$3">
            <Text fontSize="$4" fontWeight="bold" color="$blue12">
              {`${player.firstName} ${player.lastName}`}
            </Text>
            <Text fontSize="$3" color="$blue11">
              {player.position} - {player.team}
            </Text>
          </Card>

          {/* FAAB Bid */}
          <YStack space="$2">
            <Text fontSize="$3" fontWeight="600">
              FAAB Bid (Max: ${maxFaab})
            </Text>
            <Input
              value={faabBid}
              onChangeText={setFaabBid}
              keyboardType="numeric"
              placeholder="Enter bid amount"
              backgroundColor="$gray1"
              borderRadius="$3"
            />
          </YStack>

          {/* Priority */}
          <YStack space="$2">
            <Text fontSize="$3" fontWeight="600">
              Claim Priority
            </Text>
            <Input
              value={priority}
              onChangeText={setPriority}
              keyboardType="numeric"
              placeholder="1"
              backgroundColor="$gray1"
              borderRadius="$3"
            />
          </YStack>

          {/* Drop Player */}
          <YStack space="$2">
            <Text fontSize="$3" fontWeight="600">
              Drop Player (Optional)
            </Text>
            <ScrollView maxHeight={150}>
              <YStack space="$1">
                <Button
                  variant={!dropPlayerId ? 'outlined' : 'outlined'}
                  backgroundColor={!dropPlayerId ? '$gray4' : '$gray1'}
                  borderColor={!dropPlayerId ? '$gray7' : '$gray5'}
                  justifyContent="flex-start"
                  onPress={() => setDropPlayerId(undefined)}
                >
                  None (if roster space)
                </Button>
                {rosterPlayers.map((rosterPlayer) => (
                  <Button
                    key={rosterPlayer.id}
                    variant={
                      dropPlayerId === rosterPlayer.id ? 'outlined' : 'outlined'
                    }
                    backgroundColor={
                      dropPlayerId === rosterPlayer.id ? '$gray4' : '$gray1'
                    }
                    borderColor={
                      dropPlayerId === rosterPlayer.id ? '$gray7' : '$gray5'
                    }
                    justifyContent="flex-start"
                    onPress={() => setDropPlayerId(rosterPlayer.id)}
                  >
                    {`${rosterPlayer.firstName} ${rosterPlayer.lastName}`} (
                    {rosterPlayer.position})
                  </Button>
                ))}
              </YStack>
            </ScrollView>
          </YStack>

          {/* Action Buttons */}
          <XStack space="$2" marginTop="$3">
            <Button
              flex={1}
              variant="outlined"
              backgroundColor="$gray1"
              borderColor="$gray6"
              color="$gray11"
              onPress={onClose}
            >
              Cancel
            </Button>
            <Button
              flex={1}
              backgroundColor="$blue9"
              color="white"
              fontWeight="600"
              onPress={handleSubmit}
            >
              Submit Claim
            </Button>
          </XStack>
        </YStack>
      </Sheet.Frame>
    </Sheet>
  );
};

/**
 * Main FreeAgents component
 */
export interface FreeAgentsProps {
  sport: string;
  players: FreeAgentPlayer[];
  onPlayerClaim: (claim: WaiverClaim) => void;
  onPlayerWatch: (playerId: string) => void;
  maxFaab: number;
  rosterPlayers: Player[];
}

function FreeAgents({
  sport,
  players,
  onPlayerClaim,
  onPlayerWatch,
  maxFaab,
  rosterPlayers,
}: FreeAgentsProps) {
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Filter>({
    position: 'ALL',
    availability: 'ALL',
    trending: 'ALL',
  });
  const [sortBy, setSortBy] = useState('Rank');
  const [selectedPlayer, setSelectedPlayer] = useState<FreeAgentPlayer | null>(
    null,
  );
  const [showClaimModal, setShowClaimModal] = useState(false);

  const sportConfig = SPORT_CONFIGS[sport] || SPORT_CONFIGS.baseball;

  // Filter and sort players
  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = players.filter((player) => {
      const matchesSearch =
        searchText === '' ||
        `${player.firstName} ${player.lastName}`
          .toLowerCase()
          .includes(searchText.toLowerCase());
      const matchesPosition =
        filters.position === 'ALL' || player.position === filters.position;
      const matchesTrending =
        filters.trending === 'ALL' ||
        player.trending === filters.trending?.toLowerCase();

      return matchesSearch && matchesPosition && matchesTrending;
    });

    // Sort logic
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'Rank':
          return a.rank - b.rank;
        case 'Ownership%':
          return b.ownership - a.ownership;
        case 'FAAB':
          return b.faabValue - a.faabValue;
        default:
          return a.rank - b.rank;
      }
    });

    return filtered;
  }, [players, searchText, filters, sortBy]);

  const handlePlayerClaim = (player: FreeAgentPlayer) => {
    setSelectedPlayer(player);
    setShowClaimModal(true);
  };

  const renderPlayer = ({ item }: { item: FreeAgentPlayer }) => (
    <FreeAgentCard
      player={item}
      sport={sport}
      onSelect={() => setSelectedPlayer(item)}
      onWatch={() => onPlayerWatch(item.id)}
      onClaim={() => handlePlayerClaim(item)}
      isSelected={selectedPlayer?.id === item.id}
    />
  );

  return (
    <YStack flex={1} backgroundColor="$gray1">
      {/* Header */}
      <YStack padding="$4" backgroundColor="$gray2">
        <Text fontSize="$6" fontWeight="bold" color="$gray12">
          Free Agents
        </Text>
        <Text fontSize="$3" color="$gray10">
          {filteredAndSortedPlayers.length} available players
        </Text>
      </YStack>

      {/* Controls */}
      <SortFilterControls
        searchText={searchText}
        onSearchChange={setSearchText}
        filters={filters}
        onFiltersChange={setFilters}
        sortBy={sortBy}
        onSortChange={setSortBy}
        positions={sportConfig.positions}
        sortOptions={sportConfig.sortOptions || ['Rank', 'Ownership%', 'FAAB']}
      />

      {/* Player List */}
      <FlatList
        data={filteredAndSortedPlayers}
        renderItem={renderPlayer}
        keyExtractor={(item: FreeAgentPlayer) => item.id}
        numColumns={IS_TABLET ? 2 : 1}
        {...(IS_TABLET && {
          columnWrapperStyle: {
            justifyContent: 'space-between',
            paddingHorizontal: 8,
          },
        })}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 8 }}
      />

      {/* Waiver Claim Modal */}
      <WaiverClaimModal
        visible={showClaimModal}
        player={selectedPlayer}
        onSubmit={onPlayerClaim}
        onClose={() => setShowClaimModal(false)}
        maxFaab={maxFaab}
        rosterPlayers={rosterPlayers}
      />
    </YStack>
  );
}

export { FreeAgents };
