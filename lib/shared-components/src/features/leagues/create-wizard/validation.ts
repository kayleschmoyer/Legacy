// Per-step validation for the league-create wizard (LS-8809).
//
// Every rule returns a field-keyed message so the wizard can anchor the error
// under the offending control instead of raising an Alert — the pre-wizard
// mobile form returned only the first error string, which is why errors were
// never attached to a field.
//
// Rules are the pre-wizard `validateBaseball` set plus the web-parity
// additions from `validateFormFull` in
// `apps/web/src/pages/baseball/LeagueCreatePage.tsx`.

import {
  AUCTION_BUDGET_RANGE,
  AUCTION_MIN_BID_RANGE,
  LEAGUE_NAME_MAX_LENGTH,
  LEAGUE_NAME_MIN_LENGTH,
  type LeagueCreateWizardForm,
  ROSTER_RANGE_BY_SPORT,
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  validDivisionOptions,
  type WizardSport,
  type WizardStepId,
} from './constants';
import { CUSTOM_ERA_MIN_YEAR_BY_SPORT } from '../../../config/sports';
import {
  FAAB_BUDGET_MAX,
  FAAB_BUDGET_MIN,
  MAX_SALARY_CAP,
  MIN_SALARY_CAP,
} from '../premium/constants';

/** Field name → inline error message. Empty object means the step is valid. */
export type WizardErrors = Record<string, string>;

export const WIZARD_MESSAGES = {
  leagueNameLength: `League name must be ${LEAGUE_NAME_MIN_LENGTH}–${LEAGUE_NAME_MAX_LENGTH} characters.`,
  teamsOutOfRange: `Teams must be ${TEAM_COUNT_MIN}–${TEAM_COUNT_MAX}.`,
  moreDivisionsThanTeams: 'More divisions than teams.',
  divisionParityMismatch: 'Division parity must match team parity.',
  rosterOutOfRange: (min: number, max: number) =>
    `Roster must be ${min}–${max}.`,
  draftDateRequired: 'Please select a draft date.',
  draftDateInPast: 'Draft date must be in the future.',
  auctionBudgetOutOfRange: `Auction budget must be ${AUCTION_BUDGET_RANGE.min}–${AUCTION_BUDGET_RANGE.max}.`,
  auctionMinBidOutOfRange: `Minimum bid must be ${AUCTION_MIN_BID_RANGE.min}–${AUCTION_MIN_BID_RANGE.max}.`,
  auctionMinBidAboveBudget: 'Minimum bid cannot exceed the auction budget.',
  customEraRequired: 'Both custom-era boundary years are required.',
  customEraOrderInvalid: 'Custom era start year must be before the end year.',
  customEraOutOfRange: (min: number, max: number) =>
    `Custom era years must be between ${min} and ${max}.`,
  faabBudgetOutOfRange: `FAAB budget must be ${FAAB_BUDGET_MIN}–${FAAB_BUDGET_MAX}.`,
  salaryCapRequired: 'Please enter a salary cap amount.',
  salaryCapOutOfRange: `Salary cap must be between ${MIN_SALARY_CAP} and ${MAX_SALARY_CAP}.`,
} as const;

function validateBasics(form: LeagueCreateWizardForm): WizardErrors {
  const errors: WizardErrors = {};
  const name = form.leagueName.trim();
  if (
    name.length < LEAGUE_NAME_MIN_LENGTH ||
    name.length > LEAGUE_NAME_MAX_LENGTH
  ) {
    errors.leagueName = WIZARD_MESSAGES.leagueNameLength;
  }
  if (
    form.numberOfTeams < TEAM_COUNT_MIN ||
    form.numberOfTeams > TEAM_COUNT_MAX
  ) {
    errors.numberOfTeams = WIZARD_MESSAGES.teamsOutOfRange;
  }
  if (form.numberOfDivisions > form.numberOfTeams) {
    errors.numberOfDivisions = WIZARD_MESSAGES.moreDivisionsThanTeams;
  } else if (
    !validDivisionOptions(form.numberOfTeams).includes(form.numberOfDivisions)
  ) {
    errors.numberOfDivisions = WIZARD_MESSAGES.divisionParityMismatch;
  }
  return errors;
}

function validateRoster(
  form: LeagueCreateWizardForm,
  sport: WizardSport,
): WizardErrors {
  const errors: WizardErrors = {};
  const range = ROSTER_RANGE_BY_SPORT[sport];
  if (form.maxRosterSize < range.min || form.maxRosterSize > range.max) {
    errors.maxRosterSize = WIZARD_MESSAGES.rosterOutOfRange(
      range.min,
      range.max,
    );
  }
  return errors;
}

function validateDraft(form: LeagueCreateWizardForm, now: Date): WizardErrors {
  const errors: WizardErrors = {};
  if (!form.draftDate) {
    errors.draftDate = WIZARD_MESSAGES.draftDateRequired;
  } else if (form.draftDate < now) {
    errors.draftDate = WIZARD_MESSAGES.draftDateInPast;
  }
  if (form.selectionMethod === 'auction') {
    const budgetInvalid =
      Number.isNaN(form.auctionBudget) ||
      form.auctionBudget < AUCTION_BUDGET_RANGE.min ||
      form.auctionBudget > AUCTION_BUDGET_RANGE.max;
    if (budgetInvalid) {
      errors.auctionBudget = WIZARD_MESSAGES.auctionBudgetOutOfRange;
    }
    if (
      Number.isNaN(form.auctionMinBid) ||
      form.auctionMinBid < AUCTION_MIN_BID_RANGE.min ||
      form.auctionMinBid > AUCTION_MIN_BID_RANGE.max
    ) {
      errors.auctionMinBid = WIZARD_MESSAGES.auctionMinBidOutOfRange;
    } else if (!budgetInvalid && form.auctionMinBid > form.auctionBudget) {
      errors.auctionMinBid = WIZARD_MESSAGES.auctionMinBidAboveBudget;
    }
  }
  return errors;
}

function validateRules(
  form: LeagueCreateWizardForm,
  sport: WizardSport,
  now: Date,
): WizardErrors {
  const errors: WizardErrors = {};

  if (form.baseballEraFilter === 'custom') {
    const { customEraStartYear: start, customEraEndYear: end } = form;
    if (start === undefined || end === undefined) {
      errors.customEra = WIZARD_MESSAGES.customEraRequired;
    } else if (start > end) {
      errors.customEra = WIZARD_MESSAGES.customEraOrderInvalid;
    } else {
      const minYear = CUSTOM_ERA_MIN_YEAR_BY_SPORT[sport];
      const currentYear = now.getFullYear();
      if (
        start < minYear ||
        start > currentYear ||
        end < minYear ||
        end > currentYear
      ) {
        errors.customEra = WIZARD_MESSAGES.customEraOutOfRange(
          minYear,
          currentYear,
        );
      }
    }
  }

  if (
    form.waiverType === 'faab' &&
    (form.faabBudgetDefault < FAAB_BUDGET_MIN ||
      form.faabBudgetDefault > FAAB_BUDGET_MAX)
  ) {
    errors.faabBudget = WIZARD_MESSAGES.faabBudgetOutOfRange;
  }

  if (form.salaryCapEnabled) {
    if (form.salaryCap === undefined) {
      errors.salaryCap = WIZARD_MESSAGES.salaryCapRequired;
    } else if (
      form.salaryCap < MIN_SALARY_CAP ||
      form.salaryCap > MAX_SALARY_CAP
    ) {
      errors.salaryCap = WIZARD_MESSAGES.salaryCapOutOfRange;
    }
  }

  return errors;
}

/**
 * Validate a single step. `now` is injectable so tests can pin the clock and
 * so the final submit can re-check a draft date that has slipped into the past
 * while the user worked through the wizard.
 */
export function validateWizardStep(
  step: WizardStepId,
  form: LeagueCreateWizardForm,
  sport: WizardSport,
  now: Date = new Date(),
): WizardErrors {
  switch (step) {
    case 'basics':
      return validateBasics(form);
    case 'roster':
      return validateRoster(form, sport);
    case 'draft':
      return validateDraft(form, now);
    case 'rules':
      return validateRules(form, sport, now);
    case 'review':
      return validateWizardAll(form, sport, now);
    default:
      return {};
  }
}

/** Every rule across every step — run again on Create. */
export function validateWizardAll(
  form: LeagueCreateWizardForm,
  sport: WizardSport,
  now: Date = new Date(),
): WizardErrors {
  return {
    ...validateBasics(form),
    ...validateRoster(form, sport),
    ...validateDraft(form, now),
    ...validateRules(form, sport, now),
  };
}
