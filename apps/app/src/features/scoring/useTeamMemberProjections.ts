import { useMemo } from 'react';
import type {
  PlayerFragment,
  PlayerProjectionsResult,
} from '@legacy-sports/shared-components';
import { usePlayerProjections } from '@legacy-sports/shared-components';
import { useCareerAverageStats } from './careerAverages';
import type { TeamMemberFragment } from '../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../common/scoring';

export interface TeamMemberProjectionsResult {
  readonly projections: Record<number, number>;
  readonly loading: boolean;
  readonly error: Error | undefined;
}

function buildPlayers(
  teamMembers: ReadonlyArray<TeamMemberFragment>,
): PlayerFragment[] {
  const players: PlayerFragment[] = [];

  for (const member of teamMembers) {
    const playerId = member.playerId;
    if (typeof playerId !== 'number' || !Number.isFinite(playerId)) {
      continue;
    }

    players.push({
      __typename: 'Player',
      id: playerId,
      firstName: member.player?.firstName ?? null,
      lastName: member.player?.lastName ?? null,
      brefId: member.player?.brefId ?? null,
    });
  }

  return players;
}

function mapProjectionsToRecord(
  projections: Map<number, number>,
): Record<number, number> {
  const result: Record<number, number> = {};

  projections.forEach((value, key) => {
    if (Number.isFinite(value)) {
      result[key] = value;
    }
  });

  return result;
}

export function useTeamMemberProjections(
  teamMembers: ReadonlyArray<TeamMemberFragment>,
  leagueId: number | null | undefined,
): TeamMemberProjectionsResult {
  const players = useMemo(() => buildPlayers(teamMembers), [teamMembers]);

  const playerIds = useMemo(
    () =>
      players
        .map((player) => player.id)
        .filter((id): id is number => typeof id === 'number'),
    [players],
  );

  const {
    records: careerStats,
    loading: statsLoading,
    error: statsError,
  } = useCareerAverageStats(playerIds);

  const numericLeagueId = Number.isFinite(leagueId ?? NaN)
    ? Number(leagueId)
    : undefined;

  const {
    settings: scoringSettings,
    loading: scoringLoading,
    error: scoringError,
  } = useLeagueScoringSettings(numericLeagueId);

  const result: PlayerProjectionsResult = usePlayerProjections(
    players,
    careerStats,
    scoringSettings,
    statsLoading || scoringLoading,
    statsError ?? scoringError,
  );
  const projections = result.projections;
  const projectionsLoading = result.loading;
  const projectionError = result.error;

  const projectionRecord = useMemo(
    () => mapProjectionsToRecord(projections),
    [projections],
  );

  return {
    projections: projectionRecord,
    loading: statsLoading || scoringLoading || projectionsLoading,
    error: statsError ?? scoringError ?? projectionError,
  } as const;
}
