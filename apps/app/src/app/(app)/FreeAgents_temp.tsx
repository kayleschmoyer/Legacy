import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Filter } from './DraftBoardPage';

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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

/**
 * Enhanced Player Card with advanced stats
 */
const PlayerCard: React.FC<{
  player: Player;
  sport: string;
  onSelect: () => void;
  onWatch: () => void;
  onClaim: () => void;
  isSelected?: boolean;
}> = ({ player, sport, onSelect, onWatch, onClaim, isSelected }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const sportConfig = SPORT_CONFIGS[sport];

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const getTrendingIcon = () => {
    switch (player.trending) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getInjuryColor = () => {
    switch (player.injury) {
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

  return (
    <Animated.View
      style={[
        {
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderColor: 'rgba(255,255,255,0.2)',
          borderRadius: 16,
          borderWidth: 1,
          elevation: 8,
          flex: 1,
          margin: 8,
          shadowColor: '#000',
          shadowOffset: { height: 4, width: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        { transform: [{ scale: scaleAnim }] },
        isSelected && {
          borderColor: sportConfig.colors.accent,
          borderWidth: 2,
        },
      ]}
    >
      <Button
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        padding={16}
        backgroundColor="transparent"
        borderWidth={0}
        unstyled
      >
        <YStack gap={12}>
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="flex-start">
            <YStack flex={1}>
              <Text
                fontSize={18}
                fontWeight="700"
                color="$white"
                marginBottom={4}
              >
                {player.name}
              </Text>
              <XStack alignItems="center" gap={8}>
                <Text fontSize={14} color="rgba(255,255,255,0.7)">
                  {player.team}
                </Text>
                <YStack
                  backgroundColor={getPositionColor(player.position, sport)}
                  borderRadius={6}
                  paddingHorizontal={8}
                  paddingVertical={2}
                >
                  <Text fontSize={10} fontWeight="700" color="$white">
                    {player.position}
                  </Text>
                </YStack>
                <YStack
                  backgroundColor={getInjuryColor()}
                  borderRadius={4}
                  paddingHorizontal={6}
                  paddingVertical={2}
                >
                  <Text fontSize={8} fontWeight="700" color="$white">
                    {player.injury.toUpperCase()}
                  </Text>
                </YStack>
              </XStack>
            </YStack>
            <XStack alignItems="center" gap={8}>
              <Button
                onPress={onWatch}
                padding={4}
                backgroundColor="transparent"
                borderWidth={0}
                unstyled
              >
                <Text fontSize={20}>{player.isWatched ? '⭐' : '☆'}</Text>
              </Button>
              <Text fontSize={16}>{getTrendingIcon()}</Text>
            </XStack>
          </XStack>

          {/* Stats */}
          <XStack justifyContent="space-between" marginBottom={12}>
            <YStack alignItems="center">
              <Text fontSize={12} color="rgba(255,255,255,0.6)">
                Rank:
              </Text>
              <Text fontSize={14} fontWeight="600" color="$white">
                #{player.rank}
              </Text>
            </YStack>
            <YStack alignItems="center">
              <Text fontSize={12} color="rgba(255,255,255,0.6)">
                Own%:
              </Text>
              <Text fontSize={14} fontWeight="600" color="$white">
                {player.ownership}%
              </Text>
            </YStack>
            <YStack alignItems="center">
              <Text fontSize={12} color="rgba(255,255,255,0.6)">
                FAAB:
              </Text>
              <Text
                fontSize={14}
                fontWeight="600"
                color={sportConfig.colors.accent}
              >
                ${player.faabValue}
              </Text>
            </YStack>
          </XStack>

          {/* Action Button */}
          <Button
            backgroundColor={sportConfig.colors.accent}
            borderRadius={8}
            paddingVertical={10}
            onPress={onClaim}
          >
            <Text fontSize={14} fontWeight="600" color="$white">
              Add Waiver Claim
            </Text>
          </Button>
        </YStack>
      </Button>
    </Animated.View>
  );
};

/**
 * Advanced Filter Panel
 */
const FilterPanel: React.FC<{
  sport: string;
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  visible: boolean;
  onClose: () => void;
}> = ({ sport, filters, onFiltersChange, visible, onClose }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sportConfig = SPORT_CONFIGS[sport];

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  return (
    <Modal visible={visible} transparent>
      <View style={styles.filterOverlay}>
        <TouchableOpacity style={styles.filterBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.filterPanel,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Advanced Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.filterContent}>
            {/* Position Filter */}
            <Text style={styles.filterSectionTitle}>Position</Text>
            <View style={styles.filterGrid}>
              {['ALL', ...sportConfig.positions].map((pos) => (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.filterChip,
                    filters.position === pos && {
                      backgroundColor: sportConfig.colors.accent,
                    },
                  ]}
                  onPress={() => onFiltersChange({ ...filters, position: pos })}
                >
                  <Text style={styles.filterChipText}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Availability Filter */}
            <Text style={styles.filterSectionTitle}>Availability</Text>
            <View style={styles.filterGrid}>
              {['All', 'Available', 'Waivers', 'Free Agents'].map((avail) => (
                <TouchableOpacity
                  key={avail}
                  style={[
                    styles.filterChip,
                    filters.availability === avail && {
                      backgroundColor: sportConfig.colors.accent,
                    },
                  ]}
                  onPress={() =>
                    onFiltersChange({ ...filters, availability: avail })
                  }
                >
                  <Text style={styles.filterChipText}>{avail}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Trending Filter */}
            <Text style={styles.filterSectionTitle}>Trending</Text>
            <View style={styles.filterGrid}>
              {['All', 'Rising', 'Falling', 'Hot Adds'].map((trend) => (
                <TouchableOpacity
                  key={trend}
                  style={[
                    styles.filterChip,
                    filters.trending === trend && {
                      backgroundColor: sportConfig.colors.accent,
                    },
                  ]}
                  onPress={() =>
                    onFiltersChange({ ...filters, trending: trend })
                  }
                >
                  <Text style={styles.filterChipText}>{trend}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ownership Range */}
            <Text style={styles.filterSectionTitle}>Ownership %</Text>
            <View style={styles.rangeContainer}>
              <Text style={styles.rangeLabel}>0% - 100%</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

/**
 * Waiver Claim Modal
 */
const WaiverClaimModal: React.FC<{
  player: Player | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (claim: WaiverClaim) => void;
  sport: string;
}> = ({ player, visible, onClose, onSubmit, sport }) => {
  const [faabBid, setFaabBid] = useState('');
  const [priority, setPriority] = useState(1);
  const sportConfig = SPORT_CONFIGS[sport];

  const handleSubmit = () => {
    if (player) {
      onSubmit({
        faabBid: parseInt(faabBid) || 0,
        playerId: player.id,
        priority,
      });
      onClose();
      setFaabBid('');
      setPriority(1);
    }
  };

  if (!player) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.claimModal}>
          <Text style={styles.modalTitle}>Add Waiver Claim</Text>

          <View style={styles.playerSummary}>
            <Text style={styles.modalPlayerName}>{player.name}</Text>
            <Text style={styles.modalPlayerInfo}>
              {player.team} - {player.position}
            </Text>
          </View>

          <View style={styles.claimForm}>
            <Text style={styles.formLabel}>FAAB Bid ($)</Text>
            <TextInput
              style={styles.formInput}
              value={faabBid}
              onChangeText={setFaabBid}
              placeholder="Enter bid amount"
              keyboardType="numeric"
              placeholderTextColor="#666"
            />

            <Text style={styles.formLabel}>Waiver Priority</Text>
            <View style={styles.priorityContainer}>
              {[1, 2, 3, 4, 5].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityButton,
                    priority === p && {
                      backgroundColor: sportConfig.colors.accent,
                    },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={styles.priorityText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: sportConfig.colors.accent },
              ]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitButtonText}>Submit Claim</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * Main Free Agents Component
 */
const FreeAgents: React.FC = () => {
  // State
  const [sport] = useState<'baseball' | 'football'>('baseball'); // TODO: Get from route params
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('Rank');
  const [filters, setFilters] = useState({
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
    console.log('Waiver claim submitted:', claim);
    // TODO: Submit to backend
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
      style={{ padding: 8 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <YStack
          alignItems="center"
          flex={1}
          justifyContent="center"
          paddingVertical={60}
        >
          <Text
            fontSize={18}
            fontWeight="600"
            color="rgba(255,255,255,0.8)"
            marginBottom={8}
          >
            No free agents available
          </Text>
          <Text fontSize={14} color="rgba(255,255,255,0.6)" textAlign="center">
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
        paddingBottom={16}
        paddingHorizontal={20}
        paddingTop={50}
        backgroundColor={sportConfig.colors.secondary}
      >
        <Text fontSize={28} fontWeight="800" color="$white" marginBottom={4}>
          Free Agents
        </Text>
        <Text
          fontSize={12}
          fontWeight="600"
          color="rgba(255,255,255,0.8)"
          marginBottom={16}
        >
          {sport.toUpperCase()}
        </Text>

        {/* Quick Stats */}
        <XStack gap={24}>
          <YStack alignItems="center">
            <Text fontSize={20} fontWeight="700" color="$white">
              {filteredPlayers.length}
            </Text>
            <Text fontSize={12} color="rgba(255,255,255,0.7)">
              Available
            </Text>
          </YStack>
          <YStack alignItems="center">
            <Text fontSize={20} fontWeight="700" color="$white">
              {watchlist.size}
            </Text>
            <Text fontSize={12} color="rgba(255,255,255,0.7)">
              Watched
            </Text>
          </YStack>
        </XStack>
      </YStack>

      {/* Search and Controls */}
      <XStack flexDirection="row" gap={12} padding={16}>
        <TextInput
          style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: sportConfig.colors.accent,
            color: '#ffffff',
            flex: 1,
            fontSize: 16,
            height: 44,
            paddingHorizontal: 16,
          }}
          placeholder={`Search ${sport} free agents...`}
          placeholderTextColor="#64748b"
          value={searchText}
          onChangeText={setSearchText}
        />
        <Button
          backgroundColor={sportConfig.colors.accent}
          borderRadius={12}
          height={44}
          paddingHorizontal={20}
          alignItems="center"
          justifyContent="center"
          onPress={() => setShowFilters(true)}
        >
          <Text fontSize={14} fontWeight="600" color="$white">
            Filters
          </Text>
        </Button>
      </XStack>

      {/* Sort and View Controls */}
      <XStack alignItems="center" marginBottom={16} paddingHorizontal={16}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          <XStack gap={8}>
            {sportConfig.sortOptions.map((option) => (
              <Button
                key={option}
                backgroundColor={
                  sortBy === option
                    ? sportConfig.colors.accent
                    : 'rgba(255,255,255,0.1)'
                }
                borderRadius={20}
                paddingHorizontal={16}
                paddingVertical={8}
                onPress={() => setSortBy(option)}
              >
                <Text fontSize={12} fontWeight="600" color="$white">
                  {option}
                </Text>
              </Button>
            ))}
          </XStack>
        </ScrollView>

        <Button
          backgroundColor="rgba(255,255,255,0.1)"
          borderRadius={22}
          height={44}
          width={44}
          alignItems="center"
          justifyContent="center"
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          <Text fontSize={18} color="$white">
            {viewMode === 'grid' ? '☰' : '⊞'}
          </Text>
        </Button>
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

// Helper functions
const getPositionColor = (position: string, sport: string): string => {
  const baseballColors: Record<string, string> = {
    '1B': '#ff8c42',
    '2B': '#ffa726',
    '3B': '#ffb74d',
    C: '#ff6b35',
    OF: '#ffe0b2',
    P: '#e65100',
    SS: '#ffcc80',
  };
  const footballColors: Record<string, string> = {
    DEF: '#ffedd5',
    K: '#fed7aa',
    QB: '#ea580c',
    RB: '#f97316',
    TE: '#fdba74',
    WR: '#fb923c',
  };
  const colors = sport === 'baseball' ? baseballColors : footballColors;
  return colors[position] || '#6b7280';
};

// Styles for the modal components
const styles = StyleSheet.create({
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterBackdrop: {
    flex: 1,
  },
  filterPanel: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  closeButton: {
    fontSize: 18,
    color: '#ffffff',
    padding: 5,
  },
  filterContent: {
    maxHeight: 400,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 10,
    marginTop: 15,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 12,
  },
  rangeContainer: {
    paddingVertical: 10,
  },
  rangeLabel: {
    color: '#ffffff',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 15,
    textAlign: 'center',
  },
  playerSummary: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalPlayerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 5,
  },
  modalPlayerInfo: {
    fontSize: 14,
    color: '#cccccc',
  },
  claimForm: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    backgroundColor: '#2a2a2a',
    marginBottom: 15,
  },
  priorityContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  priorityText: {
    color: '#ffffff',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 14,
  },
  submitButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default FreeAgents;
