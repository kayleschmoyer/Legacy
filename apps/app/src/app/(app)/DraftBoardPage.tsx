/* eslint-disable */
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
  TouchableOpacity,
  Vibration,
} from 'react-native';
import {
  Button,
  Card,
  Input,
  ScrollView,
  Text,
  View,
  XStack,
  YStack,
} from 'tamagui';
import { Alert } from 'react-native';
import {
  StartDraftMutation,
  useStartDraftMutation,
} from '../../api/db/graphql.generated';

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
    [initialTime, colorAnim],
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

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <Card
        backgroundColor="rgba(255,255,255,0.1)"
        borderColor={isSelected ? '$white' : 'rgba(255,255,255,0.2)'}
        borderRadius="$4"
        borderWidth={isSelected ? 2 : 1}
        flex={1}
        margin="$2"
        shadowColor="$shadowColor"
        shadowOffset={{ height: 4, width: 0 }}
        shadowOpacity={0.3}
        shadowRadius={8}
        elevation={8}
        pressStyle={{ scale: 0.98 }}
        onPress={onSelect}
        padding="$4"
      >
        <XStack
          alignItems="flex-start"
          justifyContent="space-between"
          marginBottom="$2"
        >
          <Text
            color="$white"
            flex={1}
            fontSize="$4"
            fontWeight="700"
            marginRight="$2"
          >
            {player.name}
          </Text>
          <View
            backgroundColor={getPositionColor(player.position, sport)}
            borderRadius="$2"
            paddingHorizontal="$2"
            paddingVertical="$1"
          >
            <Text color="$white" fontSize="$1" fontWeight="700">
              {player.position}
            </Text>
          </View>
        </XStack>
        <Text color="rgba(255,255,255,0.7)" fontSize="$3" marginBottom="$3">
          {player.team}
        </Text>
        <XStack justifyContent="space-between">
          <Text color="rgba(255,255,255,0.6)" fontSize="$2">
            ADP: {player.adp}
          </Text>
          <Text color="$white" fontSize="$2" fontWeight="600">
            #{player.rank}
          </Text>
        </XStack>
      </Card>
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
    <Animated.View
      style={{
        alignItems: 'center',
        height: 60,
        justifyContent: 'center',
        paddingHorizontal: 20,
        backgroundColor,
      }}
    >
      <Text
        color="$white"
        fontSize="$8"
        fontWeight="800"
        textShadowColor="rgba(0,0,0,0.3)"
        textShadowOffset={{ height: 1, width: 0 }}
        textShadowRadius={2}
      >
        {minutes}:{seconds.toString().padStart(2, '0')}
      </Text>
      <Text color="rgba(255,255,255,0.8)" fontSize="$2" marginTop="$1">
        Time Remaining
      </Text>
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
      <View
        backgroundColor="rgba(0, 0, 0, 0.5)"
        position="absolute"
        width="100%"
        height="100%"
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '$background',
              padding: 20,
              paddingTop: 30,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text fontSize="$6" fontWeight="600" marginBottom="$4">
            Filters
          </Text>
          <ScrollView backgroundColor="$background" flex={1}>
            <Text fontSize="$4" fontWeight="500" marginBottom="$3">
              Position
            </Text>
            <XStack flexWrap="wrap" gap="$2" marginBottom="$4">
              {allPositions.map((pos) => (
                <Button
                  key={pos}
                  size="$3"
                  backgroundColor={
                    filters.position === pos ? '$blue10' : '$gray4'
                  }
                  color={filters.position === pos ? 'white' : '$gray11'}
                  borderRadius="$3"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  onPress={() => onFiltersChange({ ...filters, position: pos })}
                >
                  {pos}
                </Button>
              ))}
            </XStack>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

// Using generated StartDraft mutation from codegen

/**
 * Main DraftBoard component
 */
const DraftBoardPage: React.FC = () => {
  // State
  const [draftId] = useState('default-draft');
  const [sport] = useState<'baseball' | 'football'>('baseball');
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Filter>({ position: 'ALL' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [activeView, setActiveView] = useState<'draft' | 'teams' | 'myteam'>(
    'draft',
  );
  // Sport config
  const sportConfig = SPORT_CONFIGS[sport];

  // Hooks
  const timer = useTimer(90);

  // StartDraft mutation - with refetchQueries to ensure UI updates
  const [startDraft, { loading: startDraftLoading }] = useStartDraftMutation({
    refetchQueries: ['GetLeagueById'],
    awaitRefetchQueries: true,
    onCompleted: (data: StartDraftMutation) => {
      console.log('✅ Draft mutation completed successfully:', data);
      console.log(
        '🎯 Returned League object with updated status:',
        data.startDraft,
      );
      console.log('📊 Updated draft status:', data.startDraft?.draftStatus);
      Alert.alert(
        'Success',
        'Draft has been started and queued for processing!',
      );
      timer.start();
    },
    onError: (error: unknown) => {
      console.error('Error starting draft:', error);
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : 'Failed to start draft';
      Alert.alert('Error', message);
    },
  });

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
    [timer],
  );

  const handleStartDraft = useCallback(() => {
    console.log('Starting draft...', draftId);

    // For now, using a placeholder league ID - this should come from route params or props
    // TODO(LS-337): Get actual league ID from route parameters or component props
    const leagueId = 1; // Placeholder - replace with actual league ID

    startDraft({
      variables: {
        leagueId: leagueId,
        selectionMethod: 'random',
      },
    });
  }, [startDraft, draftId]);

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
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <YStack
          alignItems="center"
          justifyContent="center"
          paddingVertical="$8"
        >
          <Text fontSize="$5" fontWeight="600" color="$gray11">
            No players available
          </Text>
          <Text fontSize="$3" color="$gray10" textAlign="center" marginTop="$2">
            Players will appear when database is populated
          </Text>
        </YStack>
      }
    />
  );

  const renderMobileLayout = () => (
    <View backgroundColor={sportConfig.colors.primary} flex={1}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={sportConfig.colors.primary}
      />

      {/* Header */}
      <View
        backgroundColor={sportConfig.colors.secondary}
        paddingHorizontal="$4"
        paddingVertical="$3"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Text fontSize="$6" fontWeight="600" color="white">
          {draft.name}
        </Text>
        <Text
          fontSize="$3"
          backgroundColor="$blue10"
          color="white"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$2"
        >
          {sport.toUpperCase()}
        </Text>
        <XStack gap="$2">
          <Button
            size="$3"
            backgroundColor={activeView === 'draft' ? '$blue10' : 'transparent'}
            color={activeView === 'draft' ? 'white' : '$gray11'}
            borderRadius="$2"
            paddingHorizontal="$3"
            onPress={() => setActiveView('draft')}
          >
            Draft
          </Button>
          <Button
            size="$3"
            backgroundColor={
              activeView === 'myteam' ? '$blue10' : 'transparent'
            }
            color={activeView === 'myteam' ? 'white' : '$gray11'}
            borderRadius="$2"
            paddingHorizontal="$3"
            onPress={() => setActiveView('myteam')}
          >
            My Team
          </Button>
          <Button
            size="$3"
            backgroundColor={activeView === 'teams' ? '$blue10' : 'transparent'}
            color={activeView === 'teams' ? 'white' : '$gray11'}
            borderRadius="$2"
            paddingHorizontal="$3"
          >
            All Teams
          </Button>
        </XStack>
      </View>

      {activeView === 'draft' ? (
        <>
          {/* Timer */}
          {draft.status === 'active' && (
            <TimerBar time={timer.time} colorAnim={timer.colorAnim} />
          )}

          {/* Start Draft Button */}
          {draft.status === 'waiting' && (
            <Button
              backgroundColor={sportConfig.colors.accent}
              color="white"
              size="$5"
              margin="$4"
              onPress={handleStartDraft}
              disabled={startDraftLoading}
              opacity={startDraftLoading ? 0.6 : 1}
            >
              {startDraftLoading ? 'Starting Draft...' : 'Start Draft'}
            </Button>
          )}

          {/* Search & Filters */}
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$2"
            gap="$2"
            alignItems="center"
          >
            <Input
              flex={1}
              placeholder={`Search ${sport} players...`}
              value={searchText}
              onChangeText={setSearchText}
              borderColor={sportConfig.colors.accent}
              backgroundColor="$background"
              borderRadius="$3"
            />
            <Button
              backgroundColor={sportConfig.colors.accent}
              color="white"
              size="$3"
              paddingHorizontal="$3"
              onPress={() => setShowFilters(true)}
            >
              Filters
            </Button>
          </XStack>

          {/* Player Grid */}
          {renderPlayerGrid()}
        </>
      ) : activeView === 'myteam' ? (
        /* My Team View */
        <ScrollView backgroundColor="$background" padding="$4">
          <Text fontSize="$6" fontWeight="600" marginBottom="$4">
            My Roster
          </Text>
          {sportConfig.positions.map((position) => (
            <XStack
              key={position}
              alignItems="center"
              justifyContent="space-between"
              marginBottom="$3"
              padding="$3"
              backgroundColor="$gray2"
              borderRadius="$3"
            >
              <Text fontSize="$4" fontWeight="500">
                {position}
              </Text>
              <Text fontSize="$3" color="$gray10">
                Empty
              </Text>
            </XStack>
          ))}

          <Text fontSize="$5" fontWeight="600" marginTop="$4" marginBottom="$3">
            Bench
          </Text>
          {[1, 2, 3, 4, 5].map((benchSpot) => (
            <XStack
              key={benchSpot}
              alignItems="center"
              justifyContent="space-between"
              marginBottom="$3"
              padding="$3"
              backgroundColor="$gray2"
              borderRadius="$3"
            >
              <Text fontSize="$4" fontWeight="500">
                BE{benchSpot}
              </Text>
              <Text fontSize="$3" color="$gray10">
                Empty
              </Text>
            </XStack>
          ))}
        </ScrollView>
      ) : (
        /* Teams View */
        <ScrollView backgroundColor="$background" padding="$4">
          <YStack
            alignItems="center"
            justifyContent="center"
            paddingVertical="$8"
          >
            <Text fontSize="$5" fontWeight="600" color="$gray11">
              No teams available
            </Text>
            <Text
              fontSize="$3"
              color="$gray10"
              textAlign="center"
              marginTop="$2"
            >
              Teams will appear when database is populated
            </Text>
          </YStack>
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

export default DraftBoardPage;
