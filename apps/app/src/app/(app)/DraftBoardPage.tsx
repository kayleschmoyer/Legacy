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

// Sport configurations
const SPORT_CONFIGS = {
  baseball: {
    colors: { accent: '#ff6b35', primary: '#1a1a1a', secondary: '#2d2d2d' },
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
    statLabels: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K'],
  },
  football: {
    colors: { accent: '#f97316', primary: '#7c2d12', secondary: '#ea580c' },
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    statLabels: ['PASS YDS', 'RUSH YDS', 'REC', 'TD', 'FG', 'INT'],
  },
};

// Types
export interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  adp: number;
  rank: number;
  stats?: Record<string, unknown>;
  // Additional properties for PlayerRow component
  player: string;
  pos: string;
  hr: number;
  avg: number;
  rbi: number;
  legacy: string;
  fantasyPoints: number;
  projectedPoints: number;
  gamesPlayed: number;
  runs: number;
  hits: number;
  strikeouts: number;
  walks: number;
  obp: number;
}

export interface Filter {
  position?: string;
  availability?: string;
  trending?: string;
}

export interface TeamType {
  id: number;
  name: string;
}

interface Pick {
  id: string;
  player: Player;
  pickNumber: number;
  timestamp: string;
  teamId: string;
}

interface DraftTeam {
  id: string;
  name: string;
  owner: string;
  picks: Pick[];
}

interface DraftState {
  id: string;
  name: string;
  sport: 'baseball' | 'football';
  status: 'waiting' | 'active' | 'paused' | 'completed';
  currentPick: number;
  timeRemaining: number;
  teams: DraftTeam[];
  picks: Pick[];
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

/**
 * Custom hook for draft timer with color transitions
 */
const useTimer = (initialTime: number) => {
  const [time, setTime] = useState(initialTime);
  const [isActive, setIsActive] = useState(false);
  const colorAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && time > 0) {
      interval = setInterval(() => {
        setTime((t) => {
          const newTime = t - 1;
          if ([30, 10, 5, 3, 2, 1].includes(newTime)) {
            Platform.OS !== 'web' && Vibration.vibrate(50);
          }
          Animated.timing(colorAnim, {
            duration: 300,
            toValue: newTime > 30 ? 1 : newTime > 10 ? 0.5 : 0,
            useNativeDriver: false,
          }).start();
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, time, colorAnim]);

  const start = useCallback(() => setIsActive(true), []);
  const pause = useCallback(() => setIsActive(false), []);
  const reset = useCallback(
    (newTime: number = initialTime) => {
      setTime(newTime);
      setIsActive(false);
      colorAnim.setValue(1);
    },
    [initialTime, colorAnim]
  );

  return { colorAnim, isActive, pause, reset, start, time };
};

/**
 * Player card component
 */
const PlayerCard: React.FC<{
  player: Player;
  onSelect: () => void;
  isSelected?: boolean;
  sport?: string;
}> = ({ player, onSelect, isSelected, sport = 'baseball' }) => {
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
      ]}
    >
      <TouchableOpacity
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardContent}
        activeOpacity={1}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.playerName}>{player.name}</Text>
          <View
            style={[
              styles.positionBadge,
              { backgroundColor: getPositionColor(player.position, sport) },
            ]}
          >
            <Text style={styles.positionText}>{player.position}</Text>
          </View>
        </View>
        <Text style={styles.teamText}>{player.team}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.adpText}>ADP: {player.adp}</Text>
          <Text style={styles.rankText}>#{player.rank}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

/**
 * Timer bar with smooth color transitions
 */
const TimerBar: React.FC<{ time: number; colorAnim: Animated.Value }> = ({
  time,
  colorAnim,
}) => {
  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#ef4444', '#f59e0b', '#10b981'],
  });

  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  return (
    <Animated.View style={[styles.timerBar, { backgroundColor }]}>
      <Text style={styles.timerText}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </Text>
      <Text style={styles.timerLabel}>Time Remaining</Text>
    </Animated.View>
  );
};

/**
 * Filter drawer for mobile
 */
const FilterDrawer: React.FC<{
  visible: boolean;
  onClose: () => void;
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  positions: string[];
}> = ({ visible, onClose, filters, onFiltersChange, positions }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const allPositions = ['ALL', ...positions];

  return (
    <Modal visible={visible} transparent>
      <View style={styles.drawerOverlay}>
        <TouchableOpacity style={styles.drawerBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.filterDrawer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.drawerTitle}>Filters</Text>
          <ScrollView style={styles.drawerContent}>
            <Text style={styles.filterLabel}>Position</Text>
            <View style={styles.filterGrid}>
              {allPositions.map((pos) => (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.filterChip,
                    filters.position === pos && styles.filterChipActive,
                  ]}
                  onPress={() => onFiltersChange({ ...filters, position: pos })}
                >
                  <Text style={styles.filterChipText}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

/**
 * Main DraftBoard component
 */
const DraftBoardPage: React.FC = () => {
  // State
  const [draftId] = useState('default-draft');
  const [sport] = useState<'baseball' | 'football'>('baseball');
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({ position: 'ALL', team: 'ALL' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [activeView, setActiveView] = useState<'draft' | 'teams' | 'myteam'>(
    'draft'
  );
  // Sport config
  const sportConfig = SPORT_CONFIGS[sport];

  // Hooks
  const timer = useTimer(90);

  // Empty data - will be populated from database
  const draft: DraftState = {
    currentPick: 1,
    id: draftId,
    name: 'Fantasy League',
    picks: [],
    sport: sport,
    status: 'waiting',
    teams: [],
    timeRemaining: 90,
  };

  const players: Player[] = useMemo((): Player[] => [], []); // Will be populated from database

  // Filtered players
  const filteredPlayers = useMemo(() => {
    return players
      .filter((p: Player) => {
        const matchesSearch = p.name
          .toLowerCase()
          .includes(searchText.toLowerCase());
        const matchesPosition =
          filters.position === 'ALL' || p.position === filters.position;
        return matchesSearch && matchesPosition;
      })
      .sort((a: Player, b: Player) => a.adp - b.adp);
  }, [players, searchText, filters]);

  // Handlers
  const handlePlayerSelect = useCallback(
    (player: Player) => {
      setSelectedPlayer(player);
      console.log('Selected player:', player.name);
      Platform.OS !== 'web' && Vibration.vibrate(100);
      timer.reset(90);
      timer.start();
    },
    [timer]
  );

  const handleStartDraft = useCallback(() => {
    console.log('Starting draft...', draftId);
    timer.start();
  }, [timer, draftId]);

  const renderPlayerGrid = () => (
    <FlatList
      data={filteredPlayers}
      keyExtractor={(item) => item.id}
      numColumns={IS_TABLET ? 3 : 2}
      renderItem={({ item }) => (
        <PlayerCard
          player={item}
          onSelect={() => handlePlayerSelect(item)}
          isSelected={selectedPlayer?.id === item.id}
          sport={sport}
        />
      )}
      contentContainerStyle={styles.playerGrid}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No players available</Text>
          <Text style={styles.emptyStateSubtext}>
            Players will appear when database is populated
          </Text>
        </View>
      }
    />
  );

  const renderMobileLayout = () => (
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
          styles.mobileHeader,
          { backgroundColor: sportConfig.colors.secondary },
        ]}
      >
        <Text style={styles.leagueName}>{draft.name}</Text>
        <Text style={styles.sportBadge}>{sport.toUpperCase()}</Text>
        <View style={styles.headerTabs}>
          <TouchableOpacity
            style={[
              styles.headerTab,
              activeView === 'draft' && styles.activeHeaderTab,
            ]}
            onPress={() => setActiveView('draft')}
          >
            <Text style={styles.headerTabText}>Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.headerTab,
              activeView === 'myteam' && styles.activeHeaderTab,
            ]}
            onPress={() => setActiveView('myteam')}
          >
            <Text style={styles.headerTabText}>My Team</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.headerTab,
              activeView === 'teams' && styles.activeHeaderTab,
            ]}
            onPress={() => setActiveView('teams')}
          >
            <Text style={styles.headerTabText}>All Teams</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeView === 'draft' ? (
        <>
          {/* Timer */}
          {draft.status === 'active' && (
            <TimerBar time={timer.time} colorAnim={timer.colorAnim} />
          )}

          {/* Start Draft Button */}
          {draft.status === 'waiting' && (
            <TouchableOpacity
              style={[
                styles.startDraftButton,
                { backgroundColor: sportConfig.colors.accent },
              ]}
              onPress={handleStartDraft}
            >
              <Text style={styles.startDraftText}>Start Draft</Text>
            </TouchableOpacity>
          )}

          {/* Search & Filters */}
          <View style={styles.searchContainer}>
            <TextInput
              style={[
                styles.searchInput,
                { borderColor: sportConfig.colors.accent },
              ]}
              placeholder={`Search ${sport} players...`}
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

          {/* Player Grid */}
          {renderPlayerGrid()}
        </>
      ) : activeView === 'myteam' ? (
        /* My Team View */
        <ScrollView style={styles.myTeamContainer}>
          <Text style={styles.myTeamTitle}>My Roster</Text>
          {sportConfig.positions.map((position) => (
            <View key={position} style={styles.rosterSlot}>
              <Text style={styles.positionLabel}>{position}</Text>
              <Text style={styles.playerSlot}>Empty</Text>
            </View>
          ))}

          <Text style={styles.benchTitle}>Bench</Text>
          {[1, 2, 3, 4, 5].map((benchSpot) => (
            <View key={benchSpot} style={styles.rosterSlot}>
              <Text style={styles.positionLabel}>BE{benchSpot}</Text>
              <Text style={styles.playerSlot}>Empty</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        /* Teams View */
        <ScrollView style={styles.teamsContainer}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No teams available</Text>
            <Text style={styles.emptyStateSubtext}>
              Teams will appear when database is populated
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Filter Drawer */}
      <FilterDrawer
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onFiltersChange={setFilters}
        positions={sportConfig.positions}
      />
    </View>
  );

  return IS_TABLET ? renderMobileLayout() : renderMobileLayout();
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
  activeHeaderTab: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  container: {
    flex: 1,
  },
  headerTab: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minWidth: 60,
    paddingVertical: 8,
  },
  headerTabText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerTabs: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  leagueName: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  mobileHeader: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
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
  sportBadge: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
  },
  startDraftButton: {
    alignItems: 'center',
    borderRadius: 12,
    elevation: 8,
    margin: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  startDraftText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  filterButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  timerBar: {
    alignItems: 'center',
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  timerText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 2,
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timerLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
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
  playerGrid: {
    padding: 8,
  },
  playerName: {
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  positionBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adpText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  selectedCard: {
    borderColor: '#ffffff',
    borderWidth: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 60,
  },
  positionText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyStateSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
  teamText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 12,
  },
  emptyStateText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  myTeamContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    marginBottom: 16,
    padding: 16,
  },
  myTeamContainer: {
    flex: 1,
    padding: 16,
  },
  myTeamTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  positionLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  benchTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 24,
    textAlign: 'center',
  },
  positionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  playerSlot: {
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    marginLeft: 16,
  },
  rankText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  drawerBackdrop: {
    flex: 1,
  },
  drawerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
  },
  rosterSlot: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 16,
  },
  drawerContent: {
    padding: 20,
  },
  teamsContainer: {
    flex: 1,
    padding: 16,
  },
  drawerTitle: {
    borderBottomColor: 'rgba(255,255,255,0.2)',
    borderBottomWidth: 1,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 20,
    textAlign: 'center',
  },
  filterDrawer: {
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChipActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: '#ffffff',
  },
  filterLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DraftBoardPage;
