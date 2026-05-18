import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { useApolloClient, useQuery } from '@apollo/client/react';
import type {
  AvailableDraftPlayer,
  CurrentDraftPickInfo,
  DraftPickRecord,
  LeagueTeam,
  PlayerStatsEntry,
} from '../types';
import { normalizeTeamId } from '../utils';
import {
  GetAvailableDraftPlayers as GET_AVAILABLE_DRAFT_PLAYERS,
  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,
  GetDraftPicks as GET_DRAFT_PICKS,
  GetDraftPitchingStats as GET_DRAFT_PITCHING_STATS,
  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,
  GetDraftTeamAutoPickStatuses as GET_DRAFT_TEAM_AUTO_PICK_STATUSES,
  GetDraftTeamOrder as GET_DRAFT_TEAM_ORDER,
  GetLeagueById as GET_LEAGUE_BY_ID,
  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,
  GetLeagueTeams as GET_LEAGUE_TEAMS,
  GetMyDraftQueue as GET_MY_DRAFT_QUEUE,
  type GetAvailableDraftPlayersQuery,
  type GetAvailableDraftPlayersQueryVariables,
  type GetCurrentDraftPickQuery,
  type GetCurrentDraftPickQueryVariables,
  type GetDraftPicksQuery,
  type GetDraftPicksQueryVariables,
  type GetDraftPitchingStatsQuery,
  type GetDraftPlayerStatsQuery,
  type GetDraftTeamAutoPickStatusesQuery,
  type GetDraftTeamAutoPickStatusesQueryVariables,
  type GetDraftTeamOrderQuery,
  type GetDraftTeamOrderQueryVariables,
  type GetLeagueByIdQuery,
  type GetLeagueTeamsQuery,
  type GetLiveDraftLeagueDraftQuery,
  type GetMyDraftQueueQuery,
  type GetMyDraftQueueQueryVariables,
} from '../../../api/db/graphql.generated';

const PLAYER_PAGE_SIZE = 200;

interface UseDraftQueriesParams {
  leagueId: number | null;
  playerSearch: string;
  selectedPosition: string;
  viewMode: 'grid' | 'list' | 'compact' | 'board' | 'table' | 'depth';
}

export function useDraftQueries({
  leagueId,
  playerSearch,
  selectedPosition,
  viewMode,
}: UseDraftQueriesParams) {
  // ---- League Data ----
  const {
    data: leagueData,
    loading: leagueLoading,
    error: leagueError,
    refetch: refetchLeague,
  } = useQuery<GetLeagueByIdQuery>(GET_LEAGUE_BY_ID, {
    variables: { id: leagueId },
    skip: !leagueId,
  });

  const { data: teamsData } = useQuery<GetLeagueTeamsQuery>(GET_LEAGUE_TEAMS, {
    variables: { leagueId },
    skip: !leagueId,
  });

  const league = leagueData?.league;
  const leagueTeams: LeagueTeam[] = useMemo(
    () =>
      (teamsData?.leagueTeams ?? [])
        .filter(
          (
            t,
          ): t is {
            id: number;
            name: string;
            leagueId: number;
            managerId?: number | null;
          } => t.id != null && t.name != null && t.leagueId != null,
        )
        .map((t) => ({
          id: String(t.id),
          name: t.name,
          leagueId: t.leagueId,
          managerId: t.managerId,
        })),
    [teamsData],
  );

  const permLevel = league?.userMembership?.permissionLevel as
    | string
    | undefined;
  const isOwner =
    permLevel === 'owner' ||
    permLevel === 'commissioner' ||
    permLevel === 'general_manager';
  const isCommissioner = permLevel === 'owner' || permLevel === 'commissioner';
  const myTeamId = normalizeTeamId(league?.userMembership?.teamId);

  const teamNameById = useCallback(
    (teamId: number | null | undefined): string => {
      if (teamId == null) return 'Unknown Team';
      const t = leagueTeams.find((lt) => String(lt.id) === String(teamId));
      return t?.name ?? `Team #${teamId}`;
    },
    [leagueTeams],
  );

  // ---- Draft Data ----
  const {
    data: draftData,
    error: draftError,
    refetch: refetchDraft,
  } = useQuery<GetLiveDraftLeagueDraftQuery>(GET_LEAGUE_DRAFT, {
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  const leagueDraft = draftData?.getLeagueDraft;
  const draftId: number | null = leagueDraft?.id
    ? Number(leagueDraft.id)
    : null;
  const isAuctionDraft = leagueDraft?.selectionMethod === 'auction';

  useEffect(() => {
    if (draftError) LOGGER.error('[Draft] getLeagueDraft error:', draftError);
  }, [draftError]);

  // ---- Current Pick ----
  const {
    data: currentPickData,
    error: currentPickError,
    refetch: refetchCurrentPick,
  } = useQuery<GetCurrentDraftPickQuery, GetCurrentDraftPickQueryVariables>(
    GET_CURRENT_DRAFT_PICK,
    {
      variables: { draftId: draftId ?? 0 },
      skip: !draftId || isAuctionDraft,
      errorPolicy: 'all',
    },
  );

  const currentPickInfo: CurrentDraftPickInfo | null = useMemo(() => {
    const raw = currentPickData?.getCurrentDraftPick;
    if (
      !raw ||
      raw.draftId == null ||
      raw.teamId == null ||
      raw.round == null ||
      raw.pickNumber == null ||
      raw.overallPick == null ||
      raw.isComplete == null
    ) {
      return null;
    }
    return {
      draftId: raw.draftId,
      teamId: raw.teamId,
      round: raw.round,
      pickNumber: raw.pickNumber,
      overallPick: raw.overallPick,
      isComplete: raw.isComplete,
    };
  }, [currentPickData]);
  const currentPickTeamId = normalizeTeamId(currentPickInfo?.teamId);
  const currentPickErrorMessage = currentPickError?.message ?? '';

  // ---- Pick History ----
  const { data: picksData, refetch: refetchPickHistory } = useQuery<
    GetDraftPicksQuery,
    GetDraftPicksQueryVariables
  >(GET_DRAFT_PICKS, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId || isAuctionDraft,
  });

  const pickHistory: DraftPickRecord[] = useMemo(
    () =>
      (picksData?.getDraftPicks ?? [])
        .filter(
          (p) =>
            p.id != null &&
            p.draftId != null &&
            p.round != null &&
            p.pickNumber != null &&
            p.overallPick != null &&
            p.pickedAt != null &&
            p.teamId != null &&
            p.playerId != null,
        )
        .map((p) => ({
          id: String(p.id),
          draftId: p.draftId as number,
          round: p.round as number,
          pickNumber: p.pickNumber as number,
          overallPick: p.overallPick as number,
          pickedAt: p.pickedAt as string,
          teamId: p.teamId as number,
          playerId: p.playerId as number,
          player:
            p.player?.id != null
              ? {
                  id: p.player.id,
                  firstName: p.player.firstName ?? '',
                  lastName: p.player.lastName ?? '',
                  eligiblePositions: p.player.eligiblePositions ?? null,
                }
              : null,
        })),
    [picksData],
  );

  // ---- Available Players (server-side search) ----
  const client = useApolloClient();
  const playerSortOrderBy = 'projectedMatchupPoints';

  const {
    data: availablePlayersData,
    loading: availablePlayersLoading,
    error: availablePlayersError,
    refetch: refetchAvailablePlayers,
  } = useQuery<
    GetAvailableDraftPlayersQuery,
    GetAvailableDraftPlayersQueryVariables
  >(GET_AVAILABLE_DRAFT_PLAYERS, {
    variables: {
      draftId: draftId ?? 0,
      search: playerSearch || null,
      position: selectedPosition !== 'ALL' ? selectedPosition : null,
      orderBy: playerSortOrderBy,
      limit: PLAYER_PAGE_SIZE,
    },
    skip: !draftId || isAuctionDraft,
    errorPolicy: 'all',
  });

  // Accumulated raw player list
  const [allRawPlayers, setAllRawPlayers] = useState<
    NonNullable<GetAvailableDraftPlayersQuery['getAvailableDraftPlayers']>
  >([]);
  const [hasMorePlayers, setHasMorePlayers] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const items = availablePlayersData?.getAvailableDraftPlayers ?? [];
    setAllRawPlayers(items);
    setHasMorePlayers(items.length === PLAYER_PAGE_SIZE);
  }, [availablePlayersData]);

  const availablePlayers: AvailableDraftPlayer[] = useMemo(
    () =>
      allRawPlayers
        .filter(
          (
            p,
          ): p is {
            id: number;
            firstName: string;
            lastName: string;
            brefId: string;
            eligiblePositions?: string[] | null;
            hitterAvgPointsPerGame?: number | null;
            pitchingAvgPointsPerGame?: number | null;
          } =>
            p.id != null &&
            p.firstName != null &&
            p.lastName != null &&
            p.brefId != null,
        )
        .map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          brefId: p.brefId,
          eligiblePositions: p.eligiblePositions ?? undefined,
          hitterAvgPointsPerGame: p.hitterAvgPointsPerGame ?? null,
          pitchingAvgPointsPerGame: p.pitchingAvgPointsPerGame ?? null,
        })),
    [allRawPlayers],
  );

  // ---- Career Batting Stats ----
  // first capped at 5 000 to match the server-side MAX_CAREER_BATTING_LIMIT
  // (LS-3113). primaryPosition is intentionally omitted from the query to avoid
  // the expensive careerFielding DataLoader call; position is derived from
  // eligiblePositions in usePlayerData. player { firstName lastName } is retained
  // so the statsLookup fallback in useDraftWebSocket resolves correctly for picks
  // arriving via WebSocket before the available-players refetch completes.
  const { data: statsData } = useQuery<GetDraftPlayerStatsQuery>(
    GET_DRAFT_PLAYER_STATS,
    {
      variables: { first: 5000, minGames: 1 },
      skip: isAuctionDraft,
      errorPolicy: 'all',
    },
  );

  const playerStatsMap = useMemo(() => {
    const map = new Map<number, PlayerStatsEntry>();
    const edges = statsData?.careerBattingStats?.edges;
    if (!edges) return map;
    for (const edge of edges) {
      if (!edge?.node) continue;
      const n = edge.node;
      const pid = n.playerId;
      if (pid == null) continue;
      map.set(pid, {
        playerId: pid,
        firstName: n.player?.firstName ?? '',
        lastName: n.player?.lastName ?? '',
        position: 'UTIL',
        games: n.games ?? 0,
        hits: n.hits ?? 0,
        hr: n.homeRuns ?? 0,
        rbi: n.rbi ?? 0,
        runs: n.runs ?? 0,
        sb: n.stolenBases ?? 0,
        avg: n.battingAverage ?? 0,
        obp: n.onBasePercentage ?? 0,
        slg: n.sluggingPercentage ?? 0,
        war: n.offensiveWAR ?? 0,
      });
    }
    return map;
  }, [statsData]);

  // ---- Career Pitching Stats ----
  const { data: pitchingStatsData } = useQuery<GetDraftPitchingStatsQuery>(
    GET_DRAFT_PITCHING_STATS,
    {
      variables: { limit: 2000, minGames: 1 },
      skip: isAuctionDraft,
      errorPolicy: 'all',
    },
  );

  const pitchingStatsMap = useMemo(() => {
    const map = new Map<
      number,
      {
        wins: number;
        losses: number;
        era: number;
        strikeouts: number;
        saves: number;
        games: number;
        gamesStarted: number;
        whip: number;
        winPct: number;
        war: number;
      }
    >();
    const rows = pitchingStatsData?.careerPitchingStats;
    if (!Array.isArray(rows)) return map;
    for (const r of rows) {
      const pid = r.playerId;
      if (pid == null) continue;
      const outsRecorded = r.outsRecorded ?? 0;
      const ip = outsRecorded / 3;
      const hitsAllowed = r.hits ?? 0;
      const bb = r.baseOnBalls ?? 0;
      const whip = ip > 0 ? (hitsAllowed + bb) / ip : 0;
      map.set(pid, {
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        era: parseFloat(r.era ?? '0') || 0,
        strikeouts: r.strikeouts ?? 0,
        saves: r.saves ?? 0,
        games: r.games ?? 0,
        gamesStarted: r.gamesStarted ?? 0,
        whip: Math.round(whip * 1000) / 1000,
        winPct: r.winPercentage ?? 0,
        war: r.pitchingWAR ?? 0,
      });
    }
    return map;
  }, [pitchingStatsData]);

  // ---- Auto-pick statuses ----
  // No pollInterval here — statuses are refetched via explicit calls after
  // pick events (useDraftWebSocket) and after the user toggles their own
  // auto-pick (useDraftActions). Polling every 5 s caused excessive API calls
  // (LS-3114). Use cache-and-network so the board shows cached data immediately
  // but still refreshes once on load when polling is disabled.
  const { data: allAutoPickData, refetch: refetchAutoPickStatuses } = useQuery<
    GetDraftTeamAutoPickStatusesQuery,
    GetDraftTeamAutoPickStatusesQueryVariables
  >(GET_DRAFT_TEAM_AUTO_PICK_STATUSES, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId || isAuctionDraft,
    fetchPolicy: 'cache-and-network',
  });

  // ---- Draft team order ----
  const { data: draftTeamOrderData } = useQuery<
    GetDraftTeamOrderQuery,
    GetDraftTeamOrderQueryVariables
  >(GET_DRAFT_TEAM_ORDER, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId || viewMode !== 'board',
  });

  const boardOrderedTeams = useMemo<LeagueTeam[]>(() => {
    const slotOrder = draftTeamOrderData?.getDraftTeamOrder;
    if (!slotOrder || slotOrder.length === 0) return leagueTeams;
    const slotMap = new Map<string, number>();
    for (const entry of slotOrder) {
      if (entry.teamId != null && entry.draftOrder != null) {
        slotMap.set(String(entry.teamId), entry.draftOrder);
      }
    }
    return [...leagueTeams].sort((a, b) => {
      const slotA = slotMap.get(String(a.id)) ?? Infinity;
      const slotB = slotMap.get(String(b.id)) ?? Infinity;
      return slotA - slotB;
    });
  }, [leagueTeams, draftTeamOrderData]);

  const autoPickTeamIds = useMemo<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    for (const entry of allAutoPickData?.getDraftTeamAutoPickStatuses ?? []) {
      if (entry.autoPick && entry.teamId != null) ids.add(String(entry.teamId));
    }
    return ids;
  }, [allAutoPickData]);

  // ---- Draft Queue ----
  const { data: queueData, refetch: refetchQueue } = useQuery<
    GetMyDraftQueueQuery,
    GetMyDraftQueueQueryVariables
  >(GET_MY_DRAFT_QUEUE, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId || isAuctionDraft,
    fetchPolicy: 'cache-and-network',
  });
  const queueEntries = useMemo(
    () => queueData?.getMyDraftQueue ?? [],
    [queueData],
  );
  const queuedPlayerIds = useMemo(
    () => new Set(queueEntries.map((e) => e.playerId ?? e.player?.id ?? 0)),
    [queueEntries],
  );

  // ---- Load More Players ----
  const loadMoreRequestKeyRef = useRef(0);

  const handleLoadMorePlayers = useCallback(async () => {
    if (loadingMore || !draftId) return;
    setLoadingMore(true);
    const requestKey = ++loadMoreRequestKeyRef.current;
    try {
      const result = await client.query<
        GetAvailableDraftPlayersQuery,
        GetAvailableDraftPlayersQueryVariables
      >({
        query: GET_AVAILABLE_DRAFT_PLAYERS,
        variables: {
          draftId: draftId ?? 0,
          search: playerSearch || null,
          position: selectedPosition !== 'ALL' ? selectedPosition : null,
          orderBy: playerSortOrderBy,
          limit: PLAYER_PAGE_SIZE,
          offset: allRawPlayers.length,
        },
        fetchPolicy: 'network-only',
      });
      if (requestKey !== loadMoreRequestKeyRef.current) return;
      const newItems = result.data?.getAvailableDraftPlayers ?? [];
      setAllRawPlayers((prev) => [...prev, ...newItems]);
      setHasMorePlayers(newItems.length === PLAYER_PAGE_SIZE);
    } catch (err) {
      if (requestKey !== loadMoreRequestKeyRef.current) return;
      LOGGER.error(
        '[Draft] Load more players failed',
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      if (requestKey === loadMoreRequestKeyRef.current) {
        setLoadingMore(false);
      }
    }
  }, [
    loadingMore,
    draftId,
    client,
    playerSearch,
    selectedPosition,
    playerSortOrderBy,
    allRawPlayers.length,
  ]);

  return {
    // League
    league,
    leagueData,
    leagueLoading,
    leagueError,
    leagueTeams,
    refetchLeague,
    permLevel,
    isOwner,
    isCommissioner,
    myTeamId,
    teamNameById,
    // Draft
    leagueDraft,
    draftId,
    isAuctionDraft,
    refetchDraft,
    // Current pick
    currentPickInfo,
    currentPickTeamId,
    currentPickError,
    currentPickErrorMessage,
    refetchCurrentPick,
    // Pick history
    pickHistory,
    refetchPickHistory,
    // Available players
    availablePlayers,
    availablePlayersData,
    availablePlayersLoading,
    availablePlayersError,
    refetchAvailablePlayers,
    hasMorePlayers,
    loadingMore,
    handleLoadMorePlayers,
    // Stats
    playerStatsMap,
    pitchingStatsMap,
    // Auto-pick / team order
    boardOrderedTeams,
    autoPickTeamIds,
    refetchAutoPickStatuses,
    // Queue
    queueEntries,
    queuedPlayerIds,
    refetchQueue,
  } as const;
}
