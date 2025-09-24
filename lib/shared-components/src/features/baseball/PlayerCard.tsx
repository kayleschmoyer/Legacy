import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';

// Generic player interface for baseball cards
export interface BaseballPlayer {
  id: number;
  name: string;
  position: string;
  team: string;
  battingAvg?: number;
  homeRuns?: number;
  rbi?: number;
  era?: number;
  wins?: number;
  saves?: number;
  jerseyNumber?: number;
  age?: number;
  fantasyPoints?: number;
}

export interface PlayerCardProps {
  player: BaseballPlayer;
  onPress?: (player: BaseballPlayer) => void;
  showStats?: 'batting' | 'pitching' | 'both';
  compact?: boolean;
}

function PlayerCard({
  player,
  onPress,
  showStats = 'both',
  compact = false,
}: PlayerCardProps) {
  const isPitcher =
    player.position === 'P' ||
    player.position === 'SP' ||
    player.position === 'RP';

  const handlePress = () => {
    onPress?.(player);
  };

  const formatStat = (stat: number | undefined): string => {
    if (stat === undefined || stat === null) return '-';
    return stat.toString();
  };

  const formatAverage = (avg: number | undefined): string => {
    if (avg === undefined || avg === null) return '.---';
    return avg.toFixed(3);
  };

  const formatERA = (era: number | undefined): string => {
    if (era === undefined || era === null) return '-.--';
    return era.toFixed(2);
  };

  return (
    <Button
      backgroundColor="$gray9"
      borderRadius="$4"
      padding={compact ? '$3' : '$4'}
      marginVertical={compact ? '$1' : '$2'}
      marginHorizontal="$1"
      borderWidth={1}
      borderColor="$gray8"
      shadowColor="$black"
      shadowOffset={{ width: 0, height: 2 }}
      shadowOpacity={0.25}
      shadowRadius={3.84}
      elevation={5}
      onPress={onPress ? handlePress : undefined}
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      disabled={!onPress}
    >
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        marginBottom="$3"
      >
        <YStack flex={1}>
          <Text
            fontSize="$5"
            fontWeight="bold"
            color="$white"
            marginBottom="$1"
            numberOfLines={1}
          >
            {player.name}
          </Text>
          <XStack alignItems="center">
            <Text fontSize="$3" color="$yellow10" fontWeight="600">
              {player.position}
            </Text>
            <Text color="$gray6" marginHorizontal="$2">
              •
            </Text>
            <Text fontSize="$3" color="$gray4">
              {player.team}
            </Text>
          </XStack>
        </YStack>

        {player.jerseyNumber && (
          <YStack
            backgroundColor="$yellow10"
            borderRadius="$2"
            paddingHorizontal="$2"
            paddingVertical="$1"
          >
            <Text fontSize="$2" fontWeight="bold" color="$black">
              #{player.jerseyNumber}
            </Text>
          </YStack>
        )}
      </XStack>

      {/* Stats */}
      {!compact && (
        <YStack borderTopWidth={1} borderTopColor="$gray8" paddingTop="$3">
          {/* Batting Stats */}
          {(showStats === 'batting' || showStats === 'both') && !isPitcher && (
            <XStack justifyContent="space-around" marginBottom="$3">
              {player.battingAvg !== undefined && (
                <YStack alignItems="center" flex={1}>
                  <Text fontSize="$2" color="$gray6" marginBottom="$0.5">
                    AVG
                  </Text>
                  <Text fontSize="$4" fontWeight="bold" color="$white">
                    {formatAverage(player.battingAvg)}
                  </Text>
                </YStack>
              )}
              {player.homeRuns !== undefined && (
                <YStack alignItems="center" flex={1}>
                  <Text fontSize="$2" color="$gray6" marginBottom="$0.5">
                    HR
                  </Text>
                  <Text fontSize="$4" fontWeight="bold" color="$white">
                    {formatStat(player.homeRuns)}
                  </Text>
                </YStack>
              )}
              {player.rbi !== undefined && (
                <YStack alignItems="center" flex={1}>
                  <Text fontSize="$2" color="$gray6" marginBottom="$0.5">
                    RBI
                  </Text>
                  <Text fontSize="$4" fontWeight="bold" color="$white">
                    {formatStat(player.rbi)}
                  </Text>
                </YStack>
              )}
            </XStack>
          )}

          {/* Pitching Stats */}
          {(showStats === 'pitching' || showStats === 'both') && isPitcher && (
            <XStack justifyContent="space-around" marginBottom="$3">
              {player.era !== undefined && (
                <YStack alignItems="center" flex={1}>
                  <Text fontSize="$2" color="$gray6" marginBottom="$0.5">
                    ERA
                  </Text>
                  <Text fontSize="$4" fontWeight="bold" color="$white">
                    {formatERA(player.era)}
                  </Text>
                </YStack>
              )}
              {player.wins !== undefined && (
                <YStack alignItems="center" flex={1}>
                  <Text fontSize="$2" color="$gray6" marginBottom="$0.5">
                    W
                  </Text>
                  <Text fontSize="$4" fontWeight="bold" color="$white">
                    {formatStat(player.wins)}
                  </Text>
                </YStack>
              )}
              {player.saves !== undefined && (
                <YStack alignItems="center" flex={1}>
                  <Text fontSize="$2" color="$gray6" marginBottom="$0.5">
                    SV
                  </Text>
                  <Text fontSize="$4" fontWeight="bold" color="$white">
                    {formatStat(player.saves)}
                  </Text>
                </YStack>
              )}
            </XStack>
          )}

          {/* Fantasy Points */}
          {player.fantasyPoints !== undefined && (
            <YStack
              alignItems="center"
              backgroundColor="$blue10"
              borderRadius="$3"
              padding="$2"
            >
              <Text fontSize="$1" color="$blue1" marginBottom="$0.5">
                Fantasy Points
              </Text>
              <Text fontSize="$3" fontWeight="bold" color="$blue1">
                {formatStat(player.fantasyPoints)}
              </Text>
            </YStack>
          )}
        </YStack>
      )}

      {/* Compact mode - just key stats */}
      {compact && (
        <XStack justifyContent="center" marginTop="$2">
          {isPitcher ? (
            <Text fontSize="$2" color="$gray6">
              ERA: {formatERA(player.era)} | W: {formatStat(player.wins)}
            </Text>
          ) : (
            <Text fontSize="$2" color="$gray6">
              AVG: {formatAverage(player.battingAvg)} | HR:{' '}
              {formatStat(player.homeRuns)}
            </Text>
          )}
        </XStack>
      )}

      {/* Age indicator */}
      {player.age && (
        <YStack alignItems="center" marginTop="$2">
          <Text fontSize="$2" color="$gray6">
            Age {player.age}
          </Text>
        </YStack>
      )}
    </Button>
  );
}

// Compact list version
export interface PlayerCardListProps {
  players: BaseballPlayer[];
  onPlayerPress?: (player: BaseballPlayer) => void;
  showStats?: 'batting' | 'pitching' | 'both';
}

function PlayerCardList({
  players,
  onPlayerPress,
  showStats = 'both',
}: PlayerCardListProps) {
  return (
    <YStack space="$2" padding="$2">
      {players.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          onPress={onPlayerPress}
          showStats={showStats}
          compact={true}
        />
      ))}
    </YStack>
  );
}

export { PlayerCard };
export { PlayerCardList };
