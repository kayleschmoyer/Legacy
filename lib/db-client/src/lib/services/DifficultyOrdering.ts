/**
 * DifficultyOrdering — Progressive Disclosure Minigame (LS-2110)
 *
 * Standalone utility for ordering a player's fact pool before a session starts.
 *
 * Guarantees:
 *  1. When available, the first clue is from the VAGUE tier
 *  2. When available, final clues are from the IDENTIFYING tier (most name-specific)
 *  3. Within each tier, order is randomised per session so repeat plays feel fresh
 *
 * Also provides OBFUSCATION_CONFIG: per-category rules intended for use by the
 * seed script when building clue text. Centralising them here makes them
 * unit-testable and easy to tune without touching the seed logic.
 */

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type DifficultyTier = 'vague' | 'moderate' | 'identifying';
export type FactCategory =
  | 'career_stat'
  | 'season_stat'
  | 'award'
  | 'team_history'
  | 'transaction'
  | 'achievement';

export interface OrderableFact {
  id: number;
  difficultyTier: DifficultyTier;
  category: FactCategory;
  /**
   * Stable key used by seeding logic to produce a deterministic default order.
   * Note: `orderFactsByDifficulty()` randomises intra-tier order and does NOT
   * consult this field — the randomisation is intentional so repeat plays feel
   * fresh. `sortOrder` is only meaningful to the seed script / data pipeline.
   */
  sortOrder: number;
}

// ──────────────────────────────────────────────────────────────
// Tier ordering
// ──────────────────────────────────────────────────────────────

/**
 * Canonical numeric order for difficulty tiers.
 * Lower value = revealed earlier in a session.
 */
export const TIER_NUMERIC_ORDER: Record<DifficultyTier, number> = {
  vague: 1,
  moderate: 2,
  identifying: 3,
};

/**
 * Ordered list of tiers from least to most identifying.
 * Used to iterate tier groups in a guaranteed sequence.
 */
export const TIER_SEQUENCE: ReadonlyArray<DifficultyTier> = [
  'vague',
  'moderate',
  'identifying',
];

// ──────────────────────────────────────────────────────────────
// Obfuscation config
// ──────────────────────────────────────────────────────────────

/**
 * Per-category obfuscation rules used by the seed script when constructing
 * clue text. Centralising these here makes them unit-testable and decoupled
 * from the raw DB query logic.
 *
 * Each entry describes HOW values are obfuscated for that category's tier.
 * These are documentation-as-code: the actual string templates are built
 * in the seed script using these thresholds.
 */
export interface ObfuscationRule {
  /** Human-readable description of what makes this vague / identifying */
  description: string;
  /**
   * Threshold-based tier assignment.
   * The seed script compares the raw stat value against these to pick a tier.
   * Tiers are checked in order; first match wins.
   */
  tiers: ReadonlyArray<{
    tier: DifficultyTier;
    /** Minimum value (inclusive) for this tier; null = no lower bound */
    minValue: number | null;
  }>;
}

/**
 * Obfuscation configuration keyed by fact category.
 *
 * Intended for use by seeding logic and unit tests to calibrate clue
 * specificity. When the seed script reads from this config, changes here
 * automatically propagate to generated clue text and tests.
 */
export const OBFUSCATION_CONFIG: Readonly<
  Partial<Record<FactCategory, ObfuscationRule>>
> = {
  career_stat: {
    description:
      'Career counting stats (HR, H, RBI, W, SO, SV). ' +
      'Low totals = vague; elite milestones = identifying.',
    tiers: [
      { tier: 'identifying', minValue: 400 }, // Iconic / elite career total (e.g. 400+ HR)
      { tier: 'moderate', minValue: 200 },
      { tier: 'vague', minValue: null },
    ],
  },
  season_stat: {
    description:
      'Single-season performance clues. ' +
      'Extreme seasons (60+ HR, .380+ AVG) = identifying.',
    tiers: [
      { tier: 'identifying', minValue: 60 }, // 60+ HR or equivalent extreme
      { tier: 'moderate', minValue: 30 },
      { tier: 'vague', minValue: null },
    ],
  },
  award: {
    description: 'MVP, Cy Young, etc. Multiple awards = identifying.',
    tiers: [
      { tier: 'identifying', minValue: 2 }, // 2+ of same award = defining
      { tier: 'moderate', minValue: 1 },
      { tier: 'vague', minValue: null },
    ],
  },
  achievement: {
    description:
      'All-Star selections, Gold Gloves, Silver Sluggers, HoF, ROY. ' +
      'High counts = identifying.',
    tiers: [
      { tier: 'identifying', minValue: 10 }, // 10+ All-Stars etc.
      { tier: 'moderate', minValue: 3 },
      { tier: 'vague', minValue: null },
    ],
  },
  team_history: {
    description: 'Seasons with a team. Long tenure = more identifying.',
    tiers: [
      { tier: 'identifying', minValue: 8 },
      { tier: 'moderate', minValue: 2 },
      { tier: 'vague', minValue: null },
    ],
  },
};

/**
 * Assign a difficulty tier based on a numeric stat value and an obfuscation rule.
 * Returns 'vague' when no rule is found or no threshold matches.
 */
export function assignTierFromValue(
  category: FactCategory,
  value: number,
): DifficultyTier {
  const rule = OBFUSCATION_CONFIG[category];
  if (!rule) return 'vague';

  for (const { tier, minValue } of rule.tiers) {
    if (minValue === null || value >= minValue) {
      return tier;
    }
  }
  return 'vague';
}

/**
 * Bucket a numeric value into a human-readable range string.
 * Used to obfuscate exact values in vague-tier clues.
 *
 * e.g. bucketValue(10, 52.3) → "between 50 and 60"
 *      bucketValue(100, 523)  → "between 500 and 600"
 *
 * @param bucketSize The bucket width (e.g. 10 for WAR, 100 for career H)
 * @param value The exact numeric value to bucket
 */
export function bucketValue(bucketSize: number, value: number): string {
  if (bucketSize <= 0) throw new Error('bucketSize must be positive');
  const lo = Math.floor(value / bucketSize) * bucketSize;
  const hi = lo + bucketSize;
  return `between ${lo} and ${hi}`;
}

// ──────────────────────────────────────────────────────────────
// Ordering algorithm
// ──────────────────────────────────────────────────────────────

/**
 * Fisher-Yates in-place shuffle.
 * Operates on a copy — does NOT mutate the input array.
 */
export function shuffle<T>(items: ReadonlyArray<T>): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Order a player's facts for a game session:
 *  1. Group facts by difficulty tier
 *  2. Within each tier, shuffle randomly (Fisher-Yates)
 *  3. Concatenate groups: vague → moderate → identifying
 *
 * Guarantees:
 *  - `result[0].difficultyTier === 'vague'` (when any vague facts exist)
 *  - `result[result.length - 1].difficultyTier === 'identifying'` (when any identifying facts exist)
 *  - All facts from the input are present in the output (no facts dropped)
 *
 * @param facts The full fact pool for a player
 * @returns A new array ordered for session disclosure
 */
export function orderFactsByDifficulty<T extends OrderableFact>(
  facts: ReadonlyArray<T>,
): T[] {
  if (facts.length === 0) return [];

  const byTier: Record<DifficultyTier, T[]> = {
    vague: [],
    moderate: [],
    identifying: [],
  };

  for (const fact of facts) {
    const tierBucket = byTier[fact.difficultyTier];
    if (!tierBucket) {
      throw new Error(
        `orderFactsByDifficulty: unknown difficultyTier '${fact.difficultyTier}' for fact id ${fact.id}`,
      );
    }
    tierBucket.push(fact);
  }

  const result: T[] = [];
  for (const tier of TIER_SEQUENCE) {
    result.push(...shuffle(byTier[tier]));
  }
  return result;
}
