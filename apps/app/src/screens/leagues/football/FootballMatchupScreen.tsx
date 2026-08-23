import React, { useEffect, useMemo, useState } from 'react';
import { AppState, RefreshControl } from 'react-native';
import { NetworkStatus } from '@apollo/client';
import { useRouter } from 'expo-router';
import {
  Card,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { config } from '@legacy-sports/app-config/native';
import { LOGGER } from '@legacy-sports/logging';
import { Chip, useWebSocket } from '@legacy-sports/shared-components';
import {
  MatchupRecapPanel,
  MatchupScoreboardHero,
} from '@legacy-sports/shared-components/matchup';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import {
  type GetHeadToHeadRecordQuery,
  type GetMatchupByIdQuery,
  type GetMatchupPlayersQuery,
  MatchupStatus,
  useGetHeadToHeadRecordQuery,
  useGetMatchupByIdQuery,
  useGetMatchupPlayersQuery,
} from '@legacy-sports/graphql';
import { readKeychainValue, Secret } from '../../../common/auth/AuthHooks';
import { PremiumGate } from '../../../features/subscription/PremiumGate';
import { useHasEntitlement } from '../../../features/subscription/useSubscription';
import { useStandings } from '../../../features/matchup/hooks/useStandings';

type Matchup = NonNullable<GetMatchupByIdQuery['getMatchupById']>;
type MatchupPlayer = NonNullable<
  NonNullable<GetMatchupPlayersQuery['getMatchupPlayers']>[number]
>;
type HeadToHeadRecord = NonNullable<
  GetHeadToHeadRecordQuery['getHeadToHeadRecord']
>;

const DST_POSITION_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
] as const;
const IDP_POSITION_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DL',
  'LB',
  'DB',
] as const;
const BENCH_SLOT = 'BN';

const POSITION_LABELS: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  K: 'K',
  DST: 'D/ST',
  DL: 'DL',
  LB: 'LB',
  DB: 'DB',
};

interface FootballMatchupScreenProps {
  readonly matchupId: number;
  readonly defensiveFormat?: string | null;
  /** League's total matchup weeks, for the "Matchup {week}/{total}" counter. */
  readonly totalMatchups?: number | null;
  readonly leagueId?: number | null;
}

/**
 * Returns the ordered list of position slots for the matchup roster display.
 * Uses IDP slots (DL, LB, DB, …) for IDP leagues; DST slot for all others.
 *
 * @param defensiveFormat - 'idp' for individual defensive players, or 'dst'/null for team defense.
 * @returns Ordered array of position slot labels for each team's lineup column.
 */
export function getPositionOrder(
  defensiveFormat: string | null | undefined,
): readonly string[] {
  return defensiveFormat === 'idp' ? IDP_POSITION_ORDER : DST_POSITION_ORDER;
}

/**
 * Returns the display name for a matchup player.
 * Concatenates first and last name; falls back to 'Empty' when the player slot is unoccupied.
 *
 * @param player - The player record from a matchup player entry, or null/undefined for an empty slot.
 * @returns Full player name string, or 'Empty' if the slot is vacant or data is missing.
 */
export function getPlayerName(player: MatchupPlayer['player']): string {
  if (!player) return 'Empty';
  return (
    [player.firstName, player.lastName].filter(Boolean).join(' ') || 'Unknown'
  );
}

/**
 * Returns the primary position label for a matchup player.
 * Uses the first entry in `eligiblePositions`; falls back to '—' when none are defined.
 *
 * @param player - The player record from a matchup player entry, or null/undefined.
 * @returns Position abbreviation string (e.g. 'QB', 'WR'), or '—' if positions are unavailable.
 */
export function getPlayerPosition(player: MatchupPlayer['player']): string {
  const positions = player?.eligiblePositions;
  if (!positions || positions.length === 0) return '—';
  return positions[0] ?? '—';
}

type TeamStandingRecord = {
  teamId?: number | string | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
};

/**
 * Formats a team's W-L(-T) record from league standings, e.g. "5-2" or
 * "5-2-1" when the league allows ties. Returns undefined when no standing
 * row exists for the team (e.g. standings haven't loaded yet).
 */
export function formatTeamRecord(
  teamId: number | null | undefined,
  standings: readonly TeamStandingRecord[],
): string | undefined {
  if (teamId == null) return undefined;
  const standing = standings.find((s) => Number(s.teamId) === teamId);
  if (!standing) return undefined;
  const wins = standing.wins ?? 0;
  const losses = standing.losses ?? 0;
  const ties = standing.ties ?? 0;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function ScoreHeader({
  matchup,
  isRefreshing,
  standings,
  totalMatchups,
}: {
  matchup: Matchup;
  isRefreshing: boolean;
  standings: readonly TeamStandingRecord[];
  totalMatchups?: number | null;
}) {
  const team1Score = matchup.team1Score ?? 0;
  const team2Score = matchup.team2Score ?? 0;
  const totalGames = matchup.gamesPerMatchup ?? 0;
  const gamesPlayed = matchup.selectedGamesCount ?? 0;

  return (
    <YStack opacity={isRefreshing ? 0.5 : 1}>
      {isRefreshing ? (
        <YStack
          testID="score-refreshing-spinner"
          position="absolute"
          top="$2"
          right="$2"
          zIndex={1}
        >
          <Spinner size="small" color="$brandNavyLight" />
        </YStack>
      ) : null}
      <MatchupScoreboardHero
        weekNumber={matchup.weekNumber}
        totalMatchups={totalMatchups}
        status={matchup.status}
        team1={{
          id: matchup.team1Id,
          name: matchup.team1?.name ?? `Team ${matchup.team1Id ?? '1'}`,
          primaryColor: matchup.team1?.primaryColor,
          score: team1Score,
          record: formatTeamRecord(matchup.team1Id, standings),
        }}
        team2={{
          id: matchup.team2Id,
          name: matchup.team2?.name ?? `Team ${matchup.team2Id ?? '2'}`,
          primaryColor: matchup.team2?.primaryColor,
          score: team2Score,
          record: formatTeamRecord(matchup.team2Id, standings),
        }}
        gamesPlayed={gamesPlayed}
        totalGames={totalGames}
      />
    </YStack>
  );
}

/**
 * Small pill showing the all-time head-to-head record between the two teams
 * in this matchup, e.g. "Team 10 vs Team 20: 3-2 all-time" (FMD-046).
 * Renders nothing while loading or once there's no prior-matchup history.
 */
function HeadToHeadChip({
  team1Id,
  team2Id,
  loading,
  record,
}: {
  team1Id: number | null | undefined;
  team2Id: number | null | undefined;
  loading: boolean;
  record: HeadToHeadRecord | null | undefined;
}) {
  if (loading || !record || !record.totalMatchups) return null;

  const team1Wins = record.team1Wins ?? 0;
  const team2Wins = record.team2Wins ?? 0;
  const ties = record.ties ?? 0;

  return (
    <Chip
      testID="head-to-head-chip"
      alignSelf="center"
      tone="neutral"
      label={`Team ${team1Id ?? 'Unknown'} vs Team ${team2Id ?? 'Unknown'}: ${team1Wins}-${team2Wins}${ties > 0 ? `-${ties}` : ''} all-time`}
    />
  );
}

interface RosterSectionProps {
  readonly teamId: number | null | undefined;
  readonly players: MatchupPlayer[];
  readonly positionOrder: readonly string[];
  readonly label: string;
  readonly onPlayerPress: (player: MatchupPlayer) => void;
}

function RosterSection({
  teamId,
  players,
  positionOrder,
  label,
  onPlayerPress,
}: RosterSectionProps) {
  const teamPlayers = players.filter((p) => p.teamId === teamId);

  const starters = useMemo(() => {
    const grouped: Record<string, MatchupPlayer[]> = {};
    for (const slot of positionOrder) grouped[slot] = [];
    const bench: MatchupPlayer[] = [];

    for (const player of teamPlayers) {
      const eligiblePositions = player.player?.eligiblePositions ?? [];
      let placed = false;
      for (const slot of positionOrder) {
        if (
          eligiblePositions.includes(slot) &&
          (grouped[slot]?.length ?? 0) === 0
        ) {
          grouped[slot]?.push(player);
          placed = true;
          break;
        }
      }
      if (!placed) bench.push(player);
    }

    return { grouped, bench };
  }, [teamPlayers, positionOrder]);

  return (
    <Card
      bordered
      backgroundColor="$background"
      borderRadius="$4"
      overflow="hidden"
    >
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        backgroundColor="$backgroundHover"
      >
        <Text fontSize="$3" fontWeight="700" color="$color12">
          {label}
        </Text>
      </XStack>

      <Separator />

      {positionOrder.map((slot) => {
        const player = starters.grouped[slot]?.[0];
        return (
          <XStack
            key={slot}
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
            {...(player
              ? {
                  onPress: () => onPlayerPress(player),
                  pressStyle: { opacity: 0.6 },
                }
              : {})}
          >
            <YStack width={36} alignItems="flex-end">
              <Text fontSize="$2" fontWeight="700" color="$gray9">
                {POSITION_LABELS[slot] ?? slot}
              </Text>
            </YStack>
            <Text fontSize="$3" color={player ? '$color12' : '$gray7'} flex={1}>
              {player ? getPlayerName(player.player) : 'Empty'}
            </Text>
            {player ? (
              <Text fontSize="$2" color="$gray8">
                {getPlayerPosition(player.player)}
              </Text>
            ) : null}
          </XStack>
        );
      })}

      {starters.bench.length > 0 ? (
        <>
          <Separator />
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$gray9"
            paddingHorizontal="$3"
            paddingTop="$2"
          >
            BENCH
          </Text>
          {starters.bench.map((player, idx) => (
            <XStack
              key={String(player.id ?? player.playerId ?? idx)}
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignItems="center"
              gap="$2"
              onPress={() => onPlayerPress(player)}
              pressStyle={{ opacity: 0.6 }}
            >
              <YStack width={36} alignItems="flex-end">
                <Text fontSize="$2" fontWeight="700" color="$gray7">
                  {BENCH_SLOT}
                </Text>
              </YStack>
              <Text fontSize="$3" color="$gray9" flex={1}>
                {getPlayerName(player.player)}
              </Text>
              <Text fontSize="$2" color="$gray7">
                {getPlayerPosition(player.player)}
              </Text>
            </XStack>
          ))}
        </>
      ) : null}
    </Card>
  );
}

export function FootballMatchupScreen(
  props: FootballMatchupScreenProps,
): React.JSX.Element {
  const { matchupId, defensiveFormat, totalMatchups, leagueId } = props;
  const router = useRouter();
  const canSeeRecap = useHasEntitlement(ENTITLEMENTS.ai_matchup_recap);

  const onPlayerPress = (player: MatchupPlayer) => {
    if (player.playerId) {
      router.push(`/football/players/${player.playerId}`);
    }
  };

  const {
    data: matchupData,
    loading: matchupLoading,
    error: matchupError,
    networkStatus: matchupNetworkStatus,
    refetch: refetchMatchup,
  } = useGetMatchupByIdQuery({
    variables: { id: matchupId },
    notifyOnNetworkStatusChange: true,
  });

  const { standings, error: standingsError } = useStandings(leagueId);

  const {
    data: playersData,
    loading: playersLoading,
    refetch: refetchPlayers,
  } = useGetMatchupPlayersQuery({
    variables: { matchupId },
    notifyOnNetworkStatusChange: true,
  });

  useEffect(() => {
    if (matchupError) {
      LOGGER.error('Failed to load matchup', matchupError, { matchupId });
    }
  }, [matchupError, matchupId]);

  // Non-fatal: the header still renders name/score/avatar without a record
  // when standings fail to load (formatTeamRecord returns undefined), so a
  // standings error only degrades the header rather than blocking the page.
  useEffect(() => {
    if (standingsError) {
      LOGGER.error('Failed to load league standings', standingsError, {
        leagueId,
      });
    }
  }, [standingsError, leagueId]);

  // On resume from background, cache-first would otherwise serve stale scores
  // with no network round-trip — force a network refetch instead (LS-6388).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refetchMatchup();
        void refetchPlayers();
      }
    });
    return () => subscription.remove();
  }, [refetchMatchup, refetchPlayers]);

  const isRefreshingScore = matchupNetworkStatus === NetworkStatus.refetch;

  const [wsToken, setWsToken] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (active && token) setWsToken(token);
      } catch (err) {
        LOGGER.error(
          'FootballMatchupScreen: failed to read keychain token',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const wsUrl = config.websocketUrl;
  useWebSocket({
    url: wsUrl,
    token: wsToken,
    matchupId,
    viewContext: 'matchup',
    autoConnect: !!wsUrl && !!wsToken,
    onMatchupStatsComplete: () => {
      void refetchMatchup();
      void refetchPlayers();
    },
    // Force a refetch immediately on reconnect, not just on the next
    // matchup-stats-complete push — a user who drops offline mid-game
    // otherwise sees stale scores until the next push (LS-5425).
    onReconnect: () => {
      void refetchMatchup();
      void refetchPlayers();
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    void Promise.all([refetchMatchup(), refetchPlayers()]).finally(() =>
      setRefreshing(false),
    );
  };

  const matchup = matchupData?.getMatchupById;
  const players = playersData?.getMatchupPlayers ?? [];
  const positionOrder = useMemo(
    () => getPositionOrder(defensiveFormat),
    [defensiveFormat],
  );

  const { data: h2hData, loading: h2hLoading } = useGetHeadToHeadRecordQuery({
    variables: {
      leagueId: matchup?.leagueId ?? 0,
      team1Id: matchup?.team1Id ?? 0,
      team2Id: matchup?.team2Id ?? 0,
    },
    skip: !matchup?.leagueId || !matchup?.team1Id || !matchup?.team2Id,
  });

  if (matchupError) {
    return (
      <Card
        backgroundColor="$red2"
        borderColor="$red7"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$red11">
          Failed to load matchup.
        </Text>
      </Card>
    );
  }

  if (matchupLoading) {
    return (
      <YStack alignItems="center" padding="$6" gap="$3">
        <Spinner size="large" color="$brandNavyLight" />
        <Text fontSize="$3" color="$gray9">
          Loading matchup…
        </Text>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <Card
        backgroundColor="$yellow2"
        borderColor="$yellow6"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$yellow11">
          Matchup not found.
        </Text>
      </Card>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <YStack gap="$3" paddingBottom="$8">
        <ScoreHeader
          matchup={matchup}
          isRefreshing={isRefreshingScore}
          standings={standings}
          totalMatchups={totalMatchups}
        />

        <HeadToHeadChip
          team1Id={matchup.team1Id}
          team2Id={matchup.team2Id}
          loading={h2hLoading}
          record={h2hData?.getHeadToHeadRecord}
        />

        {playersLoading ? (
          <YStack alignItems="center" padding="$4">
            <Spinner size="small" color="$brandNavyLight" />
          </YStack>
        ) : (
          <>
            <RosterSection
              teamId={matchup.team1Id}
              players={players}
              positionOrder={positionOrder}
              label={matchup.team1?.name ?? `Team ${matchup.team1Id ?? '1'}`}
              onPlayerPress={onPlayerPress}
            />
            <RosterSection
              teamId={matchup.team2Id}
              players={players}
              positionOrder={positionOrder}
              label={matchup.team2?.name ?? `Team ${matchup.team2Id ?? '2'}`}
              onPlayerPress={onPlayerPress}
            />
          </>
        )}

        {matchup.status === MatchupStatus.Completed && matchupId != null ? (
          <PremiumGate
            isPremium={canSeeRecap}
            featureName="AI Matchup Recap"
            featureDescription="Get AI-generated narrative recaps that summarize your matchup story, highlights, and standout performances."
          >
            <MatchupRecapPanel matchupId={matchupId} />
          </PremiumGate>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
