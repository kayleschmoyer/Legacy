import React, { useEffect, useMemo, useRef } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import {
  formatMatchupTimeInfo,
  MatchupScoreboardView,
} from '@legacy-sports/shared-components/matchup';
import { formatRecord } from '@legacy-sports/shared-components/utils';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetLeagueStandingsQuery,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
} from '@legacy-sports/graphql';
import { useIsPremium } from '../../hooks/useIsPremium';
import { getEnvironmentConfig } from '../../config/environment';
import {
  type ScoringSettings,
  useLeagueScoringSettings,
} from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapMatchupPlayerToSeasonStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

// ── Score Computation ────────────────────────────────────────────────────────

export interface ComputedMatchupScores {
  team1Score: number;
  team2Score: number;
  team1Projected: number | null;
  team2Projected: number | null;
}

export interface ComputeMatchupScoresInput {
  matchup: MatchupFragment | null | undefined;
  players: readonly MatchupPlayerFragment[] | null | undefined;
  /**
   * True when the players query returned (or partially returned) a GraphQL
   * error. With `errorPolicy: 'all'`, Apollo surfaces the error alongside any
   * partial data; we must honour it as a signal to fall back to the
   * server-stored matchup scores rather than silently collapsing to 0-0.
   */
  hasPlayersError: boolean;
  scoringSettings: ScoringSettings | null | undefined;
  seasonStatsMap: ReadonlyMap<number, SeasonStats>;
}

interface TeamTotals {
  team1Total: number;
  team2Total: number;
  team1ProjTotal: number;
  team2ProjTotal: number;
}

/** Tolerance for the dev-only client/server score parity check (BMD-009). */
const SCORE_PARITY_EPSILON = 0.05;

/**
 * Per-player computed matchup stats: what a roster/matchup row displays for
 * one player in the matchup window (LS-9355).
 */
export interface MatchupPlayerComputedStats {
  playerId: number | null;
  /** Fantasy points scored so far this matchup. */
  actual: number;
  /** Projected final fantasy points (actual + per-game projection × remaining). */
  projected: number;
  /** Games with recorded stats within the matchup window. */
  gamesPlayed: number;
  /** Games in the matchup window for this player (SP-aware). */
  totalGames: number;
  /** Historical season the roster entry drafts from. */
  season: number | null;
  teamId: number | null;
  positionId: number | null;
}

/**
 * Compute each player's actual score, projection, and game counts for a
 * matchup. This is the expensive path — for a 24-player x 5-game matchup
 * that's 360 `computeScoring` invocations — so callers should only reach for
 * it when the matchup is still live or a per-player breakdown is genuinely
 * needed. Single source for both the team totals below and the roster tab's
 * per-row scores (LS-9355) — do not fork this computation.
 */
export function computeMatchupPlayerStats(
  matchup: MatchupFragment,
  players: readonly MatchupPlayerFragment[],
  scoringSettings: ScoringSettings,
  seasonStatsMap: ReadonlyMap<number, SeasonStats>,
): MatchupPlayerComputedStats[] {
  const gamesPerMatchup = matchup.gamesPerMatchup ?? 0;

  const calculateGameScore = (
    game: NonNullable<MatchupPlayerFragment['games']>[number],
  ): number => {
    let total = 0;

    if (game.battingGame) {
      const mappedBatting = mapBattingStats(game.battingGame);
      total += computeScoring(mappedBatting, scoringSettings.batting || {});
    }

    if (game.pitchingGame) {
      const mappedPitching = mapPitchingStats(game.pitchingGame);
      total += computeScoring(mappedPitching, scoringSettings.pitching || {});
    }

    if (game.fieldingGame) {
      const mappedFielding = mapFieldingStats(game.fieldingGame);
      total += computeScoring(mappedFielding, scoringSettings.fielding || {});
    }

    return total;
  };

  const result: MatchupPlayerComputedStats[] = [];

  players.forEach((player) => {
    const gamesPlayed = player.games?.length ?? 0;
    const actual =
      player.games?.reduce((sum, game) => sum + calculateGameScore(game), 0) ??
      0;
    // Use player-specific numberOfGames (SP gets pitcherStartsPerMatchup, others get gamesPerMatchup)
    const totalGames = player.numberOfGames ?? gamesPerMatchup;
    const remaining = totalGames - gamesPlayed;

    let projected = actual;
    if (remaining > 0) {
      const playerId = player.playerId;
      const seasonStats = playerId ? seasonStatsMap.get(playerId) : undefined;
      let projectedFromSeason: number | null = null;
      if (seasonStats) {
        try {
          const projection = calculateMatchupProjection(
            seasonStats,
            scoringSettings,
          );
          projectedFromSeason = actual + projection.totalPerGame * remaining;
        } catch {
          // Fall through to fallback
        }
      }
      if (projectedFromSeason != null) {
        projected = projectedFromSeason;
      } else if (gamesPlayed > 0) {
        // Fallback: use average from games already played
        projected = actual + (actual / gamesPlayed) * remaining;
      }
    }

    result.push({
      playerId: player.playerId ?? null,
      actual,
      projected,
      gamesPlayed,
      totalGames,
      season: player.season ?? null,
      teamId: player.teamId ?? null,
      positionId: player.positionId ?? null,
    });
  });

  return result;
}

/**
 * Sum per-player scores (and projections) onto each team via
 * `computeMatchupPlayerStats`. Bench players (null positionId) are excluded.
 */
function calculateTeamTotals(
  matchup: MatchupFragment,
  players: readonly MatchupPlayerFragment[],
  scoringSettings: ScoringSettings,
  seasonStatsMap: ReadonlyMap<number, SeasonStats>,
): TeamTotals {
  const perPlayer = computeMatchupPlayerStats(
    matchup,
    players,
    scoringSettings,
    seasonStatsMap,
  );

  let team1Total = 0;
  let team2Total = 0;
  let team1ProjTotal = 0;
  let team2ProjTotal = 0;

  for (const stats of perPlayer) {
    if (stats.positionId === null) continue;

    if (stats.teamId === matchup.team1Id) {
      team1Total += stats.actual;
      team1ProjTotal += stats.projected;
    } else if (stats.teamId === matchup.team2Id) {
      team2Total += stats.actual;
      team2ProjTotal += stats.projected;
    }
  }

  return { team1Total, team2Total, team1ProjTotal, team2ProjTotal };
}

/**
 * Dev-only safety net: warn when the server-stored score (authoritative for
 * completed matchups, see `computeMatchupScores`) has drifted from what the
 * client would compute from raw per-player stats — e.g. because scoring
 * settings changed after the matchup finalized (BMD-009).
 */
function warnOnScoreParityDrift(
  matchup: MatchupFragment,
  players: readonly MatchupPlayerFragment[],
  scoringSettings: ScoringSettings,
  seasonStatsMap: ReadonlyMap<number, SeasonStats>,
): void {
  const { team1Total, team2Total } = calculateTeamTotals(
    matchup,
    players,
    scoringSettings,
    seasonStatsMap,
  );
  const serverTeam1Score = matchup.team1Score ?? 0;
  const serverTeam2Score = matchup.team2Score ?? 0;

  if (
    Math.abs(team1Total - serverTeam1Score) > SCORE_PARITY_EPSILON ||
    Math.abs(team2Total - serverTeam2Score) > SCORE_PARITY_EPSILON
  ) {
    LOGGER.warn(
      'Matchup score parity drift: client-computed score diverges from server-stored score',
      {
        matchupId: matchup.id,
        serverTeam1Score,
        clientTeam1Score: team1Total,
        serverTeam2Score,
        clientTeam2Score: team2Total,
      },
    );
  }
}

/**
 * Compute the team scores and projections shown by the MatchupScoreboard.
 *
 * When the players query errors, or when required inputs are missing, fall
 * back to the matchup's server-stored `team1Score`/`team2Score`. Without this
 * fallback a failing nested resolver (e.g. games / battingGame) collapses
 * both totals to zero and the widget renders "0.00 vs 0.00 Tied" even though
 * the scores are stored correctly on the matchup row. See LS-2937.
 *
 * Once a matchup is `Completed`, the server-stored scores (Decimal columns)
 * are the sole authority — recomputing from raw per-player stats is both a
 * heavy hot path (see `calculateTeamTotals`) and a second source of truth
 * that can silently diverge from the server if scoring settings change after
 * the matchup finalizes. Projections aren't shown for completed matchups
 * either (see `MatchupScoreboardView`'s `showProjections`), so there's
 * nothing to compute them for. Live (`InProgress`) matchups still recompute
 * client-side so the score can update ahead of the next server sync. See
 * BMD-009.
 */
export function computeMatchupScores({
  matchup,
  players,
  hasPlayersError,
  scoringSettings,
  seasonStatsMap,
}: ComputeMatchupScoresInput): ComputedMatchupScores {
  if (hasPlayersError || !players || !scoringSettings || !matchup) {
    return {
      team1Score: matchup?.team1Score ?? 0,
      team2Score: matchup?.team2Score ?? 0,
      team1Projected: null,
      team2Projected: null,
    };
  }

  if (matchup.status === MatchupStatus.Completed) {
    if (getEnvironmentConfig().isDev) {
      warnOnScoreParityDrift(matchup, players, scoringSettings, seasonStatsMap);
    }
    return {
      team1Score: matchup.team1Score ?? 0,
      team2Score: matchup.team2Score ?? 0,
      team1Projected: null,
      team2Projected: null,
    };
  }

  const { team1Total, team2Total, team1ProjTotal, team2ProjTotal } =
    calculateTeamTotals(matchup, players, scoringSettings, seasonStatsMap);

  return {
    team1Score: team1Total,
    team2Score: team2Total,
    team1Projected: team1ProjTotal,
    team2Projected: team2ProjTotal,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupScoreboardProps {
  matchup: MatchupFragment | null | undefined;
  gamesRemaining?: number;
  /**
   * Show a kickoff/time-remaining line derived from the matchup's
   * startTime/endTime (LS-5430). Football-only — baseball's scoreboard does
   * not ask for this, so callers must opt in explicitly.
   */
  showTimeInfo?: boolean;
  /** When provided, team names become clickable links to view that team's roster */
  onTeamClick?: (teamId: number) => void;
  /**
   * Bumped by the parent page's WebSocket subscription (MATCHUP_STATS_COMPLETE
   * for this matchup, or a reconnect) to signal that player data should be
   * refetched (LS-5425). MatchupDetailPage owns the single real WebSocket
   * connection for this route — see its own doc comment for why this
   * component can't establish its own via `useLeagueWebSocket`.
   */
  liveUpdateSignal?: number;
}

/**
 * MatchupScoreboard — web data-fetching wrapper around the shared
 * `MatchupScoreboardView` presentational component.
 *
 * This wrapper owns the GraphQL query layer (matchup players, league teams,
 * scoring settings) and the score/projection computation, then hands the
 * already-computed values to the shared view. All presentation lives in
 * `@legacy-sports/shared-components/matchup` so web and mobile render
 * identically (LS-7715).
 */
export function MatchupScoreboard({
  matchup,
  gamesRemaining = 0,
  showTimeInfo = false,
  onTeamClick,
  liveUpdateSignal,
}: MatchupScoreboardProps) {
  // Gates the premium "+N points" score flourish (LS-6392). Resolved here in
  // the data wrapper so the shared view stays presentational.
  const isPremium = useIsPremium();

  // Extract IDs before early return to use in hooks
  const matchupIdStr = matchup?.id;
  const leagueIdNum = matchup?.leagueId ?? undefined;
  const matchupIdNum = matchupIdStr ? parseInt(matchupIdStr, 10) : 0;

  // Fetch matchup players to calculate actual scores (hooks must come before early return)
  const {
    data: playersData,
    error: playersError,
    refetch: refetchPlayers,
  } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
  });

  // This wrapper previously had no live-update mechanism at all — the score
  // never refreshed without a manual page reload (LS-5425). Refetch players
  // whenever the parent's `liveUpdateSignal` changes (MATCHUP_STATS_COMPLETE
  // for this matchup, or a websocket reconnect) — skip the initial mount so
  // this doesn't double-fire the query useGetMatchupPlayersQuery already ran.
  const refetchPlayersRef = useRef(refetchPlayers);
  refetchPlayersRef.current = refetchPlayers;
  const isFirstLiveUpdateRender = useRef(true);
  useEffect(() => {
    if (isFirstLiveUpdateRender.current) {
      isFirstLiveUpdateRender.current = false;
      return;
    }
    void refetchPlayersRef.current();
  }, [liveUpdateSignal]);

  // Fetch scoring settings
  const { settings: scoringSettings } = useLeagueScoringSettings(leagueIdNum);

  // Build season stats map from matchup players data for projection calculations
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    playersData?.getMatchupPlayers?.forEach((mp: MatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
    return map;
  }, [playersData]);

  // Calculate team scores and projected final scores. When the players
  // query errors (or returns partial data with a non-null errors array), fall
  // back to the matchup's server-stored scores — see `computeMatchupScores`
  // for the full rationale (LS-2937).
  const { team1Score, team2Score, team1Projected, team2Projected } = useMemo(
    () =>
      computeMatchupScores({
        matchup,
        players: playersData?.getMatchupPlayers,
        hasPlayersError: playersError != null,
        scoringSettings,
        seasonStatsMap,
      }),
    [playersData, playersError, scoringSettings, matchup, seasonStatsMap],
  );

  // Fetch team names
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
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

  // Fetch league standings to surface each team's W-L-T record in the header.
  const { data: standingsData } = useGetLeagueStandingsQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });

  const team1Record = useMemo(() => {
    const standing = standingsData?.getLeagueStandings?.find(
      (s) => Number(s.teamId) === matchup?.team1Id,
    );
    if (!standing) return null;
    return formatRecord(
      standing.wins ?? 0,
      standing.losses ?? 0,
      standing.ties ?? 0,
    );
  }, [matchup?.team1Id, standingsData]);

  const team2Record = useMemo(() => {
    const standing = standingsData?.getLeagueStandings?.find(
      (s) => Number(s.teamId) === matchup?.team2Id,
    );
    if (!standing) return null;
    return formatRecord(
      standing.wins ?? 0,
      standing.losses ?? 0,
      standing.ties ?? 0,
    );
  }, [matchup?.team2Id, standingsData]);

  const timeInfo = showTimeInfo
    ? formatMatchupTimeInfo(
        matchup?.status,
        matchup?.startTime,
        matchup?.endTime,
      )
    : null;

  return (
    <MatchupScoreboardView
      hasMatchup={!!matchup}
      weekNumber={matchup?.weekNumber}
      status={matchup?.status}
      cancellationReason={matchup?.cancellationReason}
      gamesPerMatchup={matchup?.gamesPerMatchup}
      gamesRemaining={gamesRemaining}
      team1Id={matchup?.team1Id}
      team2Id={matchup?.team2Id}
      team1Name={team1Name}
      team2Name={team2Name}
      team1Record={team1Record}
      team2Record={team2Record}
      team1Score={team1Score}
      team2Score={team2Score}
      team1Projected={team1Projected}
      team2Projected={team2Projected}
      hasPlayersError={playersError != null}
      timeInfo={timeInfo}
      onTeamClick={onTeamClick}
      scoringIsStale={matchup?.scoringIsStale}
      scoringChangeLog={matchup?.scoringChangeLog}
      isPremium={isPremium}
    />
  );
}
