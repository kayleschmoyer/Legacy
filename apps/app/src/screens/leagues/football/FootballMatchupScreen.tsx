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
import { MatchupRecapPanel } from '@legacy-sports/shared-components/matchup';
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

/**
 * Returns the header status label for a matchup's current status.
 * Distinguishes scheduled/live/final/cancelled matchups so a completed or
 * cancelled game is never mistaken for an upcoming one.
 *
 * @param status - The matchup's current status.
 * @returns Display label for the header status text.
 */
export function getMatchupStatusLabel(status: Matchup['status']): string {
  if (status == null) return 'SCHEDULED';
  switch (status) {
    case MatchupStatus.InProgress:
      return 'LIVE';
    case MatchupStatus.Completed:
      return 'FINAL';
    case MatchupStatus.Cancelled:
      return 'CANCELLED';
    case MatchupStatus.Scheduled:
      return 'SCHEDULED';
    default: {
      // Compile-time exhaustiveness: adding a new MatchupStatus without a case
      // here will cause a TypeScript error.
      const _exhaustive: never = status;
      void _exhaustive;
      return 'SCHEDULED';
    }
  }
}

function ScoreHeader({
  matchup,
  isRefreshing,
}: {
  matchup: Matchup;
  isRefreshing: boolean;
}) {
  const team1Score = matchup.team1Score ?? 0;
  const team2Score = matchup.team2Score ?? 0;
  const statusLabel = getMatchupStatusLabel(matchup.status);

  return (
    <Card bordered backgroundColor="$background" borderRadius="$4" padding="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <YStack alignItems="center" flex={1}>
          <Text fontSize="$2" color="$gray9" marginBottom="$1">
            Team {matchup.team1Id}
          </Text>
          <Text
            fontSize="$8"
            fontWeight="700"
            color={team1Score > team2Score ? '$green10' : '$color12'}
            opacity={isRefreshing ? 0.5 : 1}
          >
            {team1Score.toFixed(2)}
          </Text>
        </YStack>

        <YStack alignItems="center" paddingHorizontal="$3">
          {isRefreshing ? (
            <YStack testID="score-refreshing-spinner">
              <Spinner size="small" color="$brandNavyLight" />
            </YStack>
          ) : (
            <Text fontSize="$2" color="$gray7">
              {statusLabel}
            </Text>
          )}
          {matchup.weekNumber != null ? (
            <Text fontSize="$1" color="$gray7">
              Wk {matchup.weekNumber}
            </Text>
          ) : null}
        </YStack>

        <YStack alignItems="center" flex={1}>
          <Text fontSize="$2" color="$gray9" marginBottom="$1">
            Team {matchup.team2Id}
          </Text>
          <Text
            fontSize="$8"
            fontWeight="700"
            color={team2Score > team1Score ? '$green10' : '$color12'}
            opacity={isRefreshing ? 0.5 : 1}
          >
            {team2Score.toFixed(2)}
          </Text>
        </YStack>
      </XStack>
    </Card>
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
  const { matchupId, defensiveFormat } = props;
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
        <ScoreHeader matchup={matchup} isRefreshing={isRefreshingScore} />

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
              label={`Team ${matchup.team1Id ?? '1'}`}
              onPlayerPress={onPlayerPress}
            />
            <RosterSection
              teamId={matchup.team2Id}
              players={players}
              positionOrder={positionOrder}
              label={`Team ${matchup.team2Id ?? '2'}`}
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
