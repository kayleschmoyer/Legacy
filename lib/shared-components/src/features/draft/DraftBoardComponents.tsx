import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { FlatList } from '../../platform-components';

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
function DraftBoardGrid({
  draftBoard,
  onTeamPress,
  onPickPress,
  variant = 'full',
  maxRounds = 15,
}: DraftBoardGridProps) {
  const rounds = Math.min(
    Math.ceil(draftBoard.totalPicks / draftBoard.teams.length),
    maxRounds,
  );

  const renderTeamHeader = () => (
    <XStack
      backgroundColor="$gray800"
      borderBottomWidth={1}
      borderBottomColor="$gray600"
    >
      <YStack
        width={60}
        justifyContent="center"
        alignItems="center"
        paddingVertical={12}
        borderRightWidth={1}
        borderRightColor="$gray600"
      >
        <Text fontSize={12} fontWeight="600" color="$gray300">
          Round
        </Text>
      </YStack>
      {draftBoard.teams.map((team) => (
        <Button
          key={team.id}
          flex={1}
          paddingVertical={8}
          paddingHorizontal={4}
          backgroundColor={team.isCurrentPick ? '$blue700' : 'transparent'}
          borderRightWidth={1}
          borderRightColor="$gray600"
          onPress={() => onTeamPress?.(team)}
          justifyContent="center"
          alignItems="center"
          unstyled
        >
          <Text
            fontSize={11}
            fontWeight="600"
            color={team.isCurrentPick ? '$white' : '$gray200'}
            numberOfLines={1}
            textAlign="center"
          >
            {team.name}
          </Text>
          <Text
            fontSize={9}
            color={team.isCurrentPick ? '$gray200' : '$gray400'}
            numberOfLines={1}
            textAlign="center"
          >
            {team.owner}
          </Text>
        </Button>
      ))}
    </XStack>
  );

  const renderDraftRound = (roundNumber: number) => {
    const isSnakeRound = roundNumber % 2 === 0;
    const teamsOrder = isSnakeRound
      ? [...draftBoard.teams].reverse()
      : draftBoard.teams;

    return (
      <XStack
        key={roundNumber}
        backgroundColor="$gray900"
        borderBottomWidth={1}
        borderBottomColor="$gray700"
        minHeight={60}
      >
        <YStack
          width={60}
          justifyContent="center"
          alignItems="center"
          backgroundColor="$gray800"
          borderRightWidth={1}
          borderRightColor="$gray600"
        >
          <Text fontSize={14} fontWeight="600" color="$white">
            {roundNumber}
          </Text>
        </YStack>
        {teamsOrder.map((team, teamIndex) => {
          const actualTeamIndex = isSnakeRound
            ? draftBoard.teams.length - 1 - teamIndex
            : teamIndex;

          const pickNumber =
            (roundNumber - 1) * draftBoard.teams.length + actualTeamIndex + 1;
          const pick = draftBoard.picks.find(
            (p) => p.pickNumber === pickNumber,
          );
          const isCurrentPick = pickNumber === draftBoard.currentPick;

          return (
            <Button
              key={team.id}
              flex={1}
              minHeight={60}
              paddingHorizontal={4}
              paddingVertical={8}
              backgroundColor={
                isCurrentPick
                  ? '$yellow600'
                  : pick
                    ? '$green700'
                    : 'transparent'
              }
              borderRightWidth={1}
              borderRightColor="$gray600"
              onPress={() => pick && onPickPress?.(pick)}
              disabled={!pick}
              justifyContent="center"
              alignItems="center"
              unstyled
            >
              {pick ? (
                <YStack justifyContent="center" alignItems="center" flex={1}>
                  <Text
                    fontSize={11}
                    fontWeight="600"
                    color="$white"
                    numberOfLines={1}
                    textAlign="center"
                  >
                    {pick.player.name}
                  </Text>
                  <Text
                    fontSize={9}
                    color="$gray200"
                    numberOfLines={1}
                    textAlign="center"
                  >
                    {pick.player.position} - {pick.player.team}
                  </Text>
                </YStack>
              ) : (
                <YStack justifyContent="center" alignItems="center" flex={1}>
                  <Text fontSize={12} color="$gray400" fontWeight="500">
                    {pickNumber}
                  </Text>
                  {isCurrentPick && (
                    <Text fontSize={9} color="$yellow300" fontWeight="600">
                      ON CLOCK
                    </Text>
                  )}
                </YStack>
              )}
            </Button>
          );
        })}
      </XStack>
    );
  };

  return (
    <YStack
      flex={1}
      backgroundColor="$gray900"
      borderWidth={variant === 'compact' ? 0 : 1}
      borderColor="$gray700"
      borderRadius={variant === 'compact' ? 0 : 8}
    >
      <FlatList<number>
        data={Array.from({ length: rounds }, (_, i) => i + 1)}
        keyExtractor={(item: number) => item.toString()}
        renderItem={({ item }: { item: number }) => renderDraftRound(item)}
        ListHeaderComponent={renderTeamHeader}
        showsVerticalScrollIndicator={false}
      />
    </YStack>
  );
}

/**
 * Draft Pick History Component
 */
function DraftPickHistory({
  picks,
  onPickPress,
  maxVisible = 10,
  variant = 'list',
}: DraftPickHistoryProps) {
  const recentPicks = picks.slice(-maxVisible).reverse();

  const renderPickItem = ({
    item: pick,
    index,
  }: {
    item: Pick;
    index: number;
  }) => {
    if (variant === 'timeline') {
      return (
        <YStack marginBottom={12}>
          <Button
            paddingHorizontal={16}
            paddingVertical={12}
            backgroundColor="$gray800"
            borderRadius={8}
            borderWidth={1}
            borderColor="$gray700"
            onPress={() => onPickPress?.(pick)}
            justifyContent="flex-start"
            unstyled
          >
            <XStack alignItems="center" gap={12}>
              <YStack
                width={40}
                height={40}
                backgroundColor="$blue600"
                borderRadius={20}
                justifyContent="center"
                alignItems="center"
              >
                <Text fontSize={12} fontWeight="600" color="$white">
                  {pick.pickNumber}
                </Text>
              </YStack>
              <YStack flex={1}>
                <Text fontSize={14} fontWeight="600" color="$white">
                  {pick.player.name}
                </Text>
                <Text fontSize={12} color="$gray300">
                  {pick.player.position} - {pick.player.team}
                </Text>
                <Text fontSize={11} color="$gray400">
                  Round {pick.round} •{' '}
                  {new Date(pick.timestamp).toLocaleTimeString()}
                </Text>
              </YStack>
            </XStack>
          </Button>
        </YStack>
      );
    }

    if (variant === 'compact') {
      return (
        <YStack marginBottom={8}>
          <Button
            paddingHorizontal={12}
            paddingVertical={8}
            backgroundColor="$gray800"
            borderRadius={6}
            onPress={() => onPickPress?.(pick)}
            justifyContent="flex-start"
            unstyled
          >
            <XStack alignItems="center" gap={8}>
              <Text fontSize={12} fontWeight="600" color="$blue400">
                #{pick.pickNumber}
              </Text>
              <Text
                fontSize={13}
                fontWeight="500"
                color="$white"
                numberOfLines={1}
                flex={1}
              >
                {pick.player.name}
              </Text>
              <Text fontSize={11} color="$gray400">
                {pick.player.position}
              </Text>
            </XStack>
          </Button>
        </YStack>
      );
    }

    // Default list variant
    return (
      <YStack marginBottom={8}>
        <Button
          paddingHorizontal={16}
          paddingVertical={12}
          backgroundColor="$gray800"
          borderRadius={8}
          borderBottomWidth={1}
          borderBottomColor="$gray700"
          onPress={() => onPickPress?.(pick)}
          justifyContent="flex-start"
          unstyled
        >
          <XStack alignItems="center" gap={12}>
            <YStack
              width={36}
              height={36}
              backgroundColor="$gray700"
              borderRadius={18}
              justifyContent="center"
              alignItems="center"
            >
              <Text fontSize={12} fontWeight="600" color="$white">
                {pick.pickNumber}
              </Text>
            </YStack>
            <YStack flex={1}>
              <Text fontSize={14} fontWeight="600" color="$white">
                {pick.player.name}
              </Text>
              <Text fontSize={12} color="$gray300">
                {pick.player.position} - {pick.player.team}
              </Text>
            </YStack>
            <Text fontSize={11} color="$gray400">
              {new Date(pick.timestamp).toLocaleTimeString()}
            </Text>
          </XStack>
        </Button>
      </YStack>
    );
  };

  return (
    <YStack
      flex={1}
      backgroundColor="$gray900"
      paddingHorizontal={variant === 'compact' ? 8 : 16}
      paddingVertical={variant === 'compact' ? 8 : 12}
    >
      <Text fontSize={16} fontWeight="600" color="$white" marginBottom={12}>
        Recent Picks
      </Text>
      <FlatList<Pick>
        data={recentPicks}
        keyExtractor={(item: Pick) => item.id}
        renderItem={renderPickItem}
        showsVerticalScrollIndicator={false}
        scrollEnabled={variant !== 'compact'}
      />
    </YStack>
  );
}

/**
 * Team Roster Component
 */
function TeamRoster({
  team,
  sport,
  onPlayerPress,
  variant = 'list',
  showPositions = true,
}: TeamRosterProps) {
  const renderRosterItem = ({ item: pick }: { item: Pick }) => (
    <Button
      paddingHorizontal={16}
      paddingVertical={12}
      backgroundColor="$gray800"
      borderBottomWidth={1}
      borderBottomColor="$gray700"
      onPress={() => onPlayerPress?.(pick)}
      justifyContent="flex-start"
      unstyled
    >
      <XStack justifyContent="space-between" alignItems="center" flex={1}>
        <YStack flex={1}>
          <Text fontSize={14} fontWeight="600" color="$white">
            {pick.player.name}
          </Text>
          <Text fontSize={12} color="$gray300">
            {pick.player.team}
          </Text>
        </YStack>
        <YStack alignItems="flex-end">
          <Text fontSize={12} fontWeight="500" color="$blue400">
            {pick.player.position}
          </Text>
          <Text fontSize={11} color="$gray400">
            Pick #{pick.pickNumber}
          </Text>
        </YStack>
      </XStack>
    </Button>
  );

  return (
    <YStack flex={1} backgroundColor="$gray900">
      <YStack
        paddingHorizontal={16}
        paddingVertical={12}
        backgroundColor="$gray800"
        borderBottomWidth={1}
        borderBottomColor="$gray600"
      >
        <Text fontSize={16} fontWeight="600" color="$white">
          {team.name}
        </Text>
        <Text fontSize={12} color="$gray300">
          {team.owner}
        </Text>
        <Text fontSize={11} color="$gray400">
          {team.picks.length} pick{team.picks.length !== 1 ? 's' : ''}
        </Text>
      </YStack>

      <FlatList<Pick>
        data={team.picks}
        keyExtractor={(item: Pick) => item.id}
        renderItem={renderRosterItem}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <YStack padding={20} alignItems="center" justifyContent="center">
            <Text fontSize={14} color="$gray400" textAlign="center">
              No picks yet
            </Text>
          </YStack>
        }
      />
    </YStack>
  );
}

/**
 * Draft Status Bar Component
 */
function DraftStatusBar({
  draftBoard,
  currentTeam,
  timeRemaining,
  onStartDraft,
  onPauseDraft,
  variant = 'full',
}: DraftStatusBarProps) {
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
    <YStack
      backgroundColor="$gray800"
      borderBottomWidth={1}
      borderBottomColor="$gray700"
      paddingHorizontal={16}
      paddingVertical={variant === 'full' ? 16 : 12}
    >
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={12}>
          <YStack alignItems="center" gap={4}>
            <YStack
              width={8}
              height={8}
              borderRadius={4}
              backgroundColor={getStatusColor()}
            />
            <Text fontSize={12} fontWeight="500" color="$white">
              {getStatusText()}
            </Text>
          </YStack>

          {variant === 'full' && (
            <Text fontSize={11} color="$gray300">
              Pick {draftBoard.currentPick} of {draftBoard.totalPicks}
            </Text>
          )}
        </XStack>

        {currentTeam && (
          <YStack alignItems="center" gap={4}>
            <Text fontSize={11} color="$gray300" textAlign="center">
              On the Clock:
            </Text>
            <Text fontSize={13} fontWeight="600" color="$white">
              {currentTeam.name}
            </Text>
            {timeRemaining !== undefined && (
              <Text fontSize={12} color="$blue400">
                {Math.floor(timeRemaining / 60)}:
                {(timeRemaining % 60).toString().padStart(2, '0')}
              </Text>
            )}
          </YStack>
        )}

        <XStack gap={8}>
          {draftBoard.status === 'waiting' && onStartDraft && (
            <Button
              paddingHorizontal={16}
              paddingVertical={8}
              backgroundColor="$green600"
              borderRadius={6}
              onPress={onStartDraft}
            >
              <Text fontSize={12} fontWeight="600" color="$white">
                Start Draft
              </Text>
            </Button>
          )}

          {draftBoard.status === 'active' && onPauseDraft && (
            <Button
              paddingHorizontal={16}
              paddingVertical={8}
              backgroundColor="$yellow600"
              borderRadius={6}
              onPress={onPauseDraft}
            >
              <Text fontSize={12} fontWeight="600" color="$white">
                Pause
              </Text>
            </Button>
          )}
        </XStack>
      </XStack>

      {variant === 'full' && (
        <YStack marginTop={12}>
          <YStack
            height={4}
            backgroundColor="$gray700"
            borderRadius={2}
            overflow="hidden"
          >
            <YStack
              height="100%"
              backgroundColor="$blue500"
              width={`${progress * 100}%`}
            />
          </YStack>
        </YStack>
      )}
    </YStack>
  );
}

export { DraftBoardGrid };
export { DraftPickHistory };
export { TeamRoster };
export { DraftStatusBar };
