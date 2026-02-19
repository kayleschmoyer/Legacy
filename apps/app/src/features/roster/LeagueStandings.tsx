import React from 'react';
import { Card, H4, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

interface Team {
  id: number;
  name: string;
  leagueId: number;
}

export interface LeagueStandingsProps {
  teams: readonly Team[];
  loading?: boolean;
  userTeamId?: number | null;
}

export function LeagueStandings({
  teams,
  loading = false,
  userTeamId,
}: LeagueStandingsProps): React.JSX.Element {
  // expo-router types cannot be resolved in this project's TS config
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const router = useRouter();

  const handleTeamPress = (teamId: number) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    router.push(`/baseball/team/${teamId}` as Href);
  };

  if (loading) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text>Loading standings...</Text>
      </YStack>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray10">No teams in this league yet.</Text>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack padding="$4" space="$4">
        <H4>League Standings</H4>

        <Card
          padding="$3"
          backgroundColor="$gray2"
          borderColor="$gray6"
          borderWidth={1}
        >
          <Text fontSize="$3" color="$gray11" marginBottom="$2">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'} in this
            league
          </Text>
        </Card>

        {/* Header Row */}
        <Card backgroundColor="$blue2" borderColor="$blue6" borderWidth={1}>
          <XStack padding="$3" justifyContent="space-between">
            <Text flex={0.5} fontSize="$3" fontWeight="600" color="$blue11">
              Rank
            </Text>
            <Text flex={2} fontSize="$3" fontWeight="600" color="$blue11">
              Team Name
            </Text>
            <Text
              flex={1}
              fontSize="$3"
              fontWeight="600"
              color="$blue11"
              textAlign="right"
            >
              Points
            </Text>
          </XStack>
        </Card>

        {/* Team Rows */}
        {teams.map((team, index) => {
          const isUserTeam = userTeamId === team.id;
          return (
            <Pressable key={team.id} onPress={() => handleTeamPress(team.id)}>
              <Card
                padding="$3"
                borderWidth={1}
                borderColor={isUserTeam ? '$blue8' : '$gray4'}
                backgroundColor={isUserTeam ? '$blue2' : '$background'}
                pressStyle={{
                  scale: 0.98,
                  backgroundColor: isUserTeam ? '$blue3' : '$gray2',
                }}
                cursor="pointer"
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <Text
                    flex={0.5}
                    fontSize="$4"
                    fontWeight="600"
                    color="$blue10"
                  >
                    {index + 1}
                  </Text>
                  <YStack flex={2}>
                    <XStack alignItems="center" space="$2">
                      <Text fontSize="$4" fontWeight="500" color="$gray12">
                        {team.name}
                      </Text>
                      {isUserTeam && (
                        <Text fontSize="$2" color="$blue10" fontWeight="600">
                          (Your Team)
                        </Text>
                      )}
                    </XStack>
                    <Text fontSize="$2" color="$gray10">
                      Tap to view roster
                    </Text>
                  </YStack>
                  <Text
                    flex={1}
                    fontSize="$4"
                    fontWeight="600"
                    color="$gray12"
                    textAlign="right"
                  >
                    -
                  </Text>
                </XStack>
              </Card>
            </Pressable>
          );
        })}

        <Card
          padding="$3"
          backgroundColor="$yellow2"
          borderColor="$yellow6"
          borderWidth={1}
        >
          <Text fontSize="$2" color="$yellow11" textAlign="center">
            {/* eslint-disable-next-line jsx-a11y/accessible-emoji -- React Native uses Text, not span */}
            <Text role="img" aria-label="info" accessibilityLabel="info">
              ℹ️
            </Text>{' '}
            Stats and scoring coming soon!
          </Text>
        </Card>
      </YStack>
    </ScrollView>
  );
}
