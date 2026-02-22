import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, XStack, YStack } from '@legacy-sports/shared-components';
import { Separator, Spinner, styled, Text } from 'tamagui';
import { Trophy } from '@tamagui/lucide-icons';

interface Team {
  id: number;
  name: string;
  leagueId: number;
  waiverOrder?: number | null;
  faabBudget?: number | null;
}

export interface LeagueStandingsProps {
  teams: readonly Team[];
  loading?: boolean;
  userTeamId?: number | null;
  waiverType?: string | null;
}

const RankBadge = styled(YStack, {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  animation: 'quick',
  hoverStyle: { scale: 1.12 },
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
  waiverType,
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
    <Card
      backgroundColor="rgba(17, 27, 47, 0.7)"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
      role="region"
      aria-label="League standings"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Gradient accent bar */}
      <YStack
        height={3}
        width="100%"
        style={{
          background: 'linear-gradient(90deg, #F59E0B, #FBBF24, transparent)',
        }}
      />
      {/* Title bar */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        justifyContent="space-between"
        alignItems="center"
        backgroundColor="rgba(13, 21, 38, 0.6)"
      >
        <XStack alignItems="center" gap="$2">
          <Trophy size={18} color="var(--color)" />
          <Text
            fontSize="$4"
            fontWeight="700"
            color="$color"
            id="standings-title"
          >
            Standings
          </Text>
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          {teams.length} {teams.length === 1 ? 'team' : 'teams'}
        </Text>
      </XStack>

      {/* Table Header */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor="$outlineSubtle"
      >
        <Text
          width={44}
          fontSize="$1"
          color="$textMuted"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing={0.6}
        >
          #
        </Text>
        <Text
          flex={2}
          fontSize="$1"
          color="$textMuted"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing={0.6}
        >
          Team
        </Text>
        <Text
          width={60}
          fontSize="$1"
          color="$textMuted"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing={0.6}
          textAlign="center"
          display="none"
          $gtSm={{ display: 'flex' }}
        >
          {waiverType === 'faab' ? 'FAAB' : 'Waiver'}
        </Text>
        <Text
          width={70}
          fontSize="$1"
          color="$textMuted"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing={0.6}
          textAlign="right"
        >
          Points
        </Text>
      </XStack>

      {/* Team Rows */}
      <YStack role="list">
        {teams.map((team, index) => {
          const isUserTeam = userTeamId === team.id;
          const rank = index + 1;
          const rankStyle = getRankStyle(rank);
          const isEven = index % 2 === 0;

          return (
            <React.Fragment key={team.id}>
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2.5"
                backgroundColor={
                  isUserTeam
                    ? '$blue2'
                    : isEven
                      ? '$background'
                      : '$surfaceSubtle'
                }
                borderLeftWidth={3}
                borderLeftColor={isUserTeam ? '$blue9' : 'transparent'}
                role="listitem"
                cursor="pointer"
                hoverStyle={{
                  backgroundColor: isUserTeam ? '$blue3' : '$surfaceSubtle',
                }}
                pressStyle={{ scale: 0.995, opacity: 0.9 }}
                onPress={() => handleTeamClick(team.id)}
                alignItems="center"
                animation="quick"
                minHeight={48}
                style={
                  isUserTeam
                    ? { boxShadow: 'inset 0 0 24px rgba(59, 130, 246, 0.1)' }
                    : rank <= 3
                      ? { boxShadow: 'inset 0 0 20px rgba(245, 158, 11, 0.06)' }
                      : undefined
                }
              >
                {/* Rank */}
                <YStack width={44} alignItems="flex-start">
                  <RankBadge
                    backgroundColor={rankStyle.bg}
                    borderColor={rankStyle.border}
                    borderWidth={1}
                  >
                    <Text
                      fontSize="$2"
                      fontWeight="800"
                      color={rankStyle.color}
                    >
                      {rank}
                    </Text>
                  </RankBadge>
                </YStack>

                {/* Team info */}
                <YStack flex={2} gap="$0.5">
                  <XStack alignItems="center" gap="$2">
                    <Text
                      fontSize="$3"
                      fontWeight={isUserTeam ? '700' : '500'}
                      color="$color"
                      numberOfLines={1}
                    >
                      {team.name}
                    </Text>
                    {isUserTeam && (
                      <Text
                        fontSize={10}
                        fontWeight="800"
                        color="$blue11"
                        backgroundColor="$blue3"
                        paddingHorizontal="$1.5"
                        paddingVertical={1}
                        borderRadius="$2"
                      >
                        YOU
                      </Text>
                    )}
                  </XStack>
                </YStack>

                {/* Waiver Info */}
                <Text
                  width={60}
                  fontSize="$3"
                  fontWeight="500"
                  color="$textMuted"
                  textAlign="center"
                  display="none"
                  $gtSm={{ display: 'flex' }}
                >
                  {waiverType === 'faab'
                    ? team.faabBudget != null
                      ? `$${team.faabBudget}`
                      : '—'
                    : team.waiverOrder != null
                      ? `#${team.waiverOrder}`
                      : '—'}
                </Text>

                {/* Points */}
                <Text
                  width={70}
                  fontSize="$3"
                  fontWeight="600"
                  color="$textMuted"
                  textAlign="right"
                >
                  —
                </Text>
              </XStack>
              {index < teams.length - 1 && (
                <Separator borderColor="$outlineSubtle" marginVertical={0} />
              )}
            </React.Fragment>
          );
        })}
      </YStack>
    </Card>
  );
}
