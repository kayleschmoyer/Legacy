import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, XStack, YStack } from '@legacy-sports/shared-components';
import { Separator, Spinner, styled, Text } from 'tamagui';
import { Trophy } from '@tamagui/lucide-icons';

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

const RankBadge = styled(YStack, {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

function getRankStyle(rank: number) {
  switch (rank) {
    case 1:
      return { bg: '$amber3', border: '$amber7', color: '$amber11' };
    case 2:
      return { bg: '$gray3', border: '$gray7', color: '$gray11' };
    case 3:
      return { bg: '$amber3', border: '$amber8', color: '$amber11' };
    default:
      return {
        bg: '$surfaceSubtle',
        border: '$outlineSubtle',
        color: '$textMuted',
      };
  }
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
      <YStack
        padding="$6"
        alignItems="center"
        gap="$3"
        role="status"
        aria-live="polite"
      >
        <Spinner size="large" color="$blue10" />
        <Text color="$textMuted" fontSize="$4">
          Loading standings...
        </Text>
      </YStack>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$8"
        alignItems="center"
      >
        <YStack alignItems="center" gap="$3">
          <Trophy size={32} color="var(--textMuted)" />
          <Text color="$textMuted" fontSize="$5" fontWeight="600">
            No teams yet
          </Text>
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            Teams will appear here once managers join the league.
          </Text>
        </YStack>
      </Card>
    );
  }

  return (
    <YStack gap="$4" role="region" aria-label="League standings">
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <Trophy size={20} color="var(--color)" />
          <Text
            fontSize="$6"
            fontWeight="700"
            color="$color"
            id="standings-title"
          >
            Standings
          </Text>
        </XStack>
        <Text fontSize="$3" color="$textMuted">
          {teams.length} {teams.length === 1 ? 'team' : 'teams'}
        </Text>
      </XStack>

      {/* Table Header */}
      <XStack paddingHorizontal="$4" paddingVertical="$2">
        <Text
          width={48}
          fontSize="$2"
          color="$textMuted"
          fontWeight="600"
          textTransform="uppercase"
          letterSpacing={0.5}
        >
          Rank
        </Text>
        <Text
          flex={2}
          fontSize="$2"
          color="$textMuted"
          fontWeight="600"
          textTransform="uppercase"
          letterSpacing={0.5}
        >
          Team
        </Text>
        <Text
          flex={1}
          fontSize="$2"
          color="$textMuted"
          fontWeight="600"
          textTransform="uppercase"
          letterSpacing={0.5}
          textAlign="right"
        >
          Points
        </Text>
      </XStack>

      <Separator borderColor="$outlineSubtle" />

      {/* Team Rows */}
      <YStack gap="$1" role="list">
        {teams.map((team, index) => {
          const isUserTeam = userTeamId === team.id;
          const rank = index + 1;
          const rankStyle = getRankStyle(rank);

          return (
            <Card
              key={team.id}
              paddingHorizontal="$4"
              paddingVertical="$3"
              borderWidth={1}
              borderColor={isUserTeam ? '$blue7' : 'transparent'}
              backgroundColor={isUserTeam ? '$blue2' : 'transparent'}
              borderRadius="$4"
              role="listitem"
              cursor="pointer"
              hoverStyle={{
                backgroundColor: isUserTeam ? '$blue3' : '$surfaceSubtle',
              }}
              pressStyle={{
                backgroundColor: isUserTeam ? '$blue3' : '$surfaceInteractive',
              }}
              onPress={() => handleTeamClick(team.id)}
              onClick={() => handleTeamClick(team.id)}
              animation="quick"
            >
              <XStack alignItems="center">
                {/* Rank */}
                <YStack width={48} alignItems="flex-start">
                  <RankBadge
                    backgroundColor={rankStyle.bg}
                    borderColor={rankStyle.border}
                    borderWidth={1}
                  >
                    <Text
                      fontSize="$3"
                      fontWeight="800"
                      color={rankStyle.color}
                    >
                      {rank}
                    </Text>
                  </RankBadge>
                </YStack>

                {/* Team info */}
                <YStack flex={2} gap="$1">
                  <XStack alignItems="center" gap="$2">
                    <Text
                      fontSize="$4"
                      fontWeight={isUserTeam ? '700' : '500'}
                      color="$color"
                    >
                      {team.name}
                    </Text>
                    {isUserTeam && (
                      <XStack
                        backgroundColor="$blue3"
                        borderColor="$blue7"
                        borderWidth={1}
                        borderRadius="$10"
                        paddingHorizontal="$2"
                        paddingVertical="$0.5"
                      >
                        <Text fontSize="$1" fontWeight="700" color="$blue11">
                          YOU
                        </Text>
                      </XStack>
                    )}
                  </XStack>
                  <Text fontSize="$2" color="$textMuted">
                    View roster
                  </Text>
                </YStack>

                {/* Points */}
                <Text
                  flex={1}
                  fontSize="$4"
                  fontWeight="600"
                  color="$textMuted"
                  textAlign="right"
                >
                  —
                </Text>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </YStack>
  );
}
