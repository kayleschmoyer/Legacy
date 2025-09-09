import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Player, DraftState, DraftTeam, Filter } from '../../types';
import { SPORT_CONFIGS, DEFAULT_COLORS } from '../../config/sports';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

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
    let interval: NodeJS.Timeout;
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
    [initialTime]
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
      style={[
        styles.playerCard,
        { transform: [{ scale: scaleAnim }] },
        isSelected && styles.selectedCard,
        isDrafted && styles.draftedCard,
      ]}
    >
      <TouchableOpacity
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardContent}
        activeOpacity={1}
        disabled={isDrafted}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.playerName, isDrafted && styles.draftedText]}>
            {player.name}
          </Text>
          <View
            style={[
              styles.positionBadge,
              { backgroundColor: getPositionColor(player.position, sport) },
              isDrafted && styles.draftedBadge,
            ]}
          >
            <Text style={styles.positionText}>{player.position}</Text>
          </View>
        </View>
        <Text style={[styles.teamText, isDrafted && styles.draftedText]}>
          {player.team}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={[styles.adpText, isDrafted && styles.draftedText]}>
            ADP: {player.adp}
          </Text>
          <Text style={[styles.rankText, isDrafted && styles.draftedText]}>
            #{player.rank}
          </Text>
        </View>
        {isDrafted && (
          <View style={styles.draftedOverlay}>
            <Text style={styles.draftedLabel}>DRAFTED</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
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
    if (time > 30) return DEFAULT_COLORS.success;
    if (time > 10) return DEFAULT_COLORS.warning;
    return DEFAULT_COLORS.error;
  };

  return (
    <View style={[styles.timerContainer, { backgroundColor: getTimerColor() }]}>
      <Text style={styles.timerText}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </Text>
      <Text style={styles.timerLabel}>
        {isActive ? 'Time Remaining' : 'Paused'}
      </Text>
    </View>
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
    <View style={styles.filterControls}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search players..."
        placeholderTextColor="#888"
        value={searchText}
        onChangeText={onSearchChange}
      />

      <View style={styles.positionFilters}>
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
    </View>
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
    <View style={styles.draftStatus}>
      <Text style={styles.draftTitle}>{draft.name}</Text>
      <Text style={styles.currentPick}>
        Pick #{draft.currentPick}
        {currentTeam && ` - ${currentTeam.name}`}
      </Text>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>{draft.status.toUpperCase()}</Text>
      </View>
    </View>
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

export function DraftBoard({
  draft,
  availablePlayers,
  onPlayerDraft,
  onTimerControl,
  draftedPlayerIds = new Set(),
}: DraftBoardProps): JSX.Element {
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Filter>({ position: 'ALL' });
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { time, isActive, start, pause, reset } = useTimer(draft.timeRemaining);

  const sportConfig = SPORT_CONFIGS[draft.sport] || SPORT_CONFIGS.baseball;
  const currentTeam = draft.teams.find(
    (team) =>
      team.picks.length ===
      Math.floor((draft.currentPick - 1) / draft.teams.length)
  );

  // Filter players
  const filteredPlayers = availablePlayers.filter((player) => {
    const matchesSearch =
      searchText === '' ||
      player.name.toLowerCase().includes(searchText.toLowerCase());
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

  const renderPlayer = ({ item }: { item: Player }) => (
    <PlayerCard
      player={item}
      onSelect={() => handlePlayerSelect(item)}
      isSelected={selectedPlayer?.id === item.id}
      sport={draft.sport}
      isDrafted={draftedPlayerIds.has(item.id)}
    />
  );

  return (
    <View style={styles.container}>
      {/* Draft Status */}
      <DraftStatus draft={draft} currentTeam={currentTeam} />

      {/* Timer */}
      <Timer time={time} isActive={isActive} />

      {/* Timer Controls */}
      <View style={styles.timerControls}>
        <TouchableOpacity
          style={styles.timerButton}
          onPress={() => handleTimerControl(isActive ? 'pause' : 'start')}
        >
          <Text style={styles.timerButtonText}>
            {isActive ? 'Pause' : 'Start'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.timerButton}
          onPress={() => handleTimerControl('reset')}
        >
          <Text style={styles.timerButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <FilterControls
        filters={filters}
        onFiltersChange={setFilters}
        positions={sportConfig.positions}
        searchText={searchText}
        onSearchChange={setSearchText}
      />

      {/* Player List */}
      <FlatList
        data={filteredPlayers}
        renderItem={renderPlayer}
        keyExtractor={(item) => item.id}
        numColumns={IS_TABLET ? 3 : 2}
        columnWrapperStyle={IS_TABLET ? styles.row : undefined}
        style={styles.playerList}
        showsVerticalScrollIndicator={false}
      />

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Draft Pick</Text>
            {selectedPlayer && (
              <>
                <Text style={styles.modalPlayerName}>
                  {selectedPlayer.name}
                </Text>
                <Text style={styles.modalPlayerDetails}>
                  {selectedPlayer.position} - {selectedPlayer.team}
                </Text>
                <Text style={styles.modalPlayerRank}>
                  Rank: #{selectedPlayer.rank}
                </Text>
              </>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleConfirmDraft}
              >
                <Text style={styles.modalConfirmText}>Draft Player</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.primary,
  },
  draftStatus: {
    padding: 16,
    backgroundColor: DEFAULT_COLORS.secondary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    flex: 1,
  },
  currentPick: {
    fontSize: 14,
    color: DEFAULT_COLORS.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
  statusBadge: {
    backgroundColor: DEFAULT_COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
  },
  timerContainer: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
  },
  timerLabel: {
    fontSize: 12,
    color: DEFAULT_COLORS.text,
    marginTop: 4,
  },
  timerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  timerButton: {
    backgroundColor: DEFAULT_COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timerButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
  filterControls: {
    padding: 16,
    backgroundColor: DEFAULT_COLORS.secondary,
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
  positionFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: DEFAULT_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
  playerList: {
    flex: 1,
    padding: 8,
  },
  row: {
    justifyContent: 'space-around',
  },
  playerCard: {
    flex: IS_TABLET ? 1 : 0.48,
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
  selectedCard: {
    borderWidth: 2,
    borderColor: DEFAULT_COLORS.accent,
  },
  draftedCard: {
    opacity: 0.6,
  },
  cardContent: {
    padding: 12,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  positionBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  draftedBadge: {
    backgroundColor: DEFAULT_COLORS.border,
  },
  positionText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
  },
  teamText: {
    fontSize: 12,
    color: DEFAULT_COLORS.textSecondary,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  adpText: {
    fontSize: 11,
    color: DEFAULT_COLORS.textSecondary,
  },
  rankText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.accent,
  },
  draftedText: {
    color: DEFAULT_COLORS.border,
  },
  draftedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftedLabel: {
    color: DEFAULT_COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 16,
    padding: 24,
    width: Platform.OS === 'web' ? 320 : '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 16,
  },
  modalPlayerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.accent,
    marginBottom: 8,
  },
  modalPlayerDetails: {
    fontSize: 14,
    color: DEFAULT_COLORS.textSecondary,
    marginBottom: 4,
  },
  modalPlayerRank: {
    fontSize: 14,
    color: DEFAULT_COLORS.textSecondary,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    backgroundColor: DEFAULT_COLORS.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
  modalConfirmButton: {
    backgroundColor: DEFAULT_COLORS.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
});
