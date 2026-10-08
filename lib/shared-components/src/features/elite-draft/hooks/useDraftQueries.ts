import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { CombinedGraphQLErrors } from '@apollo/client';
import { useApolloClient, useQuery } from '@apollo/client/react';
import {
  DraftKind,
  GetAvailableDraftPlayers as GET_AVAILABLE_DRAFT_PLAYERS,
  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,
  GetDraftFootballPlayerStats as GET_DRAFT_FOOTBALL_PLAYER_STATS,
  GetDraftOpenSlotPositions as GET_DRAFT_OPEN_SLOT_POSITIONS,
  GetDraftPicks as GET_DRAFT_PICKS,
  GetDraftPitchingStats as GET_DRAFT_PITCHING_STATS,
  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,
  GetDraftRoom as GET_DRAFT_ROOM,
  GetDraftTeamAutoPickStatuses as GET_DRAFT_TEAM_AUTO_PICK_STATUSES,
  GetDraftTeamOrder as GET_DRAFT_TEAM_ORDER,
  GetLeagueById as GET_LEAGUE_BY_ID,
  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,
  GetLeagueTeams as GET_LEAGUE_TEAMS,
  GetMyDraftQueue as GET_MY_DRAFT_QUEUE,
  GetPositionsForLeague as GET_POSITIONS_FOR_LEAGUE,
  type GetAvailableDraftPlayersQuery,
  type GetAvailableDraftPlayersQueryVariables,
  type GetCurrentDraftPickQuery,
  type GetCurrentDraftPickQueryVariables,
  type GetDraftFootballPlayerStatsQuery,
  type GetDraftOpenSlotPositionsQuery,
  type GetDraftOpenSlotPositionsQueryVariables,
  type GetDraftPicksQuery,
  type GetDraftPicksQueryVariables,
  type GetDraftPitchingStatsQuery,
  type GetDraftPlayerStatsQuery,
  type GetDraftRoomQuery,
  type GetDraftRoomQueryVariables,
  type GetDraftTeamAutoPickStatusesQuery,
  type GetDraftTeamAutoPickStatusesQueryVariables,
  type GetDraftTeamOrderQuery,
  type GetDraftTeamOrderQueryVariables,
  type GetLeagueByIdQuery,
  type GetLeagueTeamsQuery,
  type GetLiveDraftLeagueDraftQuery,
  type GetMyDraftQueueQuery,
  type GetMyDraftQueueQueryVariables,
  type GetPositionsForLeagueQuery,
  type GetPositionsForLeagueQueryVariables,
  MockDraftMode,
  Sport,
} from '@legacy-sports/graphql';
import { isUpstreamUnreachableError } from '../../leagues/submitError';
import type {
  AvailableDraftPlayer,
  CurrentDraftPickInfo,
  DraftPickRecord,
  LeagueTeam,
  PlayerFootballStatsEntry,
  PlayerStatsEntry,
} from '../types';
import { hasDraftStarted } from '../draftUtils';
import { normalizeTeamId } from '../utils';

const PLAYER_PAGE_SIZE = 200;

interface UseDraftQueriesParams {
  leagueId: number | null;
  /**
   * Draft-room mode (LS-10076): load the board from `draftRoom(draftId)`
   * instead of the league queries. This is how a mock draft renders at all —
   * it has no league to read a name, teams, roster slots or draft status from.
   * When set, `leagueId` is ignored and the league queries are skipped.
   */
  draftId?: number | null;
  playerSearch: string;
  selectedPosition: string;
  /** Lift the server's default open-roster-slot filter (LS-10593). */
  showAllPositions?: boolean;
  viewMode: 'grid' | 'list' | 'compact' | 'board' | 'table' | 'depth';
  /** True on the compact/native draft board, which always renders the Board
   * tab (DraftRoundBoard, LS-10000; previously DraftBoardGrid) regardless of
   * `viewMode` and therefore always needs the real slot order (LS-9245). */
  isCompact?: boolean;
}

export function useDraftQueries({
  leagueId,
  draftId: roomDraftId = null,
  playerSearch,
  selectedPosition,
  showAllPositions = false,
  viewMode,
  isCompact = false,
}: UseDraftQueriesParams) {
  // Draft-room mode is chosen by the caller, not discovered: the mock-draft
  // route knows its draftId, and the league route resolves one from its
  // league. Both then render the same board off the same derived values.
  const isRoomMode = roomDraftId != null;

  // ---- Draft room (LS-10076) ----
  const {
    data: roomData,
    loading: roomLoading,
    error: roomError,
    refetch: refetchRoom,
  } = useQuery<GetDraftRoomQuery, GetDraftRoomQueryVariables>(GET_DRAFT_ROOM, {
    variables: { draftId: roomDraftId ?? 0 },
    skip: !isRoomMode,
    errorPolicy: 'all',
  });

  const room = roomData?.draftRoom ?? null;

  // ---- League Data ----
  const {
    data: leagueData,
    loading: leagueLoading,
    error: leagueError,
    refetch: refetchLeague,
  } = useQuery<GetLeagueByIdQuery>(GET_LEAGUE_BY_ID, {
    variables: { id: leagueId },
    skip: !leagueId || isRoomMode,
  });

  const { data: teamsData } = useQuery<GetLeagueTeamsQuery>(GET_LEAGUE_TEAMS, {
    variables: { leagueId },
    skip: !leagueId || isRoomMode,
  });

  // ---- League roster-slot config (My Depth Chart tab, LS-8785) ----
  // Reuses the same query the roster board (RosterBoard/Roster.tsx) fetches
  // its `positions` prop from, so the depth chart groups picks by the
  // league's real configured slots instead of a hardcoded, baseball-only list.
  const { data: positionsData } = useQuery<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  >(GET_POSITIONS_FOR_LEAGUE, {
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId || isRoomMode,
  });

  const leaguePositions = useMemo(() => {
    // A mock draft's slots are the sport defaults, delivered with its rules
    // (LS-10086) — there is no league_positions row to read them from.
    if (isRoomMode) {
      return (room?.rules?.rosterPositions ?? []).map(
        (positionType, index) => ({
          id: index + 1,
          positionType,
        }),
      );
    }

    return (positionsData?.leaguePositions ?? [])
      .filter(
        (p): p is { id: number; positionType: string } =>
          p.id != null && p.positionType != null,
      )
      .map((p) => ({ id: p.id, positionType: p.positionType }));
  }, [isRoomMode, room, positionsData]);

  const league = leagueData?.league;

  /**
   * Seats rendered as "teams" (LS-10076). A mock-draft seat has no team, so
   * the board keys on `participant_id` instead — the same id every pick,
   * queue entry and auto-pick status carries for a mock draft. The two id
   * spaces never mix inside one draft: a league draft's rows always carry a
   * team id, a mock draft's never do.
   */
  const seatTeams: LeagueTeam[] = useMemo(
    () =>
      (room?.seats ?? []).map((seat) => ({
        id: String(seat.id),
        name: seat.seatName ?? `Seat ${String(seat.slot)}`,
        leagueId: 0,
        managerId: seat.userId ?? undefined,
      })),
    [room],
  );

  const leagueTeamsFromLeague: LeagueTeam[] = useMemo(
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

  const leagueTeams = isRoomMode ? seatTeams : leagueTeamsFromLeague;

  const permLevel = league?.userMembership?.permissionLevel as
    | string
    | undefined;
  // NOT a privilege check — true for any team manager, including the ordinary
  // general_manager role. Do not use this to gate commissioner-only UI
  // (pause/resume, commissioner-pick, initialize draft); use isCommissioner
  // for that (LS-8841).
  const leagueIsOwner =
    permLevel === 'owner' ||
    permLevel === 'commissioner' ||
    permLevel === 'general_manager';
  const leagueIsCommissioner =
    permLevel === 'owner' || permLevel === 'commissioner';
  // In room mode permissions come from the room's viewer, which answers for
  // both draft kinds (LS-10076): the host runs the draft, a seat holder plays.
  const isOwner = isRoomMode ? (room?.viewer?.canPick ?? false) : leagueIsOwner;
  const isCommissioner = isRoomMode
    ? (room?.viewer?.canHost ?? false)
    : leagueIsCommissioner;
  // Draft-queue resolver restricts reads to permissionLevel === 'general_manager'
  // (lambdas/db/src/schema/drafts/queries.ts getMyDraftQueue). Surface the bit so
  // the UI can skip the query for co-managers / assistants instead of firing it
  // and swallowing a FORBIDDEN (LS-4804).
  const isGeneralManager = isRoomMode
    ? room?.viewer?.seatId != null
    : permLevel === 'general_manager';
  const myTeamId = isRoomMode
    ? normalizeTeamId(room?.viewer?.seatId)
    : normalizeTeamId(league?.userMembership?.teamId);

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
    skip: !leagueId || isRoomMode,
    errorPolicy: 'all',
  });

  const leagueDraft = draftData?.getLeagueDraft;
  const draftId: number | null = isRoomMode
    ? roomDraftId
    : leagueDraft?.id
      ? Number(leagueDraft.id)
      : null;
  // A mock draft is never an auction (createMockDraft writes 'standard').
  const isAuctionDraft =
    !isRoomMode && leagueDraft?.selectionMethod === 'auction';

  // ---- Values the board reads, from whichever source this mode has ----
  const draftStatus = isRoomMode
    ? (room?.status ?? null)
    : (league?.draftStatus ?? null);
  const maxRosterSize = isRoomMode
    ? room?.rules?.maxRosterSize
    : league?.maxRosterSize;
  // These three were league columns while a mock draft *was* a league. No
  // league row carries them any more (LS-10076 deleted every one and no writer
  // sets them), so in league mode they are simply false — the room is the only
  // place a mock draft can come from now.
  const isMock = isRoomMode && room?.kind === DraftKind.Mock;
  const isOfflineDraft =
    isRoomMode && room?.draft?.mockMode === MockDraftMode.Offline;
  const controlAllTeams = isRoomMode && (room?.draft?.controlAllTeams ?? false);
  const draftSport = isRoomMode ? room?.sport : league?.sport;
  const draftTitle = isRoomMode
    ? isMock
      ? 'Mock Draft'
      : room?.draft?.id != null
        ? `Draft #${String(room.draft.id)}`
        : 'Draft'
    : league?.name;

  useEffect(() => {
    if (!draftError) return;
    // A FORBIDDEN getLeagueDraft error is an expected condition — the user
    // lost league membership (removed, or left) between navigating to the
    // draft route and this query resolving. It is handled in the UI (see
    // the leagueError/draftError check in EliteDraftBoardScreen) and must
    // not be reported to Rollbar as a bug via LOGGER.error, which forwards
    // every error/fatal log automatically (RollbarOutputDestination).
    const isForbidden =
      CombinedGraphQLErrors.is(draftError) &&
      draftError.errors.some((e) => e.extensions?.['code'] === 'FORBIDDEN');
    // A 502/503/504 is the same transient upstream-gateway blip the shared
    // apollo-client errorLink already excludes from Rollbar — but this query
    // reads `error` directly off useQuery rather than going through that
    // link's captureError call, so it needs the same check applied locally
    // (LS-9492: this query kept flooding Rollbar with gateway timeouts on
    // the draft board after the league-create submit handlers were fixed).
    const isUpstreamUnreachable = isUpstreamUnreachableError(draftError);
    if (isForbidden) {
      LOGGER.warn(
        '[Draft] getLeagueDraft: user lost league access',
        draftError,
      );
    } else if (isUpstreamUnreachable) {
      LOGGER.warn('[Draft] getLeagueDraft: upstream unreachable', draftError);
    } else {
      LOGGER.error('[Draft] getLeagueDraft error:', draftError);
    }
  }, [draftError]);

  // ---- Current Pick ----
  const currentPickReadable = hasDraftStarted(draftStatus);
  const {
    data: currentPickData,
    error: currentPickError,
    refetch: refetchCurrentPickQuery,
  } = useQuery<GetCurrentDraftPickQuery, GetCurrentDraftPickQueryVariables>(
    GET_CURRENT_DRAFT_PICK,
    {
      variables: { draftId: draftId ?? 0 },
      // A scheduled draft has a draftId but no seats until it starts, so the
      // read would fail with DRAFT_TEAMS_NOT_CONFIGURED and toast an error
      // over the pre-draft lobby (LS-10811).
      skip: !draftId || isAuctionDraft || !currentPickReadable,
      errorPolicy: 'all',
    },
  );

  const currentPickInfo: CurrentDraftPickInfo | null = useMemo(() => {
    const raw = currentPickData?.getCurrentDraftPick;
    // A mock-draft pick has no team, so the seat is the key (LS-10076).
    const pickTeamId = raw?.teamId ?? raw?.participantId ?? null;
    if (
      !raw ||
      raw.draftId == null ||
      pickTeamId == null ||
      raw.round == null ||
      raw.pickNumber == null ||
      raw.overallPick == null ||
      raw.isComplete == null
    ) {
      return null;
    }
    return {
      draftId: raw.draftId,
      teamId: pickTeamId,
      round: raw.round,
      pickNumber: raw.pickNumber,
      overallPick: raw.overallPick,
      isComplete: raw.isComplete,
    };
  }, [currentPickData]);
  const currentPickTeamId = normalizeTeamId(currentPickInfo?.teamId);
  const currentPickErrorMessage = currentPickError?.message ?? '';
  // Apollo's refetch hits the network even while the query is skipped, so the
  // socket resync / timer paths must not read the pick before the draft
  // starts either. DRAFT_STARTED refetches the status, which unskips the query.
  const refetchCurrentPick = useCallback(
    (variables?: GetCurrentDraftPickQueryVariables) =>
      currentPickReadable
        ? refetchCurrentPickQuery(variables)
        : Promise.resolve(undefined),
    [currentPickReadable, refetchCurrentPickQuery],
  );

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
            (p.teamId ?? p.participantId) != null &&
            p.playerId != null,
        )
        .map((p) => ({
          id: String(p.id),
          draftId: p.draftId as number,
          round: p.round as number,
          pickNumber: p.pickNumber as number,
          overallPick: p.overallPick as number,
          pickedAt: p.pickedAt as string,
          teamId: (p.teamId ?? p.participantId) as number,
          playerId: p.playerId as number,
          adp: p.adp ?? null,
          projectedMatchupPoints: p.projectedMatchupPoints ?? null,
          player:
            p.player?.id != null
              ? {
                  id: p.player.id,
                  firstName: p.player.firstName ?? '',
                  lastName: p.player.lastName ?? '',
                  eligiblePositions: p.player.eligiblePositions ?? null,
                  mlbPlayerId: p.player.mlbPlayerId ?? null,
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
    previousData: previousAvailablePlayersData,
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
      openSlotsOnly: !showAllPositions,
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
  // Bumped to invalidate an in-flight load-more (see the effect below).
  const loadMoreRequestKeyRef = useRef(0);

  useEffect(() => {
    // While a filter/search-driven refetch is in flight, Apollo clears `data`
    // to undefined. Fall back to `previousData` so the board keeps rendering
    // the prior player list instead of collapsing to an empty grid.
    const source = availablePlayersData ?? previousAvailablePlayersData;
    const items = source?.getAvailableDraftPlayers ?? [];
    // A fresh first page (e.g. the post-pick refetch) invalidates any
    // load-more still in flight: its offset was computed against the old
    // list, and appending it produced duplicate rows/keys and a jumping list
    // while searching mid-pick (LS-10593).
    loadMoreRequestKeyRef.current++;
    setLoadingMore(false);
    setAllRawPlayers(items);
    setHasMorePlayers(items.length === PLAYER_PAGE_SIZE);
  }, [availablePlayersData, previousAvailablePlayersData]);

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
            projectedMatchupPoints?: number | null;
            adp?: number | null;
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
          projectedMatchupPoints: p.projectedMatchupPoints ?? null,
          adp: p.adp ?? null,
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

  // ---- Career Football Stats (LS-9478) ----
  // Football analogue of the career batting/pitching queries above. Skipped
  // entirely for baseball leagues (and before the league's sport is known)
  // so baseball boards never pay for this query or its LEFT JOINs — the
  // resolver's own WHERE clause is a second, server-side guarantee of the
  // same (see getDraftFootballPlayerStats).
  const isFootballLeague = league?.sport === Sport.Football;
  const { data: footballStatsData } =
    useQuery<GetDraftFootballPlayerStatsQuery>(
      GET_DRAFT_FOOTBALL_PLAYER_STATS,
      {
        skip: isAuctionDraft || !isFootballLeague,
        errorPolicy: 'all',
      },
    );

  const footballStatsMap = useMemo(() => {
    const map = new Map<number, PlayerFootballStatsEntry>();
    const rows = footballStatsData?.getDraftFootballPlayerStats;
    if (!Array.isArray(rows)) return map;
    for (const r of rows) {
      if (r?.playerId == null) continue;
      map.set(r.playerId, {
        playerId: r.playerId,
        passYds: r.passYds ?? undefined,
        passTd: r.passTd ?? undefined,
        rushYds: r.rushYds ?? undefined,
        rushTd: r.rushTd ?? undefined,
        rec: r.rec ?? undefined,
        recTd: r.recTd ?? undefined,
        fg: r.fg ?? undefined,
      });
    }
    return map;
  }, [footballStatsData]);

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
    skip: !draftId || isAuctionDraft || isRoomMode,
    fetchPolicy: 'cache-and-network',
  });

  // ---- Draft team order ----
  // Fetched for the 'board' view (existing), the pre-draft lobby (LS-8677, so
  // an executed draft slot trade's swap is reflected in the lobby's order
  // display immediately), and the compact/native board (LS-9245, which always
  // renders the Board tab grid off `boardOrderedTeams` regardless of
  // `viewMode` and silently fell back to unsorted `leagueTeams` once the
  // draft went live). Still skipped for other desktop views (grid/list/compact/table)
  // once the draft is live, to avoid firing an unused query throughout an
  // active draft.
  const isPreDraft = draftStatus !== 'in-progress' && draftStatus !== 'paused';
  const { data: draftTeamOrderData, refetch: refetchDraftTeamOrder } = useQuery<
    GetDraftTeamOrderQuery,
    GetDraftTeamOrderQueryVariables
  >(GET_DRAFT_TEAM_ORDER, {
    variables: { draftId: draftId ?? 0 },
    skip:
      !draftId ||
      // getDraftTeamOrder joins `teams`, so it answers nothing for a mock
      // draft; `draftRoom`'s seats already arrive in slot order (LS-10076).
      isRoomMode ||
      (viewMode !== 'board' && !isPreDraft && !isCompact),
  });

  const boardOrderedTeams = useMemo<LeagueTeam[]>(() => {
    if (isRoomMode) return seatTeams;
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
  }, [isRoomMode, seatTeams, leagueTeams, draftTeamOrderData]);

  const autoPickTeamIds = useMemo<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    if (isRoomMode) {
      for (const seat of room?.seats ?? []) {
        if (seat.autoPick) ids.add(String(seat.id));
      }
      return ids;
    }
    for (const entry of allAutoPickData?.getDraftTeamAutoPickStatuses ?? []) {
      if (entry.autoPick && entry.teamId != null) ids.add(String(entry.teamId));
    }
    return ids;
  }, [isRoomMode, room, allAutoPickData]);

  // ---- Draft Queue ----
  const { data: queueData, refetch: refetchQueue } = useQuery<
    GetMyDraftQueueQuery,
    GetMyDraftQueueQueryVariables
  >(GET_MY_DRAFT_QUEUE, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId || isAuctionDraft,
    fetchPolicy: 'cache-and-network',
    // Non-GM users receive FORBIDDEN — suppress global toast/Rollbar; the
    // queue panel itself handles the FORBIDDEN case by rendering nothing.
    context: { suppressGlobalError: true },
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
          openSlotsOnly: !showAllPositions,
        },
        fetchPolicy: 'network-only',
      });
      if (requestKey !== loadMoreRequestKeyRef.current) return;
      const newItems = result.data?.getAvailableDraftPlayers ?? [];
      setAllRawPlayers((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...newItems.filter((p) => !seen.has(p.id))];
      });
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
    showAllPositions,
    playerSortOrderBy,
    allRawPlayers.length,
  ]);

  // Which open roster-slot positions the server is narrowing the board to,
  // so the UI can say so (LS-10593). Empty = no filter applied.
  const { data: openSlotPositionsData, refetch: refetchOpenSlotPositions } =
    useQuery<
      GetDraftOpenSlotPositionsQuery,
      GetDraftOpenSlotPositionsQueryVariables
    >(GET_DRAFT_OPEN_SLOT_POSITIONS, {
      variables: { draftId: draftId ?? 0 },
      skip: !draftId || isAuctionDraft,
      errorPolicy: 'all',
    });
  const openSlotPositions = useMemo(
    () => openSlotPositionsData?.getDraftOpenSlotPositions ?? [],
    [openSlotPositionsData],
  );
  // A pick (ours) can fill a slot — refresh the applied filter with history.
  const pickCount = pickHistory.length;
  useEffect(() => {
    if (!draftId || isAuctionDraft || pickCount === 0) return;
    void refetchOpenSlotPositions();
  }, [pickCount, draftId, isAuctionDraft, refetchOpenSlotPositions]);

  return {
    // Room (LS-10076) — present only in draft-room mode.
    room,
    isRoomMode,
    refetchRoom,
    // Values the board renders from, whichever mode produced them
    draftStatus,
    maxRosterSize,
    isMock,
    isOfflineDraft,
    controlAllTeams,
    draftSport,
    draftTitle,
    // League
    league,
    leagueData,
    leagueLoading: isRoomMode ? roomLoading : leagueLoading,
    leagueError: isRoomMode ? roomError : leagueError,
    leagueTeams,
    leaguePositions,
    refetchLeague: isRoomMode ? refetchRoom : refetchLeague,
    permLevel,
    isOwner,
    isCommissioner,
    isGeneralManager,
    myTeamId,
    teamNameById,
    // Draft
    leagueDraft,
    draftId,
    draftError,
    isAuctionDraft,
    // GetLiveDraftLeagueDraft requires a non-null leagueId and is skipped in
    // room mode; refetching it there would send `leagueId: null` (LS-10464).
    refetchDraft: isRoomMode ? refetchRoom : refetchDraft,
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
    previousAvailablePlayersData,
    availablePlayersLoading,
    openSlotPositions,
    refetchOpenSlotPositions,
    availablePlayersError,
    refetchAvailablePlayers,
    hasMorePlayers,
    loadingMore,
    handleLoadMorePlayers,
    // Stats
    playerStatsMap,
    pitchingStatsMap,
    footballStatsMap,
    // Auto-pick / team order
    boardOrderedTeams,
    autoPickTeamIds,
    refetchAutoPickStatuses,
    refetchDraftTeamOrder,
    // Queue
    queueEntries,
    queuedPlayerIds,
    refetchQueue,
  } as const;
}
