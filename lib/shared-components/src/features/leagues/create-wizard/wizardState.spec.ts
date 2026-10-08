import {
  applyWizardFieldChange,
  createInitialWizardForm,
  DEFAULT_AUCTION_BUDGET,
  DEFAULT_AUCTION_MIN_BID,
  divisionsHint,
  FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT,
  type LeagueCreateWizardForm,
  reconcileDivisions,
  sumRosterSlots,
  validDivisionOptions,
} from './constants';
import {
  validateWizardAll,
  validateWizardStep,
  WIZARD_MESSAGES,
} from './validation';

function form(
  overrides: Partial<LeagueCreateWizardForm> = {},
): LeagueCreateWizardForm {
  return {
    ...createInitialWizardForm('baseball', 'Diamond Dynasty'),
    ...overrides,
  };
}

const FUTURE = new Date('2030-01-01T00:00:00.000Z');
const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('createInitialWizardForm', () => {
  it('defaults to the web-parity auction values', () => {
    const initial = createInitialWizardForm('baseball');
    expect(initial.auctionBudget).toBe(DEFAULT_AUCTION_BUDGET);
    expect(initial.auctionBudget).toBe(200);
    expect(initial.auctionMinBid).toBe(DEFAULT_AUCTION_MIN_BID);
  });

  it('truncates a prefilled league name to the max length', () => {
    const initial = createInitialWizardForm('baseball', 'x'.repeat(80));
    expect(initial.leagueName).toHaveLength(50);
  });

  it('uses the sport-specific default roster size', () => {
    expect(createInitialWizardForm('baseball').maxRosterSize).toBe(25);
    expect(createInitialWizardForm('football').maxRosterSize).toBe(16);
  });

  it('seeds football roster slots to the D/ST defaults, summing to maxRosterSize (LS-6146)', () => {
    const initial = createInitialWizardForm('football');
    expect(initial.rosterSlots).toEqual(
      FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst,
    );
    expect(sumRosterSlots(initial.rosterSlots)).toBe(initial.maxRosterSize);
  });

  it('does not seed roster slots for baseball', () => {
    expect(createInitialWizardForm('baseball').rosterSlots).toEqual({});
  });
});

describe('division parity (web parity rule)', () => {
  it('allows only same-parity counts no larger than the team count', () => {
    expect(validDivisionOptions(12)).toEqual([1, 2]);
    expect(validDivisionOptions(5)).toEqual([1]);
    expect(validDivisionOptions(2)).toEqual([1]);
  });

  it('never offers a division smaller than the 6-team minimum', () => {
    expect(validDivisionOptions(11)).toEqual([1]);
    expect(validDivisionOptions(10)).toEqual([1]);
    expect(validDivisionOptions(14)).toEqual([1, 2]);
    // 15 teams / 3 divisions would be 5 per division.
    expect(validDivisionOptions(15)).toEqual([1]);
    // 16 teams / 4 divisions would be 4 per division.
    expect(validDivisionOptions(16)).toEqual([1, 2]);
  });

  it('snaps to the nearest same-parity option rather than collapsing to 1', () => {
    // 4 divisions is never valid now — it snaps to the nearest option (2).
    expect(reconcileDivisions(4, 14)).toBe(2);
    // Too few teams for 2 divisions of 6 collapses to a single division.
    expect(reconcileDivisions(2, 10)).toBe(1);
    expect(reconcileDivisions(3, 9)).toBe(1);
  });

  it('keeps a still-valid count untouched', () => {
    expect(reconcileDivisions(2, 12)).toBe(2);
  });

  it('explains the odd-team constraint in the hint copy', () => {
    expect(divisionsHint(13)).toContain('only odd division counts (1)');
    expect(divisionsHint(12)).toContain(
      'How many divisions to split your teams into',
    );
    expect(divisionsHint(12)).toContain('at least 6 teams');
  });
});

describe('applyWizardFieldChange', () => {
  it('auto-resets divisions when the team count no longer supports them', () => {
    const next = applyWizardFieldChange(
      form({ numberOfTeams: 12, numberOfDivisions: 2 }),
      'numberOfTeams',
      9,
    );
    expect(next.numberOfDivisions).toBe(1);
  });

  it('forces Random selection when the draft mode goes automated (web parity)', () => {
    const next = applyWizardFieldChange(
      form({ selectionMethod: 'auction' }),
      'draftMode',
      'automated',
    );
    expect(next.selectionMethod).toBe('random');
  });

  it('coerces draft-slot trading off for an auction league (LS-8675)', () => {
    const next = applyWizardFieldChange(
      form({ allowDraftSlotTrading: true }),
      'selectionMethod',
      'auction',
    );
    expect(next.allowDraftSlotTrading).toBe(false);
  });

  it('falls back to round-robin when only one division remains', () => {
    const next = applyWizardFieldChange(
      form({ numberOfTeams: 9, schedulingStrategy: 'divisional' }),
      'numberOfDivisions',
      1,
    );
    expect(next.schedulingStrategy).toBe('round-robin');
  });

  it('derives maxRosterSize from the roster-slot sum (LS-6146)', () => {
    const next = applyWizardFieldChange(
      form({ rosterSlots: { QB: 1, RB: 2 } }),
      'rosterSlots',
      { QB: 1, RB: 4, WR: 3 },
    );
    expect(next.maxRosterSize).toBe(8);
  });

  it('resets roster slots to the new format defaults on a defensive-format change (LS-6146)', () => {
    const next = applyWizardFieldChange(
      form({
        defensiveFormat: 'dst',
        rosterSlots: {
          ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst,
        },
      }),
      'defensiveFormat',
      'idp',
    );
    expect(next.rosterSlots).toEqual(
      FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.idp,
    );
    expect(next.maxRosterSize).toBe(
      sumRosterSlots(FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.idp),
    );
    // The fictional DP (IDP Flex) slot must never default in (LS-8996).
    expect(next.rosterSlots).not.toHaveProperty('DP');
  });
});

describe('validateWizardStep — basics', () => {
  it('rejects a name shorter than three characters', () => {
    const errors = validateWizardStep(
      'basics',
      form({ leagueName: 'AB' }),
      'baseball',
    );
    expect(errors.leagueName).toBe(WIZARD_MESSAGES.leagueNameLength);
  });

  it('rejects more divisions than teams', () => {
    const errors = validateWizardStep(
      'basics',
      form({ numberOfTeams: 2, numberOfDivisions: 4 }),
      'baseball',
    );
    expect(errors.numberOfDivisions).toBe(
      WIZARD_MESSAGES.moreDivisionsThanTeams,
    );
  });

  it('rejects a division smaller than 6 teams', () => {
    const errors = validateWizardStep(
      'basics',
      form({ numberOfTeams: 10, numberOfDivisions: 2 }),
      'baseball',
    );
    expect(errors.numberOfDivisions).toBe(WIZARD_MESSAGES.divisionTooSmall);
  });

  it('rejects an even division count for an odd team count', () => {
    const errors = validateWizardStep(
      'basics',
      form({ numberOfTeams: 9, numberOfDivisions: 2 }),
      'baseball',
    );
    expect(errors.numberOfDivisions).toBe(
      WIZARD_MESSAGES.divisionParityMismatch,
    );
  });

  it('accepts a valid basics step', () => {
    expect(validateWizardStep('basics', form(), 'baseball')).toEqual({});
  });
});

describe('validateWizardStep — roster', () => {
  it('applies the sport-specific roster range', () => {
    expect(
      validateWizardStep('roster', form({ maxRosterSize: 12 }), 'baseball')
        .maxRosterSize,
    ).toBe(WIZARD_MESSAGES.rosterOutOfRange(15, 50));
    expect(
      validateWizardStep('roster', form({ maxRosterSize: 12 }), 'football')
        .maxRosterSize,
    ).toBeUndefined();
  });
});

describe('validateWizardStep — draft', () => {
  it('rejects a draft date in the past', () => {
    const errors = validateWizardStep(
      'draft',
      form({ draftDate: new Date('2020-01-01T00:00:00.000Z') }),
      'baseball',
      NOW,
    );
    expect(errors.draftDate).toBe(WIZARD_MESSAGES.draftDateInPast);
  });

  it('ignores auction bounds when the draft is not an auction', () => {
    const errors = validateWizardStep(
      'draft',
      form({ draftDate: FUTURE, auctionBudget: 0, auctionMinBid: 0 }),
      'baseball',
      NOW,
    );
    expect(errors).toEqual({});
  });

  it('rejects an out-of-range auction budget', () => {
    const errors = validateWizardStep(
      'draft',
      form({
        draftDate: FUTURE,
        selectionMethod: 'auction',
        auctionBudget: 99_999,
      }),
      'baseball',
      NOW,
    );
    expect(errors.auctionBudget).toBe(WIZARD_MESSAGES.auctionBudgetOutOfRange);
  });

  it('rejects a minimum bid above the budget', () => {
    const errors = validateWizardStep(
      'draft',
      form({
        draftDate: FUTURE,
        selectionMethod: 'auction',
        auctionBudget: 100,
        auctionMinBid: 500,
      }),
      'baseball',
      NOW,
    );
    expect(errors.auctionMinBid).toBe(WIZARD_MESSAGES.auctionMinBidAboveBudget);
  });
});

describe('validateWizardStep — rules', () => {
  it('requires both custom-era years', () => {
    const errors = validateWizardStep(
      'rules',
      form({ baseballEraFilter: 'custom' }),
      'baseball',
      NOW,
    );
    expect(errors.customEra).toBe(WIZARD_MESSAGES.customEraRequired);
  });

  it('rejects a custom era outside the sport bounds', () => {
    const errors = validateWizardStep(
      'rules',
      form({
        baseballEraFilter: 'custom',
        customEraStartYear: 1700,
        customEraEndYear: 1900,
      }),
      'baseball',
      NOW,
    );
    expect(errors.customEra).toMatch(/Custom era years must be between/);
  });

  it('requires an amount when the salary cap is enabled', () => {
    const errors = validateWizardStep(
      'rules',
      form({ salaryCapEnabled: true }),
      'baseball',
      NOW,
    );
    expect(errors.salaryCap).toBe(WIZARD_MESSAGES.salaryCapRequired);
  });

  it('rejects a salary cap of 0 (LS-8361)', () => {
    const errors = validateWizardStep(
      'rules',
      form({ salaryCapEnabled: true, salaryCap: 0 }),
      'baseball',
      NOW,
    );
    expect(errors.salaryCap).toBe(WIZARD_MESSAGES.salaryCapOutOfRange);
  });

  it('skips a stale cap amount once the cap is switched back off', () => {
    const errors = validateWizardStep(
      'rules',
      form({ salaryCapEnabled: false, salaryCap: 0 }),
      'baseball',
      NOW,
    );
    expect(errors).toEqual({});
  });

  it('applies the same premium rules to football (LS-6138)', () => {
    const errors = validateWizardStep(
      'rules',
      form({ salaryCapEnabled: true, baseballEraFilter: 'custom' }),
      'football',
      NOW,
    );
    expect(errors.salaryCap).toBe(WIZARD_MESSAGES.salaryCapRequired);
    expect(errors.customEra).toBe(WIZARD_MESSAGES.customEraRequired);
  });
});

describe('validateWizardAll', () => {
  it('collects errors across every step', () => {
    const errors = validateWizardAll(
      form({
        leagueName: 'A',
        maxRosterSize: 99,
        draftDate: new Date('2020-01-01T00:00:00.000Z'),
        salaryCapEnabled: true,
      }),
      'baseball',
      NOW,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'draftDate',
      'leagueName',
      'maxRosterSize',
      'salaryCap',
    ]);
  });

  it('passes a fully valid form', () => {
    expect(
      validateWizardAll(form({ draftDate: FUTURE }), 'baseball', NOW),
    ).toEqual({});
  });
});
