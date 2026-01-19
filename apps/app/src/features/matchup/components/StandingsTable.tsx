import React from 'react';
import { ScrollView } from 'react-native';
import { Card, H4, Separator, Text, XStack, YStack } from 'tamagui';
import type { TeamStanding } from '../../../api/db/graphql.generated';

export interface StandingsTableProps {
  standings: TeamStanding[];
  loading?: boolean;
}

/**
 * StandingsTable - Displays league standings in a table format
 * Shows team rankings, records, and points
 */
export function StandingsTable({ standings, loading = false }: StandingsTableProps) {
  if (loading) {
    return (
      <Card elevate size="$4" bordered margin="$2">
        <Card.Header padded>
          <Text color="$gray11">Loading standings...</Text>
        </Card.Header>
      </Card>
    );
  }

  if (standings.length === 0) {
    return (
      <Card elevate size="$4" bordered margin="$2">
        <Card.Header padded>
          <H4>Standings</H4>
        </Card.Header>
        <YStack padding="$4" alignItems="center">
          <Text color="$gray11">No standings data available</Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card elevate size="$4" bordered margin="$2">
      <Card.Header padded>
        <H4>League Standings</H4>
      </Card.Header>

      <Separator />

      {/* Table Header */}
      <XStack
        paddingVertical="$2"
        paddingHorizontal="$3"
        backgroundColor="$gray3"
        borderBottomWidth={1}
        borderBottomColor="$gray6"
      >
        <Text flex={0.5} fontSize="$2" fontWeight="bold" color="$gray11">
          #
        </Text>
        <Text flex={2} fontSize="$2" fontWeight="bold" color="$gray11">
          Team
        </Text>
        <Text flex={1} fontSize="$2" fontWeight="bold" color="$gray11" textAlign="center">
          W
        </Text>
        <Text flex={1} fontSize="$2" fontWeight="bold" color="$gray11" textAlign="center">
          L
        </Text>
        <Text flex={1} fontSize="$2" fontWeight="bold" color="$gray11" textAlign="center">
          T
        </Text>
        <Text flex={1.5} fontSize="$2" fontWeight="bold" color="$gray11" textAlign="center">
          Win %
        </Text>
        <Text flex={1.5} fontSize="$2" fontWeight="bold" color="$gray11" textAlign="right">
          PF
        </Text>
        <Text flex={1.5} fontSize="$2" fontWeight="bold" color="$gray11" textAlign="right">
          PA
        </Text>
      </XStack>

      {/* Table Rows */}
      <ScrollView>
        {standings.map((team, index) => {
          const isTopTeam = index === 0;
          const isPlayoffPosition = index < 6; // Top 6 make playoffs (example)

          return (
            <XStack
              key={team.teamId}
              paddingVertical="$3"
              paddingHorizontal="$3"
              borderBottomWidth={1}
              borderBottomColor="$gray5"
              backgroundColor={isTopTeam ? '$blue2' : isPlayoffPosition ? '$green1' : '$background'}
            >
              <Text flex={0.5} fontSize="$3" fontWeight={isTopTeam ? 'bold' : 'normal'}>
                {index + 1}
              </Text>
              <Text
                flex={2}
                fontSize="$3"
                fontWeight={isTopTeam ? 'bold' : 'normal'}
                numberOfLines={1}
              >
                {team.teamName}
              </Text>
              <Text flex={1} fontSize="$3" textAlign="center" color="$green10">
                {team.wins}
              </Text>
              <Text flex={1} fontSize="$3" textAlign="center" color="$red10">
                {team.losses}
              </Text>
              <Text flex={1} fontSize="$3" textAlign="center" color="$gray11">
                {team.ties}
              </Text>
              <Text flex={1.5} fontSize="$3" textAlign="center" fontWeight="bold">
                {team.winPercentage?.toFixed(3) ?? '0.000'}
              </Text>
              <Text flex={1.5} fontSize="$3" textAlign="right">
                {team.pointsFor?.toFixed(1) ?? '0.0'}
              </Text>
              <Text flex={1.5} fontSize="$3" textAlign="right">
                {team.pointsAgainst?.toFixed(1) ?? '0.0'}
              </Text>
            </XStack>
          );
        })}
      </ScrollView>

      {/* Legend */}
      <YStack padding="$3" space="$1" backgroundColor="$gray2">
        <Text fontSize="$1" color="$gray11">
          <Text color="$blue10">●</Text> 1st Place
        </Text>
        <Text fontSize="$1" color="$gray11">
          <Text color="$green10">●</Text> Playoff Position
        </Text>
      </YStack>
    </Card>
  );
}
