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
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
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
        styles.playerCard,
        { transform: [{ scale: scaleAnim }] },
        isSelected && {
          borderColor: sportConfig.colors.accent,
          borderWidth: 2,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardContent}
        activeOpacity={1}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.playerInfo}>
            <Text style={styles.playerName}>{player.name}</Text>
            <View style={styles.playerMeta}>
              <Text style={styles.teamText}>{player.team}</Text>
              <View
                style={[
                  styles.positionBadge,
                  { backgroundColor: getPositionColor(player.position, sport) },
                ]}
              >
                <Text style={styles.positionText}>{player.position}</Text>
              </View>
              <View
                style={[
                  styles.injuryBadge,
                  { backgroundColor: getInjuryColor() },
                ]}
              >
                <Text style={styles.injuryText}>
                  {player.injury.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={onWatch} style={styles.watchButton}>
              <Text style={styles.watchIcon}>
                {player.isWatched ? '⭐' : '☆'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.trendingIcon}>{getTrendingIcon()}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Rank:</Text>
            <Text style={styles.statValue}>#{player.rank}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Own%:</Text>
            <Text style={styles.statValue}>{player.ownership}%</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>FAAB:</Text>
            <Text
              style={[styles.statValue, { color: sportConfig.colors.accent }]}
            >
              ${player.faabValue}
            </Text>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.claimButton,
            { backgroundColor: sportConfig.colors.accent },
          ]}
          onPress={onClaim}
        >
          <Text style={styles.claimButtonText}>Add Waiver Claim</Text>
        </TouchableOpacity>
      </TouchableOpacity>
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
      contentContainerStyle={styles.playerGrid}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No free agents available</Text>
          <Text style={styles.emptyStateSubtext}>
            Players will appear when database is populated
          </Text>
        </View>
      }
    />
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: sportConfig.colors.primary },
      ]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={sportConfig.colors.primary}
      />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: sportConfig.colors.secondary },
        ]}
      >
        <Text style={styles.headerTitle}>Free Agents</Text>
        <Text style={styles.sportBadge}>{sport.toUpperCase()}</Text>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{filteredPlayers.length}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{watchlist.size}</Text>
            <Text style={styles.statLabel}>Watched</Text>
          </View>
        </View>
      </View>

      {/* Search and Controls */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[
            styles.searchInput,
            { borderColor: sportConfig.colors.accent },
          ]}
          placeholder={`Search ${sport} free agents...`}
          placeholderTextColor="#64748b"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity
          style={[
            styles.filterButton,
            { backgroundColor: sportConfig.colors.accent },
          ]}
          onPress={() => setShowFilters(true)}
        >
          <Text style={styles.filterButtonText}>Filters</Text>
        </TouchableOpacity>
      </View>

      {/* Sort and View Controls */}
      <View style={styles.controlsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sortContainer}
        >
          {sportConfig.sortOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.sortButton,
                sortBy === option && {
                  backgroundColor: sportConfig.colors.accent,
                },
              ]}
              onPress={() => setSortBy(option)}
            >
              <Text style={styles.sortButtonText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={styles.viewToggle}
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          <Text style={styles.viewToggleText}>
            {viewMode === 'grid' ? '☰' : '⊞'}
          </Text>
        </TouchableOpacity>
      </View>

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
    </View>
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

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 24,
  },
  sportBadge: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  controlsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  statNumber: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  filterButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    height: 44,
    paddingHorizontal: 16,
  },
  sortButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    marginRight: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  playerGrid: {
    padding: 8,
  },
  sortButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  sortContainer: {
    flex: 1,
  },
  viewToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cardContent: {
    padding: 16,
  },
  viewToggleText: {
    color: '#ffffff',
    fontSize: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  playerCard: {
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
  playerInfo: {
    flex: 1,
  },
  playerMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  playerName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  positionBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  injuryBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  teamText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  injuryText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '700',
  },
  positionText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  trendingIcon: {
    fontSize: 16,
  },
  watchButton: {
    padding: 4,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  watchIcon: {
    fontSize: 20,
  },
  claimButton: {
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  statRow: {
    alignItems: 'center',
  },
  claimButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyStateText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  filterBackdrop: {
    flex: 1,
  },
  filterOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
  },
  filterHeader: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.2)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  closeButton: {
    color: '#ffffff',
    fontSize: 24,
  },
  filterPanel: {
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  filterContent: {
    padding: 20,
  },
  filterTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterSectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 16,
  },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  rangeContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    flex: 1,
    justifyContent: 'center',
  },
  rangeLabel: {
    color: '#ffffff',
    fontSize: 14,
  },
  claimModal: {
    backgroundColor: '#2d2d2d',
    borderRadius: 16,
    maxWidth: 400,
    padding: 24,
    width: '90%',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalPlayerName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  playerSummary: {
    alignItems: 'center',
    marginBottom: 24,
  },
  claimForm: {
    marginBottom: 24,
  },
  modalPlayerInfo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 16,
    padding: 12,
  },
  formLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  priorityButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  priorityText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FreeAgents;
