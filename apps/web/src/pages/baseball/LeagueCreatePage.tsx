import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client';
import {
  Card,
  H1,
  H2,
  Input,
  ScrollView,
  styled,
  Text,
  TextArea,
  XStack,
  YStack,
} from 'tamagui';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Lock,
  Upload,
  Zap,
} from '@tamagui/lucide-icons';
import { Button, DateTimePicker } from '@legacy-sports/shared-components/ui';
import {
  Dialog,
  Skeleton,
  StatusBadge,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { stripInvisibleAndControlChars } from '@legacy-sports/utils';
import {
  CUSTOM_ERA_MIN_YEAR_BY_SPORT,
  GAMES_PER_MATCHUP_BY_SPORT,
  PICK_TIME_OPTIONS,
} from '@legacy-sports/shared-components/sports';
import {
  CustomEraRange,
  DraftSlotTradingField,
  EraFilterGrid,
  ERAS_BY_SPORT,
  FAAB_BUDGET_MAX,
  FAAB_BUDGET_MIN,
  FaabBudgetField,
  FREE_ERA_IDS_BY_SPORT,
  getSubmitErrorMessage,
  KEEPER_COUNT_MAX,
  KEEPER_COUNT_MIN,
  type KeeperCostModel,
  LEAGUE_SUBMIT_ERROR_FALLBACK,
  RosterContinuityField,
  SalaryCapField,
  WaiverSystemField,
} from '@legacy-sports/shared-components/leagues';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  DefensiveFormat as GqlDefensiveFormat,
  RosterContinuity as GqlRosterContinuity,
  Sport,
  useCreateLeagueAndTeamsMutation,
  useGetUserLeaguesQuery,
  usePreviewEligiblePlayerCountQuery,
} from '@legacy-sports/graphql';
import {
  LeagueSettingsExportEnvelope,
  parseLeagueSettingsExport,
} from '../../utils/leagueSettingsExport';
import {
  formatDateAsUTC,
  formatDraftDate,
  getUserTimezoneLabel,
} from '../../utils/draftDateUtils';
import {
  DEFAULT_NUM_DIVISIONS,
  FREE_LEAGUE_LIMIT,
  MAX_LEAGUE_NAME_LENGTH,
  MAX_SALARY_CAP,
  MIN_SALARY_CAP,
} from '../../constants/league';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { UpgradeModal } from '../../components/UpgradeModal';
import {
  DST_ROSTER_DEFAULTS,
  IDP_ROSTER_DEFAULTS,
  StepRosterSettings,
} from '../../components/leagues/wizard/StepRosterSettings';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import { useFeatureValue } from '../../context/GrowthBookProvider';
import {
  AMBER,
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  EMERALD,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import {
  trackFastLaneLeagueCreated,
  trackFastLaneToggled,
  trackPremiumFeatureClick,
} from '../../utils/analytics';

// ── Sport switcher ───────────────────────────────────────────────────────────
// Sport is URL-driven (`/baseball/league/create` vs `/football/league/create`)
// and persisted on submit so the league row carries it forward (LS-4631).

const SPORTS = [
  {
    id: 'baseball',
    name: 'Baseball',
    icon: '⚾',
    league: 'MLB',
    beta: false,
    defaultTeams: 12,
    defaultRoster: 26,
  },
  {
    id: 'football',
    name: 'Football',
    icon: '🏈',
    league: 'NFL',
    beta: true,
    defaultTeams: 12,
    defaultRoster: 16,
  },
] as const;

type SportId = (typeof SPORTS)[number]['id'];

/** Read the sport from a pathname (`/football/...` → football, otherwise baseball). */
function sportFromPathname(pathname: string): SportId {
  return pathname.startsWith('/football') ? 'football' : 'baseball';
}

// Strips Unicode control/format characters (Cc/Cf — covers bidi overrides
// like U+202E) and neutralizes HTML-tag-shaped substrings. Applied to both
// the ?name= URL-param prefill and manual typing so neither is more
// permissive than the other (CLB-051). Reuses the server-side sanitizer's
// control/bidi stripping (LS-6056) for consistency.
function sanitizeLeagueNameInput(raw: string): string {
  return stripInvisibleAndControlChars(raw).replace(/<[^>]*>/g, '');
}

// ── Football scoring presets (LS-4158) ──────────────────────────────────────
// Only `receiving_rec` differs across Standard / Half-PPR / PPR. All other
// multipliers (passing yds, rush yds, TDs, etc.) are identical.
type ScoringFormat = 'standard' | 'half_ppr' | 'ppr';
type DefensiveFormat = 'dst' | 'idp';

const SCORING_FORMAT_OPTIONS: ReadonlyArray<{
  id: ScoringFormat;
  label: string;
  rec: number;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    rec: 0,
    description: 'No reception bonus',
  },
  {
    id: 'half_ppr',
    label: 'Half-PPR',
    rec: 0.5,
    description: '0.5 pts per reception',
  },
  {
    id: 'ppr',
    label: 'PPR',
    rec: 1,
    description: '1 pt per reception (default)',
  },
];

export interface CreateLeagueFormData {
  sport: SportId;
  leagueName: string;
  numberOfTeams: number;
  numberOfDivisions: number;
  schedulingStrategy: 'divisional' | 'round-robin' | 'random';
  // Premium-only (advanced_scheduling entitlement): custom in-division game
  // percentage for the Divisional strategy. undefined = use server default
  // (100% in-division, matching pre-LS-6106 behavior).
  schedulingDivisionalWeightPct?: number;
  playerPool: string;
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  waiverType: 'standard' | 'faab';
  faabBudgetDefault: number;
  isPublic: boolean;
  gamesPerMatchup: number;
  baseballEraFilter: string;
  baseballHofOnly: boolean;
  customEraStartYear?: number;
  customEraEndYear?: number;
  salaryCapEnabled: boolean;
  salaryCap?: number;
  salaryFloor?: number;
  luxuryTaxThreshold?: number;
  minSalary?: number;
  salaryEscalationPct?: number;
  salaryDecayPct?: number;
  auctionBudget: number;
  auctionMinBid: number;
  // Premium (draft_slot_trading entitlement): managers may trade draft slots
  // pre-draft (LS-8675). Hidden and coerced false for auction leagues.
  allowDraftSlotTrading: boolean;
  pickTimeLimitSeconds: number;
  // Keeper draft mode (LS-8672). rosterContinuity gates the fields below —
  // only meaningful (and sent to the server) when 'keeper'.
  rosterContinuity: 'redraft' | 'keeper';
  keeperCount?: number;
  keeperCostModel?: KeeperCostModel;
  maxConsecutiveKeeps?: number;
  rookieExempt: boolean;
  // Football-only (LS-4158)
  scoringFormat: ScoringFormat;
  defensiveFormat: DefensiveFormat;
  // Football-only per-slot roster config (LS-6147). Drives maxRosterSize
  // (their sum) via handleRosterSlotsChange; unused for baseball, which has
  // no roster-slot concept and keeps its flat maxRosterSize ButtonGroup.
  rosterSlots: Record<string, number>;
}

const TEAM_COUNT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
const ALL_DIVISION_COUNT_OPTIONS = [1, 2, 3, 4];

// ── Sport-specific datasets (per docs/design/HI6N3yPYUzeh981B5SkXmw CreateForm.jsx) ──

const PLAYER_POOL_OPTIONS_BY_SPORT: Record<
  SportId,
  ReadonlyArray<{ label: string; value: string }>
> = {
  baseball: [
    { label: 'All MLB', value: 'all' },
    { label: 'National League', value: 'nl' },
    { label: 'American League', value: 'al' },
  ],
  football: [
    { label: 'All NFL', value: 'all' },
    { label: 'NFC', value: 'nfc' },
    { label: 'AFC', value: 'afc' },
  ],
};

const ROSTER_SIZE_OPTIONS_BY_SPORT: Record<SportId, readonly number[]> = {
  baseball: [20, 22, 24, 26, 28, 30, 35, 40],
  football: [13, 14, 15, 16, 17, 18, 20, 22],
};

interface RosterRange {
  min: number;
  max: number;
  defaultLabel: string;
}

const ROSTER_RANGE_BY_SPORT: Record<SportId, RosterRange> = {
  baseball: {
    min: 15,
    max: 50,
    defaultLabel: '26 is the Legacy Sports standard.',
  },
  football: {
    min: 10,
    max: 25,
    defaultLabel:
      '16 is the Legacy Sports standard (1 QB, 2 RB, 3 WR, 1 TE, K, DEF + bench).',
  },
};

const DRAFT_MODE_OPTIONS = [
  { label: 'Live Draft', value: 'live' },
  { label: 'Automated Draft', value: 'automated' },
] as const;

const SELECTION_METHOD_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
] as const;

const DRAFT_ORDER_OPTIONS = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
] as const;

// CLB-027: sane upper bound so values like 99999999999 (exceeds Pothos int32) can't be typed.
const AUCTION_BUDGET_RANGE = { min: 1, max: 10000 };
const AUCTION_MIN_BID_RANGE = { min: 1, max: 10000 };

const SCHEDULING_STRATEGY_OPTIONS = [
  { label: 'Divisional', value: 'divisional' },
  { label: 'Round Robin', value: 'round-robin' },
  { label: 'Random', value: 'random' },
] as const;

// Discrete steps for the Premium "Advanced Scheduling" in-division game ratio
// control (Divisional strategy only). 100% matches the existing default
// behavior for leagues that never customize it (LS-6106).
const DIVISIONAL_WEIGHT_OPTIONS = [60, 70, 80, 90, 100] as const;

// Era presets, free-era ids, FAAB budgets, and waiver options now live in
// `@legacy-sports/shared-components/leagues` so web and mobile stay in sync
// (LS-5174).

// ── Sport theme tones (LS-4631) ─────────────────────────────────────────────
// Primary swaps navy → forest green; accent swaps seam-red → amber.

const THEME_PRIMARY_BY_SPORT: Record<SportId, string> = {
  baseball: BRAND_NAVY_LIGHT,
  football: EMERALD,
};

const ACCENT_BY_SPORT: Record<SportId, string> = {
  baseball: '#C41E3A', // seam-red
  football: AMBER,
};

// ── Sport switch — reset sport-keyed fields to that sport's defaults ────────

function defaultsForSport(sport: SportId): {
  numberOfTeams: number;
  maxRosterSize: number;
  gamesPerMatchup: number;
} {
  const s = SPORTS.find((x) => x.id === sport) ?? SPORTS[0];
  return {
    numberOfTeams: s.defaultTeams,
    maxRosterSize: s.defaultRoster,
    gamesPerMatchup: GAMES_PER_MATCHUP_BY_SPORT[sport]?.default ?? 5,
  };
}

function applySportSwitch(
  f: CreateLeagueFormData,
  nextSport: SportId,
): CreateLeagueFormData {
  const fresh = defaultsForSport(nextSport);
  // Football's roster size is derived from its per-slot config (LS-6147);
  // baseball has no roster-slot concept and keeps the flat default.
  const freshRosterSlots = { ...DST_ROSTER_DEFAULTS };
  return {
    ...f,
    sport: nextSport,
    leagueName: '',
    numberOfTeams: fresh.numberOfTeams,
    maxRosterSize:
      nextSport === 'football'
        ? rosterSlotsTotals(freshRosterSlots).total
        : fresh.maxRosterSize,
    gamesPerMatchup: fresh.gamesPerMatchup,
    baseballEraFilter: 'all',
    playerPool: 'all',
    customEraStartYear: undefined,
    customEraEndYear: undefined,
    // Reset football-specific fields on sport switch
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
    rosterSlots: freshRosterSlots,
  };
}

// ── Import settings (LS-9146) ───────────────────────────────────────────────
// Merges a parsed export envelope into the current form, validating every
// value against the same option sets/ranges the form controls themselves
// use (mirrors the ?teams=/?eraFilter= deep-link allowlisting above) so a
// hand-edited or stale export file can't push an out-of-range or
// unrecognized value into form state. Fields that don't apply to the
// league's *current* sport (e.g. defensiveFormat for a baseball league, or
// maxRosterSize for football, which is derived from rosterSlots rather than
// set directly) are skipped rather than coerced.

export function applyImportedSettings(
  prev: CreateLeagueFormData,
  envelope: LeagueSettingsExportEnvelope,
): {
  next: CreateLeagueFormData;
  appliedCount: number;
  skippedFields: string[];
} {
  const s = envelope.settings;
  const sport = prev.sport;
  const sameSport = envelope.sport === sport;
  const next = { ...prev };
  let appliedCount = 0;
  const skippedFields: string[] = [];

  function apply<K extends keyof CreateLeagueFormData>(
    field: K,
    value: CreateLeagueFormData[K] | undefined,
    isValid: boolean,
  ): void {
    if (value === undefined) return;
    if (!isValid) {
      skippedFields.push(field);
      return;
    }
    next[field] = value;
    appliedCount++;
  }

  apply(
    'playerPool',
    s.playerPool,
    typeof s.playerPool === 'string' &&
      PLAYER_POOL_OPTIONS_BY_SPORT[sport].some((p) => p.value === s.playerPool),
  );

  if (
    sameSport &&
    sport === 'baseball' &&
    typeof s.maxRosterSize === 'number'
  ) {
    const range = ROSTER_RANGE_BY_SPORT[sport];
    apply(
      'maxRosterSize',
      s.maxRosterSize,
      s.maxRosterSize >= range.min && s.maxRosterSize <= range.max,
    );
  }

  if (typeof s.numberOfTeams === 'number') {
    apply(
      'numberOfTeams',
      s.numberOfTeams,
      (TEAM_COUNT_OPTIONS as readonly number[]).includes(s.numberOfTeams),
    );
  }

  apply(
    'waiverType',
    s.waiverType as CreateLeagueFormData['waiverType'],
    s.waiverType === 'standard' || s.waiverType === 'faab',
  );

  if (typeof s.faabBudgetDefault === 'number') {
    apply(
      'faabBudgetDefault',
      s.faabBudgetDefault,
      s.faabBudgetDefault >= FAAB_BUDGET_MIN &&
        s.faabBudgetDefault <= FAAB_BUDGET_MAX,
    );
  }

  if (typeof s.isPublic === 'boolean') apply('isPublic', s.isPublic, true);

  if (typeof s.gamesPerMatchup === 'number') {
    const range = GAMES_PER_MATCHUP_BY_SPORT[sport];
    apply(
      'gamesPerMatchup',
      s.gamesPerMatchup,
      s.gamesPerMatchup >= range.min && s.gamesPerMatchup <= range.max,
    );
  }

  if (typeof s.baseballEraFilter === 'string') {
    apply(
      'baseballEraFilter',
      s.baseballEraFilter,
      s.baseballEraFilter === 'custom' ||
        ERAS_BY_SPORT[sport].some((e) => e.id === s.baseballEraFilter),
    );
  }

  if (typeof s.baseballHofOnly === 'boolean') {
    apply('baseballHofOnly', s.baseballHofOnly, true);
  }

  if (typeof s.customEraStartYear === 'number') {
    apply(
      'customEraStartYear',
      s.customEraStartYear,
      isFourDigitYear(s.customEraStartYear),
    );
  }
  if (typeof s.customEraEndYear === 'number') {
    apply(
      'customEraEndYear',
      s.customEraEndYear,
      isFourDigitYear(s.customEraEndYear),
    );
  }

  if (typeof s.salaryCapEnabled === 'boolean') {
    apply('salaryCapEnabled', s.salaryCapEnabled, true);
  }
  if (typeof s.salaryCap === 'number') {
    apply(
      'salaryCap',
      s.salaryCap,
      s.salaryCap >= MIN_SALARY_CAP && s.salaryCap <= MAX_SALARY_CAP,
    );
  }
  if (typeof s.salaryFloor === 'number') {
    apply('salaryFloor', s.salaryFloor, s.salaryFloor >= 0);
  }
  if (typeof s.luxuryTaxThreshold === 'number') {
    apply(
      'luxuryTaxThreshold',
      s.luxuryTaxThreshold,
      s.luxuryTaxThreshold >= 0,
    );
  }
  if (typeof s.minSalary === 'number') {
    apply('minSalary', s.minSalary, s.minSalary >= 1);
  }
  if (typeof s.salaryEscalationPct === 'number') {
    apply(
      'salaryEscalationPct',
      s.salaryEscalationPct,
      s.salaryEscalationPct >= 0 && s.salaryEscalationPct <= 100,
    );
  }
  if (typeof s.salaryDecayPct === 'number') {
    apply(
      'salaryDecayPct',
      s.salaryDecayPct,
      s.salaryDecayPct >= 0 && s.salaryDecayPct <= 100,
    );
  }

  if (typeof s.auctionBudget === 'number') {
    apply(
      'auctionBudget',
      s.auctionBudget,
      s.auctionBudget >= AUCTION_BUDGET_RANGE.min &&
        s.auctionBudget <= AUCTION_BUDGET_RANGE.max,
    );
  }
  if (typeof s.auctionMinBid === 'number') {
    apply(
      'auctionMinBid',
      s.auctionMinBid,
      s.auctionMinBid >= AUCTION_MIN_BID_RANGE.min &&
        s.auctionMinBid <= AUCTION_MIN_BID_RANGE.max,
    );
  }

  if (typeof s.allowDraftSlotTrading === 'boolean') {
    apply('allowDraftSlotTrading', s.allowDraftSlotTrading, true);
  }

  if (typeof s.rosterContinuity === 'string') {
    apply(
      'rosterContinuity',
      s.rosterContinuity as CreateLeagueFormData['rosterContinuity'],
      s.rosterContinuity === 'redraft' || s.rosterContinuity === 'keeper',
    );
  }
  if (typeof s.keeperCount === 'number') {
    apply(
      'keeperCount',
      s.keeperCount,
      s.keeperCount >= KEEPER_COUNT_MIN && s.keeperCount <= KEEPER_COUNT_MAX,
    );
  }
  if (typeof s.keeperCostModel === 'string') {
    apply(
      'keeperCostModel',
      s.keeperCostModel as KeeperCostModel,
      s.keeperCostModel === 'round-penalty' ||
        s.keeperCostModel === 'auction-budget',
    );
  }
  if (typeof s.maxConsecutiveKeeps === 'number') {
    apply(
      'maxConsecutiveKeeps',
      s.maxConsecutiveKeeps,
      s.maxConsecutiveKeeps >= 1,
    );
  }
  if (typeof s.rookieExempt === 'boolean') {
    apply('rookieExempt', s.rookieExempt, true);
  }

  if (
    sameSport &&
    sport === 'football' &&
    typeof s.defensiveFormat === 'string'
  ) {
    apply(
      'defensiveFormat',
      s.defensiveFormat as CreateLeagueFormData['defensiveFormat'],
      s.defensiveFormat === 'dst' || s.defensiveFormat === 'idp',
    );
  }

  return { next, appliedCount, skippedFields };
}

// ── Roster-slot helpers (LS-6147) ───────────────────────────────────────────
// Mirrors StepRosterSettings' own starters/bench/total computation so the
// derived maxRosterSize and summary displays stay consistent with what the
// per-slot control shows.

function rosterSlotsTotals(rosterSlots: Record<string, number>): {
  starters: number;
  bench: number;
  total: number;
} {
  const bench = rosterSlots.BN ?? 0;
  const starters = Object.entries(rosterSlots)
    .filter(([slot]) => slot !== 'BN')
    .reduce((sum, [, n]) => sum + n, 0);
  return { starters, bench, total: starters + bench };
}

// ── Display helpers for the summary sidebar ─────────────────────────────────

function eraDisplayLabel(f: CreateLeagueFormData): string {
  if (f.baseballEraFilter === 'custom') {
    return `${f.customEraStartYear ?? '—'} – ${f.customEraEndYear ?? '—'}`;
  }
  return (
    ERAS_BY_SPORT[f.sport].find((e) => e.id === f.baseballEraFilter)?.name ??
    '—'
  );
}

function scheduleDisplayLabel(v: string): string {
  return (
    {
      divisional: 'Divisional',
      'round-robin': 'Round-Robin',
      random: 'Random',
    }[v] ?? '—'
  );
}

function poolDisplayLabel(sport: SportId, v: string): string {
  return (
    PLAYER_POOL_OPTIONS_BY_SPORT[sport].find((p) => p.value === v)?.label ?? '—'
  );
}

// ── Submit error correlation token ────────────────────────────────────────────
// jsdom (used by our Jest tests) does not implement crypto.randomUUID on all
// versions, so fall back to a Math.random-based hex token in that case.
function generateCorrelationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

// ── Form messages ─────────────────────────────────────────────────────────────
// Follows the DISCORD_SERVER_ERROR_MESSAGES precedent in
// apps/web/src/pages/login/LoginPage.tsx — a colocated messages object next
// to the component that uses it, rather than inline string literals.

const LEAGUE_FORM_MESSAGES = {
  leagueNameTooShort: 'League name must be 3–50 characters.',
  leagueNameTooLong: (maxLength: number) =>
    `League name must be less than ${maxLength} characters`,
  teamsOutOfRange: 'Teams must be 4–16.',
  moreDivisionsThanTeams: 'More divisions than teams.',
  divisionParityMismatch: 'Division parity must match team parity.',
  rosterOutOfRange: (min: number, max: number) =>
    `Roster must be ${min}–${max}.`,
  gamesPerMatchupOutOfRange: (min: number, max: number, sport: string) =>
    `Games per matchup must be ${min}–${max} for ${sport} leagues.`,
  // Phrasing avoids the literal substrings "start year"/"end year" so the
  // sticky bar's aggregated error list (LS-6090) can't collide with the
  // CustomEraRange field labels in E2E getByText() locators.
  customEraRequired: 'Both custom-era boundary years are required.',
  customEraNotFourDigits: 'Custom era years must be 4-digit years.',
  customEraOrderInvalid:
    "Custom era's first year must be on or before its last year.",
  customEraStartYearOutOfRange: (min: number, max: number) =>
    `Custom era's first year must be between ${min} and ${max}.`,
  customEraEndYearOutOfRange: (min: number, max: number) =>
    `Custom era's last year must be between ${min} and ${max}.`,
  customEraStrayFields:
    'Custom era years should only be set when Custom Era is selected.',
  draftDateInPast: 'Draft date must be in the future.',
  salaryCapRequired: 'Salary cap amount is required.',
  salaryCapOutOfRange: (min: number, max: number) =>
    `Salary cap must be between ${min} and ${max}.`,
  salaryFloorNegative: 'Salary floor cannot be negative.',
  luxuryTaxThresholdNegative: 'Luxury tax threshold cannot be negative.',
  minSalaryTooLow: 'Minimum salary must be at least 1.',
  salaryEscalationPctOutOfRange: 'Salary escalation % must be 0–100.',
  salaryDecayPctOutOfRange: 'Salary decay % must be 0–100.',
  keeperCountRequired: 'Keeper count is required.',
  keeperCountOutOfRange: (min: number, max: number) =>
    `Keeper count must be between ${min} and ${max}.`,
  maxConsecutiveKeepsTooLow:
    'Max consecutive keeps must be at least 1 when set (leave blank for unlimited).',
  // Shared with mobile so both platforms show the same untrusted-error copy
  // (LS-8814).
  submitFallback: LEAGUE_SUBMIT_ERROR_FALLBACK,
} as const;

// ── Custom era eligible-player-pool preview (LS-6089) ─────────────────────────
// A narrow custom era (e.g. 1942-1944, wartime baseball) can yield too few
// eligible players to fill every roster. This is a warning only — it never
// blocks league creation.

export function isPoolTooSmall(
  eligibleCount: number,
  numberOfTeams: number,
  maxRosterSize: number,
): boolean {
  return eligibleCount < numberOfTeams * maxRosterSize;
}

// ── Validation (returns all errors, not just first) ──────────────────────────

function isFourDigitYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1000 && year <= 9999;
}

export function validateFormFull(
  f: CreateLeagueFormData,
): Record<string, string> {
  const errs: Record<string, string> = {};
  const trimmed = f.leagueName.trim();
  if (!trimmed || trimmed.length < 3)
    errs.leagueName = LEAGUE_FORM_MESSAGES.leagueNameTooShort;
  if (trimmed.length > MAX_LEAGUE_NAME_LENGTH)
    errs.leagueName = LEAGUE_FORM_MESSAGES.leagueNameTooLong(
      MAX_LEAGUE_NAME_LENGTH,
    );
  if (f.numberOfTeams < 4 || f.numberOfTeams > 16)
    errs.numberOfTeams = LEAGUE_FORM_MESSAGES.teamsOutOfRange;
  if (f.numberOfDivisions > f.numberOfTeams)
    errs.numberOfDivisions = LEAGUE_FORM_MESSAGES.moreDivisionsThanTeams;
  if (f.numberOfTeams % 2 === 1 && f.numberOfDivisions % 2 === 0)
    errs.numberOfDivisions = LEAGUE_FORM_MESSAGES.divisionParityMismatch;
  const range = ROSTER_RANGE_BY_SPORT[f.sport];
  if (f.maxRosterSize < range.min || f.maxRosterSize > range.max)
    errs.maxRosterSize = LEAGUE_FORM_MESSAGES.rosterOutOfRange(
      range.min,
      range.max,
    );
  const gpmRange = GAMES_PER_MATCHUP_BY_SPORT[f.sport];
  if (
    gpmRange &&
    (Number.isNaN(f.gamesPerMatchup) ||
      f.gamesPerMatchup < gpmRange.min ||
      f.gamesPerMatchup > gpmRange.max)
  )
    errs.gamesPerMatchup = LEAGUE_FORM_MESSAGES.gamesPerMatchupOutOfRange(
      gpmRange.min,
      gpmRange.max,
      f.sport,
    );
  if (f.baseballEraFilter === 'custom') {
    if (f.customEraStartYear == null || f.customEraEndYear == null)
      errs.customEra = LEAGUE_FORM_MESSAGES.customEraRequired;
    else if (
      !isFourDigitYear(f.customEraStartYear) ||
      !isFourDigitYear(f.customEraEndYear)
    )
      errs.customEra = LEAGUE_FORM_MESSAGES.customEraNotFourDigits;
    else if (f.customEraStartYear > f.customEraEndYear)
      errs.customEra = LEAGUE_FORM_MESSAGES.customEraOrderInvalid;
    else {
      const minYear = CUSTOM_ERA_MIN_YEAR_BY_SPORT[f.sport];
      const currentYear = new Date().getFullYear();
      if (f.customEraStartYear < minYear || f.customEraStartYear > currentYear)
        errs.customEra = LEAGUE_FORM_MESSAGES.customEraStartYearOutOfRange(
          minYear,
          currentYear,
        );
      else if (f.customEraEndYear < minYear || f.customEraEndYear > currentYear)
        errs.customEra = LEAGUE_FORM_MESSAGES.customEraEndYearOutOfRange(
          minYear,
          currentYear,
        );
    }
  } else if (f.customEraStartYear != null || f.customEraEndYear != null) {
    errs.customEra = LEAGUE_FORM_MESSAGES.customEraStrayFields;
  }
  if (f.draftDate && f.draftDate < new Date())
    errs.draftDate = LEAGUE_FORM_MESSAGES.draftDateInPast;
  if (f.salaryCapEnabled) {
    if (f.salaryCap === undefined)
      errs.salaryCap = LEAGUE_FORM_MESSAGES.salaryCapRequired;
    else if (f.salaryCap < MIN_SALARY_CAP || f.salaryCap > MAX_SALARY_CAP)
      errs.salaryCap = LEAGUE_FORM_MESSAGES.salaryCapOutOfRange(
        MIN_SALARY_CAP,
        MAX_SALARY_CAP,
      );
    if (f.salaryFloor !== undefined && f.salaryFloor < 0)
      errs.salaryFloor = LEAGUE_FORM_MESSAGES.salaryFloorNegative;
    if (f.luxuryTaxThreshold !== undefined && f.luxuryTaxThreshold < 0)
      errs.luxuryTaxThreshold = LEAGUE_FORM_MESSAGES.luxuryTaxThresholdNegative;
    if (f.minSalary !== undefined && f.minSalary < 1)
      errs.minSalary = LEAGUE_FORM_MESSAGES.minSalaryTooLow;
    if (
      f.salaryEscalationPct !== undefined &&
      (f.salaryEscalationPct < 0 || f.salaryEscalationPct > 100)
    )
      errs.salaryEscalationPct =
        LEAGUE_FORM_MESSAGES.salaryEscalationPctOutOfRange;
    if (
      f.salaryDecayPct !== undefined &&
      (f.salaryDecayPct < 0 || f.salaryDecayPct > 100)
    )
      errs.salaryDecayPct = LEAGUE_FORM_MESSAGES.salaryDecayPctOutOfRange;
  }
  if (
    !PLAYER_POOL_OPTIONS_BY_SPORT[f.sport].some((p) => p.value === f.playerPool)
  )
    errs.playerPool = `Player pool "${f.playerPool}" is not valid for ${f.sport} leagues.`;
  if (f.selectionMethod === 'auction') {
    if (
      Number.isNaN(f.auctionBudget) ||
      f.auctionBudget < AUCTION_BUDGET_RANGE.min ||
      f.auctionBudget > AUCTION_BUDGET_RANGE.max
    )
      errs.auctionBudget = `Auction budget must be ${AUCTION_BUDGET_RANGE.min}–${AUCTION_BUDGET_RANGE.max}.`;
    if (
      Number.isNaN(f.auctionMinBid) ||
      f.auctionMinBid < AUCTION_MIN_BID_RANGE.min ||
      f.auctionMinBid > AUCTION_MIN_BID_RANGE.max
    )
      errs.auctionMinBid = `Minimum bid must be ${AUCTION_MIN_BID_RANGE.min}–${AUCTION_MIN_BID_RANGE.max}.`;
    else if (f.auctionMinBid > f.auctionBudget)
      errs.auctionMinBid = 'Auction minimum bid cannot exceed auction budget.';
  }
  if (
    f.waiverType === 'faab' &&
    (f.faabBudgetDefault < FAAB_BUDGET_MIN ||
      f.faabBudgetDefault > FAAB_BUDGET_MAX)
  )
    errs.faabBudget = `FAAB budget must be ${FAAB_BUDGET_MIN}–${FAAB_BUDGET_MAX}.`;
  if (f.rosterContinuity === 'keeper') {
    if (f.keeperCount === undefined)
      errs.keeperCount = LEAGUE_FORM_MESSAGES.keeperCountRequired;
    else if (
      f.keeperCount < KEEPER_COUNT_MIN ||
      f.keeperCount > KEEPER_COUNT_MAX
    )
      errs.keeperCount = LEAGUE_FORM_MESSAGES.keeperCountOutOfRange(
        KEEPER_COUNT_MIN,
        KEEPER_COUNT_MAX,
      );
    if (f.maxConsecutiveKeeps !== undefined && f.maxConsecutiveKeeps < 1)
      errs.maxConsecutiveKeeps = LEAGUE_FORM_MESSAGES.maxConsecutiveKeepsTooLow;
  }
  return errs;
}

// Maps each validateFormFull() error key to the CollapsibleSection id that
// contains the offending field, so a failed submit can auto-expand exactly
// the sections the user needs to fix (LS-6090).
export const VALIDATION_ERROR_SECTION: Record<string, string> = {
  leagueName: 'basic',
  numberOfTeams: 'basic',
  numberOfDivisions: 'basic',
  maxRosterSize: 'roster-schedule',
  gamesPerMatchup: 'roster-schedule',
  playerPool: 'roster-schedule',
  customEra: 'era-history',
  draftDate: 'draft',
  auctionBudget: 'draft',
  auctionMinBid: 'draft',
  keeperCount: 'draft',
  maxConsecutiveKeeps: 'draft',
  faabBudget: 'waiver-budget',
  salaryCap: 'waiver-budget',
  salaryFloor: 'waiver-budget',
  luxuryTaxThreshold: 'waiver-budget',
  minSalary: 'waiver-budget',
  salaryEscalationPct: 'waiver-budget',
  salaryDecayPct: 'waiver-budget',
};

// ── Sport switcher ───────────────────────────────────────────────────────────

interface SportSwitcherProps {
  value: SportId;
  onSelect: (sport: SportId) => void;
  disabled?: boolean;
  sports?: ReadonlyArray<(typeof SPORTS)[number]>;
  /** Sports the user can't currently create a league for (e.g. a beta sport
   * behind a feature flag). Rendered visibly but non-interactive with a Lock
   * icon, rather than removed from the tab list, so the user can see what
   * exists without being able to select it (LS-9128). */
  unavailableSports?: ReadonlySet<SportId>;
}

function SportSwitcher({
  value,
  onSelect,
  disabled,
  sports = SPORTS,
  unavailableSports,
}: SportSwitcherProps): React.JSX.Element {
  const themePrimary = THEME_PRIMARY_BY_SPORT[value];
  return (
    <XStack
      gap="$2.5"
      padding="$1.5"
      backgroundColor={withAlpha(BG_DARK, 0.6)}
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$5"
      $sm={{ flexDirection: 'column' }}
    >
      {sports.map((s) => {
        const selected = value === s.id;
        const unavailable = unavailableSports?.has(s.id) ?? false;
        const itemDisabled = disabled || unavailable;
        return (
          <Button
            key={s.id}
            flex={1}
            size="$5"
            unstyled
            data-testid={`sport-tab-${s.id}`}
            role="tab"
            aria-selected={selected}
            aria-disabled={unavailable}
            aria-label={`${s.name} — ${s.league}${s.beta ? ' (Beta)' : ''}${unavailable ? ' (not available yet)' : ''}`}
            backgroundColor={
              selected ? withAlpha(themePrimary, 0.32) : 'transparent'
            }
            borderColor={selected ? themePrimary : 'transparent'}
            borderWidth={1}
            borderRadius="$4"
            paddingHorizontal="$4"
            paddingVertical="$3.5"
            justifyContent="flex-start"
            opacity={unavailable ? 0.5 : 1}
            onPress={() => !itemDisabled && onSelect(s.id)}
            disabled={itemDisabled}
            hoverStyle={
              selected || unavailable
                ? undefined
                : { backgroundColor: withAlpha(WHITE, 0.03) }
            }
            pressStyle={unavailable ? undefined : { scale: 0.99 }}
            cursor={unavailable ? 'not-allowed' : 'pointer'}
            position="relative"
          >
            <XStack gap="$3" alignItems="center" flex={1}>
              <Text fontSize={24} aria-hidden="true">
                {s.icon}
              </Text>
              <YStack flex={1} minWidth={0}>
                <Text
                  fontFamily="$display"
                  fontWeight="800"
                  fontSize={18}
                  color={selected ? '$color' : '$color11'}
                  letterSpacing={-0.1}
                >
                  {s.name}
                </Text>
                <Text
                  fontFamily="$display"
                  fontWeight="700"
                  fontSize={10}
                  letterSpacing={1.6}
                  textTransform="uppercase"
                  color={selected ? '$brandGoldLight' : '$gray9'}
                  marginTop={2}
                >
                  {s.league}
                  {s.beta ? ' · Beta' : ''}
                </Text>
              </YStack>
              {unavailable && <Lock size={14} color="$gray9" />}
            </XStack>
            {s.beta && !unavailable && (
              <Text
                position="absolute"
                top={8}
                right={10}
                fontFamily="$display"
                fontWeight="700"
                fontSize={9}
                letterSpacing={1.4}
                textTransform="uppercase"
                color="$brandGoldLight"
                backgroundColor={withAlpha(BRAND_GOLD, 0.14)}
                borderWidth={1}
                borderColor={withAlpha(BRAND_GOLD, 0.45)}
                paddingHorizontal={6}
                paddingVertical={2}
                borderRadius={4}
              >
                Beta
              </Text>
            )}
            {unavailable && (
              <Text
                position="absolute"
                top={8}
                right={10}
                fontFamily="$display"
                fontWeight="700"
                fontSize={9}
                letterSpacing={1.4}
                textTransform="uppercase"
                color="$gray9"
                backgroundColor={withAlpha(WHITE, 0.04)}
                borderWidth={1}
                borderColor="$borderColor"
                paddingHorizontal={6}
                paddingVertical={2}
                borderRadius={4}
              >
                Coming Soon
              </Text>
            )}
          </Button>
        );
      })}
    </XStack>
  );
}

// ── Styled primitives ────────────────────────────────────────────────────────

const SectionHeader = styled(XStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  alignItems: 'center',
  gap: '$4',
  backgroundColor: '$color2',
  cursor: 'pointer' as never,
  hoverStyle: { backgroundColor: '$color3' },
});

// ── CollapsibleSection ───────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  id: string;
  num: number;
  title: string;
  sub: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** When set, the header renders visibly but can't be toggled — used to
   * lock every section but the active one behind Fast Lane (LS-9128), or a
   * panel the user otherwise lacks access to. Disabled panels are never
   * removed from the layout; only their interactivity is gated. */
  disabled?: boolean;
  /** Short reason shown in place of the collapsed summary while disabled. */
  disabledReason?: string;
}

function CollapsibleSection({
  id,
  num,
  title,
  sub,
  summary,
  open,
  onToggle,
  children,
  disabled = false,
  disabledReason,
}: CollapsibleSectionProps): React.JSX.Element {
  const regionId = `create-league-section-${id}`;
  const isOpen = open && !disabled;
  return (
    <YStack
      borderWidth={1}
      borderColor={isOpen ? withAlpha(BRAND_NAVY_LIGHT, 0.45) : '$borderColor'}
      borderRadius="$5"
      overflow="hidden"
      opacity={disabled ? 0.6 : 1}
    >
      <SectionHeader
        data-testid={`section-toggle-${id}`}
        onPress={disabled ? undefined : onToggle}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isOpen}
        aria-disabled={disabled}
        aria-controls={regionId}
        borderBottomWidth={isOpen ? 1 : 0}
        borderBottomColor="$borderColor"
        cursor={disabled ? 'not-allowed' : ('pointer' as never)}
        hoverStyle={disabled ? { backgroundColor: '$color2' } : undefined}
      >
        {/* Section number */}
        <Text
          fontFamily="$display"
          fontWeight="800"
          fontSize={13}
          letterSpacing={1}
          color={disabled ? '$gray9' : '$brandGoldLight'}
          width={28}
          flexShrink={0}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {String(num).padStart(2, '0')}
        </Text>

        {/* Title + subtitle */}
        <YStack flex={1} minWidth={0}>
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={19}
            color={disabled ? '$gray10' : '$color'}
            letterSpacing={-0.1}
          >
            {title}
          </Text>
          <Text fontFamily="$body" fontSize={13} color="$gray10" marginTop={2}>
            {disabled && disabledReason ? disabledReason : sub}
          </Text>
        </YStack>

        {/* Collapsed summary */}
        {!isOpen && !disabled && summary && (
          <Text
            data-testid={`section-summary-${id}`}
            fontFamily="$body"
            fontSize={13}
            color="$color11"
            flexShrink={1}
            textAlign="right"
            maxWidth={260}
            marginRight="$2"
            $sm={{ display: 'none' }}
          >
            {summary}
          </Text>
        )}

        {/* Chevron / lock */}
        {disabled ? (
          <Lock size={16} color="$gray9" aria-hidden="true" />
        ) : (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              flexShrink: 0,
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            <ChevronRight
              size={18}
              color={isOpen ? withAlpha(BRAND_NAVY_LIGHT, 0.9) : '#9CAAC5'}
            />
          </span>
        )}
      </SectionHeader>

      {isOpen && (
        <YStack
          id={regionId}
          role="region"
          aria-label={title}
          backgroundColor="$color1"
          padding="$5"
          gap="$5"
        >
          {children}
        </YStack>
      )}
    </YStack>
  );
}

// EraCardGrid now lives in `@legacy-sports/shared-components/leagues` as the
// cross-platform `EraFilterGrid` (LS-5174).

// ── ButtonGroup helper ───────────────────────────────────────────────────────

interface ButtonGroupProps<T extends string | number> {
  value: T;
  options: readonly (
    | T
    | {
        value: T;
        label: string;
        disabled?: boolean;
        recommended?: boolean;
        /** Premium-gated option (e.g. Auction). Stays pressable so the
         * caller's onChange can route to an upgrade flow, but renders a
         * Lock icon + dashed gold border. Mirrors OptionButtonGroup's
         * `locked` treatment (lib/shared-components premium fields). */
        locked?: boolean;
      }
  )[];
  onChange: (v: T) => void;
  disabled?: boolean;
  wide?: boolean;
  /** Test hook to disambiguate button groups that share option labels (e.g. roster size vs. team count both offering "16"). */
  'data-testid'?: string;
}

function ButtonGroup<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  wide,
  'data-testid': testId,
}: ButtonGroupProps<T>): React.JSX.Element {
  return (
    <XStack flexWrap="wrap" gap="$1.5" data-testid={testId}>
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : String(o);
        const itemDisabled = disabled || (typeof o === 'object' && o.disabled);
        const recommended = typeof o === 'object' && o.recommended === true;
        const selected = value === val;
        const locked = !selected && typeof o === 'object' && !!o.locked;
        return (
          <Button
            key={String(val)}
            size="$3"
            onPress={() => !itemDisabled && onChange(val)}
            disabled={itemDisabled}
            flex={wide ? 1 : undefined}
            minWidth={44}
            backgroundColor={selected ? '$brandNavyLight' : '$color2'}
            borderColor={
              selected
                ? '$brandNavyLight'
                : locked
                  ? '$brandGold'
                  : '$borderColor'
            }
            borderWidth={selected ? 2 : 1}
            borderStyle={locked ? 'dashed' : 'solid'}
            hoverStyle={{
              backgroundColor: selected ? '$brandNavy' : '$color3',
              borderColor: selected ? '$brandNavy' : '$borderColorHover',
            }}
            pressStyle={{ scale: 0.95 }}
            // Recommended badge text sits inside the button visually, but the
            // accessible name must stay the bare label so existing
            // getByRole('button', { name: ... }) selectors (unit + e2e) keep
            // resolving to this button (LS-6104).
            aria-label={recommended ? label : undefined}
          >
            <XStack alignItems="center" gap="$1.5">
              {locked && <Lock size={12} color={BRAND_GOLD} />}
              {recommended ? (
                <YStack alignItems="center" gap="$0.5">
                  <StatusBadge label="Recommended" variant="accent" size="xs" />
                  <Text
                    color={selected ? '$brandGold' : '$color'}
                    fontWeight={selected ? '600' : '400'}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {label}
                  </Text>
                </YStack>
              ) : (
                <Text
                  color={selected ? '$brandGold' : '$color'}
                  fontWeight={selected ? '600' : '400'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {label}
                </Text>
              )}
            </XStack>
          </Button>
        );
      })}
    </XStack>
  );
}

// ── PillToggle (Private / Public) ────────────────────────────────────────────

interface PillToggleProps {
  value: boolean;
  offLabel: string;
  onLabel: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function PillToggle({
  value,
  offLabel,
  onLabel,
  onChange,
  disabled,
}: PillToggleProps): React.JSX.Element {
  return (
    <XStack
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius={9999}
      padding={3}
      width="fit-content"
    >
      {[
        { label: offLabel, v: false },
        { label: onLabel, v: true },
      ].map(({ label, v }) => {
        const selected = value === v;
        return (
          <Button
            key={label}
            size="$2"
            onPress={() => !disabled && onChange(v)}
            disabled={disabled}
            backgroundColor={selected ? '$brandNavyLight' : 'transparent'}
            borderWidth={0}
            borderRadius={9999}
            hoverStyle={{
              backgroundColor: selected ? '$brandNavy' : '$color3',
            }}
            pressStyle={{ scale: 0.97 }}
          >
            <Text
              fontFamily="$display"
              fontWeight="700"
              fontSize={12}
              letterSpacing={0.8}
              textTransform="uppercase"
              color={selected ? 'white' : '$gray10'}
            >
              {label}
            </Text>
          </Button>
        );
      })}
    </XStack>
  );
}

// ── FieldRow wrapper ─────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  labelId?: string;
  hint?: string;
  hintId?: string;
  required?: boolean;
  /** Stable test id for scoping E2E locators to this field's controls. */
  testId?: string;
  children: React.ReactNode;
}

function FieldRow({
  label,
  labelId,
  hint,
  hintId,
  required,
  testId,
  children,
}: FieldRowProps): React.JSX.Element {
  return (
    <YStack gap="$2" data-testid={testId}>
      <XStack gap="$2" alignItems="center">
        <Text
          id={labelId}
          fontFamily="$display"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$color11"
        >
          {label}
        </Text>
        {required && (
          <Text
            fontFamily="$body"
            fontWeight="700"
            fontSize={12}
            color="$red10"
          >
            Required
          </Text>
        )}
      </XStack>
      {children}
      {hint && (
        <Text id={hintId} fontFamily="$body" fontSize={12} color="$gray9">
          {hint}
        </Text>
      )}
    </YStack>
  );
}

// ── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}): React.JSX.Element {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="baseline"
      gap="$2"
      paddingVertical="$2"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      borderStyle="dashed"
    >
      <Text
        fontFamily="$display"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1}
        textTransform="uppercase"
        color="$gray9"
      >
        {label}
      </Text>
      <Text
        fontFamily="$body"
        fontWeight="600"
        fontSize={14}
        color={gold ? '$brandGoldLight' : '$color11'}
        textAlign="right"
      >
        {value}
      </Text>
    </XStack>
  );
}

// ── SummarySidePanel ─────────────────────────────────────────────────────────

function scoringFormatLabel(f: CreateLeagueFormData): string {
  const opt = SCORING_FORMAT_OPTIONS.find((o) => o.id === f.scoringFormat);
  return opt ? opt.label : 'Custom';
}

interface SummarySidePanelProps {
  f: CreateLeagueFormData;
  teams: number;
}

function SummarySidePanel({
  f,
  teams,
}: SummarySidePanelProps): React.JSX.Element {
  const sportMeta = SPORTS.find((s) => s.id === f.sport) ?? SPORTS[0];
  const draftLabel = `${f.draftMode === 'live' ? 'Live' : 'Auto'} · ${
    f.selectionMethod === 'standard'
      ? 'Std'
      : f.selectionMethod === 'auction'
        ? 'Auction'
        : 'Random'
  }`;
  const waiversLabel =
    f.waiverType === 'faab' ? `FAAB · $${f.faabBudgetDefault}` : 'Standard';
  const rosterTotals = rosterSlotsTotals(f.rosterSlots);

  return (
    <>
      {/* League summary card */}
      <Card
        size="$4"
        bordered
        backgroundColor="$color2"
        borderColor="$borderColor"
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={12}
            letterSpacing={1.4}
            textTransform="uppercase"
            color="$brandGoldLight"
          >
            Your League
          </Text>
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.2}
            textTransform="uppercase"
            paddingHorizontal="$2.5"
            paddingVertical="$1"
            borderRadius={9999}
            backgroundColor="rgba(255,255,255,0.04)"
            borderWidth={1}
            borderColor="$borderColor"
            color="$gray9"
          >
            {sportMeta.name} · Draft
          </Text>
        </XStack>

        <YStack gap="$1">
          <H2
            fontFamily="$display"
            fontWeight={f.leagueName ? '800' : '400'}
            fontSize={22}
            color={f.leagueName ? '$color' : '$gray9'}
            fontStyle={f.leagueName ? 'normal' : 'italic'}
          >
            {f.leagueName || 'Untitled League'}
          </H2>
          <Text fontFamily="$body" fontSize={13} color="$gray9" marginTop={4}>
            {eraDisplayLabel(f)} · {f.numberOfTeams} teams ·{' '}
            {f.isPublic ? 'Public' : 'Private'}
          </Text>
        </YStack>

        <YStack>
          <SummaryRow
            label="Sport"
            value={`${sportMeta.name} (${sportMeta.league})`}
            gold
          />
          <SummaryRow label="Teams" value={String(f.numberOfTeams)} />
          <SummaryRow label="Divisions" value={String(f.numberOfDivisions)} />
          <SummaryRow
            label="Schedule"
            value={scheduleDisplayLabel(f.schedulingStrategy)}
          />
          <SummaryRow
            label="Roster"
            value={
              f.sport === 'football'
                ? `${f.maxRosterSize} (${rosterTotals.starters} starters + ${rosterTotals.bench} bench)`
                : `${f.maxRosterSize} players`
            }
          />
          <SummaryRow
            label="Pool"
            value={poolDisplayLabel(f.sport, f.playerPool)}
          />
          <SummaryRow
            label="Era"
            value={eraDisplayLabel(f)}
            gold={f.baseballEraFilter !== 'all'}
          />
          {f.baseballHofOnly && <SummaryRow label="HOF Only" value="On" gold />}
          {f.sport === 'football' && (
            <>
              <SummaryRow label="Scoring" value={scoringFormatLabel(f)} />
              <SummaryRow
                label="Defense"
                value={f.defensiveFormat === 'idp' ? 'IDP' : 'D/ST'}
              />
            </>
          )}
          <SummaryRow label="Draft" value={draftLabel} />
          <SummaryRow label="Waivers" value={waiversLabel} />
          {f.salaryCapEnabled && (
            <SummaryRow label="Cap" value={`$${f.salaryCap ?? 0}M`} gold />
          )}
          {f.rosterContinuity === 'keeper' && (
            <SummaryRow
              label="Keeper"
              value={`${f.keeperCount ?? '?'} players`}
              gold
            />
          )}
        </YStack>
      </Card>

      {/* What happens next card */}
      <Card
        size="$4"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
        borderColor={withAlpha('#C5A55A', 0.22)}
        borderWidth={1}
        padding="$5"
        gap="$3"
      >
        <XStack gap="$2" alignItems="center">
          <Zap size={14} color="$brandGoldLight" />
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={12}
            letterSpacing={1.4}
            textTransform="uppercase"
            color="$brandGoldLight"
          >
            What happens next
          </Text>
        </XStack>
        <YStack gap="$2.5">
          {[
            "Your league is created and you're set as Commissioner.",
            `Send invite links to up to ${teams - 1} managers.`,
            `Draft opens ${formatDraftDate(f.draftDate)}.`,
            f.sport === 'football'
              ? 'Tune lineups, settings, and waivers right up to kickoff.'
              : 'Tune lineups, settings, and waivers right up to first pitch.',
          ].map((item) => (
            <XStack key={item} gap="$2.5" alignItems="flex-start">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor="$brandGold"
                marginTop={7}
                flexShrink={0}
              />
              <Text
                fontFamily="$body"
                fontSize={13}
                color="$color11"
                lineHeight={22}
                flex={1}
              >
                {item}
              </Text>
            </XStack>
          ))}
        </YStack>
      </Card>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function LeagueCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isPremium, isLoading: premiumLoading } = useIsPremiumStatus();
  // Falls back to `true` (rather than `useFeatureIsOn`'s implicit `false`)
  // so the tab doesn't lock while GrowthBook is still loading or the flag is
  // unconfigured (LS-9130) — same default as the route guard in app.tsx.
  const footballEnabled = useFeatureValue('football_enabled', true);
  // Sports the flag hasn't unlocked yet stay in the tab list but render
  // disabled (LS-9128) — filtering them out entirely hid the option instead
  // of showing the user it exists but isn't available.
  const unavailableSports = useMemo(
    () => new Set<SportId>(footballEnabled ? [] : ['football']),
    [footballEnabled],
  );
  const [showWaiverUpgradeModal, setShowWaiverUpgradeModal] = useState(false);
  const [showSalaryCapUpgradeModal, setShowSalaryCapUpgradeModal] =
    useState(false);
  const [showEraUpgradeModal, setShowEraUpgradeModal] = useState(false);
  const [showHofUpgradeModal, setShowHofUpgradeModal] = useState(false);
  const [showAuctionUpgradeModal, setShowAuctionUpgradeModal] = useState(false);
  const [showSlotTradingUpgradeModal, setShowSlotTradingUpgradeModal] =
    useState(false);
  const [showKeeperUpgradeModal, setShowKeeperUpgradeModal] = useState(false);
  const [showLeagueLimitModal, setShowLeagueLimitModal] = useState(false);
  const [createdLeague, setCreatedLeague] = useState<{
    id: number;
    inviteCode: string | null;
  } | null>(null);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
  const inviteCodeCopiedResetTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  useEffect(
    () => () => {
      if (inviteCodeCopiedResetTimer.current) {
        clearTimeout(inviteCodeCopiedResetTimer.current);
      }
    },
    [],
  );

  // Guards against firing trackPremiumFeatureClick once per trigger (e.g. per
  // locked era tile clicked) — only the closed->open transition should track.
  const openEraUpgradeModal = useCallback(() => {
    setShowEraUpgradeModal((prev) => {
      if (!prev) {
        trackPremiumFeatureClick('Historical Era Selection');
      }
      return true;
    });
  }, []);

  const { data: leaguesData } = useGetUserLeaguesQuery();
  // userLeagues is paginated (LS-9101) — use the authoritative unpaginated
  // total instead of array length so this gate stays correct past the page size.
  const leagueCount = leaguesData?.userLeagueCount ?? 0;
  const atLeagueLimit =
    !isPremium && !premiumLoading && leagueCount >= FREE_LEAGUE_LIMIT;

  // Sport is URL-driven (LS-4631): `/baseball/league/create` vs
  // `/football/league/create`. SportSwitcher navigates between the two; the
  // location-derived value is the source of truth.
  const selectedSport: SportId = sportFromPathname(location.pathname);
  const sportMeta = SPORTS.find((s) => s.id === selectedSport) ?? SPORTS[0];
  const sportAccent = ACCENT_BY_SPORT[selectedSport];

  const handleSportSelect = useCallback(
    (sport: SportId) => {
      if (sport === selectedSport) return;
      // Push (not replace) so the current sport's create page stays in
      // history — Back returns here instead of skipping past it (LS-6110).
      navigate(`/${sport}/league/create`);
    },
    [navigate, selectedSport],
  );

  const [formData, setFormData] = useState<CreateLeagueFormData>(() => {
    const initialLeagueName = sanitizeLeagueNameInput(
      searchParams.get('name') ?? '',
    )
      .trim()
      .slice(0, MAX_LEAGUE_NAME_LENGTH);
    const initialDefaults = defaultsForSport(selectedSport);

    // Deep-link prefill for partner integrations / marketing campaigns
    // (LS-6112). Each param is allowlist-validated against the same option
    // sets the form controls use; anything invalid or absent falls back to
    // the existing default, matching the tolerant `?name=` behavior above.
    const teamsParam = Number(searchParams.get('teams'));
    const initialNumberOfTeams = TEAM_COUNT_OPTIONS.includes(teamsParam)
      ? teamsParam
      : initialDefaults.numberOfTeams;

    const eraFilterParam = searchParams.get('eraFilter');
    const initialEraFilter = ERAS_BY_SPORT[selectedSport].some(
      (e) => e.id === eraFilterParam,
    )
      ? (eraFilterParam as string)
      : 'all';

    const scoringFormatParam = searchParams.get('scoringFormat');
    const initialScoringFormat: ScoringFormat =
      selectedSport === 'football' &&
      SCORING_FORMAT_OPTIONS.some((o) => o.id === scoringFormatParam)
        ? (scoringFormatParam as ScoringFormat)
        : 'ppr';

    const initialRosterSlots = { ...DST_ROSTER_DEFAULTS };

    return {
      sport: selectedSport,
      leagueName: initialLeagueName,
      numberOfTeams: initialNumberOfTeams,
      numberOfDivisions: DEFAULT_NUM_DIVISIONS,
      schedulingStrategy: 'divisional',
      playerPool: 'all',
      draftMode: 'live',
      selectionMethod: 'standard',
      draftOrder: 'snake',
      maxRosterSize:
        selectedSport === 'football'
          ? rosterSlotsTotals(initialRosterSlots).total
          : initialDefaults.maxRosterSize,
      gamesPerMatchup: initialDefaults.gamesPerMatchup,
      draftDate: undefined,
      waiverType: 'standard',
      faabBudgetDefault: 100,
      isPublic: false,
      baseballEraFilter: initialEraFilter,
      baseballHofOnly: false,
      salaryCapEnabled: false,
      salaryCap: undefined,
      salaryFloor: undefined,
      luxuryTaxThreshold: undefined,
      minSalary: undefined,
      salaryEscalationPct: undefined,
      salaryDecayPct: undefined,
      auctionBudget: 200,
      auctionMinBid: 1,
      allowDraftSlotTrading: false,
      pickTimeLimitSeconds: 120,
      rosterContinuity: 'redraft',
      keeperCount: undefined,
      keeperCostModel: undefined,
      maxConsecutiveKeeps: undefined,
      rookieExempt: false,
      scoringFormat: initialScoringFormat,
      defensiveFormat: 'dst',
      rosterSlots: initialRosterSlots,
    };
  });

  // Snapshot of formData as it stood on mount, so Cancel can detect unsaved
  // edits (LS-6108). Captured once via useRef's lazy-eval-once-on-mount
  // semantics — not re-synced on the sport-switch effect below.
  const initialFormDataRef = useRef(formData);

  // Import settings dialog (LS-9146) — lets a commissioner paste or upload a
  // JSON file exported from an existing league to prefill this form.
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setImportText(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => {
        setImportFeedback({
          type: 'error',
          message: 'Could not read that file.',
        });
      };
      reader.readAsText(file);
    },
    [],
  );

  // In-flight submit guard (LS-6063). `loading` from useCreateLeagueAndTeamsMutation
  // only flips to true on the *next* render, so a rapid double-click (or two
  // events firing within the same tick) can call handleSubmit twice before
  // `disabled={isFormDisabled}` takes effect. A ref updates synchronously, so
  // checking-and-setting it at the top of handleSubmit closes that window
  // completely, unlike state.
  const submitInFlightRef = useRef(false);

  // Client-generated idempotency key (LS-6063), stable for the lifetime of this
  // page mount. Sent with every createLeagueAndTeams attempt so the server can
  // recognize a resubmission (e.g. a duplicate request that slips past the
  // in-flight guard) and return the already-created league instead of creating
  // a second one. crypto.randomUUID() isn't available in every environment
  // (e.g. jsdom in tests, older browsers), so fall back to a manual random
  // token — this key only needs to be unique per submission attempt, not
  // cryptographically strong.
  const idempotencyKeyRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );

  // When the URL-derived sport changes, reset sport-keyed fields so eras /
  // pools / roster sizes track the active sport.
  const prevSportRef = useRef<SportId>(selectedSport);
  useEffect(() => {
    if (prevSportRef.current !== selectedSport) {
      setFormData((prev) => applySportSwitch(prev, selectedSport));
      prevSportRef.current = selectedSport;
    }
  }, [selectedSport]);

  // Collapsible section state
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(['basic']),
  );
  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => {
    setOpenSections(
      new Set([
        'basic',
        'roster-schedule',
        'era-history',
        'draft',
        'waiver-budget',
        'football-scoring',
      ]),
    );
  }, []);
  const collapseAll = useCallback(() => {
    setOpenSections(new Set(['basic']));
  }, []);

  // ── Fast Lane (LS-9128) ──────────────────────────────────────────────────
  // For users who don't want to micro-manage every setting: collapses every
  // section but Basic Settings and locks the rest closed (still visible,
  // just disabled) so the league is created from the sport's recommended
  // defaults. Turning it back off just unlocks the accordion again — no
  // form data is reset, since the defaults were already the form's state.
  const [fastLane, setFastLane] = useState(false);
  const toggleFastLane = useCallback(() => {
    setFastLane((prev) => {
      const next = !prev;
      if (next) setOpenSections(new Set(['basic']));
      trackFastLaneToggled(next, selectedSport);
      return next;
    });
  }, [selectedSport]);

  // Auto-expands every section that has an invalid field and scrolls to the
  // first one, so a failed submit shows the user where all N errors live
  // instead of leaving them to guess from a single truncated message
  // (LS-6090).
  const revealValidationErrors = useCallback(
    (errors: Record<string, string>) => {
      const errorSectionIds = Object.keys(errors)
        .map((field) => VALIDATION_ERROR_SECTION[field])
        .filter((id): id is string => Boolean(id));
      if (errorSectionIds.length === 0) return;

      // A validation error can live in a section Fast Lane just locked —
      // turn it off so the user can actually reach and fix the field
      // instead of seeing an expand attempt silently no-op (LS-9128).
      setFastLane(false);
      setOpenSections((prev) => new Set([...prev, ...errorSectionIds]));

      const firstSectionId = errorSectionIds[0];
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-testid="section-toggle-${firstSectionId}"]`)
          ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });
    },
    [],
  );

  const [createLeagueAndTeams, { loading }] = useCreateLeagueAndTeamsMutation({
    update: (cache, { data }) => {
      if (data?.createLeagueAndTeams?.league) {
        const newLeague = data.createLeagueAndTeams.league;
        try {
          const existingData = cache.readQuery<GetUserLeaguesQuery>({
            query: GetUserLeagues,
          });
          if (existingData?.userLeagues) {
            cache.writeQuery({
              query: GetUserLeagues,
              data: { userLeagues: [...existingData.userLeagues, newLeague] },
            });
          }
        } catch (error) {
          LOGGER.info(
            'Cache read failed, will refetch queries instead:',
            String(error),
          );
        }
      }
    },
    refetchQueries: [{ query: GetUserLeagues }],
  });

  // Live eligible-player-count preview for a custom era range (LS-6089).
  // Debounced on a 400ms trailing timer so the query doesn't fire per keystroke
  // as the user types into the Start Year / End Year inputs.
  const [debouncedCustomEra, setDebouncedCustomEra] = useState<{
    startYear?: number;
    endYear?: number;
  }>({
    startYear: formData.customEraStartYear,
    endYear: formData.customEraEndYear,
  });
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCustomEra({
        startYear: formData.customEraStartYear,
        endYear: formData.customEraEndYear,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [formData.customEraStartYear, formData.customEraEndYear]);

  const isCustomEraRangeComplete =
    formData.baseballEraFilter === 'custom' &&
    debouncedCustomEra.startYear != null &&
    debouncedCustomEra.endYear != null &&
    debouncedCustomEra.startYear <= debouncedCustomEra.endYear;

  const {
    data: eligiblePlayerCountData,
    loading: eligiblePlayerCountLoading,
    error: eligiblePlayerCountError,
  } = usePreviewEligiblePlayerCountQuery({
    variables: {
      sport: formData.sport,
      playerPool: formData.playerPool,
      baseballHofOnly: formData.baseballHofOnly,
      baseballEraFilter: formData.baseballEraFilter,
      customEraStartYear: debouncedCustomEra.startYear,
      customEraEndYear: debouncedCustomEra.endYear,
    },
    skip: !isCustomEraRangeComplete,
    fetchPolicy: 'cache-and-network',
  });
  const eligiblePlayerCount =
    eligiblePlayerCountData?.previewEligiblePlayerCount;

  const handleInputChange = (
    field: keyof CreateLeagueFormData,
    value: string | number | boolean | Date | undefined,
  ) => {
    setHasUnsavedChanges(true);
    setFormData((prev) => {
      const sanitizedValue =
        field === 'leagueName' && typeof value === 'string'
          ? sanitizeLeagueNameInput(value)
          : value;
      const next = { ...prev, [field]: sanitizedValue };
      if (field === 'draftMode') {
        if (value === 'automated') {
          if (prev.selectionMethod !== 'random') {
            setSelectionResetNotice(
              prev.selectionMethod === 'auction'
                ? 'Selection method reset to Random; auction settings hidden.'
                : 'Switching to automated draft reset your selection method to Random.',
            );
          }
          next.selectionMethod = 'random';
        } else {
          setSelectionResetNotice(null);
        }
      }
      // Auction drafts have no slots to trade (LS-8675) — coerce the hidden
      // toggle back off so a previously-enabled value can't be submitted.
      if (next.selectionMethod === 'auction' && next.allowDraftSlotTrading) {
        next.allowDraftSlotTrading = false;
      }
      // Switching D/ST vs IDP changes which slots exist (LS-6147) — reset
      // rosterSlots to that format's defaults, mirroring
      // CreateLeagueWizard.tsx's SET_DEFENSIVE_FORMAT reducer case, and
      // re-derive maxRosterSize from the new slot total.
      if (field === 'defensiveFormat') {
        const freshSlots =
          value === 'idp'
            ? { ...IDP_ROSTER_DEFAULTS }
            : { ...DST_ROSTER_DEFAULTS };
        next.rosterSlots = freshSlots;
        next.maxRosterSize = rosterSlotsTotals(freshSlots).total;
      }
      if (
        field === 'numberOfTeams' &&
        typeof value === 'number' &&
        next.numberOfDivisions % 2 !== value % 2
      ) {
        // Team-count parity changed (in either direction), stranding the
        // current division count on the wrong parity — the ButtonGroup
        // filters its options to matching parity, so the stale value would
        // render with nothing highlighted. Snap to the nearest same-parity
        // option instead of hardcoding 1 (LS-6060).
        const validDivisionOptions = ALL_DIVISION_COUNT_OPTIONS.filter(
          (d) => d <= value && d % 2 === value % 2,
        );
        const staleDivisions = next.numberOfDivisions;
        next.numberOfDivisions = validDivisionOptions.reduce(
          (nearest, d) =>
            Math.abs(d - staleDivisions) < Math.abs(nearest - staleDivisions)
              ? d
              : nearest,
          validDivisionOptions[0] ?? 1,
        );
        if (next.numberOfDivisions !== staleDivisions) {
          setDivisionResetNotice(
            `Divisions reset to ${next.numberOfDivisions} to match team parity.`,
          );
        }
      } else if (field === 'numberOfDivisions') {
        setDivisionResetNotice(null);
      }
      if (
        next.numberOfDivisions === 1 &&
        next.schedulingStrategy === 'divisional'
      ) {
        next.schedulingStrategy = 'round-robin';
      }
      // ── Keeper / roster-continuity consistency (LS-8672) ─────────────────
      // Keeper mode is only valid with selectionMethod 'standard' or
      // 'auction' (mirrors validateKeeperConfig in mutations.ts). If a
      // selection-method change — direct, or forced by switching to
      // automated draft mode above — leaves an already-configured keeper
      // league stranded on 'random', reset it to Redraft instead of
      // submitting an invalid combination.
      if (
        next.selectionMethod === 'random' &&
        next.rosterContinuity === 'keeper'
      ) {
        next.rosterContinuity = 'redraft';
        next.keeperCount = undefined;
        next.keeperCostModel = undefined;
        next.maxConsecutiveKeeps = undefined;
        next.rookieExempt = false;
        setKeeperResetNotice(
          'Keeper mode requires Standard or Auction selection method — reset to Redraft.',
        );
      } else if (
        field === 'rosterContinuity' &&
        next.rosterContinuity === 'redraft'
      ) {
        next.keeperCount = undefined;
        next.keeperCostModel = undefined;
        next.maxConsecutiveKeeps = undefined;
        next.rookieExempt = false;
        setKeeperResetNotice(null);
      } else if (next.rosterContinuity === 'keeper') {
        const requiredCostModel: KeeperCostModel =
          next.selectionMethod === 'auction'
            ? 'auction-budget'
            : 'round-penalty';
        if (next.keeperCostModel !== requiredCostModel) {
          next.keeperCostModel = requiredCostModel;
        }
        setKeeperResetNotice(null);
      }
      return next;
    });
  };

  // Per-slot roster config (LS-6147, football only). rosterSlots isn't a
  // primitive, so it goes through its own setter rather than
  // handleInputChange; maxRosterSize is kept derived from the slot total so
  // validateFormFull's existing roster-range check stays accurate. The
  // submit payload sends both maxRosterSize and rosterSlots (server-side
  // handling added in LS-6145).
  const handleRosterSlotsChange = useCallback(
    (slots: Record<string, number>) => {
      setHasUnsavedChanges(true);
      setFormData((prev) => ({
        ...prev,
        rosterSlots: slots,
        maxRosterSize: rosterSlotsTotals(slots).total,
      }));
    },
    [],
  );

  const validationErrors = useMemo(
    () => validateFormFull(formData),
    [formData],
  );
  const errorCount = Object.keys(validationErrors).length;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorMeta, setSubmitErrorMeta] = useState<{
    code?: string;
    correlationId: string;
  } | null>(null);
  const submitErrorBannerRef = useRef<HTMLDivElement>(null);
  const prevSubmitErrorRef = useRef<string | null>(null);

  // Scroll the submit error banner into view on the null-to-truthy
  // transition only (LS-6066) — if the form is scrolled past the top when
  // submit fails, the banner renders above the fold and the user assumes
  // nothing happened. Re-renders while an error is already showing (e.g.
  // repeated submit clicks) must not re-trigger the scroll.
  useEffect(() => {
    if (submitError && !prevSubmitErrorRef.current) {
      submitErrorBannerRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
    prevSubmitErrorRef.current = submitError;
  }, [submitError]);

  const [selectionResetNotice, setSelectionResetNotice] = useState<
    string | null
  >(null);
  const [divisionResetNotice, setDivisionResetNotice] = useState<string | null>(
    null,
  );
  const [keeperResetNotice, setKeeperResetNotice] = useState<string | null>(
    null,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Unsaved-changes navigation guard (LS-6109). Without this, a stray click on
  // a nav link mid-flow (or the browser back button / a refresh) silently
  // discards everything the user has entered.
  //
  // Implementation note: react-router-dom v6's `useBlocker` only works under a
  // Data Router (`createBrowserRouter` + `RouterProvider`). This app mounts a
  // classic `<BrowserRouter>` (see apps/web/src/main.tsx), so `useBlocker`
  // would throw "must be used within a data router". We therefore guard
  // navigation with window/document listeners instead — the same pattern used
  // by LeagueScoringEditor (LS-4104) and EliteDraftBoardScreenWrapper
  // (LS-4986).
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const promptMessage =
      'You have unsaved league settings. Leave without creating your league?';

    // 1. Browser-level: refresh, tab close, typed-URL navigation. The browser
    //    supplies its own dialog text in modern Chrome/Firefox/Safari;
    //    `event.returnValue` is required for the prompt to appear at all but
    //    its value is ignored.
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 2. SPA-level: in-app clicks that would trigger a route change (header
    //    nav, sidebar links). Capture-phase so we run before any onClick
    //    handler that calls `navigate()`. Clicks anywhere within the create
    //    page itself (sport tabs, section toggles, form fields, Cancel /
    //    Create buttons) are page interactions, not navigations away from the
    //    flow, so they're excluded via the page root.
    const pageRoot = document.querySelector(
      '[data-testid="league-create-page"]',
    );

    const handleNavClick = (event: MouseEvent) => {
      // Only respond to primary clicks without modifier keys; cmd/ctrl-click
      // opens a new tab, which doesn't lose the current page's state.
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      // event.target on a click can be a Text node (e.g., a click landing on
      // selected text inside a `<p>`). `.closest()` only exists on Element,
      // so narrow with `instanceof Element` rather than a blind cast.
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Clicks inside the create-league page are never navigations away from
      // this flow — let them through.
      if (pageRoot?.contains(target)) return;

      const navTarget = target.closest('[role="tab"], a[href]');
      if (!navTarget) return;

      // Re-clicking the currently selected tab is a no-op route-wise.
      if (navTarget.getAttribute('aria-selected') === 'true') return;

      // External / new-window links bypass our SPA — beforeunload will fire
      // for those, so we can let them through here.
      if (navTarget instanceof HTMLAnchorElement) {
        if (navTarget.target === '_blank') return;
        const href = navTarget.getAttribute('href');
        if (!href) return;
        // Skip hash-only and pure query-string changes — they don't unmount
        // this page.
        if (href.startsWith('#') || href.startsWith('?')) return;
      }

      if (!window.confirm(promptMessage)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('click', handleNavClick, { capture: true });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleNavClick, {
        capture: true,
      });
    };
  }, [hasUnsavedChanges]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Synchronous reentry guard (LS-6063) — must run before any other check
    // so a double-click can't fire two mutations while `loading` is still
    // false from the first click's not-yet-rendered state update.
    if (submitInFlightRef.current) {
      return;
    }
    submitInFlightRef.current = true;

    setSubmitError(null);
    setSubmitErrorMeta(null);

    if (atLeagueLimit) {
      trackPremiumFeatureClick('Unlimited League Creation');
      setShowLeagueLimitModal(true);
      submitInFlightRef.current = false;
      return;
    }
    if (errorCount > 0) {
      revealValidationErrors(validationErrors);
      submitInFlightRef.current = false;
      return;
    }
    if ((!isPremium || premiumLoading) && formData.waiverType === 'faab') {
      trackPremiumFeatureClick('FAAB Waiver Settings');
      setShowWaiverUpgradeModal(true);
      submitInFlightRef.current = false;
      return;
    }
    if (
      (!isPremium || premiumLoading) &&
      !FREE_ERA_IDS_BY_SPORT[formData.sport].has(formData.baseballEraFilter)
    ) {
      openEraUpgradeModal();
      submitInFlightRef.current = false;
      return;
    }
    if ((!isPremium || premiumLoading) && formData.baseballHofOnly) {
      trackPremiumFeatureClick('Hall of Fame Only');
      setShowHofUpgradeModal(true);
      submitInFlightRef.current = false;
      return;
    }

    // Re-validate against the current time rather than relying solely on the
    // memoized validationErrors (LS-6076): the useMemo above is keyed on
    // formData, so it does not recompute merely because time has passed. A
    // long-idle form can hold a draftDate that was valid when picked but has
    // since slipped into the past.
    const freshErrors = validateFormFull(formData);
    const freshErrorCount = Object.keys(freshErrors).length;
    if (freshErrorCount > 0) {
      setSubmitError(Object.values(freshErrors)[0]);
      return;
    }

    try {
      const trimmedLeagueName = formData.leagueName.trim();
      const result = await createLeagueAndTeams({
        errorPolicy: 'none',
        context: { suppressGlobalError: true },
        variables: {
          input: {
            sport:
              formData.sport === 'football' ? Sport.Football : Sport.Baseball,
            defensiveFormat:
              formData.sport === 'football'
                ? (formData.defensiveFormat as GqlDefensiveFormat)
                : undefined,
            scoringFormat:
              formData.sport === 'football'
                ? formData.scoringFormat
                : undefined,
            leagueName: trimmedLeagueName,
            numberOfTeams: formData.numberOfTeams,
            numberOfDivisions: formData.numberOfDivisions,
            schedulingStrategy: formData.schedulingStrategy,
            schedulingDivisionalWeightPct:
              formData.schedulingStrategy === 'divisional' &&
              isPremium &&
              !premiumLoading
                ? formData.schedulingDivisionalWeightPct
                : undefined,
            playerPool: formData.playerPool,
            draftMode: formData.draftMode,
            selectionMethod: formData.selectionMethod,
            draftOrder: formData.draftOrder,
            maxRosterSize: formData.maxRosterSize,
            // Per-slot roster config (LS-6147 UI, wired server-side by
            // LS-6145). BN isn't a position_slot — it's already folded into
            // maxRosterSize above.
            ...(formData.sport === 'football'
              ? {
                  rosterSlots: Object.entries(formData.rosterSlots)
                    .filter(([slot, count]) => slot !== 'BN' && count > 0)
                    .map(([positionType, count]) => ({ positionType, count })),
                }
              : {}),
            startDate: formData.draftDate
              ? formData.draftDate.toISOString()
              : undefined,
            isPublic: formData.isPublic,
            tradingEnabled: true,
            waiverEnabled: true,
            waiverType: formData.waiverType,
            faabBudgetDefault: formData.faabBudgetDefault,
            eraFilter: formData.baseballEraFilter,
            baseballHofOnly: formData.baseballHofOnly,
            customEraStartYear:
              formData.baseballEraFilter === 'custom'
                ? formData.customEraStartYear
                : undefined,
            customEraEndYear:
              formData.baseballEraFilter === 'custom'
                ? formData.customEraEndYear
                : undefined,
            salaryCapEnabled: formData.salaryCapEnabled,
            salaryCap: formData.salaryCapEnabled
              ? formData.salaryCap
              : undefined,
            salaryFloor: formData.salaryCapEnabled
              ? formData.salaryFloor
              : undefined,
            luxuryTaxThreshold: formData.salaryCapEnabled
              ? formData.luxuryTaxThreshold
              : undefined,
            minSalary: formData.salaryCapEnabled
              ? formData.minSalary
              : undefined,
            salaryEscalationPct: formData.salaryCapEnabled
              ? formData.salaryEscalationPct
              : undefined,
            salaryDecayPct: formData.salaryCapEnabled
              ? formData.salaryDecayPct
              : undefined,
            auctionBudget:
              formData.selectionMethod === 'auction'
                ? formData.auctionBudget
                : undefined,
            auctionMinBid:
              formData.selectionMethod === 'auction'
                ? formData.auctionMinBid
                : undefined,
            // Draft slot trading (LS-8675) — only sent when enabled for a
            // non-auction draft; the server rejects true for auction leagues.
            allowDraftSlotTrading:
              formData.selectionMethod !== 'auction' &&
              formData.allowDraftSlotTrading
                ? true
                : undefined,
            pickTimeLimitSeconds:
              formData.draftMode === 'live'
                ? formData.pickTimeLimitSeconds
                : undefined,
            rosterContinuity:
              formData.rosterContinuity === 'keeper'
                ? GqlRosterContinuity.Keeper
                : undefined,
            keeperSettings:
              formData.rosterContinuity === 'keeper' &&
              formData.keeperCount !== undefined &&
              formData.keeperCostModel !== undefined
                ? {
                    keeperCount: formData.keeperCount,
                    costModel: formData.keeperCostModel,
                    maxConsecutiveKeeps: formData.maxConsecutiveKeeps,
                    rookieExempt: formData.rookieExempt,
                  }
                : undefined,
            gamesPerMatchup: formData.gamesPerMatchup,
            // Idempotency key (LS-6063) — lets the server recognize a
            // resubmission of this same in-progress attempt (e.g. a duplicate
            // request that slips past submitInFlightRef) and return the
            // already-created league instead of creating a second one.
            idempotencyKey: idempotencyKeyRef.current,
          },
        },
      });

      const newLeague = result.data?.createLeagueAndTeams?.league;
      if (newLeague?.id) {
        setHasUnsavedChanges(false);
        if (fastLane) {
          trackFastLaneLeagueCreated(formData.sport);
        }
        setCreatedLeague({
          id: newLeague.id,
          inviteCode: newLeague.inviteCode ?? null,
        });
      } else {
        setSubmitError(LEAGUE_FORM_MESSAGES.submitFallback);
      }
    } catch (error) {
      // Generate a short reference token so support can correlate a user's
      // "Unable to save league" report with logs/Rollbar even though this
      // mutation's errorPolicy: 'none' + suppressGlobalError bypasses the
      // shared errorLink (apollo-client.ts) that would normally do this.
      const correlationId = generateCorrelationId();
      const code = CombinedGraphQLErrors.is(error)
        ? (error.errors[0]?.extensions?.['code'] as string | undefined)
        : ServerError.is(error)
          ? String(error.statusCode)
          : undefined;

      LOGGER.error(
        'Error creating league:',
        error instanceof Error ? error : new Error(String(error)),
        { code, correlationId },
      );
      setSubmitError(getSubmitErrorMessage(error));
      setSubmitErrorMeta({ code, correlationId });
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const handleContinueToLeague = useCallback(() => {
    if (!createdLeague) return;
    setCreatedLeague(null);
    setInviteCodeCopied(false);
    navigate(`/${formData.sport}/league/${createdLeague.id}`);
  }, [createdLeague, formData.sport, navigate]);

  const handleCopyInviteCode = useCallback(() => {
    const writeText =
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText.bind(navigator.clipboard);
    if (!writeText || !createdLeague?.inviteCode) return;
    void writeText(createdLeague.inviteCode).then(
      () => {
        setInviteCodeCopied(true);
        if (inviteCodeCopiedResetTimer.current) {
          clearTimeout(inviteCodeCopiedResetTimer.current);
        }
        inviteCodeCopiedResetTimer.current = setTimeout(
          () => setInviteCodeCopied(false),
          1500,
        );
      },
      () => undefined,
    );
  }, [createdLeague]);

  const handleApplyImport = useCallback(() => {
    const result = parseLeagueSettingsExport(importText);
    if (!result.ok) {
      setImportFeedback({ type: 'error', message: result.error });
      return;
    }

    const { next, appliedCount, skippedFields } = applyImportedSettings(
      formData,
      result.envelope,
    );
    if (appliedCount === 0) {
      setImportFeedback({
        type: 'error',
        message: 'No recognizable settings found in that file.',
      });
      return;
    }

    setFormData(next);
    setHasUnsavedChanges(true);
    revealValidationErrors(validateFormFull(next));

    const sportNote =
      result.envelope.sport !== formData.sport
        ? ` ${result.envelope.sport}-only settings were skipped since this is a ${formData.sport} league.`
        : '';
    const skippedNote = skippedFields.length
      ? ` ${skippedFields.length} value(s) were unrecognized and ignored.`
      : '';
    setImportFeedback({
      type: 'success',
      message: `Applied ${appliedCount} setting${appliedCount === 1 ? '' : 's'}.${sportNote}${skippedNote}`,
    });
  }, [importText, formData, revealValidationErrors]);

  const isFormDisabled = loading;

  const isFormDirty =
    JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const handleCancel = useCallback(() => {
    if (isFormDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    navigate(`/${formData.sport}`);
  }, [isFormDirty, navigate, formData.sport]);

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <PageMeta
        title={`Create a ${sportMeta.name} League`}
        description={
          selectedSport === 'football'
            ? 'Start your own fantasy football league on Legacy Sports. Customize draft settings, roster rules, and invite friends to compete.'
            : 'Start your own fantasy baseball league on Legacy Sports. Customize draft settings, roster rules, and invite friends to compete.'
        }
      />

      <YStack
        data-testid="league-create-page"
        padding="$6"
        $sm={{ padding: '$4', paddingBottom: '$8' }}
        maxWidth={1200}
        alignSelf="center"
        width="100%"
        gap="$6"
      >
        {/* ── Page header ── */}
        <XStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="$4"
          flexWrap="wrap"
        >
          <YStack flex={1} minWidth={0} gap="$1">
            <Text
              fontFamily="$display"
              fontWeight="700"
              fontSize={12}
              letterSpacing={1.4}
              textTransform="uppercase"
              color="$brandGoldLight"
            >
              {sportMeta.name} · New League
            </Text>
            <H1
              fontFamily="$display"
              fontWeight="800"
              fontSize="$10"
              color="$color"
              letterSpacing={-0.5}
              $sm={{ fontSize: '$8' }}
              data-testid="create-league-heading"
            >
              Create {sportMeta.name} League
            </H1>
            {/* Sport-accent rule under the H1 — seam-red for baseball,
                amber for football per the LS-4631 theming. */}
            <YStack
              data-testid="sport-accent-rule"
              width={56}
              height={3}
              borderRadius={2}
              backgroundColor={sportAccent}
              marginTop="$2"
            />
            <Text
              fontFamily="$body"
              fontSize={17}
              color="$color11"
              lineHeight={27}
              marginTop="$1"
              maxWidth={600}
            >
              Configure your league settings and draft rules. You can adjust
              everything except team count after the draft.
            </Text>
          </YStack>

          <YStack gap="$2" alignItems="flex-end">
            <XStack
              gap="$2.5"
              alignItems="center"
              data-testid="fast-lane-toggle"
            >
              <YStack alignItems="flex-end">
                <Text
                  fontFamily="$display"
                  fontWeight="700"
                  fontSize={11}
                  letterSpacing={1}
                  textTransform="uppercase"
                  color={fastLane ? '$brandGoldLight' : '$gray9'}
                >
                  Fast Lane
                </Text>
                <Text fontFamily="$body" fontSize={11} color="$gray9">
                  Skip the details, use our defaults
                </Text>
              </YStack>
              <PillToggle
                value={fastLane}
                offLabel="⚡ Off"
                onLabel="⚡ On"
                onChange={toggleFastLane}
                disabled={isFormDisabled}
              />
            </XStack>
            <XStack gap="$2">
              <Button
                size="$2"
                variant="outlined"
                icon={<Upload size={14} />}
                onPress={() => {
                  setImportFeedback(null);
                  setShowImportDialog(true);
                }}
                disabled={isFormDisabled}
                data-testid="import-league-settings-button"
              >
                Import settings
              </Button>
              <Button
                size="$2"
                variant="outlined"
                onPress={expandAll}
                disabled={isFormDisabled || fastLane}
              >
                Expand all
              </Button>
              <Button
                size="$2"
                variant="outlined"
                onPress={collapseAll}
                disabled={isFormDisabled || fastLane}
              >
                Collapse
              </Button>
            </XStack>
          </YStack>
        </XStack>

        {/* ── Sport switcher ── */}
        <YStack gap="$2">
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.4}
            textTransform="uppercase"
            color="$gray9"
          >
            Sport
          </Text>
          <SportSwitcher
            value={selectedSport}
            onSelect={handleSportSelect}
            disabled={isFormDisabled}
            unavailableSports={unavailableSports}
          />
          {selectedSport === 'football' && (
            <XStack
              role="status"
              aria-live="polite"
              gap="$3"
              alignItems="center"
              backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
              borderWidth={1}
              borderColor={withAlpha(BRAND_GOLD, 0.35)}
              borderRadius="$4"
              padding="$3"
              marginTop="$1"
              data-testid="football-beta-banner"
            >
              <Text fontSize={16} aria-hidden="true">
                🏈
              </Text>
              <YStack flex={1}>
                <Text
                  fontFamily="$display"
                  fontWeight="700"
                  fontSize={12}
                  letterSpacing={1.2}
                  textTransform="uppercase"
                  color="$brandGoldLight"
                >
                  Football is in Beta
                </Text>
                <Text
                  fontFamily="$body"
                  fontSize={13}
                  color="$color11"
                  marginTop={2}
                >
                  Football leagues are rolling out gradually. Expect the
                  occasional rough edge while we polish the experience.
                </Text>
              </YStack>
            </XStack>
          )}
        </YStack>

        {/* ── Free league limit banner ── */}
        {atLeagueLimit && (
          <XStack
            role="alert"
            aria-live="polite"
            data-testid="league-limit-banner"
            gap="$3"
            alignItems="flex-start"
            backgroundColor="rgba(197,165,90,0.08)"
            borderWidth={1}
            borderColor="rgba(197,165,90,0.35)"
            borderRadius="$4"
            padding="$4"
          >
            <YStack
              width={36}
              height={36}
              borderRadius={18}
              backgroundColor="rgba(197,165,90,0.2)"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <Text fontSize={16}>
                <span role="img" aria-label="trophy">
                  🏆
                </span>
              </Text>
            </YStack>
            <YStack flex={1}>
              <Text
                fontFamily="$display"
                fontWeight="700"
                fontSize={13}
                letterSpacing={0.8}
                textTransform="uppercase"
                color="$brandGoldLight"
              >
                League limit reached
              </Text>
              <Text
                fontFamily="$body"
                fontSize={13}
                color="$color11"
                marginTop={2}
              >
                Free accounts can be in up to {FREE_LEAGUE_LIMIT} leagues total,
                across every sport — baseball and football leagues both count
                toward the same limit. Upgrade to Legacy Commissioner for
                unlimited leagues.
              </Text>
            </YStack>
            <Button
              size="$2"
              onPress={() => {
                trackPremiumFeatureClick('Unlimited League Creation');
                setShowLeagueLimitModal(true);
              }}
              backgroundColor="$brandGold"
              borderWidth={0}
            >
              <Text color="#111" fontWeight="700" fontSize={13}>
                Upgrade
              </Text>
            </Button>
          </XStack>
        )}

        {/* ── Submit error banner ── */}
        {submitError && (
          <XStack
            ref={submitErrorBannerRef}
            data-testid="submit-error-banner"
            role="alert"
            aria-live="assertive"
            gap="$3"
            alignItems="flex-start"
            backgroundColor="rgba(176,46,68,0.22)"
            borderWidth={1}
            borderColor="rgba(176,46,68,0.55)"
            borderRadius="$4"
            padding="$4"
          >
            <YStack
              width={28}
              height={28}
              borderRadius={14}
              backgroundColor="rgba(196,30,58,0.2)"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <AlertCircle size={14} color="#E07A8C" />
            </YStack>
            <YStack flex={1}>
              <Text
                fontFamily="$display"
                fontWeight="700"
                fontSize={13}
                letterSpacing={0.4}
                textTransform="uppercase"
                color="#E07A8C"
              >
                Unable to save league
              </Text>
              <Text
                fontFamily="$body"
                fontSize={14}
                color="$color11"
                marginTop={2}
              >
                {submitError}
              </Text>
              {submitErrorMeta && (
                <Text
                  fontFamily="$body"
                  fontSize={12}
                  color="$color10"
                  marginTop={2}
                >
                  {submitErrorMeta.code
                    ? `Error code: ${submitErrorMeta.code} · `
                    : ''}
                  Ref: {submitErrorMeta.correlationId}
                </Text>
              )}
            </YStack>
            <Button
              size="$2"
              variant="outlined"
              onPress={() => {
                setSubmitError(null);
                setSubmitErrorMeta(null);
              }}
            >
              Dismiss
            </Button>
          </XStack>
        )}

        {/* ── Two-column layout ── */}
        <XStack
          gap="$6"
          alignItems="flex-start"
          $lg={{ flexDirection: 'column' }}
        >
          {/* ── Main form column ── */}
          <YStack flex={1} minWidth={0} gap="$4">
            <form
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {/* ── Section 1: Basic Settings ── */}
              <CollapsibleSection
                id="basic"
                num={1}
                title="Basic Settings"
                sub="The essentials — name, size, and who gets in."
                summary={
                  <span>
                    <strong>{formData.numberOfTeams}</strong> teams ·{' '}
                    {formData.numberOfDivisions} div
                    {formData.numberOfDivisions > 1 ? 's' : ''} ·{' '}
                    {formData.isPublic ? 'Public' : 'Private'}
                  </span>
                }
                open={openSections.has('basic')}
                onToggle={() => toggleSection('basic')}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* League Name — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="League Name"
                      labelId="league-name-label"
                      required
                      hint="3–50 characters. Shown on standings, invites, and the draft board."
                      hintId="league-name-hint"
                    >
                      <Input
                        id="league-name-input"
                        aria-labelledby="league-name-label"
                        aria-describedby="league-name-hint"
                        aria-invalid={!!validationErrors.leagueName}
                        size="$4"
                        testID="create-league-name-input"
                        placeholder="Enter your league name"
                        value={formData.leagueName}
                        onChangeText={(text: string) =>
                          handleInputChange('leagueName', text)
                        }
                        borderColor={
                          validationErrors.leagueName ? '$red8' : '$borderColor'
                        }
                        backgroundColor="$color1"
                        disabled={isFormDisabled}
                        aria-required="true"
                        maxLength={MAX_LEAGUE_NAME_LENGTH}
                      />
                    </FieldRow>
                  </div>

                  {/* Number of Teams */}
                  <FieldRow
                    label="Number of Teams"
                    testId="numberOfTeams-field"
                    required
                    hint={
                      formData.numberOfTeams % 2 === 1
                        ? 'Teams are odd — divisions must also be odd, and one team will have a bye each week all season.'
                        : 'Even numbers produce cleanest divisions. 12 is standard.'
                    }
                  >
                    <ButtonGroup
                      value={formData.numberOfTeams}
                      options={TEAM_COUNT_OPTIONS}
                      onChange={(v) => handleInputChange('numberOfTeams', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Divisions */}
                  <FieldRow
                    label="Number of Divisions"
                    testId="numberOfDivisions-field"
                    hint={
                      formData.numberOfTeams % 2 === 1
                        ? `With ${formData.numberOfTeams} teams, only odd division counts (${ALL_DIVISION_COUNT_OPTIONS.filter((d) => d <= formData.numberOfTeams && d % 2 === 1).join(', ')}) are allowed for equal team distribution.`
                        : 'How many divisions to split your teams into'
                    }
                  >
                    <ButtonGroup
                      value={formData.numberOfDivisions}
                      options={ALL_DIVISION_COUNT_OPTIONS.filter(
                        (d) =>
                          d <= formData.numberOfTeams &&
                          formData.numberOfTeams % 2 === d % 2,
                      )}
                      onChange={(v) =>
                        handleInputChange('numberOfDivisions', v)
                      }
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Division reset notice */}
                  {divisionResetNotice && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <XStack
                        role="status"
                        aria-live="polite"
                        gap="$3"
                        alignItems="center"
                        backgroundColor={withAlpha(AMBER, 0.1)}
                        borderWidth={1}
                        borderColor={withAlpha(AMBER, 0.4)}
                        borderRadius="$4"
                        padding="$3"
                        data-testid="division-reset-notice"
                      >
                        <AlertCircle size={16} color={AMBER} flexShrink={0} />
                        <Text
                          fontFamily="$body"
                          fontSize={13}
                          color="$color11"
                          flex={1}
                        >
                          {divisionResetNotice}
                        </Text>
                        <Button
                          size="$2"
                          variant="outlined"
                          onPress={() => setDivisionResetNotice(null)}
                        >
                          Dismiss
                        </Button>
                      </XStack>
                    </div>
                  )}

                  {/* Visibility — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="League Visibility"
                      hint={
                        formData.isPublic
                          ? 'Anyone can browse and join this league. Its name and invite become visible to any signed-in user.'
                          : 'Only people with your invite code can join'
                      }
                    >
                      <PillToggle
                        value={formData.isPublic}
                        offLabel="🔒 Private"
                        onLabel="🌐 Public"
                        onChange={(v) => handleInputChange('isPublic', v)}
                        disabled={isFormDisabled}
                      />
                    </FieldRow>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ── Section 2: Roster & Schedule ── */}
              <CollapsibleSection
                id="roster-schedule"
                num={2}
                title="Roster & Schedule"
                sub="How the season runs and what the rosters look like."
                summary={
                  <span>
                    {scheduleDisplayLabel(formData.schedulingStrategy)} ·{' '}
                    {formData.maxRosterSize} roster ·{' '}
                    {poolDisplayLabel(formData.sport, formData.playerPool)}
                  </span>
                }
                open={openSections.has('roster-schedule')}
                onToggle={() => toggleSection('roster-schedule')}
                disabled={fastLane}
                disabledReason="Using recommended defaults — turn off Fast Lane to customize."
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* Scheduling Strategy — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="Scheduling Strategy"
                      hint={
                        formData.numberOfDivisions === 1
                          ? "Only 1 division — Divisional would be identical to Round Robin, so it's disabled."
                          : 'Divisional schedules prioritize in-division matchups'
                      }
                    >
                      <ButtonGroup
                        value={formData.schedulingStrategy}
                        options={SCHEDULING_STRATEGY_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                          disabled:
                            o.value === 'divisional' &&
                            formData.numberOfDivisions === 1,
                        }))}
                        onChange={(v) =>
                          handleInputChange('schedulingStrategy', v)
                        }
                        disabled={isFormDisabled}
                        wide
                      />
                    </FieldRow>
                  </div>

                  {/* Advanced Scheduling — custom in-division game ratio (Premium, Divisional only) */}
                  {formData.schedulingStrategy === 'divisional' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <PremiumGate
                        isPremium={isPremium}
                        featureName="Advanced Scheduling"
                        featureDescription="Set a custom in-division vs out-of-division game ratio instead of the default schedule."
                      >
                        <FieldRow
                          label="In-Division Game Ratio"
                          hint="Percentage of games played against division opponents"
                        >
                          <ButtonGroup
                            value={
                              formData.schedulingDivisionalWeightPct ?? 100
                            }
                            options={DIVISIONAL_WEIGHT_OPTIONS.map((pct) => ({
                              value: pct,
                              label: `${pct}%`,
                            }))}
                            onChange={(v) =>
                              handleInputChange(
                                'schedulingDivisionalWeightPct',
                                v,
                              )
                            }
                            disabled={isFormDisabled}
                          />
                        </FieldRow>
                      </PremiumGate>
                    </div>
                  )}

                  {/* Max Roster Size — baseball only. Football configures
                      roster size per-slot below (LS-6147). */}
                  {formData.sport === 'baseball' && (
                    <FieldRow
                      label="Max Roster Size"
                      hint={`Active + bench. ${ROSTER_RANGE_BY_SPORT[formData.sport].defaultLabel}`}
                    >
                      <ButtonGroup
                        data-testid="max-roster-size-group"
                        value={formData.maxRosterSize}
                        options={ROSTER_SIZE_OPTIONS_BY_SPORT[
                          formData.sport
                        ].map((size) => ({
                          value: size,
                          label: String(size),
                          recommended:
                            size ===
                            defaultsForSport(formData.sport).maxRosterSize,
                        }))}
                        onChange={(v) => handleInputChange('maxRosterSize', v)}
                        disabled={isFormDisabled}
                      />
                    </FieldRow>
                  )}

                  {/* Roster Positions — football only. Per-slot config
                      (QB/RB/WR/TE/FLEX/K/DST-or-IDP/Bench), reusing the
                      wizard's StepRosterSettings (LS-6147). Drives
                      maxRosterSize as the sum of slots. */}
                  {formData.sport === 'football' && (
                    <div
                      style={{ gridColumn: '1 / -1' }}
                      data-testid="roster-positions-config"
                    >
                      <StepRosterSettings
                        defensiveFormat={formData.defensiveFormat}
                        rosterSlots={formData.rosterSlots}
                        onChange={handleRosterSlotsChange}
                      />
                    </div>
                  )}

                  {/* Player Pool */}
                  <FieldRow
                    label="Player Pool"
                    hint={
                      formData.sport === 'football'
                        ? 'Limit to one conference, or keep it open league-wide.'
                        : "Narrow the league to a single league's talent, or open it up."
                    }
                  >
                    <ButtonGroup
                      value={formData.playerPool}
                      options={PLAYER_POOL_OPTIONS_BY_SPORT[formData.sport].map(
                        (o) => ({ value: o.value, label: o.label }),
                      )}
                      onChange={(v) => handleInputChange('playerPool', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Games Per Matchup — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldRow
                      label="Games Per Matchup"
                      hint={`Games played in each weekly matchup. Max ${GAMES_PER_MATCHUP_BY_SPORT[formData.sport]?.max ?? 162} for ${formData.sport}.`}
                      hintId="games-per-matchup-hint"
                    >
                      <XStack alignItems="center" gap="$3">
                        <Input
                          size="$4"
                          testID="create-league-games-per-matchup-input"
                          keyboardType="numeric"
                          value={String(formData.gamesPerMatchup)}
                          onChangeText={(text: string) => {
                            const n = parseInt(text, 10);
                            if (isNaN(n)) return;
                            const gpmRange =
                              GAMES_PER_MATCHUP_BY_SPORT[formData.sport];
                            const clamped = gpmRange
                              ? Math.min(
                                  Math.max(n, gpmRange.min),
                                  gpmRange.max,
                                )
                              : n;
                            handleInputChange('gamesPerMatchup', clamped);
                          }}
                          borderColor={
                            validationErrors.gamesPerMatchup
                              ? '$red8'
                              : '$borderColor'
                          }
                          backgroundColor="$color1"
                          disabled={isFormDisabled}
                          width={100}
                          aria-describedby={
                            validationErrors.gamesPerMatchup
                              ? 'games-per-matchup-hint games-per-matchup-error'
                              : 'games-per-matchup-hint'
                          }
                          aria-invalid={!!validationErrors.gamesPerMatchup}
                        />
                        {validationErrors.gamesPerMatchup && (
                          <Text
                            id="games-per-matchup-error"
                            fontFamily="$body"
                            fontSize={12}
                            color="$red10"
                          >
                            {validationErrors.gamesPerMatchup}
                          </Text>
                        )}
                      </XStack>
                    </FieldRow>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ── Section 3: Era & History ── */}
              <CollapsibleSection
                id="era-history"
                num={3}
                title="Era & History"
                sub="The signature Legacy Sports control — which decades are in play."
                summary={
                  <span>
                    <strong>{eraDisplayLabel(formData)}</strong>
                    {formData.baseballHofOnly ? ' · HOF only' : ''}
                  </span>
                }
                open={openSections.has('era-history')}
                onToggle={() => toggleSection('era-history')}
                disabled={fastLane}
                disabledReason="Using recommended defaults — turn off Fast Lane to customize."
              >
                {/* Premium upsell banner — suppressed while entitlements are
                    still loading so a premium user never sees a flash of the
                    non-premium banner (LS-6088). */}
                {!isPremium && !premiumLoading && (
                  <XStack
                    gap="$3"
                    alignItems="center"
                    backgroundColor="rgba(197,165,90,0.08)"
                    borderWidth={1}
                    borderColor="rgba(197,165,90,0.35)"
                    borderRadius="$4"
                    padding="$4"
                  >
                    <YStack
                      width={36}
                      height={36}
                      borderRadius={18}
                      backgroundColor="rgba(197,165,90,0.2)"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Text fontSize={16}>
                        <span role="img" aria-label="trophy">
                          🏆
                        </span>
                      </Text>
                    </YStack>
                    <YStack flex={1}>
                      <Text
                        fontFamily="$display"
                        fontWeight="700"
                        fontSize={13}
                        letterSpacing={0.8}
                        textTransform="uppercase"
                        color="$brandGoldLight"
                      >
                        Historical eras are premium
                      </Text>
                      <Text
                        fontFamily="$body"
                        fontSize={13}
                        color="$color11"
                        marginTop={2}
                      >
                        All Eras is free. Pick a specific era or
                        Hall-of-Fame-only pool with Legacy Commissioner.
                      </Text>
                    </YStack>
                    <YStack alignItems="flex-end" gap="$1.5">
                      <Button
                        size="$2"
                        onPress={openEraUpgradeModal}
                        backgroundColor="$brandGold"
                        borderWidth={0}
                      >
                        <Text color="#111" fontWeight="700" fontSize={13}>
                          Unlock
                        </Text>
                      </Button>
                      <Button
                        unstyled
                        size="$1"
                        data-testid="era-banner-view-pricing-link"
                        onPress={() => {
                          trackPremiumFeatureClick('Historical Era Selection');
                          void navigate('/pricing');
                        }}
                        backgroundColor="transparent"
                        borderWidth={0}
                        padding={0}
                      >
                        <Text
                          color="$brandGoldLight"
                          fontSize={11}
                          textDecorationLine="underline"
                        >
                          View pricing
                        </Text>
                      </Button>
                    </YStack>
                  </XStack>
                )}

                <FieldRow
                  label="Historical Era Filter"
                  hint="Only players active during this window are draftable."
                >
                  {premiumLoading ? (
                    <YStack
                      gap="$2"
                      data-testid="era-entitlements-loading"
                      aria-label="Loading entitlements"
                    >
                      <Text fontFamily="$body" fontSize={12} color="$color11">
                        Loading entitlements…
                      </Text>
                      <XStack flexWrap="wrap" gap="$2">
                        {ERAS_BY_SPORT[formData.sport].map((era) => (
                          <Skeleton
                            key={era.id}
                            width={96}
                            height={76}
                            radius={8}
                          />
                        ))}
                      </XStack>
                    </YStack>
                  ) : (
                    <EraFilterGrid
                      sport={formData.sport}
                      value={formData.baseballEraFilter}
                      onChange={(v) =>
                        handleInputChange('baseballEraFilter', v)
                      }
                      isPremium={!!isPremium}
                      disabled={isFormDisabled}
                      onUpgrade={openEraUpgradeModal}
                    />
                  )}
                </FieldRow>

                {/* Custom era year range */}
                {formData.baseballEraFilter === 'custom' && (
                  <CustomEraRange
                    startYear={formData.customEraStartYear}
                    endYear={formData.customEraEndYear}
                    onChangeStart={(v) =>
                      handleInputChange('customEraStartYear', v)
                    }
                    onChangeEnd={(v) =>
                      handleInputChange('customEraEndYear', v)
                    }
                    disabled={isFormDisabled}
                    invalid={!!validationErrors.customEra}
                  />
                )}

                {/* Live eligible-player-count preview for custom era (LS-6089) */}
                {isCustomEraRangeComplete && (
                  <XStack
                    gap="$2"
                    alignItems="center"
                    flexWrap="wrap"
                    data-testid="custom-era-eligible-count"
                  >
                    {eligiblePlayerCountError ? (
                      <Text fontFamily="$body" fontSize={13} color="$red9">
                        Couldn't check eligible players. Try again shortly.
                      </Text>
                    ) : (
                      <Text fontFamily="$body" fontSize={13} color="$color11">
                        {eligiblePlayerCountLoading &&
                        eligiblePlayerCount == null
                          ? 'Checking eligible players…'
                          : `${eligiblePlayerCount ?? 0} eligible players`}
                      </Text>
                    )}
                  </XStack>
                )}
                {isCustomEraRangeComplete &&
                  eligiblePlayerCount != null &&
                  isPoolTooSmall(
                    eligiblePlayerCount,
                    formData.numberOfTeams,
                    formData.maxRosterSize,
                  ) && (
                    <XStack
                      role="status"
                      aria-live="polite"
                      gap="$3"
                      alignItems="center"
                      backgroundColor={withAlpha(AMBER, 0.1)}
                      borderWidth={1}
                      borderColor={withAlpha(AMBER, 0.4)}
                      borderRadius="$4"
                      padding="$3"
                      data-testid="custom-era-shortfall-warning"
                    >
                      <AlertCircle size={16} color={AMBER} flexShrink={0} />
                      <Text
                        fontFamily="$body"
                        fontSize={13}
                        color="$color11"
                        flex={1}
                      >
                        Only {eligiblePlayerCount} eligible players —{' '}
                        {formData.numberOfTeams} teams ×{' '}
                        {formData.maxRosterSize} roster needs{' '}
                        {formData.numberOfTeams * formData.maxRosterSize}+
                      </Text>
                    </XStack>
                  )}

                {/* HOF Only — locked-tap pattern (matches EraFilterGrid immediately
                    above) rather than PremiumGate, which would stack a second
                    "Upgrade to Premium" CTA in the same section as the era
                    banner/modal already rendered here. */}
                <FieldRow
                  label="Hall of Fame Draft Mode"
                  hint="Restrict the player pool to HOF inductees — smaller, more legendary."
                >
                  <PillToggle
                    value={formData.baseballHofOnly}
                    offLabel="🏆 Off"
                    onLabel="🏆 On"
                    onChange={(v) => {
                      if (v && (!isPremium || premiumLoading)) {
                        trackPremiumFeatureClick('Hall of Fame Only');
                        setShowHofUpgradeModal(true);
                        return;
                      }
                      handleInputChange('baseballHofOnly', v);
                    }}
                    disabled={isFormDisabled}
                  />
                </FieldRow>
              </CollapsibleSection>

              {/* ── Section 4: Draft Settings ── */}
              <CollapsibleSection
                id="draft"
                num={4}
                title="Draft Settings"
                sub="Live or automated, snake or linear — and when it all kicks off."
                summary={
                  <span>
                    {formData.draftMode === 'live' ? 'Live' : 'Automated'} ·{' '}
                    {formData.selectionMethod} · {formData.draftOrder}
                    {formData.draftMode === 'live' &&
                      (() => {
                        const opt = PICK_TIME_OPTIONS.find(
                          (o) =>
                            o.value === String(formData.pickTimeLimitSeconds),
                        );
                        return opt ? ` · ${opt.label}/pick` : '';
                      })()}
                    {formData.rosterContinuity === 'keeper'
                      ? ` · Keeper (${formData.keeperCount ?? '?'})`
                      : ''}
                  </span>
                }
                open={openSections.has('draft')}
                onToggle={() => toggleSection('draft')}
                disabled={fastLane}
                disabledReason="Using recommended defaults — turn off Fast Lane to customize."
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* Draft Mode */}
                  <FieldRow
                    label="Draft Mode"
                    hint={
                      formData.draftMode === 'automated'
                        ? 'Automated drafts use random player assignment'
                        : 'Live drafts require all managers online'
                    }
                  >
                    <ButtonGroup
                      value={formData.draftMode}
                      options={DRAFT_MODE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={(v) => handleInputChange('draftMode', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Selection Method */}
                  <FieldRow
                    label="Selection Method"
                    hint={
                      formData.draftMode === 'automated'
                        ? 'Forced to Random in automated mode.'
                        : 'Standard picks in order, auction bidding'
                    }
                  >
                    <ButtonGroup
                      value={formData.selectionMethod}
                      options={SELECTION_METHOD_OPTIONS.filter(
                        (o) =>
                          formData.draftMode !== 'automated' ||
                          o.value === 'random',
                      ).map((o) => ({
                        value: o.value,
                        label: o.label,
                        // Auction draft is a premium selection method
                        // (LS-6072). Proactively lock it for free viewers so
                        // the gate is visible before selection; the onChange
                        // below still routes a locked tap to the upgrade
                        // modal instead of applying the selection. Mirrors
                        // WaiverSystemField's FAAB-option gating.
                        locked:
                          o.value === 'auction' &&
                          (!isPremium || premiumLoading),
                      }))}
                      onChange={(v) => {
                        if (v === 'auction' && (!isPremium || premiumLoading)) {
                          trackPremiumFeatureClick('Auction Draft');
                          setShowAuctionUpgradeModal(true);
                          return;
                        }
                        handleInputChange('selectionMethod', v);
                      }}
                      disabled={
                        isFormDisabled || formData.draftMode === 'automated'
                      }
                    />
                  </FieldRow>

                  {/* Selection method reset notice */}
                  {selectionResetNotice && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <XStack
                        role="status"
                        aria-live="polite"
                        gap="$3"
                        alignItems="center"
                        backgroundColor={withAlpha(AMBER, 0.1)}
                        borderWidth={1}
                        borderColor={withAlpha(AMBER, 0.4)}
                        borderRadius="$4"
                        padding="$3"
                        data-testid="selection-reset-notice"
                      >
                        <AlertCircle size={16} color={AMBER} flexShrink={0} />
                        <Text
                          fontFamily="$body"
                          fontSize={13}
                          color="$color11"
                          flex={1}
                        >
                          {selectionResetNotice}
                        </Text>
                        <Button
                          size="$2"
                          variant="outlined"
                          onPress={() => setSelectionResetNotice(null)}
                        >
                          Dismiss
                        </Button>
                      </XStack>
                    </div>
                  )}

                  {/* Keeper mode reset notice (LS-8672) */}
                  {keeperResetNotice && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <XStack
                        role="status"
                        aria-live="polite"
                        gap="$3"
                        alignItems="center"
                        backgroundColor={withAlpha(AMBER, 0.1)}
                        borderWidth={1}
                        borderColor={withAlpha(AMBER, 0.4)}
                        borderRadius="$4"
                        padding="$3"
                        data-testid="keeper-reset-notice"
                      >
                        <AlertCircle size={16} color={AMBER} flexShrink={0} />
                        <Text
                          fontFamily="$body"
                          fontSize={13}
                          color="$color11"
                          flex={1}
                        >
                          {keeperResetNotice}
                        </Text>
                        <Button
                          size="$2"
                          variant="outlined"
                          onPress={() => setKeeperResetNotice(null)}
                        >
                          Dismiss
                        </Button>
                      </XStack>
                    </div>
                  )}

                  {/* Draft Order */}
                  <FieldRow
                    label="Draft Order"
                    hint="Snake order reverses each round"
                  >
                    <ButtonGroup
                      value={formData.draftOrder}
                      options={DRAFT_ORDER_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={(v) => handleInputChange('draftOrder', v)}
                      disabled={isFormDisabled}
                    />
                  </FieldRow>

                  {/* Pick Timer — live drafts only */}
                  {formData.draftMode === 'live' && (
                    <FieldRow
                      label="Time Per Pick"
                      hint="How long each manager has to make a pick."
                    >
                      <ButtonGroup
                        value={String(formData.pickTimeLimitSeconds)}
                        options={PICK_TIME_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        onChange={(v) =>
                          handleInputChange(
                            'pickTimeLimitSeconds',
                            parseInt(v, 10),
                          )
                        }
                        disabled={isFormDisabled}
                      />
                    </FieldRow>
                  )}

                  {/* Draft Date */}
                  <FieldRow
                    label="Draft Date & Time"
                    hint="Optional. Leave blank to schedule later from league settings."
                  >
                    <>
                      <DateTimePicker
                        value={formData.draftDate}
                        onChange={(date: Date) =>
                          handleInputChange('draftDate', date)
                        }
                        onClear={() =>
                          setFormData((prev) => ({
                            ...prev,
                            draftDate: undefined,
                          }))
                        }
                        placeholder="Select draft date and time"
                        disabled={isFormDisabled}
                        minDate={new Date()}
                        useNativeInput={false}
                      />
                      {formData.draftDate ? (
                        <YStack gap="$1">
                          <Text
                            fontFamily="$body"
                            fontSize={12}
                            color="$gray10"
                          >
                            Local: {formatDraftDate(formData.draftDate)} —{' '}
                            {getUserTimezoneLabel()}
                          </Text>
                          <Text
                            fontFamily="$body"
                            fontSize={12}
                            color="$gray10"
                          >
                            UTC: {formatDateAsUTC(formData.draftDate)}
                          </Text>
                        </YStack>
                      ) : (
                        <Text fontFamily="$body" fontSize={12} color="$gray10">
                          Times shown in {getUserTimezoneLabel()}
                        </Text>
                      )}
                    </>
                  </FieldRow>

                  {/* Draft Slot Trading — premium, baseball-only, hidden for
                      auction leagues (no slots to trade; server rejects it,
                      LS-8675). Locked-tap pattern like the HOF toggle — a
                      PremiumGate overlay would stack a second CTA in this
                      section. Rendered below the Draft Date field so the
                      date-picker trigger keeps its viewport position — the
                      popover anchors to it and its Apply button must stay
                      on-screen in the E2E viewport (LS-5367). */}
                  {formData.sport === 'baseball' &&
                    formData.selectionMethod !== 'auction' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <DraftSlotTradingField
                          enabled={formData.allowDraftSlotTrading}
                          onToggleEnabled={(v) =>
                            handleInputChange('allowDraftSlotTrading', v)
                          }
                          isPremium={!!isPremium}
                          loading={premiumLoading}
                          disabled={isFormDisabled}
                          onUpgrade={() => {
                            trackPremiumFeatureClick('Draft Slot Trading');
                            setShowSlotTradingUpgradeModal(true);
                          }}
                        />
                      </div>
                    )}

                  {/* Auction settings — conditional */}
                  {formData.selectionMethod === 'auction' &&
                    formData.draftMode !== 'automated' && (
                      <>
                        <FieldRow
                          label="Auction Budget per Team"
                          hint={`Total dollars each manager has to fill a roster. ${AUCTION_BUDGET_RANGE.min}–${AUCTION_BUDGET_RANGE.max}.`}
                          hintId="auction-budget-hint"
                        >
                          <Input
                            size="$3"
                            value={String(formData.auctionBudget)}
                            onChangeText={(text: string) => {
                              const n = parseInt(text, 10);
                              if (isNaN(n)) return;
                              const clamped = Math.min(
                                Math.max(n, AUCTION_BUDGET_RANGE.min),
                                AUCTION_BUDGET_RANGE.max,
                              );
                              handleInputChange('auctionBudget', clamped);
                            }}
                            placeholder="200"
                            keyboardType="numeric"
                            borderColor={
                              validationErrors.auctionBudget
                                ? '$red8'
                                : '$borderColor'
                            }
                            disabled={isFormDisabled}
                            aria-describedby="auction-budget-hint"
                          />
                        </FieldRow>
                        <FieldRow
                          label="Minimum Bid"
                          hint={`Lowest opening bid accepted. ${AUCTION_MIN_BID_RANGE.min}–${AUCTION_MIN_BID_RANGE.max}.`}
                          hintId="auction-min-bid-hint"
                        >
                          <XStack alignItems="center" gap="$3">
                            <Input
                              size="$3"
                              value={String(formData.auctionMinBid)}
                              onChangeText={(text: string) => {
                                const n = parseInt(text, 10);
                                if (isNaN(n)) return;
                                const clamped = Math.min(
                                  Math.max(n, AUCTION_MIN_BID_RANGE.min),
                                  AUCTION_MIN_BID_RANGE.max,
                                );
                                handleInputChange('auctionMinBid', clamped);
                              }}
                              placeholder="1"
                              keyboardType="numeric"
                              borderColor={
                                validationErrors.auctionMinBid
                                  ? '$red8'
                                  : '$borderColor'
                              }
                              disabled={isFormDisabled}
                              aria-describedby={
                                validationErrors.auctionMinBid
                                  ? 'auction-min-bid-hint auction-min-bid-error'
                                  : 'auction-min-bid-hint'
                              }
                              aria-invalid={!!validationErrors.auctionMinBid}
                            />
                            {validationErrors.auctionMinBid && (
                              <Text
                                id="auction-min-bid-error"
                                fontFamily="$body"
                                fontSize={12}
                                color="$red10"
                              >
                                {validationErrors.auctionMinBid}
                              </Text>
                            )}
                          </XStack>
                        </FieldRow>
                      </>
                    )}

                  {/* Roster Continuity / Keeper mode — full width (LS-8672) */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <PremiumGate
                      isPremium={isPremium}
                      featureName="Roster Continuity"
                      featureDescription="Run a keeper league — commissioners choose how many players each team retains season-over-season, and how kept players are costed."
                    >
                      <RosterContinuityField
                        rosterContinuity={formData.rosterContinuity}
                        onRosterContinuityChange={(v) =>
                          handleInputChange('rosterContinuity', v)
                        }
                        selectionMethod={formData.selectionMethod}
                        keeperCount={formData.keeperCount}
                        onKeeperCountChange={(v) =>
                          handleInputChange('keeperCount', v)
                        }
                        keeperCountError={validationErrors.keeperCount}
                        costModel={formData.keeperCostModel}
                        onCostModelChange={(v) =>
                          handleInputChange('keeperCostModel', v)
                        }
                        maxConsecutiveKeeps={formData.maxConsecutiveKeeps}
                        onMaxConsecutiveKeepsChange={(v) =>
                          handleInputChange('maxConsecutiveKeeps', v)
                        }
                        maxConsecutiveKeepsError={
                          validationErrors.maxConsecutiveKeeps
                        }
                        rookieExempt={formData.rookieExempt}
                        onRookieExemptChange={(v) =>
                          handleInputChange('rookieExempt', v)
                        }
                        isPremium={!!isPremium && !premiumLoading}
                        disabled={isFormDisabled}
                        onUpgrade={() => {
                          trackPremiumFeatureClick('Roster Continuity');
                          setShowKeeperUpgradeModal(true);
                        }}
                      />
                    </PremiumGate>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ── Section 5: Waivers, Budget & Salary Cap ── */}
              <CollapsibleSection
                id="waiver-budget"
                num={5}
                title="Waivers, Budget & Salary Cap"
                sub="In-season free-agent rules and optional cap enforcement."
                summary={
                  <span>
                    {formData.waiverType === 'faab'
                      ? `FAAB · $${formData.faabBudgetDefault}`
                      : 'Standard waivers'}
                    {formData.salaryCapEnabled
                      ? ` · $${formData.salaryCap ?? 0}M cap`
                      : ''}
                  </span>
                }
                open={openSections.has('waiver-budget')}
                onToggle={() => toggleSection('waiver-budget')}
                disabled={fastLane}
                disabledReason="Using recommended defaults — turn off Fast Lane to customize."
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 22,
                  }}
                >
                  {/* Waiver Type — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <WaiverSystemField
                      value={formData.waiverType}
                      onChange={(v) => handleInputChange('waiverType', v)}
                      isPremium={!!isPremium}
                      loading={premiumLoading}
                      disabled={isFormDisabled}
                      onUpgrade={() => {
                        trackPremiumFeatureClick('FAAB Waiver Settings');
                        setShowWaiverUpgradeModal(true);
                      }}
                    />
                  </div>

                  {/* FAAB Budget (conditional) */}
                  {formData.waiverType === 'faab' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <PremiumGate
                        isPremium={isPremium}
                        featureName="FAAB Waiver Settings"
                        featureDescription="Configure Free Agent Acquisition Budget (FAAB) bidding — the most competitive waiver system for serious leagues."
                      >
                        <FaabBudgetField
                          value={formData.faabBudgetDefault}
                          onChange={(v) =>
                            handleInputChange('faabBudgetDefault', v)
                          }
                          disabled={isFormDisabled}
                          error={validationErrors.faabBudget}
                        />
                      </PremiumGate>
                    </div>
                  )}

                  {/* Salary Cap — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <PremiumGate
                      isPremium={isPremium}
                      featureName="Salary Cap"
                      featureDescription="Track player salaries and enforce roster spending caps for a competitive salary cap league format."
                    >
                      <SalaryCapField
                        enabled={formData.salaryCapEnabled}
                        amount={formData.salaryCap}
                        onToggleEnabled={(v) =>
                          handleInputChange('salaryCapEnabled', v)
                        }
                        onAmountChange={(v) =>
                          handleInputChange('salaryCap', v)
                        }
                        isPremium={!!isPremium && !premiumLoading}
                        disabled={isFormDisabled}
                        onUpgrade={() => {
                          trackPremiumFeatureClick('Salary Cap');
                          setShowSalaryCapUpgradeModal(true);
                        }}
                        error={validationErrors.salaryCap}
                        numberOfTeams={formData.numberOfTeams}
                        maxRosterSize={formData.maxRosterSize}
                        salaryFloor={formData.salaryFloor}
                        onSalaryFloorChange={(v) =>
                          handleInputChange('salaryFloor', v)
                        }
                        salaryFloorError={validationErrors.salaryFloor}
                        luxuryTaxThreshold={formData.luxuryTaxThreshold}
                        onLuxuryTaxThresholdChange={(v) =>
                          handleInputChange('luxuryTaxThreshold', v)
                        }
                        luxuryTaxThresholdError={
                          validationErrors.luxuryTaxThreshold
                        }
                        minSalary={formData.minSalary}
                        onMinSalaryChange={(v) =>
                          handleInputChange('minSalary', v)
                        }
                        minSalaryError={validationErrors.minSalary}
                        salaryEscalationPct={formData.salaryEscalationPct}
                        onSalaryEscalationPctChange={(v) =>
                          handleInputChange('salaryEscalationPct', v)
                        }
                        salaryEscalationPctError={
                          validationErrors.salaryEscalationPct
                        }
                        salaryDecayPct={formData.salaryDecayPct}
                        onSalaryDecayPctChange={(v) =>
                          handleInputChange('salaryDecayPct', v)
                        }
                        salaryDecayPctError={validationErrors.salaryDecayPct}
                      />
                    </PremiumGate>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ── Section 6: Football Scoring Format (football only) ── */}
              {selectedSport === 'football' && (
                <CollapsibleSection
                  id="football-scoring"
                  num={6}
                  title="Scoring Format"
                  sub="Offensive preset and defensive lineup type for your football league."
                  summary={
                    <span>
                      {SCORING_FORMAT_OPTIONS.find(
                        (o) => o.id === formData.scoringFormat,
                      )?.label ?? 'Custom'}{' '}
                      · {formData.defensiveFormat === 'idp' ? 'IDP' : 'D/ST'}
                    </span>
                  }
                  open={openSections.has('football-scoring')}
                  onToggle={() => toggleSection('football-scoring')}
                  disabled={fastLane}
                  disabledReason="Using recommended defaults — turn off Fast Lane to customize."
                >
                  {/* Offensive format */}
                  <FieldRow
                    label="Offensive Format"
                    hint="Sets the receiving reception multiplier. All other stats are identical across formats."
                  >
                    <XStack gap="$2" flexWrap="wrap">
                      {SCORING_FORMAT_OPTIONS.map((opt) => {
                        const selected = formData.scoringFormat === opt.id;
                        return (
                          <Button
                            key={opt.id}
                            size="$3"
                            flex={1}
                            minWidth={100}
                            onPress={() =>
                              !isFormDisabled &&
                              handleInputChange('scoringFormat', opt.id)
                            }
                            disabled={isFormDisabled}
                            backgroundColor={
                              selected ? withAlpha(EMERALD, 0.22) : '$color2'
                            }
                            borderColor={selected ? EMERALD : '$borderColor'}
                            borderWidth={selected ? 2 : 1}
                            hoverStyle={{
                              backgroundColor: selected
                                ? withAlpha(EMERALD, 0.3)
                                : '$color3',
                            }}
                            pressStyle={{ scale: 0.97 }}
                            data-testid={`scoring-format-${opt.id}`}
                          >
                            <YStack alignItems="center" gap={2}>
                              <Text
                                fontFamily="$display"
                                fontWeight="800"
                                fontSize={15}
                                color={selected ? EMERALD : '$color'}
                              >
                                {opt.label}
                              </Text>
                              <Text
                                fontFamily="$body"
                                fontSize={11}
                                color={selected ? '$color11' : '$gray9'}
                              >
                                {opt.description}
                              </Text>
                            </YStack>
                          </Button>
                        );
                      })}
                    </XStack>
                  </FieldRow>

                  {/* Defensive format */}
                  <FieldRow
                    label="Defensive Format"
                    hint="D/ST uses team defense scoring with points-allowed bands. IDP uses individual defensive player stats."
                  >
                    <XStack gap="$2">
                      {(
                        [
                          {
                            id: 'dst' as const,
                            label: 'D/ST',
                            sub: 'Team Defense',
                          },
                          {
                            id: 'idp' as const,
                            label: 'IDP',
                            sub: 'Individual Players',
                          },
                        ] as const
                      ).map((opt) => {
                        const selected = formData.defensiveFormat === opt.id;
                        return (
                          <Button
                            key={opt.id}
                            size="$3"
                            flex={1}
                            onPress={() =>
                              !isFormDisabled &&
                              handleInputChange('defensiveFormat', opt.id)
                            }
                            disabled={isFormDisabled}
                            backgroundColor={
                              selected ? withAlpha(AMBER, 0.18) : '$color2'
                            }
                            borderColor={selected ? AMBER : '$borderColor'}
                            borderWidth={selected ? 2 : 1}
                            hoverStyle={{
                              backgroundColor: selected
                                ? withAlpha(AMBER, 0.26)
                                : '$color3',
                            }}
                            pressStyle={{ scale: 0.97 }}
                            data-testid={`defensive-format-${opt.id}`}
                          >
                            <YStack alignItems="center" gap={2}>
                              <Text
                                fontFamily="$display"
                                fontWeight="800"
                                fontSize={15}
                                color={selected ? AMBER : '$color'}
                              >
                                {opt.label}
                              </Text>
                              <Text
                                fontFamily="$body"
                                fontSize={11}
                                color={selected ? '$color11' : '$gray9'}
                              >
                                {opt.sub}
                              </Text>
                            </YStack>
                          </Button>
                        );
                      })}
                    </XStack>
                  </FieldRow>

                  {/* Context note */}
                  <XStack
                    gap="$2"
                    padding="$3"
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.22)}
                  >
                    <Text
                      fontFamily="$body"
                      fontSize={12}
                      color="$gray10"
                      flex={1}
                    >
                      {formData.defensiveFormat === 'idp'
                        ? 'IDP replaces the DST slot with DL×2, LB×2, and DB×2. Scoring uses flat multipliers per tackle, sack, INT, etc.'
                        : 'D/ST uses a single team defense slot. Scoring combines sacks, turnovers, and points-allowed bands.'}
                    </Text>
                  </XStack>
                </CollapsibleSection>
              )}

              {/* ── Sticky action bar ── */}
              <XStack
                justifyContent="space-between"
                alignItems="center"
                gap="$4"
                padding="$4"
                paddingHorizontal="$5"
                backgroundColor="$color2"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$5"
                flexWrap="wrap"
                $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                {/* Validation status */}
                <XStack
                  gap="$2"
                  alignItems="flex-start"
                  flex={1}
                  data-testid="create-league-validation-status"
                  role={errorCount > 0 ? 'alert' : undefined}
                  aria-live={errorCount > 0 ? 'assertive' : undefined}
                >
                  {errorCount === 0 ? (
                    <>
                      <Check size={14} color="#6FD39A" />
                      <Text fontFamily="$body" fontSize={13} color="#6FD39A">
                        All settings look good.
                      </Text>
                    </>
                  ) : (
                    <>
                      <AlertCircle
                        size={14}
                        color="#E07A8C"
                        style={{ marginTop: 2 }}
                      />
                      <YStack gap="$1" flex={1}>
                        <Text
                          fontFamily="$body"
                          fontWeight="700"
                          fontSize={13}
                          color="#E07A8C"
                        >
                          {errorCount} item{errorCount > 1 ? 's' : ''} need
                          attention:
                        </Text>
                        {Object.entries(validationErrors).map(
                          ([field, message]) => (
                            <Text
                              key={field}
                              fontFamily="$body"
                              fontSize={12}
                              color="#E07A8C"
                            >
                              • {message}
                            </Text>
                          ),
                        )}
                      </YStack>
                    </>
                  )}
                </XStack>

                <XStack gap="$2">
                  <Button
                    size="$4"
                    variant="outlined"
                    onPress={handleCancel}
                    disabled={isFormDisabled}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="$4"
                    variant="primary"
                    type="submit"
                    data-testid="create-league-submit"
                    disabled={isFormDisabled}
                  >
                    {loading ? 'Creating...' : 'Create League'}
                  </Button>
                </XStack>
              </XStack>
            </form>
          </YStack>

          {/* ── Sticky sidebar ── */}
          <YStack
            width={340}
            gap="$4"
            flexShrink={0}
            $lg={{ width: '100%' }}
            style={{ position: 'sticky', top: 80 }}
          >
            <SummarySidePanel f={formData} teams={formData.numberOfTeams} />
          </YStack>
        </XStack>
      </YStack>

      <Dialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (!open) {
            setImportText('');
            setImportFeedback(null);
          }
        }}
        title="Import League Settings"
        description="Paste the JSON exported from an existing league, or upload the file, to prefill this form. One-time draft-setup fields (draft mode, order, and scheduling strategy) aren't included in exports and must still be set manually."
        confirmLabel="Apply Settings"
        cancelLabel="Close"
        onConfirm={handleApplyImport}
        onCancel={() => setShowImportDialog(false)}
      >
        <YStack gap="$3">
          <input
            ref={importFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
          <Button
            size="$2"
            variant="outlined"
            alignSelf="flex-start"
            onPress={() => importFileInputRef.current?.click()}
          >
            Upload JSON file
          </Button>
          <TextArea
            value={importText}
            onChangeText={(text: string) => {
              setImportText(text);
              setImportFeedback(null);
            }}
            placeholder="Or paste exported settings JSON here"
            minHeight={140}
            data-testid="import-settings-textarea"
          />
          {importFeedback ? (
            <Text
              fontSize="$2"
              color={
                importFeedback.type === 'error' ? '$red11' : '$brandGoldLight'
              }
              data-testid="import-settings-feedback"
            >
              {importFeedback.message}
            </Text>
          ) : null}
        </YStack>
      </Dialog>

      <Dialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
        title="Discard this league?"
        description="You have unsaved settings. Leaving now will discard everything you've entered."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false);
          navigate(`/${formData.sport}`);
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
      <Dialog
        open={createdLeague !== null}
        onOpenChange={(open) => {
          if (!open) handleContinueToLeague();
        }}
        title="League created!"
        description={
          createdLeague?.inviteCode
            ? `Share this invite code so managers can join ${formData.leagueName.trim()}.`
            : `${formData.leagueName.trim()} is ready.`
        }
        confirmLabel="Continue to League"
        cancelLabel={
          createdLeague?.inviteCode
            ? inviteCodeCopied
              ? 'Copied!'
              : 'Copy Invite Code'
            : 'Got it'
        }
        onConfirm={handleContinueToLeague}
        onCancel={
          createdLeague?.inviteCode
            ? handleCopyInviteCode
            : handleContinueToLeague
        }
      >
        {createdLeague?.inviteCode ? (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            gap={12}
            paddingVertical={12}
            paddingHorizontal={16}
            borderRadius={12}
            borderWidth={1}
            borderColor="$outlineStrong"
            backgroundColor="$surfacePanel"
          >
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={20}
              letterSpacing={1.2}
              color="$brandGoldLight"
            >
              {createdLeague.inviteCode}
            </Text>
            {inviteCodeCopied ? (
              <Check size={18} color="$brandGoldLight" />
            ) : (
              <Copy size={18} color="$textMuted" />
            )}
          </XStack>
        ) : null}
      </Dialog>
      <UpgradeModal
        open={showWaiverUpgradeModal}
        onOpenChange={setShowWaiverUpgradeModal}
        featureName="FAAB Waiver Settings"
        featureDescription="Use Free Agent Acquisition Budget (FAAB) bidding for waiver claims, where the highest bid wins."
      />
      <UpgradeModal
        open={showSalaryCapUpgradeModal}
        onOpenChange={setShowSalaryCapUpgradeModal}
        featureName="Salary Cap"
        featureDescription="Track player salaries and enforce roster spending caps for a competitive salary cap league format."
      />
      <UpgradeModal
        open={showEraUpgradeModal}
        onOpenChange={setShowEraUpgradeModal}
        featureName="Historical Era Selection"
        featureDescription="Unlock all historical eras — Dead Ball, Golden Age, Expansion, and more — or set a custom year range to restrict your league's player pool."
      />
      <UpgradeModal
        open={showHofUpgradeModal}
        onOpenChange={setShowHofUpgradeModal}
        featureName="Hall of Fame Only"
        featureDescription="Restrict the draft board to Hall of Fame inductees for a smaller, more legendary player pool."
      />
      <UpgradeModal
        open={showAuctionUpgradeModal}
        onOpenChange={setShowAuctionUpgradeModal}
        featureName="Auction Draft"
        featureDescription="Run a live auction where managers bid on players from a shared budget — the most competitive draft format for serious leagues."
      />
      <UpgradeModal
        open={showSlotTradingUpgradeModal}
        onOpenChange={setShowSlotTradingUpgradeModal}
        featureName="Draft Slot Trading"
        featureDescription="Let managers propose draft position swaps before the draft starts — the commissioner approves each trade."
      />
      <UpgradeModal
        open={showKeeperUpgradeModal}
        onOpenChange={setShowKeeperUpgradeModal}
        featureName="Roster Continuity"
        featureDescription="Run a keeper league — commissioners choose how many players each team retains season-over-season, and how kept players are costed."
      />
      <UpgradeModal
        open={showLeagueLimitModal}
        onOpenChange={setShowLeagueLimitModal}
        featureName="Unlimited League Creation"
        featureDescription={`Free accounts can be in up to ${FREE_LEAGUE_LIMIT} leagues total, across every sport — baseball and football leagues both count toward the same limit. Upgrade to Legacy Commissioner for unlimited league creation.`}
        secondaryAction={{
          label: 'Or delete an existing league to make room',
          to: `/${formData.sport}`,
        }}
      />
    </ScrollView>
  );
}

export default LeagueCreatePage;
