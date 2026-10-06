import React, { useContext, useMemo } from 'react';
import { Spinner, YStack } from 'tamagui';
import { type SeasonStats } from '@legacy-sports/scoring';
import {
  computeFootballMatchupTotals,
  formatMatchupTimeInfo,
  MatchupScoreboardHero,
  useFootballMatchupScores,
} from '@legacy-sports/shared-components/matchup';
import {
  type AppMatchupFragment,
  type AppMatchupPlayerFragment,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
  useGetUserPreferencesQuery,
} from '@legacy-sports/graphql';
import { AUTHORIZED_CONTEXT } from '../../../common/auth/AuthorizedUserContext';
import { useSubscription } from '../../subscription/useSubscription';
import { useLeagueScoringSettings } from '../../../common/scoring';
import { mapMatchupPlayerToSeasonStats } from '../../../common/scoring/mapGraphQLToScoringFormat';
import { computeMatchupScores } from '../computeMatchupScores';

export interface TeamStandingRecord {
  teamId?: number | string | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
}

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

export interface MatchupScoreboardProps {
  matchup: AppMatchupFragment | null | undefined;
  /** League id used to resolve team names and scoring settings. */
  leagueId: number | null | undefined;
  gamesRemaining?: number;
  /** League's total matchup weeks, for the "Matchup {week}/{total}" counter. */
  totalMatchups?: number | null;
  /**
   * Show a kickoff/time-remaining line derived from the matchup's
   * startTime/endTime (LS-5430). Football-only — baseball's scoreboard does
   * not ask for this, so callers must opt in explicitly.
   */
  showTimeInfo?: boolean;
  /** League standings, used to render each team's W-L(-T) record. */
  standings?: readonly TeamStandingRecord[];
  /** Dims the scoreboard and shows a spinner while a background score refetch is in flight. */
  isRefreshing?: boolean;
  /** When provided, team avatars/names become pressable to view that team. */
  onTeamPress?: (teamId: number) => void;
  /**
   * Overrides the wrapper's own player-level projected score (LS-6364).
   * Football passes the lambda-computed `matchupScores` projection here,
   * which accounts for season pace/bye weeks; falls back to the internally
   * computed `computeMatchupScores` projection when omitted.
   */
  team1ProjectedScore?: number;
  team2ProjectedScore?: number;
  /**
   * Football league: live scores come from the server-computed
   * `matchupScores` team totals instead of the baseball-only client
   * recompute, which sums NFL rosters to 0–0 (LS-10829).
   */
  isFootball?: boolean;
}

/**
 * MatchupScoreboard — native data-fetching wrapper around the shared
 * `MatchupScoreboardHero` presentational component.
 *
 * Owns the GraphQL query layer (matchup players, league teams, scoring
 * settings) and the score/projection computation, then hands the
 * already-computed values to the shared hero so web and mobile render the same
 * rich scoreboard: projected scores, status chip, pace-coloured scores and a
 * games-progress summary (LS-7815). Mirrors web's `MatchupScoreboard` wrapper.
 */
export function MatchupScoreboard({
  matchup,
  leagueId,
  gamesRemaining = 0,
  totalMatchups,
  showTimeInfo = false,
  standings = [],
  isRefreshing = false,
  onTeamPress,
  team1ProjectedScore,
  team2ProjectedScore,
  isFootball = false,
}: MatchupScoreboardProps) {
  // Gates the premium "+N points" score flourish (LS-6392). Resolved here in
  // the data wrapper so the shared hero stays presentational.
  const { isPremium } = useSubscription();
  // The touchdown horn plays only for users who explicitly opted in (LS-10195);
  // a free preference gate, not a tier gate.
  const currentUser = useContext(AUTHORIZED_CONTEXT);
  const { data: preferencesData } = useGetUserPreferencesQuery({
    skip: currentUser == null,
  });
  const audioEnabled =
    preferencesData?.getUserPreferences?.audioEnabled === true;
  const matchupIdNum = matchup?.id ? parseInt(matchup.id, 10) : 0;

  const { data: playersData, error: playersError } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum || isFootball,
    errorPolicy: 'all',
  });

  // Same query and variables as FootballMatchupScreen's own `matchupScores`
  // read, so this shares its Apollo cache entry rather than refetching.
  const { teamScores: footballTeamScores } = useFootballMatchupScores({
    leagueId,
    weekNum: matchup?.weekNumber,
    skip: !isFootball,
  });

  const { settings: scoringSettings } = useLeagueScoringSettings(
    leagueId ?? undefined,
  );

  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    playersData?.getMatchupPlayers?.forEach((mp: AppMatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
    return map;
  }, [playersData]);

  const {
    team1Score,
    team2Score,
    team1Projected,
    team2Projected,
    scoresUnavailable = false,
  } = useMemo<{
    team1Score: number | null;
    team2Score: number | null;
    team1Projected: number | null;
    team2Projected: number | null;
    scoresUnavailable?: boolean;
  }>(
    () =>
      isFootball
        ? computeFootballMatchupTotals(matchup, footballTeamScores)
        : computeMatchupScores({
            matchup,
            players: playersData?.getMatchupPlayers,
            hasPlayersError: playersError != null,
            scoringSettings,
            seasonStatsMap,
          }),
    [
      isFootball,
      footballTeamScores,
      matchup,
      playersData,
      playersError,
      scoringSettings,
      seasonStatsMap,
    ],
  );

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
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

  const totalGames = matchup?.gamesPerMatchup ?? 0;
  const gamesPlayed = Math.max(0, totalGames - gamesRemaining);

  const timeInfo = showTimeInfo
    ? formatMatchupTimeInfo(
        matchup?.status,
        matchup?.startTime,
        matchup?.endTime,
      )
    : null;

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
        isPremium={isPremium}
        audioEnabled={audioEnabled}
        weekNumber={matchup?.weekNumber}
        totalMatchups={totalMatchups}
        status={matchup?.status}
        cancellationReason={matchup?.cancellationReason}
        timeInfo={timeInfo}
        team1={{
          id: matchup?.team1Id ?? null,
          name: team1Name,
          score: team1Score,
          projectedScore: team1ProjectedScore ?? team1Projected,
          record: formatTeamRecord(matchup?.team1Id, standings),
        }}
        team2={{
          id: matchup?.team2Id ?? null,
          name: team2Name,
          score: team2Score,
          projectedScore: team2ProjectedScore ?? team2Projected,
          record: formatTeamRecord(matchup?.team2Id, standings),
        }}
        gamesPlayed={gamesPlayed}
        totalGames={totalGames}
        onTeamPress={onTeamPress}
        scoringIsStale={matchup?.scoringIsStale}
        scoringChangeLog={matchup?.scoringChangeLog}
        scoresUnavailable={scoresUnavailable}
      />
    </YStack>
  );
}
