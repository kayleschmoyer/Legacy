import { createDefaultScoringSettings } from './baseball/ScoringSettingsLoader';
import type { ScoringSettings } from './matchup-scoring';

/** A single stat-column override within a `ScoringMultiplierGroup`. */
export interface ScoringMultiplierEntry {
  sourceColumn?: string | null;
  multiplier?: number | null;
}

/**
 * League scoring-profile multiplier overrides for one stat group
 * (batting/fielding/pitching), as returned by `leagueScoringProfile`.
 */
export interface ScoringMultiplierGroup {
  group?: string | null;
  values?: ReadonlyArray<ScoringMultiplierEntry | null> | null;
}

/**
 * Apply league scoring-profile multiplier groups on top of `base` (or the
 * league defaults, if no `base` is given), normalizing snake_case DB column
 * names (e.g. "e_def") to the camelCase keys `computeScoring` expects (e.g.
 * "eDef").
 *
 * Shared by the web `useLeagueScoringSettings` hook and the
 * `Matchup.winProbability` lambda resolver, which independently duplicated
 * this logic because the web module wasn't importable from a lambda
 * (LS-8724, originally flagged during LS-5907 review on PR #6133).
 */
export function applyMultiplierGroups(
  groups: ReadonlyArray<ScoringMultiplierGroup | null> | null | undefined,
  base?: ScoringSettings,
): ScoringSettings {
  const result: ScoringSettings = base
    ? {
        batting: { ...base.batting },
        fielding: { ...base.fielding },
        pitching: { ...base.pitching },
      }
    : createDefaultScoringSettings();

  if (!groups) {
    return result;
  }

  for (const group of groups) {
    if (!group?.group || !group.values) {
      continue;
    }

    let target: Partial<Record<string, number>> | undefined;

    switch (group.group) {
      case 'batting':
        target = result.batting;
        break;
      case 'fielding':
        target = result.fielding;
        break;
      case 'pitching':
        target = result.pitching;
        break;
      default:
        target = undefined;
    }

    if (!target) {
      continue;
    }

    for (const entry of group.values) {
      if (
        entry?.sourceColumn &&
        typeof entry.multiplier === 'number' &&
        Number.isFinite(entry.multiplier)
      ) {
        // Normalize snake_case DB column names (e.g. "e_def") to
        // camelCase keys (e.g. "eDef") so API overrides replace defaults.
        const key = entry.sourceColumn.replace(/_([a-z])/g, (_, c: string) =>
          c.toUpperCase(),
        );
        target[key] = entry.multiplier;
      }
    }
  }

  return result;
}
