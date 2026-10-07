// Premium league-creation field constants.
//
// Shared by the web (`apps/web` LeagueCreatePage) and mobile (`apps/app`
// baseball league create) screens so the option sets for era filters, FAAB
// budgets, and waiver systems stay in lockstep across platforms (LS-5174).

import {
  CUSTOM_ERA_MIN_YEAR_BY_SPORT,
  formatEraYearRange,
} from '../../../config/sports';

/** Two-sport discriminator accepted by the premium league-create controls. */
export type LeagueSport = 'baseball' | 'football';

/** Waiver system selection — standard priority order or FAAB blind bidding. */
export type WaiverType = 'standard' | 'faab';

export interface EraOption {
  id: string;
  name: string;
  years: string;
  /** When true, selecting this era requires a premium subscription. */
  premium: boolean;
}

/** Wizard-facing display name + premium gating for each era id. */
const ERA_PRESETS_BY_SPORT: Record<
  LeagueSport,
  ReadonlyArray<Omit<EraOption, 'years'>>
> = {
  baseball: [
    { id: 'all', name: 'All Eras', premium: false },
    { id: 'dead_ball', name: 'Dead Ball (pre-1920)', premium: true },
    { id: 'golden_age', name: 'Golden Age', premium: true },
    { id: 'expansion', name: 'Expansion', premium: true },
    { id: 'free_agency', name: 'Free Agency', premium: true },
    { id: 'steroid_era', name: 'Steroid Era', premium: true },
    { id: 'modern', name: 'Modern (2006+)', premium: false },
    { id: 'custom', name: 'Custom Era', premium: true },
  ],
  football: [
    { id: 'all', name: 'All Eras', premium: false },
    { id: 'pioneer', name: 'Pioneer', premium: true },
    { id: 'single_platoon', name: 'Single-Platoon', premium: true },
    { id: 'super_bowl_era', name: 'Super Bowl Era', premium: true },
    { id: 'west_coast', name: 'West Coast', premium: true },
    { id: 'salary_cap_era', name: 'Salary Cap', premium: true },
    { id: 'spread_offense', name: 'Spread Offense', premium: false },
    { id: 'custom', name: 'Custom Era', premium: true },
  ],
};

/** Years caption for an era: the canonical range, or a pseudo-era caption. */
function eraYears(sport: LeagueSport, id: string): string {
  if (id === 'all') return `${CUSTOM_ERA_MIN_YEAR_BY_SPORT[sport]} – Now`;
  if (id === 'custom') return 'Pick years';
  const years = formatEraYearRange(sport, id);
  if (!years) throw new Error(`No year range for ${sport} era "${id}"`);
  return years;
}

/**
 * Historical era presets per sport. `all` and the most-recent era are free.
 * Year captions are derived from `ERA_YEAR_RANGES_BY_SPORT` — the same table
 * the backend draft-pool filter enforces — so the wizard can never advertise
 * a range the league does not actually draft from (LS-10689).
 */
export const ERAS_BY_SPORT: Record<LeagueSport, ReadonlyArray<EraOption>> = {
  baseball: ERA_PRESETS_BY_SPORT.baseball.map((era) => ({
    ...era,
    years: eraYears('baseball', era.id),
  })),
  football: ERA_PRESETS_BY_SPORT.football.map((era) => ({
    ...era,
    years: eraYears('football', era.id),
  })),
};

/** Era ids that are available without a premium subscription, per sport. */
export const FREE_ERA_IDS_BY_SPORT: Record<LeagueSport, ReadonlySet<string>> = {
  baseball: new Set(['all', 'modern']),
  football: new Set(['all', 'spread_offense']),
};

/** Selectable FAAB starting-budget amounts (dollars per manager). */
export const FAAB_BUDGET_OPTIONS = [50, 100, 150, 200, 250, 500] as const;

/** Valid range for a custom FAAB budget amount (LS-6116). */
export const FAAB_BUDGET_MIN = 1;
export const FAAB_BUDGET_MAX = 100_000;

// Valid range for the salary cap amount (LS-8361). Kept in sync with
// MIN_SALARY_CAP / MAX_SALARY_CAP in lambdas/db/src/schema/leagues/mutations.ts
// and apps/web/src/constants/league.ts (LS-6115).
export const MIN_SALARY_CAP = 1;
export const MAX_SALARY_CAP = 1_000_000_000;

/** Waiver system options. FAAB is a premium feature. */
export const WAIVER_TYPE_OPTIONS: ReadonlyArray<{
  label: string;
  value: WaiverType;
}> = [
  { label: 'Standard', value: 'standard' },
  { label: 'FAAB  ·  Premium', value: 'faab' },
];

// Keeper cost model + roster-continuity constants (LS-8672). Kept in sync
// with KEEPER_COUNT_MIN / KEEPER_COUNT_MAX / VALID_KEEPER_COST_MODELS in
// lambdas/db/src/schema/leagues/mutations.ts (LS-8671).

/** Cost model applied to kept players. Hyphenated values match the server's
 *  validated-string convention (not a GraphQL enum — see mutations.ts). */
export type KeeperCostModel = 'round-penalty' | 'auction-budget';

export const KEEPER_COUNT_MIN = 1;
export const KEEPER_COUNT_MAX = 10;

/** Keeper cost model options, each paired with the selectionMethod it requires. */
export const KEEPER_COST_MODEL_OPTIONS: ReadonlyArray<{
  label: string;
  value: KeeperCostModel;
  requiresSelectionMethod: 'standard' | 'auction';
}> = [
  {
    label: 'Round Penalty',
    value: 'round-penalty',
    requiresSelectionMethod: 'standard',
  },
  {
    label: 'Auction Budget',
    value: 'auction-budget',
    requiresSelectionMethod: 'auction',
  },
];
