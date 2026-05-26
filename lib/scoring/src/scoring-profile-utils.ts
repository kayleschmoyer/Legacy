/**
 * Shared scoring profile utilities used by both web and mobile LeagueScoringEditor.
 *
 * Extracted from duplicated logic in:
 *  - apps/web/src/components/baseball/LeagueScoringEditor.tsx
 *  - apps/app/src/features/scoring/LeagueScoringEditor.tsx
 */

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Normalized representation of a single scoring stat for form editing.
 */
export interface ProfileStat {
  id: number;
  group: string;
  displayName: string;
  description: string | null | undefined;
  multiplier: number;
  defaultMultiplier: number;
  enforcePositive: boolean;
  enforceNegative: boolean;
  minMultiplier: number | null | undefined;
  maxMultiplier: number | null | undefined;
}

/** Maps stat-definition IDs → the current form string value. */
export type FormValueState = Record<number, string>;

/** Maps stat-definition IDs → validation error message (null = valid). */
export type FieldErrorState = Record<number, string | null>;

/**
 * Minimal shape of a scoring profile; intentionally avoids importing
 * generated GraphQL types so this module stays platform-agnostic.
 */
export interface ScoringProfileInput {
  stats?: ReadonlyArray<{
    multiplier?: number | null;
    defaultMultiplier?: number | null;
    definition?: {
      id?: number | null;
      statGroup?: string | null;
      displayName?: string | null;
      description?: string | null;
      defaultMultiplier?: number | null;
      enforcePositive?: boolean | null;
      enforceNegative?: boolean | null;
      minMultiplier?: number | null;
      maxMultiplier?: number | null;
    } | null;
  } | null> | null;
}

/** A single stat multiplier update to send to the API. */
export interface ScoringStatUpdate {
  statDefinitionId: number;
  multiplier: number;
}

/** Group metadata (title, description, accent colour). */
export interface ScoringGroupCopy {
  title: string;
  description: string;
  accent: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Canonical order of scoring stat groups for baseball leagues.
 * Values must match the `ScoringStatGroup` GraphQL enum string values.
 */
export const SCORING_GROUP_ORDER: readonly string[] = [
  'batting',
  'pitching',
  'fielding',
];

/**
 * Canonical order of scoring stat groups for football leagues (Passing → Rushing →
 * Receiving → Kicking → DST or IDP depending on defensiveFormat).
 */
export const FOOTBALL_SCORING_GROUP_ORDER: readonly string[] = [
  'passing',
  'rushing',
  'receiving',
  'kicking',
  'defense',
  'idp',
];

/**
 * Display copy for each scoring group.
 * Keys match the `ScoringStatGroup` enum string values.
 */
export const SCORING_GROUP_COPY: Record<string, ScoringGroupCopy> = {
  batting: {
    title: 'Batting',
    description: 'Home runs, RBIs, steals, and more.',
    accent: '#3B82F6',
  },
  pitching: {
    title: 'Pitching',
    description: 'Wins, strikeouts, saves, and ERA impact.',
    accent: '#22C55E',
  },
  fielding: {
    title: 'Fielding',
    description: 'Fielding bonuses and errors.',
    accent: '#F97316',
  },
  passing: {
    title: 'Passing',
    description: 'Passing yards, TDs, and interceptions.',
    accent: '#8B5CF6',
  },
  rushing: {
    title: 'Rushing',
    description: 'Rushing yards, TDs, and fumbles.',
    accent: '#14B8A6',
  },
  receiving: {
    title: 'Receiving',
    description: 'Receptions (PPR), receiving yards, and TDs.',
    accent: '#F59E0B',
  },
  kicking: {
    title: 'Kicking',
    description: 'Field goals by distance, extra points, and misses.',
    accent: '#EC4899',
  },
  defense: {
    title: 'Defense / Special Teams (D/ST)',
    description: 'Sacks, turnovers, TDs, and points-allowed bands.',
    accent: '#EF4444',
  },
  idp: {
    title: 'Individual Defensive Players (IDP)',
    description: 'Tackles, sacks, interceptions, and defensive TDs.',
    accent: '#EF4444',
  },
};

// ── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Format a numeric multiplier for display in the form input.
 * Strips trailing zeros: 1.000 → "1", 1.500 → "1.5", 1.250 → "1.25".
 */
export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

/**
 * Parse a user-entered string to a number, returning `null` for empty or
 * non-finite values.
 */
export function parseInput(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validate a single stat's form value against its constraints.
 * Returns a human-readable error string or `null` if valid.
 */
export function validateStat(
  stat: ProfileStat,
  value: string | undefined,
): string | null {
  const parsed = parseInput(value);

  if (parsed === null) {
    return 'Enter a number to apply an override';
  }

  if (stat.enforcePositive && parsed <= 0) {
    return 'Value must be greater than zero';
  }

  if (stat.enforceNegative && parsed >= 0) {
    return 'Value must be less than zero';
  }

  const min =
    typeof stat.minMultiplier === 'number' ? stat.minMultiplier : null;
  const max =
    typeof stat.maxMultiplier === 'number' ? stat.maxMultiplier : null;

  if (min !== null && !(stat.defaultMultiplier < min) && parsed < min) {
    return `Must be >= ${min}`;
  }

  if (max !== null && !(stat.defaultMultiplier > max) && parsed > max) {
    return `Must be <= ${max}`;
  }

  return null;
}

/**
 * Normalize a raw scoring profile (from the GraphQL query) into a flat
 * array of `ProfileStat` objects suitable for form editing.
 */
export function collectProfileStats(
  profile: ScoringProfileInput | null | undefined,
): ProfileStat[] {
  if (!profile?.stats) {
    return [];
  }

  const stats: ProfileStat[] = [];

  for (const raw of profile.stats) {
    if (!raw || !raw.definition) {
      continue;
    }

    const { definition } = raw;

    if (definition.id == null || definition.statGroup == null) {
      continue;
    }

    const displayName = definition.displayName ?? `Stat ${definition.id}`;
    const defaultMultiplier =
      typeof definition.defaultMultiplier === 'number'
        ? definition.defaultMultiplier
        : typeof raw.defaultMultiplier === 'number'
          ? raw.defaultMultiplier
          : typeof raw.multiplier === 'number'
            ? raw.multiplier
            : 0;
    const multiplier =
      typeof raw.multiplier === 'number' ? raw.multiplier : defaultMultiplier;

    stats.push({
      id: definition.id,
      group: definition.statGroup,
      displayName,
      description: definition.description,
      multiplier,
      defaultMultiplier,
      enforcePositive: Boolean(definition.enforcePositive),
      enforceNegative: Boolean(definition.enforceNegative),
      minMultiplier:
        typeof definition.minMultiplier === 'number'
          ? definition.minMultiplier
          : null,
      maxMultiplier:
        typeof definition.maxMultiplier === 'number'
          ? definition.maxMultiplier
          : null,
    });
  }

  return stats;
}

/**
 * Build the initial form value map from an array of `ProfileStat`.
 */
export function createInitialValues(stats: ProfileStat[]): FormValueState {
  return stats.reduce<FormValueState>((acc, stat) => {
    acc[stat.id] = formatMultiplier(stat.multiplier);
    return acc;
  }, {});
}

/**
 * Build the initial field-error map (all fields valid).
 */
export function createInitialErrors(stats: ProfileStat[]): FieldErrorState {
  const next: FieldErrorState = {};

  for (const stat of stats) {
    next[stat.id] = null;
  }

  return next;
}

/**
 * Diff the form values against the original stats and produce an array of
 * `ScoringStatUpdate` objects ready to submit to the mutation.
 */
export function valuesToUpdates(
  stats: ProfileStat[],
  values: FormValueState,
): ScoringStatUpdate[] {
  return stats
    .map((stat) => {
      const value = values[stat.id];
      const parsed = parseInput(value);

      if (parsed === null) {
        return null;
      }

      const isChanged = Math.abs(parsed - stat.multiplier) > 0.0001;

      if (!isChanged) {
        return null;
      }

      return {
        statDefinitionId: stat.id,
        multiplier: Number(parsed.toFixed(4)),
      };
    })
    .filter((update): update is ScoringStatUpdate => Boolean(update));
}

/**
 * Group an array of `ProfileStat` by their group key and sort alphabetically.
 */
export function groupStatsByGroup(
  stats: ProfileStat[],
  groupOrder: readonly string[] = SCORING_GROUP_ORDER,
): Record<string, ProfileStat[]> {
  const groups: Record<string, ProfileStat[]> = {};

  for (const group of groupOrder) {
    groups[group] = [];
  }

  for (const stat of stats) {
    if (!groupOrder.includes(stat.group)) {
      continue;
    }

    groups[stat.group].push(stat);
  }

  for (const group of groupOrder) {
    groups[group].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return groups;
}

/**
 * Check whether a stat's current multiplier differs from its default.
 */
export function isStatOverridden(stat: ProfileStat): boolean {
  return Math.abs(stat.multiplier - stat.defaultMultiplier) > 0.0001;
}

/**
 * Check whether a form value differs from the stat's persisted multiplier.
 */
export function isStatDirty(stat: ProfileStat, formValue: string): boolean {
  const parsed = parseInput(formValue);
  return parsed !== null && Math.abs(parsed - stat.multiplier) > 0.0001;
}
