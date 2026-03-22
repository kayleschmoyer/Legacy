import { useMemo } from 'react';
import type { PlayerFragment } from './PlayersApi';
import {
  createDefaultScoringSettings,
  type BaseballScoringSettings,
  type ScoringDictionary,
} from '@legacy-sports/scoring';

export type { BaseballScoringSettings } from '@legacy-sports/scoring';

export type ProjectionMap = Map<number, number>;

export interface ScoringStatRecord {
  readonly g?: number | null;
  readonly [statKey: string]: number | null | undefined;
}

export interface PlayerCareerStats {
  readonly batting: ScoringStatRecord;
  readonly fielding: ScoringStatRecord;
  readonly pitching: ScoringStatRecord;
}

export interface PlayerProjectionsResult {
  readonly projections: ProjectionMap;
  readonly loading: boolean;
  readonly error: Error | undefined;
}

interface ProjectionDependencies {
  readonly players: ReadonlyArray<PlayerFragment>;
  readonly careerStats: ReadonlyMap<number, PlayerCareerStats>;
  readonly settings: BaseballScoringSettings;
}

const DEFAULT_SETTINGS = createDefaultScoringSettings();

function resolveNumericIdentifier(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function ensureSettings(
  overrides?: Partial<BaseballScoringSettings>,
): BaseballScoringSettings {
  if (!overrides) {
    return {
      batting: { ...DEFAULT_SETTINGS.batting },
      fielding: { ...DEFAULT_SETTINGS.fielding },
      pitching: { ...DEFAULT_SETTINGS.pitching },
    };
  }

  return {
    batting: { ...DEFAULT_SETTINGS.batting, ...overrides.batting },
    fielding: { ...DEFAULT_SETTINGS.fielding, ...overrides.fielding },
    pitching: { ...DEFAULT_SETTINGS.pitching, ...overrides.pitching },
  };
}

function sumWithMultipliers(
  stats: ScoringStatRecord | undefined,
  multipliers: ScoringDictionary | undefined,
): number {
  if (!stats || !multipliers) {
    return 0;
  }

  let total = 0;

  for (const [statKey, multiplier] of Object.entries(multipliers)) {
    if (typeof multiplier !== 'number' || !Number.isFinite(multiplier)) {
      continue;
    }

    const rawValue = stats[statKey];
    if (typeof rawValue !== 'number') {
      continue;
    }

    total += rawValue * multiplier;
  }

  return total;
}

function determineGamesPlayed(stats: PlayerCareerStats): number {
  const battingGames =
    typeof stats.batting.g === 'number' ? stats.batting.g : 0;
  const fieldingGames =
    typeof stats.fielding.g === 'number' ? stats.fielding.g : 0;
  const pitchingGames =
    typeof stats.pitching.g === 'number' ? stats.pitching.g : 0;

  return Math.max(battingGames, fieldingGames, pitchingGames, 0);
}

function computeProjection(
  stats: PlayerCareerStats,
  settings: BaseballScoringSettings,
): number | undefined {
  const batting = sumWithMultipliers(stats.batting, settings.batting);
  const fielding = sumWithMultipliers(stats.fielding, settings.fielding);
  const pitching = sumWithMultipliers(stats.pitching, settings.pitching);

  const gamesPlayed = determineGamesPlayed(stats);
  const totalPoints = batting + fielding + pitching;

  if (gamesPlayed <= 0) {
    return Number.isFinite(totalPoints) ? totalPoints : undefined;
  }

  const perGame = totalPoints / gamesPlayed;
  return Number.isFinite(perGame) ? perGame : undefined;
}

function buildProjectionMap({
  players,
  careerStats,
  settings,
}: ProjectionDependencies): ProjectionMap {
  const result: ProjectionMap = new Map();

  for (const player of players) {
    const playerId = resolveNumericIdentifier(player?.id);
    if (playerId === undefined) {
      continue;
    }

    const stats = careerStats.get(playerId);
    if (!stats) {
      continue;
    }

    const projection = computeProjection(stats, settings);
    if (projection !== undefined) {
      result.set(playerId, projection);
    }
  }

  return result;
}

export function usePlayerProjections(
  players: ReadonlyArray<PlayerFragment>,
  careerStats: ReadonlyMap<number, PlayerCareerStats>,
  scoringOverrides?: Partial<BaseballScoringSettings>,
  upstreamLoading?: boolean,
  upstreamError?: Error | null,
): PlayerProjectionsResult {
  const settings = useMemo(
    () => ensureSettings(scoringOverrides),
    [scoringOverrides],
  );

  const projections = useMemo(() => {
    if (upstreamLoading || upstreamError) {
      return new Map<number, number>();
    }

    return buildProjectionMap({
      players,
      careerStats,
      settings,
    });
  }, [players, careerStats, settings, upstreamLoading, upstreamError]);

  return {
    projections,
    loading: Boolean(upstreamLoading),
    error: upstreamError ?? undefined,
  } as const;
}

export function formatProjection(
  value: number | null | undefined,
  fallback = '—',
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const absValue = Math.abs(value);
  const digits = absValue >= 10 ? 1 : 2;
  return value.toFixed(digits);
}
