import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetAllTimeRecordsQuery,
  useGetLeagueHistoryQuery,
  useGetLeagueStandingsQuery,
} from '../../api/db/graphql.generated';

const RECORD_LABELS: Record<string, string> = {
  highest_score: 'Highest Single-Matchup Score',
  most_wins: 'Most Wins in a Season',
  most_points_season: 'Most Points in a Season',
  longest_win_streak: 'Longest Win Streak',
};

function formatRecordValue(type: string, value: number): string {
  if (type === 'longest_win_streak' || type === 'most_wins') {
    return String(value);
  }
  return value.toFixed(1);
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

interface LeagueHistoryTabProps {
  leagueId: number;
}

export function LeagueHistoryTab({
  leagueId,
}: LeagueHistoryTabProps): React.JSX.Element {
  const {
    data: historyData,
    loading: historyLoading,
    error: historyError,
  } = useGetLeagueHistoryQuery({
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  const seasons = useMemo(
    () => historyData?.getLeagueHistory ?? [],
    [historyData?.getLeagueHistory],
  );

  const defaultSeasonLeagueId = useMemo(() => {
    const frozen = seasons.find((s) => s.frozenAt !== null);
    return frozen?.leagueId ?? seasons[0]?.leagueId ?? leagueId;
  }, [seasons, leagueId]);

  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const viewingLeagueId = selectedLeagueId ?? defaultSeasonLeagueId;

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.leagueId === viewingLeagueId),
    [seasons, viewingLeagueId],
  );

  const {
    data: standingsData,
    loading: standingsLoading,
    error: standingsError,
  } = useGetLeagueStandingsQuery({
    variables: { leagueId: viewingLeagueId },
    skip: !viewingLeagueId,
    errorPolicy: 'all',
  });

  const {
    data: recordsData,
    loading: recordsLoading,
    error: recordsError,
  } = useGetAllTimeRecordsQuery({
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  React.useEffect(() => {
    if (historyError) {
      LOGGER.error('League history query failed', historyError, { leagueId });
    }
  }, [historyError, leagueId]);

  React.useEffect(() => {
    if (standingsError) {
      LOGGER.error('Season standings query failed', standingsError, {
        viewingLeagueId,
      });
    }
  }, [standingsError, viewingLeagueId]);

  React.useEffect(() => {
    if (recordsError) {
      LOGGER.error('All-time records query failed', recordsError, { leagueId });
    }
  }, [recordsError, leagueId]);

  const standings = useMemo(() => {
    const list = standingsData?.getLeagueStandings ?? [];
    return [...list].sort((a, b) => {
      const aw = a.winPercentage ?? -1;
      const bw = b.winPercentage ?? -1;
      if (aw !== bw) return bw - aw;
      return (b.pointsFor ?? 0) - (a.pointsFor ?? 0);
    });
  }, [standingsData?.getLeagueStandings]);

  const records = useMemo(
    () => recordsData?.getAllTimeRecords ?? [],
    [recordsData?.getAllTimeRecords],
  );

  const champions = useMemo(
    () => seasons.filter((s) => s.frozenAt && s.championTeamName),
    [seasons],
  );

  const selectableSeasons = useMemo(
    () =>
      seasons.filter(
        (s): s is typeof s & { leagueId: number } => s.leagueId != null,
      ),
    [seasons],
  );

  if (historyLoading && seasons.length === 0) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Spinner size="large" />
        <Text marginTop="$2" color="$gray10">
          Loading history…
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack padding="$3" gap="$4">
        {/* ── League History Section ── */}
        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <YStack flex={1}>
              <Text fontSize="$5" fontWeight="700">
                League History
              </Text>
              <Text fontSize="$2" color="$gray10">
                {historyLoading
                  ? 'Loading…'
                  : selectedSeason
                    ? `Season ${selectedSeason.seasonNumber ?? '—'}${selectedSeason.frozenAt ? ` · Completed ${formatDate(selectedSeason.frozenAt)}` : ' · Current'}`
                    : 'Past seasons + standings'}
              </Text>
            </YStack>
          </XStack>

          {/* Season picker */}
          {selectableSeasons.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap="$2" paddingVertical="$1">
                {selectableSeasons.map((s) => {
                  const isActive = s.leagueId === viewingLeagueId;
                  return (
                    <Pressable
                      key={s.leagueId}
                      onPress={() => setSelectedLeagueId(s.leagueId)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        borderRadius="$4"
                        fontSize="$2"
                        fontWeight={isActive ? '700' : '400'}
                        backgroundColor={isActive ? '$blue9' : '$gray4'}
                        color={isActive ? 'white' : '$gray11'}
                      >
                        Season {s.seasonNumber ?? '—'}
                        {s.frozenAt ? '' : ' (current)'}
                      </Text>
                    </Pressable>
                  );
                })}
              </XStack>
            </ScrollView>
          )}

          {/* Standings */}
          {historyError && seasons.length === 0 ? (
            <Card padding="$3" backgroundColor="$red2" borderColor="$red6">
              <Text color="$red11">Couldn't load league history</Text>
              <Text color="$red10" fontSize="$2">
                {historyError.message}
              </Text>
            </Card>
          ) : seasons.length <= 1 ? (
            <Card padding="$4" bordered>
              <Text fontWeight="600" marginBottom="$1">
                First season in progress
              </Text>
              <Text fontSize="$2" color="$gray10">
                History will be available after season renewal.
              </Text>
            </Card>
          ) : standingsLoading && standings.length === 0 ? (
            <YStack alignItems="center" padding="$4">
              <Spinner />
              <Text marginTop="$2" color="$gray10" fontSize="$2">
                Loading season standings…
              </Text>
            </YStack>
          ) : standingsError && standings.length === 0 ? (
            <Card padding="$3" backgroundColor="$red2" borderColor="$red6">
              <Text color="$red11" fontSize="$2">
                Couldn't load standings: {standingsError.message}
              </Text>
            </Card>
          ) : standings.length === 0 ? (
            <Card padding="$4" bordered>
              <Text color="$gray10" fontSize="$2" textAlign="center">
                No standings data available for this season.
              </Text>
            </Card>
          ) : (
            <YStack gap="$2">
              {standings.map((t, i) => {
                const rank = i + 1;
                const winPct = t.winPercentage ?? 0;
                const isChampion = rank === 1 && !!selectedSeason?.frozenAt;
                return (
                  <Card
                    key={t.teamId ?? rank}
                    padding="$3"
                    bordered
                    backgroundColor={isChampion ? '$yellow2' : '$background'}
                    borderColor={isChampion ? '$yellow6' : '$borderColor'}
                  >
                    <XStack alignItems="center" gap="$3">
                      <Text
                        fontSize="$3"
                        fontWeight="700"
                        color="$gray10"
                        width={24}
                        textAlign="center"
                      >
                        {rank}
                      </Text>
                      <YStack flex={1}>
                        <XStack alignItems="center" gap="$1">
                          <Text fontSize="$3" fontWeight="600">
                            {t.teamName ?? 'Team'}
                          </Text>
                          {isChampion && (
                            <Text fontSize="$2" color="$yellow9">
                              🏆
                            </Text>
                          )}
                        </XStack>
                        <Text fontSize="$1" color="$gray10">
                          {t.wins ?? '—'}W {t.losses ?? '—'}L{' '}
                          {t.ties != null && t.ties > 0 ? `${t.ties}T ` : ''}·{' '}
                          {winPct.toFixed(3).replace(/^0/, '')} Win%
                        </Text>
                      </YStack>
                      <YStack alignItems="flex-end">
                        <Text fontSize="$2" fontWeight="600">
                          {(t.pointsFor ?? 0).toFixed(1)}
                        </Text>
                        <Text fontSize="$1" color="$gray10">
                          PF
                        </Text>
                      </YStack>
                    </XStack>
                  </Card>
                );
              })}
            </YStack>
          )}
        </YStack>

        {/* ── All-Time Records Section ── */}
        <YStack gap="$2">
          <Text fontSize="$5" fontWeight="700">
            All-Time Records
          </Text>

          {recordsError && records.length === 0 ? (
            <Card padding="$3" backgroundColor="$red2" borderColor="$red6">
              <Text color="$red11">Couldn't load records</Text>
              <Text color="$red10" fontSize="$2">
                {recordsError.message}
              </Text>
            </Card>
          ) : recordsLoading && records.length === 0 ? (
            <YStack alignItems="center" padding="$4">
              <Spinner />
              <Text marginTop="$2" color="$gray10" fontSize="$2">
                Loading records…
              </Text>
            </YStack>
          ) : records.length === 0 ? (
            <Card padding="$4" bordered>
              <Text fontWeight="600" marginBottom="$1">
                No records yet
              </Text>
              <Text fontSize="$2" color="$gray10">
                Records are computed from completed matchups across all seasons.
              </Text>
            </Card>
          ) : (
            <YStack gap="$2">
              {records.map((r) => {
                const type = r.recordType ?? 'unknown';
                return (
                  <Card key={type} padding="$3" bordered>
                    <XStack alignItems="center" gap="$3">
                      <YStack flex={1}>
                        <Text fontSize="$2" color="$gray10">
                          {RECORD_LABELS[type] ?? type}
                        </Text>
                        <Text fontSize="$3" fontWeight="700">
                          {r.teamName ?? '—'}
                        </Text>
                        {r.seasonNumber != null && (
                          <Text fontSize="$1" color="$gray10">
                            Season {r.seasonNumber}
                          </Text>
                        )}
                      </YStack>
                      <Text fontSize="$5" fontWeight="800" color="$blue10">
                        {formatRecordValue(type, r.value ?? 0)}
                      </Text>
                    </XStack>
                  </Card>
                );
              })}
            </YStack>
          )}
        </YStack>

        {/* ── Champions Row Section ── */}
        {champions.length > 0 && (
          <YStack gap="$2">
            <Text fontSize="$5" fontWeight="700">
              Champions Row
            </Text>
            <YStack gap="$2">
              {champions.map((c) => (
                <Card
                  key={c.leagueId}
                  padding="$3"
                  backgroundColor="$yellow2"
                  borderColor="$yellow6"
                  bordered
                >
                  <XStack alignItems="center" gap="$2" marginBottom="$2">
                    <Text fontSize="$2" color="$yellow9">
                      🏆
                    </Text>
                    <Text fontSize="$3" fontWeight="800" color="$yellow10">
                      Season {c.seasonNumber ?? '—'}
                    </Text>
                  </XStack>
                  <Text fontSize="$3" fontWeight="700">
                    {c.championTeamName ?? 'Unknown'}
                  </Text>
                  {c.runnerUpTeamName != null && (
                    <Text fontSize="$2" color="$gray10">
                      vs {c.runnerUpTeamName}
                    </Text>
                  )}
                  {c.championScore != null && (
                    <Text fontSize="$1" color="$gray9" marginTop="$1">
                      Final: {c.championScore.toFixed(1)}
                      {c.runnerUpScore != null
                        ? ` – ${c.runnerUpScore.toFixed(1)}`
                        : ''}
                    </Text>
                  )}
                </Card>
              ))}
            </YStack>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}
