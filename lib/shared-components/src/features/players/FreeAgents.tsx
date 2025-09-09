import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Animated,
  StyleSheet,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Player, Filter } from '../../types';
import { SPORT_CONFIGS, DEFAULT_COLORS } from '../../config/sports';

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
  const sportConfig = SPORT_CONFIGS[sport] || SPORT_CONFIGS.baseball;

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
                  { backgroundColor: getInjuryColor(player.injury) },
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
            <Text style={styles.trendingIcon}>
              {getTrendingIcon(player.trending)}
            </Text>
          </View>
        </View>

        {/* Stats Preview */}
        <View style={styles.statsContainer}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Rank: #{player.rank}</Text>
            <Text style={styles.statLabel}>Own: {player.ownership}%</Text>
            <Text style={styles.statLabel}>FAAB: ${player.faabValue}</Text>
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
          <Text style={styles.claimButtonText}>Claim Player</Text>
        </TouchableOpacity>
      </TouchableOpacity>
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
  const availabilityOptions = ['ALL', 'Available', 'Watched'];
  const trendingOptions = ['ALL', 'Up', 'Down', 'Stable'];

  return (
    <View style={styles.controlsContainer}>
      {/* Search Bar */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search players..."
        placeholderTextColor="#888"
        value={searchText}
        onChangeText={onSearchChange}
      />

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersRow}
      >
        {/* Position Filter */}
        <View style={styles.filterGroup}>
          {allPositions.map((position) => (
            <TouchableOpacity
              key={position}
              style={[
                styles.filterChip,
                filters.position === position && styles.filterChipActive,
              ]}
              onPress={() => onFiltersChange({ ...filters, position })}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filters.position === position && styles.filterChipTextActive,
                ]}
              >
                {position}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trending Filter */}
        <View style={styles.filterGroup}>
          {trendingOptions.map((trending) => (
            <TouchableOpacity
              key={trending}
              style={[
                styles.filterChip,
                filters.trending === trending && styles.filterChipActive,
              ]}
              onPress={() => onFiltersChange({ ...filters, trending })}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filters.trending === trending && styles.filterChipTextActive,
                ]}
              >
                {trending === 'ALL' ? 'All Trends' : `${trending} 📈`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Sort Button */}
      <TouchableOpacity
        style={styles.sortButton}
        onPress={() => setShowSortModal(true)}
      >
        <Text style={styles.sortButtonText}>Sort: {sortBy}</Text>
        <Text style={styles.sortArrow}>▼</Text>
      </TouchableOpacity>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sortModalContent}>
            <Text style={styles.sortModalTitle}>Sort By</Text>
            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.sortOption,
                  sortBy === option && styles.sortOptionActive,
                ]}
                onPress={() => {
                  onSortChange(option);
                  setShowSortModal(false);
                }}
              >
                <Text
                  style={[
                    styles.sortOptionText,
                    sortBy === option && styles.sortOptionTextActive,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
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
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.claimModalContent}>
          <Text style={styles.claimModalTitle}>Submit Waiver Claim</Text>

          <View style={styles.playerSummary}>
            <Text style={styles.claimPlayerName}>{player.name}</Text>
            <Text style={styles.claimPlayerDetails}>
              {player.position} - {player.team}
            </Text>
          </View>

          {/* FAAB Bid */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FAAB Bid (Max: ${maxFaab})</Text>
            <TextInput
              style={styles.textInput}
              value={faabBid}
              onChangeText={setFaabBid}
              keyboardType="numeric"
              placeholder="Enter bid amount"
              placeholderTextColor="#888"
            />
          </View>

          {/* Priority */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Claim Priority</Text>
            <TextInput
              style={styles.textInput}
              value={priority}
              onChangeText={setPriority}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor="#888"
            />
          </View>

          {/* Drop Player */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Drop Player (Optional)</Text>
            <ScrollView style={styles.dropPlayerList}>
              <TouchableOpacity
                style={[
                  styles.dropPlayerOption,
                  !dropPlayerId && styles.dropPlayerOptionSelected,
                ]}
                onPress={() => setDropPlayerId(undefined)}
              >
                <Text style={styles.dropPlayerText}>
                  None (if roster space)
                </Text>
              </TouchableOpacity>
              {rosterPlayers.map((rosterPlayer) => (
                <TouchableOpacity
                  key={rosterPlayer.id}
                  style={[
                    styles.dropPlayerOption,
                    dropPlayerId === rosterPlayer.id &&
                      styles.dropPlayerOptionSelected,
                  ]}
                  onPress={() => setDropPlayerId(rosterPlayer.id)}
                >
                  <Text style={styles.dropPlayerText}>
                    {rosterPlayer.name} ({rosterPlayer.position})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Action Buttons */}
          <View style={styles.claimModalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitButton}
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

export function FreeAgents({
  sport,
  players,
  onPlayerClaim,
  onPlayerWatch,
  maxFaab,
  rosterPlayers,
}: FreeAgentsProps): JSX.Element {
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Filter>({
    position: 'ALL',
    availability: 'ALL',
    trending: 'ALL',
  });
  const [sortBy, setSortBy] = useState('Rank');
  const [selectedPlayer, setSelectedPlayer] = useState<FreeAgentPlayer | null>(
    null
  );
  const [showClaimModal, setShowClaimModal] = useState(false);

  const sportConfig = SPORT_CONFIGS[sport] || SPORT_CONFIGS.baseball;

  // Filter and sort players
  const filteredAndSortedPlayers = useMemo(() => {
    let filtered = players.filter((player) => {
      const matchesSearch =
        searchText === '' ||
        player.name.toLowerCase().includes(searchText.toLowerCase());
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Free Agents</Text>
        <Text style={styles.subtitle}>
          {filteredAndSortedPlayers.length} available players
        </Text>
      </View>

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
        keyExtractor={(item) => item.id}
        numColumns={IS_TABLET ? 2 : 1}
        columnWrapperStyle={IS_TABLET ? styles.row : undefined}
        style={styles.playerList}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.primary,
  },
  header: {
    padding: 16,
    backgroundColor: DEFAULT_COLORS.secondary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: DEFAULT_COLORS.textSecondary,
    marginTop: 4,
  },
  controlsContainer: {
    backgroundColor: DEFAULT_COLORS.secondary,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchInput: {
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: DEFAULT_COLORS.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: DEFAULT_COLORS.border,
  },
  filtersRow: {
    marginBottom: 12,
  },
  filterGroup: {
    flexDirection: 'row',
    marginRight: 16,
  },
  filterChip: {
    backgroundColor: DEFAULT_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: DEFAULT_COLORS.accent,
  },
  filterChipText: {
    fontSize: 12,
    color: DEFAULT_COLORS.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: DEFAULT_COLORS.text,
  },
  sortButton: {
    backgroundColor: DEFAULT_COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sortButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
  sortArrow: {
    color: DEFAULT_COLORS.text,
    fontSize: 12,
  },
  playerList: {
    flex: 1,
  },
  listContent: {
    padding: 8,
  },
  row: {
    justifyContent: 'space-around',
  },
  playerCard: {
    flex: IS_TABLET ? 1 : undefined,
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 12,
    margin: 4,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  cardContent: {
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 4,
  },
  playerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  teamText: {
    fontSize: 12,
    color: DEFAULT_COLORS.textSecondary,
  },
  positionBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  positionText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
  },
  injuryBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  injuryText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
  },
  cardActions: {
    alignItems: 'center',
  },
  watchButton: {
    padding: 4,
  },
  watchIcon: {
    fontSize: 16,
  },
  trendingIcon: {
    fontSize: 12,
    marginTop: 4,
  },
  statsContainer: {
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 11,
    color: DEFAULT_COLORS.textSecondary,
  },
  claimButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  claimButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortModalContent: {
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    width: Platform.OS === 'web' ? 280 : '70%',
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  sortOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  sortOptionActive: {
    backgroundColor: DEFAULT_COLORS.accent,
  },
  sortOptionText: {
    fontSize: 16,
    color: DEFAULT_COLORS.textSecondary,
  },
  sortOptionTextActive: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
  claimModalContent: {
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 16,
    padding: 24,
    width: Platform.OS === 'web' ? 400 : '90%',
    maxHeight: '80%',
  },
  claimModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  playerSummary: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
  },
  claimPlayerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.accent,
  },
  claimPlayerDetails: {
    fontSize: 14,
    color: DEFAULT_COLORS.textSecondary,
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: DEFAULT_COLORS.text,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: DEFAULT_COLORS.text,
    borderWidth: 1,
    borderColor: DEFAULT_COLORS.border,
  },
  dropPlayerList: {
    maxHeight: 120,
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DEFAULT_COLORS.border,
  },
  dropPlayerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: DEFAULT_COLORS.border,
  },
  dropPlayerOptionSelected: {
    backgroundColor: DEFAULT_COLORS.accent,
  },
  dropPlayerText: {
    fontSize: 14,
    color: DEFAULT_COLORS.text,
  },
  claimModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
});
