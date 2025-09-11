import React from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

export interface DraftTeam {
  id: string;
  name: string;
  owner: string;
  picks: Pick[];
  isCurrentPick?: boolean;
}

export interface Pick {
  id: string;
  player: {
    id: string;
    name: string;
    position: string;
    team: string;
  };
  pickNumber: number;
  round: number;
  timestamp: string;
  teamId: string;
}

export interface DraftBoard {
  id: string;
  name: string;
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  status: 'waiting' | 'active' | 'paused' | 'completed';
  currentPick: number;
  totalPicks: number;
  teams: DraftTeam[];
  picks: Pick[];
}

export interface DraftBoardGridProps {
  draftBoard: DraftBoard;
  onTeamPress?: (team: DraftTeam) => void;
  onPickPress?: (pick: Pick) => void;
  variant?: 'full' | 'compact' | 'mobile';
  maxRounds?: number;
}

export interface DraftPickHistoryProps {
  picks: Pick[];
  onPickPress?: (pick: Pick) => void;
  maxVisible?: number;
  variant?: 'list' | 'timeline' | 'compact';
}

export interface TeamRosterProps {
  team: DraftTeam;
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  onPlayerPress?: (pick: Pick) => void;
  variant?: 'grid' | 'list' | 'positions';
  showPositions?: boolean;
}

export interface DraftStatusBarProps {
  draftBoard: DraftBoard;
  currentTeam?: DraftTeam;
  timeRemaining?: number;
  onStartDraft?: () => void;
  onPauseDraft?: () => void;
  variant?: 'full' | 'compact';
}

/**
 * Draft Board Grid Component - Shows the complete draft board
 */
export function DraftBoardGrid({
  draftBoard,
  onTeamPress,
  onPickPress,
  variant = 'full',
  maxRounds = 15,
}: DraftBoardGridProps): JSX.Element {
  const rounds = Math.min(
    Math.ceil(draftBoard.totalPicks / draftBoard.teams.length),
    maxRounds
  );

  const renderTeamHeader = () => (
    <View style={styles.teamHeaderRow}>
      <View style={styles.roundCell}>
        <Text style={styles.roundHeaderText}>Round</Text>
      </View>
      {draftBoard.teams.map((team) => (
        <TouchableOpacity
          key={team.id}
          style={[
            styles.teamHeaderCell,
            team.isCurrentPick && styles.currentTeamHeader,
          ]}
          onPress={() => onTeamPress?.(team)}
        >
          <Text
            style={[
              styles.teamHeaderText,
              team.isCurrentPick && styles.currentTeamHeaderText,
            ]}
            numberOfLines={1}
          >
            {team.name}
          </Text>
          <Text style={styles.teamOwnerText} numberOfLines={1}>
            {team.owner}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderDraftRound = (roundNumber: number) => {
    const isSnakeRound = roundNumber % 2 === 0;
    const teamsOrder = isSnakeRound
      ? [...draftBoard.teams].reverse()
      : draftBoard.teams;

    return (
      <View key={roundNumber} style={styles.draftRoundRow}>
        <View style={styles.roundCell}>
          <Text style={styles.roundText}>{roundNumber}</Text>
        </View>
        {teamsOrder.map((team, teamIndex) => {
          const actualTeamIndex = isSnakeRound
            ? draftBoard.teams.length - 1 - teamIndex
            : teamIndex;

          const pickNumber =
            (roundNumber - 1) * draftBoard.teams.length + actualTeamIndex + 1;
          const pick = draftBoard.picks.find(
            (p) => p.pickNumber === pickNumber
          );
          const isCurrentPick = pickNumber === draftBoard.currentPick;

          return (
            <TouchableOpacity
              key={team.id}
              style={[
                styles.pickCell,
                isCurrentPick && styles.currentPickCell,
                pick && styles.completedPickCell,
              ]}
              onPress={() => pick && onPickPress?.(pick)}
              disabled={!pick}
            >
              {pick ? (
                <View style={styles.pickContent}>
                  <Text style={styles.pickPlayerName} numberOfLines={1}>
                    {pick.player.name}
                  </Text>
                  <Text style={styles.pickPlayerDetails} numberOfLines={1}>
                    {pick.player.position} - {pick.player.team}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyPickContent}>
                  <Text style={styles.pickNumberText}>{pickNumber}</Text>
                  {isCurrentPick && (
                    <Text style={styles.currentPickText}>ON CLOCK</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const containerStyle = [
    styles.draftBoardContainer,
    styles[`${variant}Container`],
  ];

  return (
    <View style={containerStyle}>
      <FlatList
        data={Array.from({ length: rounds }, (_, i) => i + 1)}
        keyExtractor={(item) => item.toString()}
        renderItem={({ item }) => renderDraftRound(item)}
        ListHeaderComponent={renderTeamHeader}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      />
    </View>
  );
}

/**
 * Draft Pick History Component
 */
export function DraftPickHistory({
  picks,
  onPickPress,
  maxVisible = 10,
  variant = 'list',
}: DraftPickHistoryProps): JSX.Element {
  const recentPicks = picks.slice(-maxVisible).reverse();

  const renderPickItem = ({
    item: pick,
    index,
  }: {
    item: Pick;
    index: number;
  }) => {
    const handlePressIn = () => {
      // Simple press feedback without animation for now
    };

    const handlePressOut = () => {
      // Simple press feedback without animation for now
    };

    if (variant === 'timeline') {
      return (
        <View>
          <TouchableOpacity
            style={styles.timelinePickItem}
            onPress={() => onPickPress?.(pick)}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <View style={styles.timelinePickNumber}>
              <Text style={styles.timelinePickNumberText}>
                {pick.pickNumber}
              </Text>
            </View>
            <View style={styles.timelinePickContent}>
              <Text style={styles.timelinePlayerName}>{pick.player.name}</Text>
              <Text style={styles.timelinePlayerDetails}>
                {pick.player.position} - {pick.player.team}
              </Text>
              <Text style={styles.timelinePickTime}>
                Round {pick.round} •{' '}
                {new Date(pick.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    if (variant === 'compact') {
      return (
        <View>
          <TouchableOpacity
            style={styles.compactPickItem}
            onPress={() => onPickPress?.(pick)}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <Text style={styles.compactPickNumber}>#{pick.pickNumber}</Text>
            <Text style={styles.compactPlayerName} numberOfLines={1}>
              {pick.player.name}
            </Text>
            <Text style={styles.compactPlayerPosition}>
              {pick.player.position}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Default list variant
    return (
      <View>
        <TouchableOpacity
          style={styles.listPickItem}
          onPress={() => onPickPress?.(pick)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.listPickNumber}>
            <Text style={styles.listPickNumberText}>{pick.pickNumber}</Text>
          </View>
          <View style={styles.listPickContent}>
            <Text style={styles.listPlayerName}>{pick.player.name}</Text>
            <Text style={styles.listPlayerDetails}>
              {pick.player.position} - {pick.player.team}
            </Text>
          </View>
          <Text style={styles.listPickTime}>
            {new Date(pick.timestamp).toLocaleTimeString()}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const containerStyle = [
    styles.pickHistoryContainer,
    styles[`${variant}HistoryContainer`],
  ];

  return (
    <View style={containerStyle}>
      <Text style={styles.historyTitle}>Recent Picks</Text>
      <FlatList
        data={recentPicks}
        keyExtractor={(item) => item.id}
        renderItem={renderPickItem}
        showsVerticalScrollIndicator={false}
        scrollEnabled={variant !== 'compact'}
      />
    </View>
  );
}

/**
 * Team Roster Component
 */
export function TeamRoster({
  team,
  sport,
  onPlayerPress,
  variant = 'list',
  showPositions = true,
}: TeamRosterProps): JSX.Element {
  const renderRosterItem = ({ item: pick }: { item: Pick }) => (
    <TouchableOpacity
      style={styles.rosterItem}
      onPress={() => onPlayerPress?.(pick)}
    >
      <View style={styles.rosterPlayerInfo}>
        <Text style={styles.rosterPlayerName}>{pick.player.name}</Text>
        <Text style={styles.rosterPlayerTeam}>{pick.player.team}</Text>
      </View>
      <View style={styles.rosterPlayerMeta}>
        <Text style={styles.rosterPlayerPosition}>{pick.player.position}</Text>
        <Text style={styles.rosterPickInfo}>Pick #{pick.pickNumber}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.teamRosterContainer}>
      <View style={styles.teamRosterHeader}>
        <Text style={styles.teamRosterTitle}>{team.name}</Text>
        <Text style={styles.teamRosterOwner}>{team.owner}</Text>
        <Text style={styles.teamRosterCount}>
          {team.picks.length} pick{team.picks.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={team.picks}
        keyExtractor={(item) => item.id}
        renderItem={renderRosterItem}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyRoster}>
            <Text style={styles.emptyRosterText}>No picks yet</Text>
          </View>
        }
      />
    </View>
  );
}

/**
 * Draft Status Bar Component
 */
export function DraftStatusBar({
  draftBoard,
  currentTeam,
  timeRemaining,
  onStartDraft,
  onPauseDraft,
  variant = 'full',
}: DraftStatusBarProps): JSX.Element {
  const getStatusColor = () => {
    switch (draftBoard.status) {
      case 'active':
        return '#22c55e';
      case 'paused':
        return '#eab308';
      case 'completed':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (draftBoard.status) {
      case 'active':
        return 'Draft Active';
      case 'paused':
        return 'Draft Paused';
      case 'completed':
        return 'Draft Complete';
      default:
        return 'Waiting to Start';
    }
  };

  const progress = (draftBoard.currentPick - 1) / draftBoard.totalPicks;

  return (
    <View style={[styles.statusBar, styles[`${variant}StatusBar`]]}>
      <View style={styles.statusContent}>
        <View style={styles.statusLeft}>
          <View style={styles.statusIndicator}>
            <View
              style={[styles.statusDot, { backgroundColor: getStatusColor() }]}
            />
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>

          {variant === 'full' && (
            <Text style={styles.draftInfo}>
              Pick {draftBoard.currentPick} of {draftBoard.totalPicks}
            </Text>
          )}
        </View>

        {currentTeam && (
          <View style={styles.statusCenter}>
            <Text style={styles.currentTeamLabel}>On the Clock:</Text>
            <Text style={styles.currentTeamName}>{currentTeam.name}</Text>
            {timeRemaining !== undefined && (
              <Text style={styles.timeRemaining}>
                {Math.floor(timeRemaining / 60)}:
                {(timeRemaining % 60).toString().padStart(2, '0')}
              </Text>
            )}
          </View>
        )}

        <View style={styles.statusRight}>
          {draftBoard.status === 'waiting' && onStartDraft && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onStartDraft}
            >
              <Text style={styles.actionButtonText}>Start Draft</Text>
            </TouchableOpacity>
          )}

          {draftBoard.status === 'active' && onPauseDraft && (
            <TouchableOpacity
              style={[styles.actionButton, styles.pauseButton]}
              onPress={onPauseDraft}
            >
              <Text style={styles.actionButtonText}>Pause</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {variant === 'full' && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Draft Board Grid
  draftBoardContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },

  fullContainer: {
    padding: 16,
  },

  compactContainer: {
    padding: 8,
  },

  mobileContainer: {
    padding: 4,
  },

  teamHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 2,
    borderBottomColor: '#374151',
  },

  roundCell: {
    width: 60,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRightWidth: 1,
    borderRightColor: '#374151',
  },

  roundHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
  },

  roundText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  teamHeaderCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#374151',
    minWidth: IS_TABLET ? 120 : 80,
  },

  currentTeamHeader: {
    backgroundColor: '#3b82f6',
  },

  teamHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },

  currentTeamHeaderText: {
    color: '#ffffff',
  },

  teamOwnerText: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 2,
  },

  draftRoundRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },

  pickCell: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#374151',
    backgroundColor: '#2a2a2a',
    minWidth: IS_TABLET ? 120 : 80,
  },

  currentPickCell: {
    backgroundColor: '#1e3a8a',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },

  completedPickCell: {
    backgroundColor: '#1f2937',
  },

  pickContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickPlayerName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },

  pickPlayerDetails: {
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 2,
  },

  emptyPickContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickNumberText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },

  currentPickText: {
    fontSize: 8,
    color: '#3b82f6',
    fontWeight: 'bold',
    marginTop: 2,
  },

  // Pick History
  pickHistoryContainer: {
    backgroundColor: '#1a1a1a',
    padding: 16,
  },

  listHistoryContainer: {
    maxHeight: 400,
  },

  timelineHistoryContainer: {
    maxHeight: 500,
  },

  compactHistoryContainer: {
    maxHeight: 200,
    padding: 8,
  },

  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },

  // List variant
  listPickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
  },

  listPickNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  listPickNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  listPickContent: {
    flex: 1,
  },

  listPlayerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  listPlayerDetails: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },

  listPickTime: {
    fontSize: 12,
    color: '#6b7280',
  },

  // Timeline variant
  timelinePickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    backgroundColor: '#2a2a2a',
    marginBottom: 12,
    borderRadius: 8,
  },

  timelinePickNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },

  timelinePickNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  timelinePickContent: {
    flex: 1,
  },

  timelinePlayerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  timelinePlayerDetails: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },

  timelinePickTime: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },

  // Compact variant
  compactPickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    marginBottom: 4,
    gap: 8,
  },

  compactPickNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3b82f6',
    width: 30,
  },

  compactPlayerName: {
    flex: 1,
    fontSize: 12,
    color: '#ffffff',
  },

  compactPlayerPosition: {
    fontSize: 11,
    color: '#9ca3af',
    backgroundColor: '#374151',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Team Roster
  teamRosterContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },

  teamRosterHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },

  teamRosterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  teamRosterOwner: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 2,
  },

  teamRosterCount: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },

  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
  },

  rosterPlayerInfo: {
    flex: 1,
  },

  rosterPlayerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  rosterPlayerTeam: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },

  rosterPlayerMeta: {
    alignItems: 'flex-end',
  },

  rosterPlayerPosition: {
    fontSize: 12,
    color: '#ffffff',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },

  rosterPickInfo: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },

  emptyRoster: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },

  emptyRosterText: {
    fontSize: 14,
    color: '#6b7280',
  },

  // Status Bar
  statusBar: {
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },

  fullStatusBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  compactStatusBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statusLeft: {
    flex: 1,
  },

  statusCenter: {
    flex: 1,
    alignItems: 'center',
  },

  statusRight: {
    flex: 1,
    alignItems: 'flex-end',
  },

  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  draftInfo: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },

  currentTeamLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },

  currentTeamName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 2,
  },

  timeRemaining: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f59e0b',
    marginTop: 4,
  },

  actionButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },

  pauseButton: {
    backgroundColor: '#f59e0b',
  },

  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  progressContainer: {
    marginTop: 12,
  },

  progressBar: {
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
});
