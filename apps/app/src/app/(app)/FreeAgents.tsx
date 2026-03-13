import React, { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Vibration,
} from 'react-native';
import { Input, Text, XStack, YStack } from '@tamagui/core';
import { LOGGER } from '@legacy-sports/logging';
import { PlayerCard } from './FreeAgents/PlayerCard';
import { FilterPanel } from './FreeAgents/FilterPanel';
import { WaiverClaimModal } from './FreeAgents/WaiverClaimModal';

// Configuration
interface SportConfig {
  colors: {
    accent: string;
    primary: string;
    secondary: string;
  };
  positions: string[];
  sortOptions: string[];
  stats: string[];
}

const SPORT_CONFIGS: Record<string, SportConfig> = {
  baseball: {
    colors: { accent: '#ff6b35', primary: '#1a1a1a', secondary: '#2d2d2d' },
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
    sortOptions: ['Rank', 'AVG', 'HR', 'RBI', 'ERA', 'WHIP', 'Ownership%'],
    stats: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K', 'SV', 'OBP'],
  },
  football: {
    colors: { accent: '#f97316', primary: '#7c2d12', secondary: '#ea580c' },
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    sortOptions: [
      'Rank',
      'PassYds',
      'PassTDs',
      'RushYds',
      'RushTDs',
      'Ownership%',
    ],
    stats: [
      'PassYds',
      'PassTDs',
      'RushYds',
      'RushTDs',
      'Rec',
      'RecYds',
      'RecTDs',
    ],
  },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

// Types
interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  rank: number;
  ownership: number;
  trending: 'up' | 'down' | 'stable';
  injury: 'healthy' | 'questionable' | 'doubtful' | 'out';
  stats: Record<string, number>;
  projections: Record<string, number>;
  isWatched: boolean;
  faabValue: number;
}

interface WaiverClaim {
  playerId: string;
  priority: number;
  faabBid: number;
  dropPlayerId?: string;
}

interface Filter {
  position: string;
  availability: string;
  trending: string;
  ownershipRange: [number, number];
}

/**
 * Main Free Agents Component
 */
const FreeAgents: React.FC = () => {
  // State
  const [sport] = useState<'baseball' | 'football'>('baseball');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('Rank');
  const [filters, setFilters] = useState<Filter>({
    availability: 'All',
    ownershipRange: [0, 100],
    position: 'ALL',
    trending: 'All',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Sport config
  const sportConfig = SPORT_CONFIGS[sport as keyof typeof SPORT_CONFIGS];

  // Empty players array - will be populated from database
  const players: Player[] = useMemo((): Player[] => [], []);

  // Filtered and sorted players
  const filteredPlayers = useMemo(() => {
    return players
      .filter((player) => {
        const matchesSearch =
          player.name.toLowerCase().includes(searchText.toLowerCase()) ||
          player.team.toLowerCase().includes(searchText.toLowerCase());
        const matchesPosition =
          filters.position === 'ALL' || player.position === filters.position;
        return matchesSearch && matchesPosition;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'Rank':
            return a.rank - b.rank;
          case 'Ownership%':
            return b.ownership - a.ownership;
          default:
            return a.rank - b.rank;
        }
      });
  }, [players, searchText, filters, sortBy]);

  // Handlers
  const handlePlayerSelect = useCallback((player: Player) => {
    setSelectedPlayer(player);
    Platform.OS !== 'web' && Vibration.vibrate(50);
  }, []);

  const handleWatchToggle = useCallback((playerId: string) => {
    setWatchlist((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        newSet.add(playerId);
      }
      return newSet;
    });
    Platform.OS !== 'web' && Vibration.vibrate(25);
  }, []);

  const handleClaimPlayer = useCallback((player: Player) => {
    setSelectedPlayer(player);
    setShowClaimModal(true);
  }, []);

  const handleSubmitClaim = useCallback((claim: WaiverClaim) => {
    LOGGER.info('Waiver claim submitted:', claim);
  }, []);

  const renderPlayerGrid = () => (
    <FlatList
      data={filteredPlayers}
      keyExtractor={(item) => item.id}
      numColumns={IS_TABLET ? 3 : 1}
      renderItem={({ item }) => (
        <PlayerCard
          player={{ ...item, isWatched: watchlist.has(item.id) }}
          sport={sport}
          onSelect={() => handlePlayerSelect(item)}
          onWatch={() => handleWatchToggle(item.id)}
          onClaim={() => handleClaimPlayer(item)}
          isSelected={selectedPlayer?.id === item.id}
        />
      )}
      contentContainerStyle={{ padding: 8 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <YStack
          alignItems="center"
          flex={1}
          justifyContent="center"
          paddingVertical="$15"
        >
          <Text
            color="rgba(255,255,255,0.8)"
            fontSize="$6"
            fontWeight="600"
            marginBottom="$2"
          >
            No free agents available
          </Text>
          <Text color="rgba(255,255,255,0.6)" fontSize="$4" textAlign="center">
            Players will appear when database is populated
          </Text>
        </YStack>
      }
    />
  );

  return (
    <YStack flex={1} backgroundColor={sportConfig.colors.primary}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={sportConfig.colors.primary}
      />

      {/* Header */}
      <YStack
        backgroundColor={sportConfig.colors.secondary}
        paddingBottom="$4"
        paddingHorizontal="$5"
        paddingTop="$13"
      >
        <Text color="#ffffff" fontSize="$9" fontWeight="800" marginBottom="$1">
          Free Agents
        </Text>
        <Text
          color="rgba(255,255,255,0.8)"
          fontSize="$3"
          fontWeight="600"
          marginBottom="$4"
        >
          {sport.toUpperCase()}
        </Text>

        {/* Quick Stats */}
        <XStack gap="$6">
          <YStack alignItems="center">
            <Text color="#ffffff" fontSize="$7" fontWeight="700">
              {filteredPlayers.length}
            </Text>
            <Text color="rgba(255,255,255,0.7)" fontSize="$3">
              Available
            </Text>
          </YStack>
          <YStack alignItems="center">
            <Text color="#ffffff" fontSize="$7" fontWeight="700">
              {watchlist.size}
            </Text>
            <Text color="rgba(255,255,255,0.7)" fontSize="$3">
              Watched
            </Text>
          </YStack>
        </XStack>
      </YStack>

      {/* Search and Controls */}
      <XStack gap="$3" padding="$4">
        <Input
          backgroundColor="rgba(255,255,255,0.1)"
          borderColor={sportConfig.colors.accent}
          borderRadius="$3"
          borderWidth={1}
          color="#ffffff"
          flex={1}
          fontSize="$5"
          height={44}
          onChangeText={setSearchText}
          placeholder={`Search ${sport} free agents...`}
          placeholderTextColor="#64748b"
          value={searchText}
        />
        <TouchableOpacity
          style={{
            alignItems: 'center',
            backgroundColor: sportConfig.colors.accent,
            borderRadius: 12,
            height: 44,
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
          onPress={() => setShowFilters(true)}
        >
          <Text color="#ffffff" fontSize="$4" fontWeight="600">
            Filters
          </Text>
        </TouchableOpacity>
      </XStack>

      {/* Sort and View Controls */}
      <XStack alignItems="center" marginBottom="$4" paddingHorizontal="$4">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {sportConfig.sortOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={{
                backgroundColor:
                  sortBy === option
                    ? sportConfig.colors.accent
                    : 'rgba(255,255,255,0.1)',
                borderRadius: 20,
                marginRight: 8,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
              onPress={() => setSortBy(option)}
            >
              <Text color="#ffffff" fontSize="$3" fontWeight="600">
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 22,
            height: 44,
            justifyContent: 'center',
            width: 44,
          }}
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          <Text color="#ffffff" fontSize="$6">
            {viewMode === 'grid' ? '☰' : '⊞'}
          </Text>
        </TouchableOpacity>
      </XStack>

      {/* Player List */}
      {renderPlayerGrid()}

      {/* Filter Panel */}
      <FilterPanel
        sport={sport}
        filters={filters}
        onFiltersChange={setFilters}
        visible={showFilters}
        onClose={() => setShowFilters(false)}
      />

      {/* Waiver Claim Modal */}
      <WaiverClaimModal
        player={selectedPlayer}
        visible={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        onSubmit={handleSubmitClaim}
        sport={sport}
      />
    </YStack>
  );
};

export default FreeAgents;
