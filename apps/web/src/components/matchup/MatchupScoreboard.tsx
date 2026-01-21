import React from 'react';
import { Card, H3, H5, Separator, Text, XStack, YStack } from 'tamagui';
import { StatsLoadingIndicator } from './StatsLoadingIndicator';
import {
  type MatchupFragment,
  MatchupStatus,
} from '../../api/db/graphql.generated';

export interface MatchupScoreboardProps {
  matchup: MatchupFragment | null | undefined;
  gamesRemaining?: number;
}

/**
 * MatchupScoreboard - Large scoreboard-style display of a matchup
 * Shows live scores and games remaining counter with responsive design
 */
export function MatchupScoreboard({
  matchup,
  gamesRemaining = 0,
}: MatchupScoreboardProps) {
  if (!matchup) {
    return (
      <Card elevate size="$4" bordered margin="$2">
        <Card.Header padded>
          <Text color="$gray11">No active matchup</Text>
        </Card.Header>
      </Card>
    );
  }

  const {
    weekNumber,
    team1Score,
    team2Score,
    status,
    // statsLoadingStatus, // TODO(LS-53): Property not yet in MatchupFragment
    gamesPerMatchup,
  } = matchup;
  const statsLoadingStatus = null; // Placeholder

  const team1Leading = (team1Score ?? 0) > (team2Score ?? 0);
  const team2Leading = (team2Score ?? 0) > (team1Score ?? 0);
  const isTied = team1Score === team2Score;

  const getStatusBadgeColor = () => {
    if (status === MatchupStatus.InProgress) return '$green10';
    if (status === MatchupStatus.Completed) return '$blue10';
    return '$gray10';
  };

  return (
    <Card
      elevate
      size="$5"
      bordered
      margin="$2"
      backgroundColor="$background"
      maxWidth={800}
      width="100%"
    >
      {/* Header with Week and Status */}
      <Card.Header padded>
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$2"
        >
          <H5 color="$gray11">Week {weekNumber}</H5>
          <XStack space="$2" alignItems="center" flexWrap="wrap">
            {status === MatchupStatus.InProgress && gamesRemaining > 0 && (
              <Text fontSize="$3" color="$orange10">
                {gamesRemaining} games remaining
              </Text>
            )}
            <Text
              fontSize="$3"
              color={getStatusBadgeColor()}
              fontWeight="bold"
              paddingHorizontal="$3"
              paddingVertical="$1"
              backgroundColor="$backgroundPress"
              borderRadius="$2"
            >
              {status === MatchupStatus.InProgress
                ? 'LIVE'
                : status?.toUpperCase()}
            </Text>
          </XStack>
        </XStack>
      </Card.Header>

      <Separator />

      {/* Stats Loading Indicator */}
      {statsLoadingStatus && (
        <YStack padding="$4" paddingBottom="$2">
          <StatsLoadingIndicator status={statsLoadingStatus} compact />
        </YStack>
      )}

      {/* Scoreboard */}
      <YStack padding="$4" space="$3">
        {/* Team 1 */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingVertical="$3"
          paddingHorizontal="$4"
          backgroundColor={team1Leading ? '$blue3' : '$background'}
          borderRadius="$3"
          borderWidth={team1Leading ? 2 : 0}
          borderColor={team1Leading ? '$blue8' : 'transparent'}
          flexWrap="wrap"
          gap="$2"
        >
          <YStack flex={1} minWidth={150}>
            <H3>Team 1</H3>
            {team1Leading && !isTied && (
              <Text fontSize="$2" color="$green10">
                Leading
              </Text>
            )}
          </YStack>
          <H3
            fontSize="$9"
            fontWeight="900"
            color={team1Leading ? '$blue11' : '$gray11'}
          >
            {team1Score?.toFixed(2) ?? '0.00'}
          </H3>
        </XStack>

        {/* Team 2 */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingVertical="$3"
          paddingHorizontal="$4"
          backgroundColor={team2Leading ? '$blue3' : '$background'}
          borderRadius="$3"
          borderWidth={team2Leading ? 2 : 0}
          borderColor={team2Leading ? '$blue8' : 'transparent'}
          flexWrap="wrap"
          gap="$2"
        >
          <YStack flex={1} minWidth={150}>
            <H3>Team 2</H3>
            {team2Leading && !isTied && (
              <Text fontSize="$2" color="$green10">
                Leading
              </Text>
            )}
          </YStack>
          <H3
            fontSize="$9"
            fontWeight="900"
            color={team2Leading ? '$blue11' : '$gray11'}
          >
            {team2Score?.toFixed(2) ?? '0.00'}
          </H3>
        </XStack>

        {/* Tie indicator */}
        {isTied && team1Score !== null && (
          <Text textAlign="center" color="$orange10" fontWeight="bold">
            TIED
          </Text>
        )}

        {/* Games info */}
        {gamesPerMatchup && (
          <Text fontSize="$2" color="$gray11" textAlign="center">
            {gamesPerMatchup} game matchup
            {gamesRemaining > 0 &&
              ` • ${gamesPerMatchup - gamesRemaining} games completed`}
          </Text>
        )}
      </YStack>
    </Card>
  );
}
