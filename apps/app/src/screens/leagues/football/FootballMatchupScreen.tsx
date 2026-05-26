import React, { useEffect, useMemo } from 'react';
import {
  Card,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  type GetMatchupByIdQuery,
  type GetMatchupPlayersQuery,
  MatchupStatus,
  useGetMatchupByIdQuery,
  useGetMatchupPlayersQuery,
} from '../../../api/db/graphql.generated';

type Matchup = NonNullable<GetMatchupByIdQuery['getMatchupById']>;
type MatchupPlayer = NonNullable<
  NonNullable<GetMatchupPlayersQuery['getMatchupPlayers']>[number]
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

function ScoreHeader({ matchup }: { matchup: Matchup }) {
  const team1Score = matchup.team1Score ?? 0;
  const team2Score = matchup.team2Score ?? 0;
  const isLive = matchup.status === MatchupStatus.InProgress;

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
          >
            {team1Score.toFixed(2)}
          </Text>
        </YStack>

        <YStack alignItems="center" paddingHorizontal="$3">
          <Text fontSize="$2" color="$gray7">
            {isLive ? 'LIVE' : 'vs'}
          </Text>
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
          >
            {team2Score.toFixed(2)}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}

interface RosterSectionProps {
  readonly teamId: number | null | undefined;
  readonly players: MatchupPlayer[];
  readonly positionOrder: readonly string[];
  readonly label: string;
}

function RosterSection({
  teamId,
  players,
  positionOrder,
  label,
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

  const {
    data: matchupData,
    loading: matchupLoading,
    error: matchupError,
  } = useGetMatchupByIdQuery({ variables: { id: matchupId } });

  const { data: playersData, loading: playersLoading } =
    useGetMatchupPlayersQuery({ variables: { matchupId } });

  useEffect(() => {
    if (matchupError) {
      LOGGER.error('Failed to load matchup', matchupError, { matchupId });
    }
  }, [matchupError, matchupId]);

  const matchup = matchupData?.getMatchupById;
  const players = playersData?.getMatchupPlayers ?? [];
  const positionOrder = useMemo(
    () => getPositionOrder(defensiveFormat),
    [defensiveFormat],
  );

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
        <Spinner size="large" color="$blue9" />
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
    <ScrollView showsVerticalScrollIndicator={false}>
      <YStack gap="$3" paddingBottom="$8">
        <ScoreHeader matchup={matchup} />

        {playersLoading ? (
          <YStack alignItems="center" padding="$4">
            <Spinner size="small" color="$blue9" />
          </YStack>
        ) : (
          <>
            <RosterSection
              teamId={matchup.team1Id}
              players={players}
              positionOrder={positionOrder}
              label={`Team ${matchup.team1Id ?? '1'}`}
            />
            <RosterSection
              teamId={matchup.team2Id}
              players={players}
              positionOrder={positionOrder}
              label={`Team ${matchup.team2Id ?? '2'}`}
            />
          </>
        )}
      </YStack>
    </ScrollView>
  );
}
