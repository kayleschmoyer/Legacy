import {
  applyWizardFieldChange,
  createInitialWizardForm,
  DEFAULT_AUCTION_BUDGET,
  DEFAULT_AUCTION_MIN_BID,
  divisionsHint,
  type LeagueCreateWizardForm,
  reconcileDivisions,
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
});

describe('division parity (web parity rule)', () => {
  it('allows only same-parity counts no larger than the team count', () => {
    expect(validDivisionOptions(12)).toEqual([2, 4]);
    expect(validDivisionOptions(5)).toEqual([1, 3]);
    expect(validDivisionOptions(2)).toEqual([2]);
  });

  it('snaps to the nearest same-parity option rather than collapsing to 1', () => {
    // 4 divisions with 16 teams stays 4 when the league drops to 14 teams.
    expect(reconcileDivisions(4, 14)).toBe(4);
    // Switching to an odd team count forces an odd division count.
    expect(reconcileDivisions(4, 5)).toBe(3);
    expect(reconcileDivisions(2, 9)).toBe(1);
  });

  it('keeps a still-valid count untouched', () => {
    expect(reconcileDivisions(2, 12)).toBe(2);
  });

  it('explains the odd-team constraint in the hint copy', () => {
    expect(divisionsHint(9)).toContain('only odd division counts (1, 3)');
    expect(divisionsHint(12)).toBe(
      'How many divisions to split your teams into',
    );
  });
});

describe('applyWizardFieldChange', () => {
  it('auto-resets divisions when the team-count parity changes', () => {
    const next = applyWizardFieldChange(
      form({ numberOfTeams: 12, numberOfDivisions: 4 }),
      'numberOfTeams',
      5,
    );
    expect(next.numberOfDivisions).toBe(3);
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
