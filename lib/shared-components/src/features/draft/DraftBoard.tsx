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
} from '../../platform-components';
import { Player, DraftState, DraftTeam, Filter } from '../../types';
import { SPORT_CONFIGS, DEFAULT_COLORS } from '../../config/sports';
import { safeStyle } from '../../utils/styles';

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
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => setIsPressed(true);
  const handlePressOut = () => setIsPressed(false);

  const playerName = player.player || `${player.firstName} ${player.lastName}`;

  return (
    <Animated.View
      style={safeStyle([
        styles.playerCard,
        isSelected && styles.selectedCard,
        isDrafted && styles.draftedCard,
      ])}
    >
      <button
        onClick={onSelect}
        onMouseDown={handlePressIn}
        onMouseUp={handlePressOut}
        onMouseLeave={handlePressOut}
        style={{
          ...styles.cardContent,
          cursor: isDrafted ? 'default' : 'pointer',
          opacity: isDrafted ? 0.6 : 1,
        }}
        disabled={isDrafted}
      >
        <View style={styles.cardHeader}>
          <Text
            style={safeStyle([
              styles.playerName,
              isDrafted && styles.draftedText,
            ])}
          >
            {`${player.firstName} ${player.lastName}`}
          </Text>
          <View
            style={safeStyle([
              styles.positionBadge,
              { backgroundColor: getPositionColor(player.position, sport) },
              ...(isDrafted ? [styles.draftedBadge] : []),
            ])}
          >
            <Text style={styles.positionText}>{player.position}</Text>
          </View>
        </View>
        <Text
          style={safeStyle([styles.teamText, isDrafted && styles.draftedText])}
        >
          {player.team}
        </Text>
        <View style={styles.cardFooter}>
          <Text
            style={safeStyle([styles.adpText, isDrafted && styles.draftedText])}
          >
            ADP: {player.adp}
          </Text>
          <Text
            style={safeStyle([
              styles.rankText,
              isDrafted && styles.draftedText,
            ])}
          >
            #{player.rank}
          </Text>
        </View>
        {isDrafted && (
          <div style={styles.draftedOverlay}>
            <span style={styles.draftedLabel}>DRAFTED</span>
          </div>
        )}
      </button>
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
    <View
      style={safeStyle([
        styles.timerContainer,
        { backgroundColor: getTimerColor() },
      ])}
    >
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
    <div style={styles.filterControls}>
      <input
        style={styles.searchInput}
        placeholder="Search players..."
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div style={styles.positionFilters}>
        {allPositions.map((position) => (
          <button
            key={position}
            style={safeStyle([
              styles.filterChip,
              filters.position === position && styles.filterChipActive,
            ])}
            onClick={() => onFiltersChange({ ...filters, position })}
          >
            <Text
              style={safeStyle([
                styles.filterChipText,
                filters.position === position && styles.filterChipTextActive,
              ])}
            >
              {position}
            </Text>
          </button>
        ))}
      </div>
    </div>
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
    <div style={styles.draftStatus}>
      <span style={styles.draftTitle}>{draft.name}</span>
      <span style={styles.currentPick}>
        Pick #{draft.currentPick}
        {currentTeam && ` - ${currentTeam.name}`}
      </span>
      <div style={styles.statusBadge}>
        <span style={styles.statusText}>{draft.status.toUpperCase()}</span>
      </div>
    </div>
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
      `${player.firstName} ${player.lastName}`
        .toLowerCase()
        .includes(searchText.toLowerCase());
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
    <div style={styles.container}>
      {/* Draft Status */}
      <DraftStatus draft={draft} currentTeam={currentTeam} />

      {/* Timer */}
      <Timer time={time} isActive={isActive} />

      {/* Timer Controls */}
      <div style={styles.timerControls}>
        <button
          style={styles.timerButton}
          onClick={() => handleTimerControl(isActive ? 'pause' : 'start')}
        >
          <span style={styles.timerButtonText}>
            {isActive ? 'Pause' : 'Start'}
          </span>
        </button>
        <button
          style={styles.timerButton}
          onClick={() => handleTimerControl('reset')}
        >
          <span style={styles.timerButtonText}>Reset</span>
        </button>
      </div>

      {/* Filters */}
      <FilterControls
        filters={filters}
        onFiltersChange={setFilters}
        positions={sportConfig.positions}
        searchText={searchText}
        onSearchChange={setSearchText}
      />

      {/* Player List */}
      <div
        style={{
          ...styles.playerList,
          display: 'grid',
          gridTemplateColumns: IS_TABLET ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: '16px',
          padding: '16px',
          overflowY: 'auto',
        }}
      >
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
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>Confirm Draft Pick</h3>
            {selectedPlayer && (
              <>
                <Text style={styles.modalPlayerName}>
                  {`${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
                </Text>
                <Text style={styles.modalPlayerDetails}>
                  {selectedPlayer.position} - {selectedPlayer.team}
                </Text>
                <Text style={styles.modalPlayerRank}>
                  Rank: #{selectedPlayer.rank}
                </Text>
              </>
            )}
            <div style={styles.modalButtons}>
              <button
                style={styles.modalCancelButton}
                onClick={() => setShowConfirmModal(false)}
              >
                <span style={styles.modalCancelText}>Cancel</span>
              </button>
              <button
                style={styles.modalConfirmButton}
                onClick={handleConfirmDraft}
              >
                <span style={styles.modalConfirmText}>Draft Player</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
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
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
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
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
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
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
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
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 2,
    paddingBottom: 2,
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
    width: 320,
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
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
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
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
});

export { DraftBoard };
