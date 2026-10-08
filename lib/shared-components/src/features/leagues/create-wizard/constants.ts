// Shape, option sets, and ranges for the "Line-score Wizard" league-create
// flow (LS-8809). Kept separate from the components so the per-step validation
// rules in `validation.ts` can be unit-tested without rendering anything.

import {
  FOOTBALL_DST_DATA_AVAILABLE,
  MIN_TEAMS_PER_DIVISION,
  validDivisionCounts,
} from '@legacy-sports/utils';
import type { WaiverType } from '../premium/constants';

/** Two-sport discriminator for the wizard. Mirrors `LeagueSport`. */
export type WizardSport = 'baseball' | 'football';

export type SchedulingStrategy = 'divisional' | 'round-robin' | 'random';
export type DraftMode = 'live' | 'automated';
export type SelectionMethod = 'standard' | 'auction' | 'random';
export type DraftOrder = 'snake' | 'linear';
export type ScoringFormat = 'standard' | 'half_ppr' | 'ppr';
export type DefensiveFormatChoice = 'dst' | 'idp';

/**
 * The whole wizard's state in one object, held at the wizard root so values
 * survive forward/back navigation between steps. Extends the shape the
 * pre-wizard mobile form used with the five web-parity fields this ticket
 * adds: `numberOfDivisions`, `isPublic`, `schedulingStrategy`,
 * `baseballHofOnly`, and `auctionBudget`/`auctionMinBid`.
 */
export interface LeagueCreateWizardForm {
  leagueName: string;
  numberOfTeams: number;
  numberOfDivisions: number;
  isPublic: boolean;
  schedulingStrategy: SchedulingStrategy;
  maxRosterSize: number;
  /**
   * Per-position roster slot counts (football only; empty for baseball).
   * `maxRosterSize` is always kept as the derived sum — see
   * `applyWizardFieldChange` — so this is the composition, not an
   * independent value to validate on its own (LS-6146).
   */
  rosterSlots: Record<string, number>;
  playerPool: string;
  draftMode: DraftMode;
  selectionMethod: SelectionMethod;
  draftOrder: DraftOrder;
  draftDate?: Date;
  auctionBudget: number;
  auctionMinBid: number;
  /** Premium (LS-8675): hidden and coerced false for auction leagues. */
  allowDraftSlotTrading: boolean;
  baseballEraFilter: string;
  customEraStartYear?: number;
  customEraEndYear?: number;
  baseballHofOnly: boolean;
  waiverType: WaiverType;
  faabBudgetDefault: number;
  salaryCapEnabled: boolean;
  salaryCap?: number;
  scoringFormat: ScoringFormat;
  defensiveFormat: DefensiveFormatChoice;
}

// ── Steps ────────────────────────────────────────────────────────────────────

export const WIZARD_STEPS = [
  { id: 'basics', label: 'BASICS' },
  { id: 'roster', label: 'ROSTER' },
  { id: 'draft', label: 'DRAFT' },
  { id: 'rules', label: 'RULES' },
  { id: 'review', label: 'REVIEW' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

/** Full title for each step, used by the review-card headers. */
export const WIZARD_STEP_TITLES: Record<WizardStepId, string> = {
  basics: 'BASICS',
  roster: 'ROSTER & SCHEDULE',
  draft: 'DRAFT',
  rules: 'RULES',
  review: 'REVIEW',
};

// ── Field ranges ─────────────────────────────────────────────────────────────

export const LEAGUE_NAME_MIN_LENGTH = 3;
export const LEAGUE_NAME_MAX_LENGTH = 50;

/** Matches `FREE_LEAGUE_LIMIT` in `apps/web/src/constants/league.ts` (LS-6133). */
export const FREE_LEAGUE_LIMIT = 3;

export const TEAM_COUNT_MIN = 4;
export const TEAM_COUNT_MAX = 16;

/**
 * Auction ranges and defaults. Values match the web league-create form
 * (`apps/web/src/pages/baseball/LeagueCreatePage.tsx`, CLB-027 upper bound);
 * this module is the shared home so future consumers stop re-declaring them.
 */
export const AUCTION_BUDGET_RANGE = { min: 1, max: 10_000 } as const;
export const AUCTION_MIN_BID_RANGE = { min: 1, max: 10_000 } as const;
export const DEFAULT_AUCTION_BUDGET = 200;
export const DEFAULT_AUCTION_MIN_BID = 1;

/** Roster bounds per sport — same values the web form validates against. */
export const ROSTER_RANGE_BY_SPORT: Record<
  WizardSport,
  { min: number; max: number }
> = {
  baseball: { min: 15, max: 50 },
  football: { min: 10, max: 25 },
};

// ── Option sets ──────────────────────────────────────────────────────────────

export const TEAM_COUNT_OPTIONS_BY_SPORT: Record<
  WizardSport,
  readonly number[]
> = {
  baseball: [4, 6, 8, 10, 12, 14, 16],
  football: [4, 6, 8, 10, 12, 14, 16],
};

export const ROSTER_SIZE_OPTIONS_BY_SPORT: Record<
  WizardSport,
  readonly number[]
> = {
  baseball: [20, 22, 25, 30, 35, 40],
  football: [13, 14, 15, 16, 17, 18],
};

export const DIVISION_COUNT_OPTIONS = [1, 2, 3, 4] as const;

/**
 * Per-position roster slots for football, keyed by defensive format —
 * mirrors the position set the server seeds via
 * `DEFAULT_ROSTER_POSITIONS_BY_SPORT` (`lambdas/db/src/schema/leagues/mutations.ts`)
 * and the labels used by the web wizard's own roster step
 * (`apps/web/src/components/leagues/wizard/StepRosterSettings.tsx`).
 *
 * The server does not yet accept a per-slot breakdown on
 * `CreateLeagueAndTeamsInput` (tracked separately as LS-6145) — only the
 * derived `maxRosterSize` sum is sent. This still resolves the gap this
 * wizard has today (LS-6146): no way at all to express "3 WRs, not 2".
 */
export const FOOTBALL_ROSTER_SLOT_LABELS: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running Back',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  FLEX: 'Flex (RB/WR/TE)',
  K: 'Kicker',
  DST: 'Team D/ST',
  DL: 'Defensive Line',
  LB: 'Linebacker',
  DB: 'Defensive Back',
  BN: 'Bench',
  SFLEX: 'Superflex (QB/RB/WR/TE)',
  KP: 'Kicker/Punter',
};

/**
 * Premium-gated roster slot types (LS-9108, inherited from LS-6151): Superflex
 * and a combined Kicker/Punter slot. Deliberately excluded from
 * `FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT` / `..._DEFAULTS_BY_...` above —
 * those two stay the ungated base slot set so non-premium behavior is
 * unchanged (AC3) — `RosterPositionsEditor` renders these as an additional,
 * separately-gated section.
 *
 * `SFLEX` already exists end-to-end on the server (`position_slot` enum);
 * `KP` is a placeholder key for the DB enum value LS-9107 has not added yet —
 * reconcile against the real value once LS-9107 merges.
 */
export const PREMIUM_FOOTBALL_ROSTER_SLOTS = ['SFLEX', 'KP'] as const;

export type PremiumFootballRosterSlot =
  (typeof PREMIUM_FOOTBALL_ROSTER_SLOTS)[number];

export const FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT: Record<
  DefensiveFormatChoice,
  readonly string[]
> = {
  dst: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BN'],
  idp: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DL', 'LB', 'DB', 'BN'],
};

/** Sums to 16 for `dst` — matches `DEFAULT_ROSTER_BY_SPORT.football` below. */
export const FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT: Record<
  DefensiveFormatChoice,
  Record<string, number>
> = {
  dst: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 7 },
  idp: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    FLEX: 1,
    K: 1,
    DL: 2,
    LB: 2,
    DB: 2,
    BN: 6,
  },
};

export function sumRosterSlots(rosterSlots: Record<string, number>): number {
  return Object.values(rosterSlots).reduce((sum, count) => sum + count, 0);
}

export const PLAYER_POOL_OPTIONS_BY_SPORT: Record<
  WizardSport,
  ReadonlyArray<{ label: string; value: string }>
> = {
  baseball: [
    { label: 'All MLB', value: 'all' },
    { label: 'NL Only', value: 'nl' },
    { label: 'AL Only', value: 'al' },
  ],
  football: [
    { label: 'All NFL', value: 'all' },
    { label: 'AFC', value: 'afc' },
    { label: 'NFC', value: 'nfc' },
  ],
};

export const SCHEDULING_STRATEGY_OPTIONS: ReadonlyArray<{
  label: string;
  value: SchedulingStrategy;
}> = [
  { label: 'Divisional', value: 'divisional' },
  { label: 'Round-Robin', value: 'round-robin' },
  { label: 'Random', value: 'random' },
];

export const DRAFT_MODE_OPTIONS: ReadonlyArray<{
  label: string;
  value: DraftMode;
}> = [
  { label: 'Live', value: 'live' },
  { label: 'Automated', value: 'automated' },
];

/**
 * Football has no documented "random" league format (LS-6128 / CLF-009) — the
 * server-accepted `'random'` selection method is real but relabeled per sport
 * so the football wizard doesn't imply it's a standard draft type.
 */
export const SELECTION_METHOD_OPTIONS_BY_SPORT: Record<
  WizardSport,
  ReadonlyArray<{ label: string; value: SelectionMethod }>
> = {
  baseball: [
    { label: 'Standard', value: 'standard' },
    { label: 'Auction', value: 'auction' },
    { label: 'Random', value: 'random' },
  ],
  football: [
    { label: 'Standard', value: 'standard' },
    { label: 'Auction', value: 'auction' },
    { label: 'Auto-Draft (Random)', value: 'random' },
  ],
};

export const DRAFT_ORDER_OPTIONS: ReadonlyArray<{
  label: string;
  value: DraftOrder;
}> = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
];

export const SCORING_FORMAT_OPTIONS: ReadonlyArray<{
  label: string;
  value: ScoringFormat;
}> = [
  { label: 'Standard', value: 'standard' },
  { label: 'Half-PPR', value: 'half_ppr' },
  { label: 'PPR', value: 'ppr' },
];

export const DEFENSIVE_FORMAT_OPTIONS: ReadonlyArray<{
  label: string;
  value: DefensiveFormatChoice;
}> = (
  [
    { label: 'D/ST', value: 'dst' },
    { label: 'IDP', value: 'idp' },
  ] as const
).filter(
  // D/ST is hidden while no team-defense players exist (LS-10727): its
  // required DST slot could never be filled, and the server rejects it.
  (option) => option.value !== 'dst' || FOOTBALL_DST_DATA_AVAILABLE,
);

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TEAM_COUNT = 12;
/** Matches `DEFAULT_NUM_DIVISIONS` in `apps/web/src/constants/league.ts`. */
export const DEFAULT_NUM_DIVISIONS = 2;
const DEFAULT_ROSTER_BY_SPORT: Record<WizardSport, number> = {
  baseball: 25,
  football: 16,
};

/** Draft date defaults to a week out, matching the pre-wizard form. */
const DEFAULT_DRAFT_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

export function createInitialWizardForm(
  sport: WizardSport,
  leagueName = '',
  now: Date = new Date(),
): LeagueCreateWizardForm {
  const rosterSlots =
    sport === 'football'
      ? { ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst }
      : {};
  return {
    leagueName: leagueName.trim().slice(0, LEAGUE_NAME_MAX_LENGTH),
    numberOfTeams: DEFAULT_TEAM_COUNT,
    numberOfDivisions: DEFAULT_NUM_DIVISIONS,
    isPublic: false,
    schedulingStrategy: 'divisional',
    maxRosterSize:
      sport === 'football'
        ? sumRosterSlots(rosterSlots)
        : DEFAULT_ROSTER_BY_SPORT[sport],
    rosterSlots,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    draftDate: new Date(now.getTime() + DEFAULT_DRAFT_LEAD_MS),
    auctionBudget: DEFAULT_AUCTION_BUDGET,
    auctionMinBid: DEFAULT_AUCTION_MIN_BID,
    allowDraftSlotTrading: false,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    salaryCapEnabled: false,
    scoringFormat: 'ppr',
    // 'idp' rather than 'dst' (LS-9475): career_football_defense is empty,
    // so a 'dst' league's DST roster slot could never be filled. 'dst' is
    // only offered once FOOTBALL_DST_DATA_AVAILABLE is on (LS-10727).
    defensiveFormat: 'idp',
  };
}

// ── Divisions parity (web parity rule) ───────────────────────────────────────

/**
 * Division counts selectable for a given team count. A division needs at least
 * `MIN_TEAMS_PER_DIVISION` teams, an odd team count cannot pair with an even
 * division count (equal distribution), and a single division is always valid.
 * Counts outside this set render disabled rather than being hidden, so the
 * constraint is visible. Shared with the server (`@legacy-sports/utils`).
 */
export function validDivisionOptions(numberOfTeams: number): number[] {
  return validDivisionCounts(numberOfTeams);
}

/**
 * Snap a division count onto the nearest valid option after a team-count
 * change. Mirrors the web auto-reset (LS-6060): pick the nearest same-parity
 * option rather than hardcoding 1, so a 4-division league dropping from 16 to
 * 14 teams keeps 4 instead of collapsing.
 */
export function reconcileDivisions(
  numberOfDivisions: number,
  numberOfTeams: number,
): number {
  const options = validDivisionOptions(numberOfTeams);
  if (options.includes(numberOfDivisions)) return numberOfDivisions;
  return options.reduce(
    (nearest, d) =>
      Math.abs(d - numberOfDivisions) < Math.abs(nearest - numberOfDivisions)
        ? d
        : nearest,
    options[0] ?? 1,
  );
}

/**
 * Apply one field change plus every cross-field rule the web form enforces:
 * divisions snap to the new team parity, an automated draft forces Random
 * selection, an auction league can't carry draft-slot trading (LS-8675), and a
 * single division rules out the Divisional schedule (it would be identical to
 * Round-Robin).
 */
export function applyWizardFieldChange<K extends keyof LeagueCreateWizardForm>(
  form: LeagueCreateWizardForm,
  field: K,
  value: LeagueCreateWizardForm[K],
): LeagueCreateWizardForm {
  const next: LeagueCreateWizardForm = { ...form, [field]: value };

  if (field === 'numberOfTeams') {
    next.numberOfDivisions = reconcileDivisions(
      form.numberOfDivisions,
      next.numberOfTeams,
    );
  }
  if (field === 'rosterSlots') {
    next.maxRosterSize = sumRosterSlots(next.rosterSlots);
  }
  if (field === 'defensiveFormat') {
    // The roster step's slot picker depends on this choice — reset to that
    // format's defaults rather than leaving stale slot keys (e.g. a leftover
    // `DST` count after switching to IDP) behind.
    const defaults =
      FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT[next.defensiveFormat];
    next.rosterSlots = { ...defaults };
    next.maxRosterSize = sumRosterSlots(defaults);
  }
  if (field === 'draftMode' && next.draftMode === 'automated') {
    next.selectionMethod = 'random';
  }
  if (next.selectionMethod === 'auction' && next.allowDraftSlotTrading) {
    next.allowDraftSlotTrading = false;
  }
  if (
    next.numberOfDivisions === 1 &&
    next.schedulingStrategy === 'divisional'
  ) {
    next.schedulingStrategy = 'round-robin';
  }
  return next;
}

/** Hint copy under the divisions chips. */
export function divisionsHint(numberOfTeams: number): string {
  const minRule = `Each division needs at least ${MIN_TEAMS_PER_DIVISION} teams.`;
  return numberOfTeams % 2 === 1
    ? `With ${numberOfTeams} teams, only odd division counts (${validDivisionOptions(
        numberOfTeams,
      ).join(', ')}) are allowed for equal team distribution. ${minRule}`
    : `How many divisions to split your teams into. ${minRule}`;
}
