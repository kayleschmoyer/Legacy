import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, XStack, YStack } from '@legacy-sports/shared-components';
import { Separator, Spinner, styled, Text } from 'tamagui';
import { Trophy } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

export interface TeamStandingData {
  teamId?: string | null;
  teamName?: string | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  winPercentage?: number | null;
  pointsFor?: number | null;
  pointsAgainst?: number | null;
}

export interface LeagueStandingsProps {
  standings: readonly TeamStandingData[];
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
  standings,
  loading = false,
  userTeamId,
}: LeagueStandingsProps): React.JSX.Element {
  const navigate = useNavigate();

  console.log(
    '[LeagueStandings] render — loading:',
    loading,
    'standings count:',
    standings?.length,
    'data:',
    standings,
  );

  const handleTeamClick = (teamId: string) => {
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
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
        <Text color="$textMuted" fontSize="$4">
          Loading standings...
        </Text>
      </YStack>
    );
  }

  if (!standings || standings.length === 0) {
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
          {standings.length} {standings.length === 1 ? 'team' : 'teams'}
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
          Record
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
          Pts For
        </Text>
      </XStack>

      <Separator borderColor="$outlineSubtle" />

      {/* Team Rows */}
      <YStack gap="$1" role="list">
        {standings.map((team, index) => {
          const teamIdNum = team.teamId ? parseInt(team.teamId, 10) : null;
          const isUserTeam = userTeamId != null && teamIdNum === userTeamId;
          const rank = index + 1;
          const rankStyle = getRankStyle(rank);
          const wins = team.wins ?? 0;
          const losses = team.losses ?? 0;
          const ties = team.ties ?? 0;
          const record =
            ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
          const pts = team.pointsFor != null ? team.pointsFor.toFixed(1) : '—';

          return (
            <Card
              key={team.teamId ?? index}
              paddingHorizontal="$4"
              paddingVertical="$3"
              borderWidth={1}
              borderColor={
                isUserTeam ? withAlpha(BRAND_NAVY_LIGHT, 0.5) : 'transparent'
              }
              backgroundColor={
                isUserTeam ? withAlpha(BRAND_NAVY_LIGHT, 0.12) : 'transparent'
              }
              borderRadius="$4"
              role="listitem"
              cursor="pointer"
              hoverStyle={{
                backgroundColor: isUserTeam
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                  : '$surfaceSubtle',
              }}
              pressStyle={{
                backgroundColor: isUserTeam
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                  : '$surfaceInteractive',
              }}
              onPress={() => team.teamId && handleTeamClick(team.teamId)}
              onClick={() => team.teamId && handleTeamClick(team.teamId)}
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
                      {team.teamName ?? 'Unknown Team'}
                    </Text>
                    {isUserTeam && (
                      <XStack
                        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                        borderWidth={1}
                        borderRadius="$10"
                        paddingHorizontal="$2"
                        paddingVertical="$0.5"
                      >
                        <Text
                          fontSize="$1"
                          fontWeight="700"
                          color={BRAND_GOLD_LIGHT}
                        >
                          YOU
                        </Text>
                      </XStack>
                    )}
                  </XStack>
                  <Text fontSize="$2" color="$textMuted">
                    View roster
                  </Text>
                </YStack>

                {/* Record */}
                <Text
                  flex={1}
                  fontSize="$4"
                  fontWeight="600"
                  color="$color"
                  textAlign="right"
                >
                  {record}
                </Text>

                {/* Points For */}
                <Text
                  flex={1}
                  fontSize="$4"
                  fontWeight="600"
                  color="$textMuted"
                  textAlign="right"
                >
                  {pts}
                </Text>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </YStack>
  );
}
