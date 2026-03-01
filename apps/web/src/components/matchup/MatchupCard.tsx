import React, { useMemo } from 'react';
import { Card, styled, Text, XStack, YStack } from 'tamagui';
import { Activity, CheckCircle, Clock } from '@tamagui/lucide-icons';
import {
  type MatchupFragment,
  MatchupStatus,
  useGetLeagueTeamsQuery,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { AvatarImage } from '../common';

export interface MatchupCardProps {
  matchup: MatchupFragment | null | undefined;
  onPress?: () => void;
  showWeek?: boolean;
}

// ── Styled Components ─────────────────────────────────────────────────────────

const CardContainer = styled(Card, {
  overflow: 'hidden',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  cursor: 'pointer',
  pressStyle: { scale: 0.98, opacity: 0.9 },
  hoverStyle: { borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5) },
  animation: 'quick',
  margin: '$1',
});

const AccentBar = styled(YStack, {
  height: 3,
  width: '100%',
});

const StatusDot = styled(YStack, {
  width: 8,
  height: 8,
  borderRadius: 4,
});

const ScoreValue = styled(Text, {
  fontWeight: '800',
  fontVariant: ['tabular-nums'],
  letterSpacing: -0.5,
});

// ── Component ─────────────────────────────────────────────────────────────

/**
 * MatchupCard - Modern card displaying a matchup between two teams
 * Shows team names, scores, and matchup status with visual polish
 */
export function MatchupCard({
  matchup,
  onPress,
  showWeek = true,
}: MatchupCardProps) {
  const leagueId = matchup?.leagueId ?? 0;
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  const team1Name = useMemo(() => {
    if (!matchup?.team1Id || !teamsData?.leagueTeams) return 'Team 1';
    return (
      teamsData.leagueTeams.find((t) => t.id === matchup.team1Id)?.name ??
      'Team 1'
    );
  }, [matchup?.team1Id, teamsData]);

  const team2Name = useMemo(() => {
    if (!matchup?.team2Id || !teamsData?.leagueTeams) return 'Team 2';
    return (
      teamsData.leagueTeams.find((t) => t.id === matchup.team2Id)?.name ??
      'Team 2'
    );
  }, [matchup?.team2Id, teamsData]);

  const team1Logo = useMemo(
    () =>
      teamsData?.leagueTeams?.find((t) => t.id === matchup?.team1Id)?.logoUrl ??
      null,
    [matchup?.team1Id, teamsData],
  );

  const team2Logo = useMemo(
    () =>
      teamsData?.leagueTeams?.find((t) => t.id === matchup?.team2Id)?.logoUrl ??
      null,
    [matchup?.team2Id, teamsData],
  );

  if (!matchup) {
    return null;
  }

  const { weekNumber, team1Score, team2Score, status } = matchup;

  const isLive = status === MatchupStatus.InProgress;
  const isCompleted = status === MatchupStatus.Completed;
  const team1Wins = isCompleted && (team1Score ?? 0) > (team2Score ?? 0);
  const team2Wins = isCompleted && (team2Score ?? 0) > (team1Score ?? 0);

  const statusConfig = isLive
    ? {
        color: '$green10',
        bg: '$green3',
        label: 'Live',
        icon: <Activity size={12} color="var(--green10)" />,
      }
    : isCompleted
      ? {
          color: BRAND_GOLD_LIGHT,
          bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
          label: 'Final',
          icon: <CheckCircle size={12} color={BRAND_GOLD_LIGHT} />,
        }
      : {
          color: '$gray10',
          bg: '$gray3',
          label: 'Scheduled',
          icon: <Clock size={12} color="var(--gray10)" />,
        };

  const accentColor = isLive
    ? '$green9'
    : isCompleted
      ? BRAND_NAVY_LIGHT
      : '$gray6';

  return (
    <CardContainer onPress={onPress}>
      {/* Accent bar */}
      <AccentBar backgroundColor={accentColor} />

      {/* Header row */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        paddingHorizontal="$4"
        paddingTop="$3"
        paddingBottom="$2"
      >
        {showWeek && (
          <Text fontSize="$2" fontWeight="600" color="$textMuted">
            Week {weekNumber}
          </Text>
        )}
        <XStack
          alignItems="center"
          gap="$1.5"
          paddingHorizontal="$2.5"
          paddingVertical="$1"
          borderRadius="$10"
          backgroundColor={statusConfig.bg}
        >
          {statusConfig.icon}
          <Text
            fontSize="$1"
            fontWeight="700"
            color={statusConfig.color}
            textTransform="uppercase"
            letterSpacing={0.3}
          >
            {statusConfig.label}
          </Text>
        </XStack>
      </XStack>

      {/* Teams & Scores */}
      <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$2.5">
        {/* Team 1 */}
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" gap="$2" flex={1}>
            {team1Wins && <StatusDot backgroundColor="$green9" />}
            <AvatarImage
              url={team1Logo}
              username={team1Name}
              size={24}
              borderRadius={3}
            />
            <Text
              fontSize="$4"
              fontWeight={team1Wins ? '700' : '500'}
              color={team1Wins ? '$color' : '$textMuted'}
              numberOfLines={1}
            >
              {team1Name}
            </Text>
          </XStack>
          <ScoreValue fontSize="$6" color={team1Wins ? '$color' : '$textMuted'}>
            {team1Score?.toFixed(2) ?? '0.00'}
          </ScoreValue>
        </XStack>

        {/* Divider */}
        <YStack height={1} backgroundColor="$surfacePanelBorder" />

        {/* Team 2 */}
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" gap="$2" flex={1}>
            {team2Wins && <StatusDot backgroundColor="$green9" />}
            <AvatarImage
              url={team2Logo}
              username={team2Name}
              size={24}
              borderRadius={3}
            />
            <Text
              fontSize="$4"
              fontWeight={team2Wins ? '700' : '500'}
              color={team2Wins ? '$color' : '$textMuted'}
              numberOfLines={1}
            >
              {team2Name}
            </Text>
          </XStack>
          <ScoreValue fontSize="$6" color={team2Wins ? '$color' : '$textMuted'}>
            {team2Score?.toFixed(2) ?? '0.00'}
          </ScoreValue>
        </XStack>
      </YStack>
    </CardContainer>
  );
}
