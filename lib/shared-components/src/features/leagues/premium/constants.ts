// Premium league-creation field constants.
//
// Shared by the web (`apps/web` LeagueCreatePage) and mobile (`apps/app`
// baseball league create) screens so the option sets for era filters, FAAB
// budgets, and waiver systems stay in lockstep across platforms (LS-5174).

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

/** Historical era presets per sport. `all` and the most-recent era are free. */
export const ERAS_BY_SPORT: Record<LeagueSport, ReadonlyArray<EraOption>> = {
  baseball: [
    { id: 'all', name: 'All Eras', years: '1871 – Now', premium: false },
    {
      id: 'dead_ball',
      name: 'Dead Ball (pre-1920)',
      years: '1901 – 1919',
      premium: true,
    },
    {
      id: 'golden_age',
      name: 'Golden Age',
      years: '1920 – 1945',
      premium: true,
    },
    { id: 'expansion', name: 'Expansion', years: '1946 – 1968', premium: true },
    {
      id: 'free_agency',
      name: 'Free Agency',
      years: '1969 – 1993',
      premium: true,
    },
    {
      id: 'steroid_era',
      name: 'Steroid Era',
      years: '1994 – 2005',
      premium: true,
    },
    {
      id: 'modern',
      name: 'Modern (2006+)',
      years: '2006 – Now',
      premium: false,
    },
    { id: 'custom', name: 'Custom Era', years: 'Pick years', premium: true },
  ],
  football: [
    { id: 'all', name: 'All Eras', years: '1920 – Now', premium: false },
    { id: 'pioneer', name: 'Pioneer', years: '1920 – 1945', premium: true },
    {
      id: 'single_platoon',
      name: 'Single-Platoon',
      years: '1946 – 1959',
      premium: true,
    },
    {
      id: 'super_bowl',
      name: 'Super Bowl Era',
      years: '1960 – 1977',
      premium: true,
    },
    {
      id: 'west_coast',
      name: 'West Coast',
      years: '1978 – 1993',
      premium: true,
    },
    {
      id: 'salary_cap',
      name: 'Salary Cap',
      years: '1994 – 2010',
      premium: true,
    },
    {
      id: 'spread_offense',
      name: 'Spread Offense',
      years: '2011 – Now',
      premium: false,
    },
    { id: 'custom', name: 'Custom Era', years: 'Pick years', premium: true },
  ],
};

/** Era ids that are available without a premium subscription, per sport. */
export const FREE_ERA_IDS_BY_SPORT: Record<LeagueSport, ReadonlySet<string>> = {
  baseball: new Set(['all', 'modern']),
  football: new Set(['all', 'spread_offense']),
};

/** Selectable FAAB starting-budget amounts (dollars per manager). */
export const FAAB_BUDGET_OPTIONS = [50, 100, 150, 200, 250, 500] as const;

/** Waiver system options. FAAB is a premium feature. */
export const WAIVER_TYPE_OPTIONS: ReadonlyArray<{
  label: string;
  value: WaiverType;
}> = [
  { label: 'Standard', value: 'standard' },
  { label: 'FAAB  ·  Premium', value: 'faab' },
];
