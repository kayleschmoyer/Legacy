import React, { useMemo, useState } from 'react';
import { Card, H4, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { Users } from '@tamagui/lucide-icons';
import {
  getPositionColors,
  isStatsLoading,
  POSITION_SLOT_ORDER,
} from './rosterUtils';
import {
  type StatsLoadingStatus,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../utils/colors';

// ── Types ────────────────────────────────────────────────────────────────────

interface RosterPlayer {
  id: string;
  name: string;
  position: string | null;
  positionOrder: number;
  isBenched: boolean;
}

export interface MatchupRosterComparisonProps {
  /** The matchup to compare rosters for. Expects a fragment with id, leagueId, team1Id, team2Id. */
  matchup:
    | {
        id?: string | null;
        leagueId?: number | null;
        team1Id?: number | null;
        team2Id?: number | null;
        statsLoadingStatus?: StatsLoadingStatus | null;
      }
    | null
    | undefined;
  /** When provided, this team is shown on the left side. */
  userTeamId?: number | null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PlayerRow({ player }: { player: RosterPlayer }) {
  const posColors = getPositionColors(player.position);
  return (
    <XStack
      paddingVertical="$1.5"
      paddingHorizontal="$3"
      alignItems="center"
      gap="$2"
    >
      {player.position && (
        <YStack
          backgroundColor={posColors.bg}
          paddingHorizontal="$1.5"
          paddingVertical="$0.5"
          borderRadius="$2"
          minWidth={32}
          alignItems="center"
        >
          <Text fontSize="$1" fontWeight="700" color={posColors.text}>
            {player.position}
          </Text>
        </YStack>
      )}
      <Text
        fontSize="$2"
        fontWeight="500"
        color={player.isBenched ? '$gray9' : '$color'}
        flex={1}
        numberOfLines={1}
      >
        {player.name}
      </Text>
    </XStack>
  );
}

function TeamRoster({
  teamName,
  players,
  showBench,
  onToggleBench,
}: {
  teamName: string;
  players: RosterPlayer[];
  showBench: boolean;
  onToggleBench: () => void;
}) {
  const starters = players.filter((p) => !p.isBenched);
  const bench = players.filter((p) => p.isBenched);

  return (
    <YStack flex={1} minWidth={0}>
      <YStack
        paddingVertical="$2"
        paddingHorizontal="$3"
        backgroundColor="$gray2"
        borderBottomWidth={1}
        borderBottomColor="$gray4"
      >
        <Text fontSize="$2" fontWeight="700" numberOfLines={1}>
          {teamName}
        </Text>
        <Text fontSize="$1" color="$gray10">
          {starters.length} starters
        </Text>
      </YStack>

      {starters.map((p) => (
        <PlayerRow key={p.id} player={p} />
      ))}

      {bench.length > 0 && (
        <>
          <XStack
            paddingVertical="$1.5"
            paddingHorizontal="$3"
            backgroundColor="$gray2"
            borderTopWidth={1}
            borderBottomWidth={1}
            borderColor="$gray4"
            onPress={onToggleBench}
            cursor="pointer"
            pressStyle={{ opacity: 0.7 }}
          >
            <Text fontSize="$1" fontWeight="600" color="$gray10">
              Bench ({bench.length}) {showBench ? '▾' : '▸'}
            </Text>
          </XStack>
          {showBench && bench.map((p) => <PlayerRow key={p.id} player={p} />)}
        </>
      )}
    </YStack>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * MatchupRosterComparison — Cross-platform side-by-side roster display.
 *
 * Self-contained: fetches matchup players, league positions, and team names
 * from GraphQL. Shows starters organized by position with collapsible bench.
 */
export function MatchupRosterComparison({
  matchup,
  userTeamId,
}: MatchupRosterComparisonProps) {
  const [showLeftBench, setShowLeftBench] = useState(false);
  const [showRightBench, setShowRightBench] = useState(false);

  const matchupId = matchup?.id ? parseInt(matchup.id, 10) : 0;
  const leagueId = matchup?.leagueId ?? 0;

  const {
    data: playersData,
    loading: playersLoading,
    error: playersError,
  } = useGetMatchupPlayersQuery({
    variables: { matchupId },
    skip: !matchupId,
  });

  const { data: positionsData, error: positionsError } =
    useGetPositionsForLeagueQuery({
      variables: { leagueId },
      skip: !leagueId,
    });

  const { data: teamsData, error: teamsError } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  const queryError = playersError ?? positionsError ?? teamsError;

  // Build position lookup
  const positionMap = useMemo(() => {
    const map = new Map<number, string>();
    positionsData?.leaguePositions?.forEach(
      (pos: { id?: string | number | null; positionType?: string | null }) => {
        if (pos.id && pos.positionType) {
          map.set(
            typeof pos.id === 'string' ? parseInt(pos.id, 10) : pos.id,
            pos.positionType,
          );
        }
      },
    );
    return map;
  }, [positionsData]);

  // Determine which team is "left" (user's team if provided)
  const leftTeamId = useMemo(() => {
    if (userTeamId && matchup?.team1Id === userTeamId) return matchup.team1Id;
    if (userTeamId && matchup?.team2Id === userTeamId) return matchup.team2Id;
    return matchup?.team1Id ?? 0;
  }, [matchup, userTeamId]);

  const rightTeamId = useMemo(() => {
    if (leftTeamId === matchup?.team1Id) return matchup?.team2Id ?? 0;
    return matchup?.team1Id ?? 0;
  }, [matchup, leftTeamId]);

  // Resolve team names
  const teamNameById = useMemo(() => {
    const map = new Map<number, string>();
    teamsData?.leagueTeams?.forEach(
      (t: { id?: number | null; name?: string | null }) => {
        if (t.id != null && t.name) map.set(t.id, t.name);
      },
    );
    return map;
  }, [teamsData]);

  // Build roster arrays
  const { leftRoster, rightRoster } = useMemo(() => {
    const left: RosterPlayer[] = [];
    const right: RosterPlayer[] = [];

    if (!playersData?.getMatchupPlayers)
      return { leftRoster: left, rightRoster: right };

    for (const mp of playersData.getMatchupPlayers) {
      const posType = mp.positionId
        ? (positionMap.get(mp.positionId) ?? null)
        : null;
      const entry: RosterPlayer = {
        id: mp.id ?? String(mp.playerId),
        name: mp.player
          ? `${mp.player.firstName ?? ''} ${mp.player.lastName ?? ''}`.trim()
          : `Player #${mp.playerId}`,
        position: posType,
        positionOrder: posType ? (POSITION_SLOT_ORDER[posType] ?? 99) : 999,
        isBenched: mp.positionId == null,
      };

      if (mp.teamId === leftTeamId) left.push(entry);
      else if (mp.teamId === rightTeamId) right.push(entry);
    }

    // Sort: starters by position order, bench alphabetically
    const sortRoster = (r: RosterPlayer[]) =>
      r.sort((a, b) => {
        if (a.isBenched !== b.isBenched) return a.isBenched ? 1 : -1;
        if (!a.isBenched && !b.isBenched)
          return a.positionOrder - b.positionOrder;
        return a.name.localeCompare(b.name);
      });

    return { leftRoster: sortRoster(left), rightRoster: sortRoster(right) };
  }, [playersData, positionMap, leftTeamId, rightTeamId]);

  const leftName = teamNameById.get(leftTeamId) ?? 'Team 1';
  const rightName = teamNameById.get(rightTeamId) ?? 'Team 2';

  if (!matchup) return null;

  if (queryError) {
    return (
      <Card padding="$4" bordered borderRadius="$6">
        <XStack alignItems="center" gap="$2" justifyContent="center">
          <Text color="$red10">Failed to load roster data.</Text>
        </XStack>
      </Card>
    );
  }

  if (playersLoading || isStatsLoading(matchup?.statsLoadingStatus)) {
    return (
      <Card padding="$4" bordered borderRadius="$6">
        <XStack alignItems="center" gap="$2" justifyContent="center">
          <Spinner size="small" />
          <Text color="$gray11">Loading rosters...</Text>
        </XStack>
      </Card>
    );
  }

  if (leftRoster.length === 0 && rightRoster.length === 0) return null;

  return (
    <Card overflow="hidden" bordered borderRadius="$6">
      {/* Header */}
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$4"
        paddingVertical="$3"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        borderBottomWidth={1}
        borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
      >
        <Users size={16} color={BRAND_GOLD_LIGHT} />
        <H4 fontSize="$4" fontWeight="700" color={BRAND_GOLD_LIGHT}>
          Roster Comparison
        </H4>
      </XStack>

      {/* Side-by-side rosters */}
      <XStack>
        <TeamRoster
          teamName={leftName}
          players={leftRoster}
          showBench={showLeftBench}
          onToggleBench={() => setShowLeftBench((prev) => !prev)}
        />
        <Separator vertical />
        <TeamRoster
          teamName={rightName}
          players={rightRoster}
          showBench={showRightBench}
          onToggleBench={() => setShowRightBench((prev) => !prev)}
        />
      </XStack>
    </Card>
  );
}
