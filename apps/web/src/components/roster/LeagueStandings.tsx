import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, XStack, YStack } from '@legacy-sports/shared-components';
import { H4, Text } from 'tamagui';

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
  const navigate = useNavigate();

  const handleTeamClick = (teamId: number) => {
    navigate(`/baseball/team/${teamId}`);
  };

  if (loading) {
    return (
      <YStack padding="$4" alignItems="center" role="status" aria-live="polite">
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
    <div
      style={{ maxHeight: '80vh', overflowY: 'auto' }}
      role="region"
      aria-label="League standings"
    >
      <YStack padding="$4" space="$4" maxWidth={1200} alignSelf="center">
        <H4 id="standings-title">League Standings</H4>

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
        <YStack space="$2" role="list">
          {teams.map((team, index) => {
            const isUserTeam = userTeamId === team.id;
            return (
              <Card
                key={team.id}
                padding="$3"
                borderWidth={1}
                borderColor={isUserTeam ? '$blue8' : '$gray4'}
                backgroundColor={isUserTeam ? '$blue2' : '$background'}
                role="listitem"
                cursor="pointer"
                hoverStyle={{
                  backgroundColor: isUserTeam ? '$blue3' : '$gray2',
                  transform: 'scale(0.99)',
                }}
                pressStyle={{
                  backgroundColor: isUserTeam ? '$blue3' : '$gray3',
                }}
                onPress={() => handleTeamClick(team.id)}
                onClick={() => handleTeamClick(team.id)}
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
                      Click to view roster
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
            );
          })}
        </YStack>

        <Card
          padding="$3"
          backgroundColor="$yellow2"
          borderColor="$yellow6"
          borderWidth={1}
        >
          <Text fontSize="$2" color="$yellow11" textAlign="center">
            <span role="img" aria-label="info">
              ℹ️
            </span>{' '}
            Stats and scoring coming soon!
          </Text>
        </Card>
      </YStack>
    </div>
  );
}
