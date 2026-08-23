import React from 'react';
import { Card, H3, Text, XStack, YStack } from 'tamagui';

export interface KeyPlayerToWatch {
  playerId: number;
  playerName: string;
  position: string;
  teamName: string;
  totalPoints: number;
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
  /** Top fantasy-point scorers across both teams in this matchup. Empty = no stats loaded yet. */
  keyPlayers: KeyPlayerToWatch[];
  /** Prior completed meetings between the two teams this season, most recent first. */
  headToHead: HeadToHeadResult[];
  /** Current standings context for the two teams in this matchup. */
  standings: TeamStandingContext[];
  /** Playoff stakes for either team in this matchup, when this matchup's result would clinch or eliminate. Empty = no playoff implication this week. */
  playoffImplications: PlayoffImplication[];
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
 * League Context for the football matchup detail page (LS-5424). Each
 * subsection renders its own empty state when its data source has nothing
 * to show, rather than hiding the section entirely, so the page structure
 * stays predictable.
 */
export function MatchupAdditionalSections({
  keyPlayers,
  headToHead,
  standings,
  playoffImplications,
}: MatchupAdditionalSectionsProps) {
  return (
    <YStack space="$4" testID="matchup-additional-sections">
      <SectionCard title="Key Players to Watch" testId="key-players-section">
        {keyPlayers.length === 0 ? (
          <EmptyState message="No key player data available yet." />
        ) : (
          <YStack space="$2">
            {keyPlayers.map((player) => (
              <XStack
                key={player.playerId}
                justifyContent="space-between"
                alignItems="center"
              >
                <YStack>
                  <Text fontSize="$3" fontWeight="bold">
                    {player.playerName}
                  </Text>
                  <Text fontSize="$2" color="$gray11">
                    {player.position} · {player.teamName}
                  </Text>
                </YStack>
                <Text fontSize="$3" fontWeight="bold">
                  {player.totalPoints.toFixed(1)} pts
                </Text>
              </XStack>
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
