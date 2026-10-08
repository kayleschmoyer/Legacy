import { useCallback, useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import {
  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,
  GetDraftPicks as GET_DRAFT_PICKS,
  GetDraftPitchingStats as GET_DRAFT_PITCHING_STATS,
  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,
  GetDraftTeamOrder as GET_DRAFT_TEAM_ORDER,
  GetHighlightVideos as GET_HIGHLIGHT_VIDEOS,
  GetLeagueById as GET_LEAGUE_BY_ID,
  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,
  GetLeagueTeams as GET_LEAGUE_TEAMS,
  GetNotablePlays as GET_NOTABLE_PLAYS,
  GetPositionsForLeague as GET_POSITIONS_FOR_LEAGUE,
  type GetCurrentDraftPickQuery,
  type GetCurrentDraftPickQueryVariables,
  type GetDraftPicksQuery,
  type GetDraftPicksQueryVariables,
  type GetDraftPitchingStatsQuery,
  type GetDraftPlayerStatsQuery,
  type GetDraftTeamOrderQuery,
  type GetDraftTeamOrderQueryVariables,
  type GetHighlightVideosQuery,
  type GetHighlightVideosQueryVariables,
  type GetLeagueByIdQuery,
  type GetLeagueTeamsQuery,
  type GetLiveDraftLeagueDraftQuery,
  type GetNotablePlaysQuery,
  type GetNotablePlaysQueryVariables,
  type GetPositionsForLeagueQuery,
  type GetPositionsForLeagueQueryVariables,
} from '@legacy-sports/graphql';
import { usePlayerData } from './usePlayerData';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  HighlightVideoSummary,
  LeagueTeam,
  NotablePlaySummary,
  PlayerStatsEntry,
} from '../types';
import { hasDraftStarted } from '../draftUtils';
import { normalizeTeamId } from '../utils';

/**
 * Poll cadence for the current-pick query — the WebSocket push is the primary
 * live signal; this poll is the fallback that covers reconnect gaps and
 * auction drafts (which opt out of the draft socket entirely).
 */
export const SPECTATOR_POLL_INTERVAL_MS = 5000;

interface UseSpectatorDraftDataParams {
  leagueId: number | null;
  /**
   * Player ids drafted over the live socket that may not be in `pickHistory`
   * yet (it refetches on a debounce). Included in the highlight-video lookup
   * so the pick splash can find its video immediately.
   */
  livePlayerIds?: readonly number[];
}

/**
 * Read-only draft data composition for the spectator screen (LS-8942).
 *
 * Deliberately a separate hook rather than a prop-gated `useDraftQueries`:
 * the spectator surface must *never* mount member-only queries
 * (`GetMyDraftQueue`, `GetAvailableDraftPlayers`, auto-pick statuses,
 * recommendations) — a skip-flag on the member hook would leave that
 * guarantee one refactor away from breaking. This hook composes the same
 * generated documents and returns the same shapes (`boardOrderedTeams`,
 * `pickHistory`, `currentPickInfo`, `teamNameById`) so `DraftGrid` and the
 * paused/complete state screens plug in unchanged.
 */
export function useSpectatorDraftData({
  leagueId,
  livePlayerIds,
}: UseSpectatorDraftDataParams) {
  // ---- League ----
  const {
    data: leagueData,
    loading: leagueLoading,
    error: leagueError,
    refetch: refetchLeague,
  } = useQuery<GetLeagueByIdQuery>(GET_LEAGUE_BY_ID, {
    variables: { id: leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });
  const league = leagueData?.league;

  const { data: teamsData } = useQuery<GetLeagueTeamsQuery>(GET_LEAGUE_TEAMS, {
    variables: { leagueId },
    skip: !leagueId,
  });

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

  const teamNameById = useCallback(
    (teamId: number | null | undefined): string => {
      if (teamId == null) return 'Unknown Team';
      const t = leagueTeams.find((lt) => String(lt.id) === String(teamId));
      return t?.name ?? `Team #${teamId}`;
    },
    [leagueTeams],
  );

  // ---- League roster-slot config (drives the on-the-clock depth chart) ----
  const { data: positionsData } = useQuery<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  >(GET_POSITIONS_FOR_LEAGUE, {
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });

  const leaguePositions = useMemo(
    () =>
      (positionsData?.leaguePositions ?? [])
        .filter(
          (p): p is { id: number; positionType: string } =>
            p.id != null && p.positionType != null,
        )
        .map((p) => ({ id: p.id, positionType: p.positionType })),
    [positionsData],
  );

  // ---- Draft ----
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

  // ---- Current pick (polled — the WS-fallback heartbeat of the page) ----
  const currentPickReadable = hasDraftStarted(league?.draftStatus);
  const { data: currentPickData, refetch: refetchCurrentPickQuery } = useQuery<
    GetCurrentDraftPickQuery,
    GetCurrentDraftPickQueryVariables
  >(GET_CURRENT_DRAFT_PICK, {
    variables: { draftId: draftId ?? 0 },
    // Not polled before the draft starts: an unseated draft answers
    // DRAFT_TEAMS_NOT_CONFIGURED, which toasted on every poll (LS-10811).
    skip: !draftId || !currentPickReadable,
    errorPolicy: 'all',
    pollInterval: SPECTATOR_POLL_INTERVAL_MS,
  });

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
  // refetch() ignores `skip`, so the socket/timer paths are gated the same way.
  const refetchCurrentPick = useCallback(
    (variables?: GetCurrentDraftPickQueryVariables) =>
      currentPickReadable
        ? refetchCurrentPickQuery(variables)
        : Promise.resolve(undefined),
    [currentPickReadable, refetchCurrentPickQuery],
  );

  // ---- Pick history ----
  // Snake drafts refresh via WebSocket pushes; auction drafts have no draft
  // socket, so their board fills in on the same 5s poll as the current pick.
  const { data: picksData, refetch: refetchPickHistory } = useQuery<
    GetDraftPicksQuery,
    GetDraftPicksQueryVariables
  >(GET_DRAFT_PICKS, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId,
    pollInterval: isAuctionDraft ? SPECTATOR_POLL_INTERVAL_MS : 0,
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

  /** playerId → MLB Stats API id, for the splash headshot URL. */
  const mlbPlayerIdFor = useCallback(
    (playerId: number): number | null =>
      pickHistory.find((p) => p.playerId === playerId)?.player?.mlbPlayerId ??
      null,
    [pickHistory],
  );

  // ---- Notable plays (pick-splash stat graphic, LS-9095) ----
  // Cache-table read only — the refresh schedule keeps it warm, so the splash
  // path never waits on a live statsapi lookup.
  const notableMlbIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of pickHistory) {
      if (p.player?.mlbPlayerId != null) ids.add(p.player.mlbPlayerId);
    }
    return [...ids].sort((a, b) => a - b);
  }, [pickHistory]);

  const { data: notablePlaysData } = useQuery<
    GetNotablePlaysQuery,
    GetNotablePlaysQueryVariables
  >(GET_NOTABLE_PLAYS, {
    variables: { mlbPlayerIds: notableMlbIds },
    skip: notableMlbIds.length === 0,
    errorPolicy: 'all',
  });

  const notablePlayByMlbId = useMemo(() => {
    const map = new Map<number, NotablePlaySummary>();
    for (const row of notablePlaysData?.notablePlaysByMlbPlayerIds ?? []) {
      if (row?.mlbPlayerId == null) continue;
      map.set(row.mlbPlayerId, {
        mlbPlayerId: row.mlbPlayerId,
        playerRole: row.playerRole === 'pitcher' ? 'pitcher' : 'batter',
        gameDate: row.gameDate ?? '',
        eventType: row.eventType ?? '',
        description: row.description ?? '',
        exitVelocity: row.exitVelocity ?? null,
        launchAngle: row.launchAngle ?? null,
        hitDistance: row.hitDistance ?? null,
        pitchSpeed: row.pitchSpeed ?? null,
        pitchType: row.pitchType ?? null,
        filmRoomUrl: row.filmRoomUrl ?? null,
      });
    }
    return map;
  }, [notablePlaysData]);

  /** playerId → cached notable play for the splash stat graphic (LS-9095). */
  const notablePlayFor = useCallback(
    (playerId: number): NotablePlaySummary | null => {
      const mlbId = mlbPlayerIdFor(playerId);
      return mlbId != null ? (notablePlayByMlbId.get(mlbId) ?? null) : null;
    },
    [mlbPlayerIdFor, notablePlayByMlbId],
  );

  // ---- Highlight videos (pick-splash video tier, LS-9113) ----
  // Same cache-read-only contract as the notable plays: the nightly resolver
  // keeps player_highlight_videos warm, so the splash never waits on a
  // YouTube API lookup. Keyed on our own players.id (mlb_player_id is NULL
  // for all baseball rows).
  const highlightPlayerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of pickHistory) ids.add(p.playerId);
    for (const id of livePlayerIds ?? []) ids.add(id);
    return [...ids].sort((a, b) => a - b);
  }, [pickHistory, livePlayerIds]);

  const { data: highlightVideosData } = useQuery<
    GetHighlightVideosQuery,
    GetHighlightVideosQueryVariables
  >(GET_HIGHLIGHT_VIDEOS, {
    variables: { playerIds: highlightPlayerIds },
    skip: highlightPlayerIds.length === 0,
    errorPolicy: 'all',
  });

  const highlightVideoByPlayerId = useMemo(() => {
    const map = new Map<number, HighlightVideoSummary>();
    for (const row of highlightVideosData?.highlightVideosByPlayerIds ?? []) {
      if (row?.playerId == null || !row.youtubeVideoId) continue;
      map.set(row.playerId, {
        playerId: row.playerId,
        youtubeVideoId: row.youtubeVideoId,
        videoTitle: row.videoTitle ?? null,
      });
    }
    return map;
  }, [highlightVideosData]);

  /** playerId → validated highlight video for the splash video tier (LS-9113). */
  const highlightVideoFor = useCallback(
    (playerId: number): HighlightVideoSummary | null =>
      highlightVideoByPlayerId.get(playerId) ?? null,
    [highlightVideoByPlayerId],
  );

  // ---- Career stats (names, positions, and the splash stat line) ----
  const { data: statsData } = useQuery<GetDraftPlayerStatsQuery>(
    GET_DRAFT_PLAYER_STATS,
    {
      variables: { first: 5000, minGames: 1 },
      skip: !leagueId,
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

  const { data: pitchingStatsData } = useQuery<GetDraftPitchingStatsQuery>(
    GET_DRAFT_PITCHING_STATS,
    {
      variables: { limit: 2000, minGames: 1 },
      skip: !leagueId,
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

  // statsLookup reuses the member room's enrichment with an empty
  // available-players list — the spectator never loads the draftable pool.
  const { statsLookup } = usePlayerData({
    availablePlayers: [],
    pickHistory,
    playerStatsMap,
    pitchingStatsMap,
    myTeamId: null,
  });

  // ---- Board column order ----
  const { data: draftTeamOrderData } = useQuery<
    GetDraftTeamOrderQuery,
    GetDraftTeamOrderQueryVariables
  >(GET_DRAFT_TEAM_ORDER, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId,
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

  // ---- On-the-clock team's drafted players (depth chart rail) ----
  const onClockTeamPlayers: DraftPlayer[] = useMemo(() => {
    if (currentPickTeamId === null) return [];
    return pickHistory
      .filter((p) => p.teamId === currentPickTeamId)
      .map(
        (pick) =>
          statsLookup.get(pick.playerId) ?? {
            id: pick.playerId,
            name: pick.player
              ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
              : `Player #${pick.playerId}`,
            position: pick.player?.eligiblePositions?.[0] ?? 'UTIL',
            eligiblePositions: pick.player?.eligiblePositions ?? undefined,
            avg: 0,
            hr: 0,
            rbi: 0,
            runs: 0,
            sb: 0,
            games: 0,
            hits: 0,
            obp: 0,
            slg: 0,
          },
      );
  }, [pickHistory, currentPickTeamId, statsLookup]);

  return {
    // League
    league,
    leagueData,
    leagueLoading,
    leagueError,
    leagueTeams,
    leaguePositions,
    teamNameById,
    refetchLeague,
    // Draft
    leagueDraft,
    draftId,
    draftError,
    isAuctionDraft,
    refetchDraft,
    // Current pick
    currentPickInfo,
    currentPickTeamId,
    refetchCurrentPick,
    // Pick history
    pickHistory,
    refetchPickHistory,
    mlbPlayerIdFor,
    notablePlayFor,
    highlightVideoFor,
    // Stats / lookups
    statsLookup,
    // Board
    boardOrderedTeams,
    onClockTeamPlayers,
  } as const;
}
