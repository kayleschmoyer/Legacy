import { useMemo } from 'react';
import type {
  PlayerFragment,
  ProjectionMap,
} from '@legacy-sports/shared-components';
import { usePlayerProjections } from '@legacy-sports/shared-components';
import type { AppTeamMemberFragment } from '@legacy-sports/graphql';
import { useCareerAverageStats } from './careerAverages';
import {
  type ScoringSettings,
  useLeagueScoringSettings,
} from '../../common/scoring';

/**
 * How often to re-check the league's scoring format while a lineup screen
 * is mounted, so a commissioner changing PPR -> Standard (etc.) mid-season
 * is picked up without requiring the manager to leave and re-enter the
 * screen. Balances staleness risk against unnecessary network chatter.
 */
const SCORING_FORMAT_POLL_INTERVAL_MS = 30_000;

export interface TeamMemberProjectionsResult {
  readonly projections: Record<number, number>;
  /**
   * Identifies the scoring format `projections` were computed under —
   * the profile name plus a stable hash of its multipliers. Changes
   * whenever the underlying scoring settings change, so a consumer (or a
   * test) can detect that projections came from a stale format.
   */
  readonly scoringFormatVersion: string;
  readonly loading: boolean;
  readonly error: Error | undefined;
  /** Forces an immediate re-check of the league's scoring format. */
  readonly refetchScoringFormat: () => Promise<unknown>;
}

function stableStringify(value: ScoringSettings): string {
  const sortGroup = (group: Partial<Record<string, number>>): string =>
    Object.keys(group)
      .sort()
      .map((key) => `${key}:${group[key]}`)
      .join(',');

  return [
    `batting[${sortGroup(value.batting)}]`,
    `fielding[${sortGroup(value.fielding)}]`,
    `pitching[${sortGroup(value.pitching)}]`,
  ].join('|');
}

function computeScoringFormatVersion(
  profileName: string,
  settings: ScoringSettings,
): string {
  return `${profileName}::${stableStringify(settings)}`;
}

function buildPlayers(
  teamMembers: ReadonlyArray<AppTeamMemberFragment>,
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
  projections: ProjectionMap,
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
  teamMembers: ReadonlyArray<AppTeamMemberFragment>,
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
    profileName: scoringProfileName,
    loading: scoringLoading,
    error: scoringError,
    refetch: refetchScoringFormat,
  } = useLeagueScoringSettings(numericLeagueId, {
    pollInterval: SCORING_FORMAT_POLL_INTERVAL_MS,
  });

  const {
    projections,
    loading: projectionsLoading,
    error: projectionError,
  } = usePlayerProjections(
    players,
    careerStats,
    scoringSettings,
    statsLoading || scoringLoading,
    statsError ?? scoringError,
  );

  const projectionRecord = useMemo(
    () => mapProjectionsToRecord(projections),
    [projections],
  );

  const scoringFormatVersion = useMemo(
    () => computeScoringFormatVersion(scoringProfileName, scoringSettings),
    [scoringProfileName, scoringSettings],
  );

  return {
    projections: projectionRecord,
    scoringFormatVersion,
    loading: statsLoading || scoringLoading || projectionsLoading,
    error: statsError ?? scoringError ?? projectionError,
    refetchScoringFormat,
  } as const;
}
