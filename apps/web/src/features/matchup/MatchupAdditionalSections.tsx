import React from 'react';
import {
  derivePlayoffImplications,
  MatchupAdditionalSections as MatchupAdditionalSectionsView,
} from '@legacy-sports/shared-components/matchup';
import {
  type MatchupFragment,
  type MatchupScoresQuery,
  MatchupStatus,
  useGetLeagueStandingsQuery,
  useGetPlayoffProjectionsQuery,
  useGetTeamMatchupHistoryQuery,
  useMatchupScoresQuery,
} from '@legacy-sports/graphql';

const KEY_PLAYERS_LIMIT = 4;
const HEAD_TO_HEAD_LIMIT = 5;

type MatchupScoreEntry = MatchupScoresQuery['matchupScores'][number];
type FootballMatchupScoreEntry = Extract<
  MatchupScoreEntry,
  { __typename?: 'FootballMatchupStats' }
>;

function isFootballMatchupStats(
  stats: MatchupScoreEntry,
): stats is FootballMatchupScoreEntry {
  return stats.__typename === 'FootballMatchupStats';
}

export interface MatchupAdditionalSectionsProps {
  matchup: MatchupFragment;
  leagueId: number;
}

/**
 * Container for the football matchup detail page's "Additional Sections"
 * area (LS-5424): fetches Key Players to Watch, Historical Head-to-Head,
 * and League Context from existing queries and hands the derived data to
 * the shared presentational component.
 */
export function MatchupAdditionalSections({
  matchup,
  leagueId,
}: MatchupAdditionalSectionsProps) {
  const team1Id = matchup.team1Id ?? null;
  const team2Id = matchup.team2Id ?? null;
  const team1Name = matchup.team1?.name ?? 'Team 1';
  const team2Name = matchup.team2?.name ?? 'Team 2';

  // weekNumber/team1Id are 1-based in this schema (0 is never a valid id or
  // week number) — the `|| 1` fallback keeps the variables well-typed without
  // ever passing 0; `skip` guarantees no request fires until the real value
  // is available, so the placeholder is never actually sent to the server.
  const { data: scoresData } = useMatchupScoresQuery({
    variables: { leagueId, weekNum: matchup.weekNumber || 1 },
    skip: !matchup.weekNumber,
  });

  const { data: historyData } = useGetTeamMatchupHistoryQuery({
    variables: {
      leagueId,
      teamId: team1Id || 1,
      limit: 50,
    },
    skip: !team1Id || !team2Id,
  });

  const { data: standingsData } = useGetLeagueStandingsQuery({
    variables: { leagueId },
  });

  // Playoff stakes only matter for a matchup still to be decided — skip the
  // query once the matchup is Completed or has no weekNumber to gate on.
  const showsPlayoffStakes =
    matchup.weekNumber != null && matchup.status !== MatchupStatus.Completed;
  const { data: playoffProjectionsData } = useGetPlayoffProjectionsQuery({
    variables: { leagueId },
    skip: !showsPlayoffStakes,
  });

  const keyPlayers = (scoresData?.matchupScores ?? [])
    .filter(isFootballMatchupStats)
    .filter((stats) => stats.teamId === team1Id || stats.teamId === team2Id)
    .flatMap((stats) =>
      stats.players.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
        position: player.position,
        teamName: stats.teamId === team1Id ? team1Name : team2Name,
        totalPoints: player.totalPoints,
      })),
    )
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, KEY_PLAYERS_LIMIT);

  const headToHead = (historyData?.getTeamMatchupHistory ?? [])
    .filter(
      (m) =>
        m.status === MatchupStatus.Completed &&
        m.id !== matchup.id &&
        ((m.team1Id === team1Id && m.team2Id === team2Id) ||
          (m.team1Id === team2Id && m.team2Id === team1Id)),
    )
    .sort((a, b) => (b.weekNumber ?? 0) - (a.weekNumber ?? 0))
    .slice(0, HEAD_TO_HEAD_LIMIT)
    .map((m) => ({
      id: m.id ?? `${m.weekNumber}`,
      weekNumber: m.weekNumber ?? null,
      team1Name: m.team1?.name ?? team1Name,
      team2Name: m.team2?.name ?? team2Name,
      team1Score: m.team1Score ?? null,
      team2Score: m.team2Score ?? null,
    }));

  const allStandings = standingsData?.getLeagueStandings ?? [];
  const standings = allStandings
    .map((standing, index) => ({ standing, rank: index + 1 }))
    .filter(
      ({ standing }) =>
        String(standing.teamId) === String(team1Id) ||
        String(standing.teamId) === String(team2Id),
    )
    .map(({ standing, rank }) => ({
      teamId: Number(standing.teamId),
      teamName: standing.teamName ?? `Team ${standing.teamId ?? ''}`,
      rank,
      wins: standing.wins ?? 0,
      losses: standing.losses ?? 0,
      ties: standing.ties ?? 0,
      pointsFor: standing.pointsFor ?? 0,
    }));

  const playoffImplications = derivePlayoffImplications(
    [
      { teamId: team1Id, teamName: team1Name },
      { teamId: team2Id, teamName: team2Name },
    ],
    playoffProjectionsData?.getPlayoffProjections ?? [],
  );

  return (
    <MatchupAdditionalSectionsView
      keyPlayers={keyPlayers}
      headToHead={headToHead}
      standings={standings}
      playoffImplications={playoffImplications}
    />
  );
}
