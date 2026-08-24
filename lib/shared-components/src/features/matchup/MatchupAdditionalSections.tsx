import React from 'react';
import { Card, H3, Text, XStack, YStack } from 'tamagui';
import {
  type MatchupFragment,
  type MatchupScoresQuery,
  MatchupStatus,
  useGetLeagueStandingsQuery,
  useGetPlayoffProjectionsQuery,
  useGetTeamMatchupHistoryQuery,
  useMatchupScoresQuery,
} from '@legacy-sports/graphql';

const KEY_PLAYERS_PER_TEAM = 2;
const HEAD_TO_HEAD_LIMIT = 5;

export interface KeyPlayerToWatch {
  playerId: number;
  playerName: string;
  position: string;
  teamName: string;
  totalPoints: number;
  /** Short explanation of why this player is highlighted (LS-6351). */
  reasoning: string;
}

export interface HeadToHeadResult {
  id: string;
  weekNumber: number | null;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
}

export interface TeamStandingContext {
  teamId: number;
  teamName: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
}

export interface PlayoffImplication {
  teamId: number;
  teamName: string;
  /** 'clinch' = a win in this matchup clinches a playoff spot; 'eliminated' = a loss eliminates the team. */
  kind: 'clinch' | 'eliminated';
}

export interface MatchupAdditionalSectionsProps {
  matchup: MatchupFragment;
  leagueId: number;
}

const PLAYOFF_IMPLICATION_MESSAGES: Record<PlayoffImplication['kind'], string> =
  {
    clinch: 'Win to clinch playoffs',
    eliminated: 'Lose and you are eliminated',
  };

export interface PlayoffProjectionLike {
  teamId?: number | null;
  magicNumber?: number | null;
  eliminationNumber?: number | null;
}

/**
 * Derives the League Context playoff-implication banner for the two teams in
 * a matchup. A team's magicNumber of 1 means a win in any remaining matchup
 * — including this one — clinches a playoff spot; an eliminationNumber of 1
 * means a loss eliminates them. Both are only ever 1 near the actual playoff
 * cutoff, so this naturally gates the banner to weeks where it's actionable.
 */
export function derivePlayoffImplications(
  teams: Array<{ teamId: number | null | undefined; teamName: string }>,
  projections: PlayoffProjectionLike[],
): PlayoffImplication[] {
  const projectionsByTeamId = new Map(
    projections.map((projection) => [projection.teamId, projection]),
  );
  return teams.flatMap(({ teamId, teamName }): PlayoffImplication[] => {
    const projection = teamId != null ? projectionsByTeamId.get(teamId) : null;
    if (!projection || teamId == null) return [];
    if (projection.magicNumber === 1) {
      return [{ teamId, teamName, kind: 'clinch' }];
    }
    if (projection.eliminationNumber === 1) {
      return [{ teamId, teamName, kind: 'eliminated' }];
    }
    return [];
  });
}

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

/**
 * Highest-scoring player for a team gets "top scorer"; the runner-up gets
 * "second-highest scorer" — there is no per-matchup projection field in the
 * schema (only a season-level one on `FootballPlayer`), so this reasoning is
 * based on actual points scored this week rather than a projection.
 */
function buildReasoning(teamName: string, rankWithinTeam: number): string {
  return rankWithinTeam === 1
    ? `${teamName}'s top scorer this week`
    : `${teamName}'s second-highest scorer this week`;
}

function keyPlayersForTeam(
  scores: readonly FootballMatchupScoreEntry[],
  teamId: number | null,
  teamName: string,
): KeyPlayerToWatch[] {
  if (teamId == null) return [];
  return scores
    .filter((stats) => stats.teamId === teamId)
    .flatMap((stats) => stats.players)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, KEY_PLAYERS_PER_TEAM)
    .map((player, index) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      teamName,
      totalPoints: player.totalPoints,
      reasoning: buildReasoning(teamName, index + 1),
    }));
}

function SectionCard({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      bordered
      backgroundColor="$background"
      borderRadius="$4"
      padding="$4"
      testID={testId}
    >
      <H3 fontSize="$5" marginBottom="$2">
        {title}
      </H3>
      {children}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Text fontSize="$3" color="$gray11">
      {message}
    </Text>
  );
}

/**
 * Additional Sections — Key Players to Watch, Historical Head-to-Head, and
 * League Context for the football matchup detail page (LS-5424, LS-6351).
 * Self-contained: fetches its own data via GraphQL so both `apps/web` and
 * `apps/app` can render it from just `matchup` + `leagueId`. Each subsection
 * renders its own empty state when its data source has nothing to show,
 * rather than hiding the section entirely, so the page structure stays
 * predictable.
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

  const footballScores = (scoresData?.matchupScores ?? []).filter(
    isFootballMatchupStats,
  );
  const keyPlayers = [
    ...keyPlayersForTeam(footballScores, team1Id, team1Name),
    ...keyPlayersForTeam(footballScores, team2Id, team2Name),
  ];

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
      // 0 is never a real team id in this schema — it only appears here if
      // the GraphQL ID is missing/non-numeric, and is used only as a React
      // `key` for this row, not for any lookup, so it's a safe placeholder.
      teamId:
        standing.teamId && !Number.isNaN(Number(standing.teamId))
          ? Number(standing.teamId)
          : 0,
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
    <YStack space="$4" testID="matchup-additional-sections">
      <SectionCard title="Key Players to Watch" testId="key-players-section">
        {keyPlayers.length === 0 ? (
          <EmptyState message="No key player data available yet." />
        ) : (
          <YStack space="$3">
            {keyPlayers.map((player) => (
              <YStack key={player.playerId}>
                <XStack justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontSize="$3" fontWeight="bold">
                      {player.playerName ?? 'Unknown Player'}
                    </Text>
                    <Text fontSize="$2" color="$gray11">
                      {player.position ?? '—'} · {player.teamName}
                    </Text>
                  </YStack>
                  <Text fontSize="$3" fontWeight="bold">
                    {(player.totalPoints ?? 0).toFixed(1)} pts
                  </Text>
                </XStack>
                <Text fontSize="$1" color="$gray9" marginTop="$1">
                  {player.reasoning}
                </Text>
              </YStack>
            ))}
          </YStack>
        )}
      </SectionCard>

      <SectionCard
        title="Historical Head-to-Head"
        testId="matchup-history-section"
      >
        {headToHead.length === 0 ? (
          <EmptyState message="No previous meetings this season." />
        ) : (
          <YStack space="$2">
            {headToHead.map((meeting) => (
              <XStack
                key={meeting.id}
                justifyContent="space-between"
                alignItems="center"
              >
                <Text fontSize="$3" color="$gray11">
                  {meeting.weekNumber != null
                    ? `Week ${meeting.weekNumber}`
                    : '—'}
                </Text>
                <Text fontSize="$3">
                  {meeting.team1Name} {meeting.team1Score?.toFixed(1) ?? '—'} –{' '}
                  {meeting.team2Score?.toFixed(1) ?? '—'} {meeting.team2Name}
                </Text>
              </XStack>
            ))}
          </YStack>
        )}
      </SectionCard>

      <SectionCard title="League Context" testId="league-context-section">
        {playoffImplications.length > 0 ? (
          <YStack space="$2" marginBottom="$2">
            {playoffImplications.map((implication) => (
              <XStack
                key={implication.teamId}
                testID={`playoff-implication-banner-${implication.teamId}`}
                backgroundColor={
                  implication.kind === 'clinch' ? '$green3' : '$red3'
                }
                borderRadius="$3"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignItems="center"
                justifyContent="space-between"
              >
                <Text fontSize="$3" fontWeight="bold">
                  {implication.teamName}
                </Text>
                <Text
                  fontSize="$3"
                  fontWeight="bold"
                  color={implication.kind === 'clinch' ? '$green11' : '$red11'}
                >
                  {PLAYOFF_IMPLICATION_MESSAGES[implication.kind]}
                </Text>
              </XStack>
            ))}
          </YStack>
        ) : null}
        {standings.length === 0 ? (
          <EmptyState message="Standings not yet available." />
        ) : (
          <YStack space="$2">
            {standings.map((standing) => (
              <XStack
                key={standing.teamId}
                justifyContent="space-between"
                alignItems="center"
              >
                <Text fontSize="$3" fontWeight="bold">
                  {standing.teamName}
                </Text>
                <Text fontSize="$3" color="$gray11">
                  #{standing.rank} · {standing.wins}-{standing.losses}-
                  {standing.ties} · {standing.pointsFor.toFixed(1)} PF
                </Text>
              </XStack>
            ))}
          </YStack>
        )}
      </SectionCard>
    </YStack>
  );
}
