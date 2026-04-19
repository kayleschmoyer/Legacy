import React, { useMemo, useState } from 'react';
import { XStack, YStack } from '@legacy-sports/shared-components/ui';
import { Card, H3, H4, Spinner, styled, Text } from 'tamagui';
import {
  Award,
  Calendar,
  Crown,
  Flame,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from '@tamagui/lucide-icons';
import {
  useGetAllTimeRecordsQuery,
  useGetLeagueHistoryQuery,
  useGetLeagueStandingsQuery,
} from '../../api/db/graphql.generated';
import {
  AMBER,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  WHITE,
  withAlpha,
} from '../../constants/colors';

export interface LeagueHistoryProps {
  leagueId: number;
}

// ── Styled Components ────────────────────────────────────────────────────────

const SectionCard = styled(Card, {
  backgroundColor: '$surfacePanel',
  borderColor: '$surfacePanelBorder',
  borderWidth: 1,
  borderRadius: '$6',
  padding: '$4',
});

const SeasonButton = styled(XStack, {
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  borderRadius: '$4',
  cursor: 'pointer',
  alignItems: 'center',
  gap: '$2',
  hoverStyle: { backgroundColor: '$backgroundHover' },
  pressStyle: { backgroundColor: '$backgroundPress', scale: 0.98 },
  variants: {
    active: {
      true: {
        backgroundColor: '$brandNavyLight',
      },
    },
  } as const,
});

const RecordCard = styled(Card, {
  backgroundColor: '$surfaceSubtle',
  borderRadius: '$4',
  padding: '$3',
  flex: 1,
  minWidth: 200,
});

const RECORD_ICONS: Record<string, React.ReactNode> = {
  highest_score: <Zap size={18} color="$amber9" />,
  most_wins: <Trophy size={18} color="$brandGoldLight" />,
  most_points_season: <TrendingUp size={18} color="$brandGoldLight" />,
  longest_win_streak: <Flame size={18} color="$brandSeamRed" />,
};

const RECORD_LABELS: Record<string, string> = {
  highest_score: 'Highest Single-Matchup Score',
  most_wins: 'Most Wins in a Season',
  most_points_season: 'Most Points in a Season',
  longest_win_streak: 'Longest Win Streak',
};

// ── Main Component ───────────────────────────────────────────────────────────

export function LeagueHistory({
  leagueId,
}: LeagueHistoryProps): React.JSX.Element {
  const [selectedSeasonLeagueId, setSelectedSeasonLeagueId] = useState<
    number | null
  >(null);

  const {
    data: historyData,
    loading: historyLoading,
    error: historyError,
  } = useGetLeagueHistoryQuery({ variables: { leagueId } });

  const seasons = useMemo(
    () => historyData?.getLeagueHistory ?? [],
    [historyData],
  );

  // Default to most recent frozen season (or current if only 1 season)
  const viewingLeagueId = useMemo(() => {
    if (selectedSeasonLeagueId !== null) return selectedSeasonLeagueId;
    // Pick the first frozen (past) season, or the current season if none frozen
    const frozen = seasons.find((s) => s.frozenAt !== null);
    return frozen?.leagueId ?? seasons[0]?.leagueId ?? leagueId;
  }, [selectedSeasonLeagueId, seasons, leagueId]);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.leagueId === viewingLeagueId),
    [seasons, viewingLeagueId],
  );

  const {
    data: recordsData,
    loading: recordsLoading,
    error: recordsError,
  } = useGetAllTimeRecordsQuery({
    variables: { leagueId },
    skip: historyLoading || seasons.length === 0 || !viewingLeagueId,
  });

  // Fetch standings for the selected season's league ID
  const {
    data: standingsData,
    loading: standingsLoading,
    error: standingsError,
  } = useGetLeagueStandingsQuery({
    variables: { leagueId: viewingLeagueId },
    skip: !viewingLeagueId,
  });

  const standings = useMemo(
    () => standingsData?.getLeagueStandings ?? [],
    [standingsData],
  );

  const records = useMemo(
    () => recordsData?.getAllTimeRecords ?? [],
    [recordsData],
  );

  if (historyLoading) {
    return (
      <YStack alignItems="center" padding="$6">
        <Spinner size="large" />
        <Text color="$textMuted" marginTop="$2">
          Loading league history...
        </Text>
      </YStack>
    );
  }

  if (historyError) {
    return (
      <SectionCard>
        <Text color="$red11">
          Error loading league history: {historyError.message}
        </Text>
      </SectionCard>
    );
  }

  if (seasons.length <= 1) {
    return (
      <SectionCard>
        <YStack alignItems="center" gap="$3" padding="$4">
          <Calendar size={32} color="$textMuted" />
          <Text color="$textMuted" textAlign="center">
            This league is in its first season. History will be available after
            season renewal.
          </Text>
        </YStack>
      </SectionCard>
    );
  }

  return (
    <YStack gap="$4">
      {/* Season Selector */}
      <SectionCard>
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Calendar size={18} />
            <H4>Season Archives</H4>
          </XStack>
          <XStack gap="$2" flexWrap="wrap">
            {seasons.map((season) => (
              <SeasonButton
                key={season.leagueId}
                active={season.leagueId === viewingLeagueId}
                onPress={() =>
                  setSelectedSeasonLeagueId(season.leagueId ?? null)
                }
              >
                <Text
                  fontWeight={
                    season.leagueId === viewingLeagueId ? '700' : '400'
                  }
                  color={
                    season.leagueId === viewingLeagueId
                      ? '$brandGoldLight'
                      : '$text'
                  }
                  fontSize={14}
                >
                  Season {season.seasonNumber}
                </Text>
                {!season.frozenAt && (
                  <Text fontSize={10} color="$textMuted">
                    (current)
                  </Text>
                )}
                {season.championTeamName && (
                  <Trophy size={12} color="$brandGoldLight" />
                )}
              </SeasonButton>
            ))}
          </XStack>
        </YStack>
      </SectionCard>

      {/* Selected Season Detail */}
      {selectedSeason && (
        <SectionCard>
          <YStack gap="$4">
            <XStack
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              gap="$2"
            >
              <H3>
                Season {selectedSeason.seasonNumber}
                {!selectedSeason.frozenAt ? ' (Current)' : ''}
              </H3>
              <XStack gap="$2" alignItems="center">
                <Text color="$textMuted" fontSize={13}>
                  {selectedSeason.totalMatchups} matchups
                </Text>
                {selectedSeason.frozenAt && (
                  <Text color="$textMuted" fontSize={13}>
                    Completed{' '}
                    {new Date(selectedSeason.frozenAt).toLocaleDateString()}
                  </Text>
                )}
              </XStack>
            </XStack>

            {/* Champion Banner */}
            {selectedSeason.championTeamName && (
              <XStack
                backgroundColor={withAlpha(AMBER, 0.12)}
                borderRadius="$4"
                padding="$3"
                alignItems="center"
                gap="$3"
              >
                <Crown size={24} color="$brandGoldLight" />
                <YStack flex={1}>
                  <Text fontWeight="700" fontSize={16}>
                    {selectedSeason.championTeamName}
                  </Text>
                  <Text color="$textMuted" fontSize={13}>
                    Season {selectedSeason.seasonNumber} Champion
                    {selectedSeason.championScore != null &&
                      ` - ${selectedSeason.championScore.toFixed(1)} pts`}
                    {selectedSeason.runnerUpTeamName &&
                      ` vs ${selectedSeason.runnerUpTeamName}`}
                    {selectedSeason.runnerUpScore != null &&
                      ` (${selectedSeason.runnerUpScore.toFixed(1)})`}
                  </Text>
                </YStack>
              </XStack>
            )}

            {/* Season Standings */}
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2">
                <Target size={16} />
                <Text fontWeight="600" fontSize={15}>
                  Final Standings
                </Text>
              </XStack>
              {standingsLoading ? (
                <XStack justifyContent="center" padding="$3">
                  <Spinner size="small" />
                </XStack>
              ) : standingsError ? (
                <Text color="$red11">
                  Error loading standings: {standingsError.message}
                </Text>
              ) : standings.length === 0 ? (
                <Text color="$textMuted" fontSize={13}>
                  No standings data available for this season.
                </Text>
              ) : (
                <YStack>
                  {/* Header */}
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderBottomWidth={1}
                    borderColor="$surfacePanelBorder"
                  >
                    <Text
                      width={32}
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      #
                    </Text>
                    <Text
                      flex={1}
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      Team
                    </Text>
                    <Text
                      width={40}
                      textAlign="center"
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      W
                    </Text>
                    <Text
                      width={40}
                      textAlign="center"
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      L
                    </Text>
                    <Text
                      width={60}
                      textAlign="right"
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      Win%
                    </Text>
                    <Text
                      width={70}
                      textAlign="right"
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      PF
                    </Text>
                    <Text
                      width={70}
                      textAlign="right"
                      fontSize={11}
                      fontWeight="600"
                      color="$textMuted"
                    >
                      PA
                    </Text>
                  </XStack>
                  {/* Rows */}
                  {standings.map((team, idx) => (
                    <XStack
                      key={team.teamId}
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      backgroundColor={
                        idx % 2 === 0 ? 'transparent' : '$surfaceSubtle'
                      }
                      borderRadius="$2"
                      alignItems="center"
                    >
                      <Text width={32} fontSize={13} fontWeight="600">
                        {idx + 1}
                      </Text>
                      <Text flex={1} fontSize={13} numberOfLines={1}>
                        {team.teamName}
                      </Text>
                      <Text
                        width={40}
                        textAlign="center"
                        fontSize={13}
                        fontWeight="600"
                        color="$green10"
                      >
                        {team.wins}
                      </Text>
                      <Text
                        width={40}
                        textAlign="center"
                        fontSize={13}
                        fontWeight="600"
                        color="$red10"
                      >
                        {team.losses}
                      </Text>
                      <Text width={60} textAlign="right" fontSize={13}>
                        {((team.winPercentage ?? 0) * 100).toFixed(1)}%
                      </Text>
                      <Text width={70} textAlign="right" fontSize={13}>
                        {(team.pointsFor ?? 0).toFixed(1)}
                      </Text>
                      <Text
                        width={70}
                        textAlign="right"
                        fontSize={13}
                        color="$textMuted"
                      >
                        {(team.pointsAgainst ?? 0).toFixed(1)}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              )}
            </YStack>
          </YStack>
        </SectionCard>
      )}

      {/* Champions Row — past season winners */}
      {seasons.filter((s) => s.frozenAt && s.championTeamName).length > 0 && (
        <SectionCard>
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <Trophy size={18} color="$brandGoldLight" />
              <H4>Champions Row</H4>
            </XStack>
            <XStack gap="$3" flexWrap="wrap">
              {seasons
                .filter((s) => s.frozenAt && s.championTeamName)
                .map((s) => (
                  <YStack
                    key={s.leagueId}
                    flex={1}
                    minWidth={180}
                    padding="$4"
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.25)}
                    style={{
                      background: `linear-gradient(135deg, ${withAlpha(AMBER, 0.08)} 0%, ${withAlpha(BRAND_NAVY, 0.3)} 60%)`,
                    }}
                    gap="$2"
                  >
                    <XStack alignItems="center" gap="$2" marginBottom="$1">
                      <Crown size={16} color="$brandGoldLight" />
                      <Text
                        style={{
                          fontFamily: "'Big Shoulders Display', sans-serif",
                          fontSize: 20,
                          fontWeight: '800',
                          letterSpacing: 0.04,
                          color: BRAND_GOLD_LIGHT,
                        }}
                      >
                        Season {s.seasonNumber}
                      </Text>
                    </XStack>
                    <Text
                      style={{
                        fontFamily: "'Big Shoulders Display', sans-serif",
                        fontSize: 15,
                        fontWeight: '700',
                        color: WHITE,
                      }}
                    >
                      {s.championTeamName}
                    </Text>
                    {s.championScore != null && s.runnerUpTeamName && (
                      <Text
                        style={{
                          fontFamily: "'Roboto Mono', 'Courier New', monospace",
                          fontSize: 11,
                          color: withAlpha(WHITE, 0.5),
                          marginTop: 4,
                        }}
                      >
                        Final: {s.championScore.toFixed(1)}
                        {s.runnerUpScore != null
                          ? ` – ${s.runnerUpScore.toFixed(1)}`
                          : ''}
                      </Text>
                    )}
                    {s.runnerUpTeamName && (
                      <Text
                        style={{
                          fontFamily: "'Literata', Georgia, serif",
                          fontSize: 12,
                          color: withAlpha(WHITE, 0.45),
                        }}
                      >
                        Runner-up: {s.runnerUpTeamName}
                      </Text>
                    )}
                  </YStack>
                ))}
            </XStack>
          </YStack>
        </SectionCard>
      )}

      {/* All-Time Records */}
      <SectionCard>
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Award size={18} />
            <H4>All-Time Records</H4>
          </XStack>
          {recordsLoading ? (
            <XStack justifyContent="center" padding="$3">
              <Spinner size="small" />
            </XStack>
          ) : recordsError ? (
            <Text color="$red11">
              Error loading records: {recordsError.message}
            </Text>
          ) : records.length === 0 ? (
            <Text color="$textMuted" fontSize={13}>
              No records available yet. Records are computed from completed
              matchups across all seasons.
            </Text>
          ) : (
            <XStack gap="$3" flexWrap="wrap">
              {records.map((record) => {
                const type = record.recordType ?? 'unknown';
                const val = record.value ?? 0;
                return (
                  <RecordCard key={type}>
                    <YStack gap="$2">
                      <XStack alignItems="center" gap="$2">
                        {RECORD_ICONS[type] ?? (
                          <Trophy size={18} color="$textMuted" />
                        )}
                        <Text fontSize={12} color="$textMuted" fontWeight="600">
                          {RECORD_LABELS[type] ?? type}
                        </Text>
                      </XStack>
                      <Text fontSize={22} fontWeight="700">
                        {type === 'longest_win_streak' || type === 'most_wins'
                          ? val
                          : val.toFixed(1)}
                      </Text>
                      <Text fontSize={13} fontWeight="600">
                        {record.teamName}
                      </Text>
                      <Text fontSize={12} color="$textMuted">
                        Season {record.seasonNumber}
                      </Text>
                    </YStack>
                  </RecordCard>
                );
              })}
            </XStack>
          )}
        </YStack>
      </SectionCard>
    </YStack>
  );
}
