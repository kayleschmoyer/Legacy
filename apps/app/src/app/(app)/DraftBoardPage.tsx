import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Animated,
  Dimensions,
  StyleSheet,
  Modal,
  Vibration,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';

// Configuration - Auto-derives from your .env file
const GRAPHQL_HOST = process.env.EXPO_PUBLIC_GRAPHQL_HOST || 'http://localhost:5000/graphql';

// Sport configurations
const SPORT_CONFIGS = {
  baseball: {
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
    colors: { primary: '#1a1a1a', secondary: '#2d2d2d', accent: '#ff6b35' },
    statLabels: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K']
  },
  football: {
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    colors: { primary: '#7c2d12', secondary: '#ea580c', accent: '#f97316' },
    statLabels: ['PASS YDS', 'RUSH YDS', 'REC', 'TD', 'FG', 'INT']
  }
};

// Types
interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  adp: number;
  rank: number;
  stats?: any;
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
        setTime(t => {
          const newTime = t - 1;
          if ([30, 10, 5, 3, 2, 1].includes(newTime)) {
            Platform.OS !== 'web' && Vibration.vibrate(50);
          }
          Animated.timing(colorAnim, {
            toValue: newTime > 30 ? 1 : newTime > 10 ? 0.5 : 0,
            duration: 300,
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
  const reset = useCallback((newTime: number = initialTime) => {
    setTime(newTime);
    setIsActive(false);
    colorAnim.setValue(1);
  }, [initialTime, colorAnim]);

  return { time, isActive, start, pause, reset, colorAnim };
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
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start();
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
          <View style={[styles.positionBadge, { backgroundColor: getPositionColor(player.position, sport) }]}>
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
const TimerBar: React.FC<{ time: number; colorAnim: Animated.Value }> = ({ time, colorAnim }) => {
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
  filters: any;
  onFiltersChange: (filters: any) => void;
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
          style={[styles.filterDrawer, { transform: [{ translateY: slideAnim }] }]}
        >
          <Text style={styles.drawerTitle}>Filters</Text>
          <ScrollView style={styles.drawerContent}>
            <Text style={styles.filterLabel}>Position</Text>
            <View style={styles.filterGrid}>
              {allPositions.map(pos => (
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
  const [activeView, setActiveView] = useState<'draft' | 'teams' | 'myteam'>('draft');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  // Sport config
  const sportConfig = SPORT_CONFIGS[sport];
  
  // Hooks
  const timer = useTimer(90);
  
  // Empty data - will be populated from database
  const draft: DraftState = {
    id: draftId,
    name: 'Fantasy League',
    sport: sport,
    status: 'waiting',
    currentPick: 1,
    timeRemaining: 90,
    teams: [],
    picks: []
  };

  const players: Player[] = []; // Will be populated from database

  // Filtered players
  const filteredPlayers = useMemo(() => {
    return players
      .filter((p: Player) => {
        const matchesSearch = p.name.toLowerCase().includes(searchText.toLowerCase());
        const matchesPosition = filters.position === 'ALL' || p.position === filters.position;
        return matchesSearch && matchesPosition;
      })
      .sort((a: Player, b: Player) => a.adp - b.adp);
  }, [players, searchText, filters]);

  // Handlers
  const handlePlayerSelect = useCallback((player: Player) => {
    setSelectedPlayer(player);
    console.log('Selected player:', player.name);
    Platform.OS !== 'web' && Vibration.vibrate(100);
    timer.reset(90);
    timer.start();
  }, [timer]);

  const handleStartDraft = useCallback(() => {
    console.log('Starting draft...', draftId);
    timer.start();
  }, [timer, draftId]);

  const renderPlayerGrid = () => (
    <FlatList
      data={filteredPlayers}
      keyExtractor={item => item.id}
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
          <Text style={styles.emptyStateSubtext}>Players will appear when database is populated</Text>
        </View>
      }
    />
  );

  const renderMobileLayout = () => (
    <View style={[styles.container, { backgroundColor: sportConfig.colors.primary }]}>
      <StatusBar barStyle="light-content" backgroundColor={sportConfig.colors.primary} />
      
      {/* Header */}
      <View style={[styles.mobileHeader, { backgroundColor: sportConfig.colors.secondary }]}>
        <Text style={styles.leagueName}>{draft.name}</Text>
        <Text style={styles.sportBadge}>{sport.toUpperCase()}</Text>
        <View style={styles.headerTabs}>
          <TouchableOpacity
            style={[styles.headerTab, activeView === 'draft' && styles.activeHeaderTab]}
            onPress={() => setActiveView('draft')}
          >
            <Text style={styles.headerTabText}>Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerTab, activeView === 'myteam' && styles.activeHeaderTab]}
            onPress={() => setActiveView('myteam')}
          >
            <Text style={styles.headerTabText}>My Team</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerTab, activeView === 'teams' && styles.activeHeaderTab]}
            onPress={() => setActiveView('teams')}
          >
            <Text style={styles.headerTabText}>All Teams</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {activeView === 'draft' ? (
        <>
          {/* Timer */}
          {draft.status === 'active' && <TimerBar time={timer.time} colorAnim={timer.colorAnim} />}
          
          {/* Start Draft Button */}
          {draft.status === 'waiting' && (
            <TouchableOpacity 
              style={[styles.startDraftButton, { backgroundColor: sportConfig.colors.accent }]}
              onPress={handleStartDraft}
            >
              <Text style={styles.startDraftText}>🚀 Start Draft</Text>
            </TouchableOpacity>
          )}
          
          {/* Search & Filters */}
          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.searchInput, { borderColor: sportConfig.colors.accent }]}
              placeholder={`Search ${sport} players...`}
              placeholderTextColor="#64748b"
              value={searchText}
              onChangeText={setSearchText}
            />
            <TouchableOpacity
              style={[styles.filterButton, { backgroundColor: sportConfig.colors.accent }]}
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
          {sportConfig.positions.map(position => (
            <View key={position} style={styles.rosterSlot}>
              <Text style={styles.positionLabel}>{position}</Text>
              <Text style={styles.playerSlot}>Empty</Text>
            </View>
          ))}
          
          <Text style={styles.benchTitle}>Bench</Text>
          {[1,2,3,4,5].map(benchSpot => (
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
            <Text style={styles.emptyStateSubtext}>Teams will appear when database is populated</Text>
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
    C: '#ff6b35', '1B': '#ff8c42', '2B': '#ffa726', '3B': '#ffb74d',
    SS: '#ffcc80', OF: '#ffe0b2', P: '#e65100'
  };
  const footballColors: Record<string, string> = {
    QB: '#ea580c', RB: '#f97316', WR: '#fb923c', TE: '#fdba74',
    K: '#fed7aa', DEF: '#ffedd5'
  };
  const colors = sport === 'baseball' ? baseballColors : footballColors;
  return colors[position] || '#6b7280';
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mobileHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  leagueName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  sportBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
  },
  headerTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 4,
  },
  headerTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    minWidth: 60,
  },
  activeHeaderTab: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTabText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  startDraftButton: {
    margin: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startDraftText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  timerBar: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  timerText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timerLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
  },
  filterButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  playerGrid: {
    padding: 8,
  },
  playerCard: {
    flex: 1,
    margin: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  selectedCard: {
    borderColor: '#ffffff',
    borderWidth: 2,
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    marginRight: 8,
  },
  positionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  positionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  teamText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  adpText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  myTeamContainer: {
    flex: 1,
    padding: 16,
  },
  myTeamTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  rosterSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  positionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff6b35',
    width: 40,
    textAlign: 'center',
  },
  playerSlot: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 16,
  },
  benchTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  teamsContainer: {
    flex: 1,
    padding: 16,
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerBackdrop: {
    flex: 1,
  },
  filterDrawer: {
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  drawerContent: {
    padding: 20,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: '#ffffff',
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DraftBoardPage;