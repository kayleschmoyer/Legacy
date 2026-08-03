import {
  DST_ROSTER_DEFAULTS,
  IDP_ROSTER_DEFAULTS,
} from './wizard/StepRosterSettings';
import {
  getSteps,
  INITIAL_STATE,
  validateStep,
  type WizardAction,
  wizardReducer,
  type WizardState,
} from './CreateLeagueWizard';

const baseState: WizardState = {
  ...INITIAL_STATE,
  name: 'Test League',
};

describe('getSteps', () => {
  it('returns 4-step flow for baseball, including the premium options step', () => {
    expect(getSteps('BASEBALL')).toEqual([
      'sport',
      'settings',
      'premium',
      'confirm',
    ]);
  });

  it('returns 6-step flow for football, including the premium options step', () => {
    expect(getSteps('FOOTBALL')).toEqual([
      'sport',
      'settings',
      'premium',
      'roster',
      'defensive',
      'confirm',
    ]);
  });
});

describe('wizardReducer', () => {
  describe('SET_SPORT', () => {
    it('switches to football defaults', () => {
      const action: WizardAction = { type: 'SET_SPORT', sport: 'FOOTBALL' };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.sport).toBe('FOOTBALL');
      expect(next.numTeams).toBe(12);
      expect(next.defensiveFormat).toBe('dst');
      expect(next.rosterSlots).toEqual(DST_ROSTER_DEFAULTS);
      expect(next.rosterCustomized).toBe(false);
    });

    it('switches to baseball defaults', () => {
      const footballState: WizardState = {
        ...INITIAL_STATE,
        sport: 'FOOTBALL',
        numTeams: 12,
        rosterSlots: { ...DST_ROSTER_DEFAULTS },
      };
      const action: WizardAction = { type: 'SET_SPORT', sport: 'BASEBALL' };
      const next = wizardReducer(footballState, action);
      expect(next.sport).toBe('BASEBALL');
      expect(next.numTeams).toBe(10);
      expect(next.rosterSlots).toEqual({});
      expect(next.rosterCustomized).toBe(false);
    });

    it('clears rosterCustomized when sport changes', () => {
      const customized: WizardState = {
        ...INITIAL_STATE,
        rosterCustomized: true,
      };
      const next = wizardReducer(customized, {
        type: 'SET_SPORT',
        sport: 'FOOTBALL',
      });
      expect(next.rosterCustomized).toBe(false);
    });
  });

  describe('SET_SETTINGS', () => {
    it('updates name, numTeams, and draftOrder', () => {
      const action: WizardAction = {
        type: 'SET_SETTINGS',
        settings: { name: 'My League', numTeams: 14, draftOrder: 'linear' },
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.name).toBe('My League');
      expect(next.numTeams).toBe(14);
      expect(next.draftOrder).toBe('linear');
    });

    it('does not touch sport or roster', () => {
      const action: WizardAction = {
        type: 'SET_SETTINGS',
        settings: { name: 'X', numTeams: 8, draftOrder: 'snake' },
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.sport).toBe(INITIAL_STATE.sport);
      expect(next.rosterSlots).toBe(INITIAL_STATE.rosterSlots);
    });
  });

  describe('SET_PREMIUM_OPTIONS', () => {
    it('merges the new premium option values into state', () => {
      const action: WizardAction = {
        type: 'SET_PREMIUM_OPTIONS',
        options: {
          selectionMethod: 'auction',
          auctionBudget: 300,
          auctionMinBid: 5,
          waiverType: 'faab',
          faabBudgetDefault: 200,
          eraFilter: 'modern',
          salaryCapEnabled: true,
          salaryCap: 50000,
        },
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.selectionMethod).toBe('auction');
      expect(next.auctionBudget).toBe(300);
      expect(next.auctionMinBid).toBe(5);
      expect(next.waiverType).toBe('faab');
      expect(next.faabBudgetDefault).toBe(200);
      expect(next.eraFilter).toBe('modern');
      expect(next.salaryCapEnabled).toBe(true);
      expect(next.salaryCap).toBe(50000);
    });

    it('does not touch unrelated state', () => {
      const action: WizardAction = {
        type: 'SET_PREMIUM_OPTIONS',
        options: {
          selectionMethod: 'random',
          auctionBudget: 200,
          auctionMinBid: 1,
          waiverType: 'standard',
          faabBudgetDefault: 100,
          eraFilter: 'all',
          salaryCapEnabled: false,
        },
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.sport).toBe(INITIAL_STATE.sport);
      expect(next.name).toBe(INITIAL_STATE.name);
    });
  });

  describe('SET_DEFENSIVE_FORMAT', () => {
    it('switches to IDP roster defaults', () => {
      const action: WizardAction = {
        type: 'SET_DEFENSIVE_FORMAT',
        format: 'idp',
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.defensiveFormat).toBe('idp');
      expect(next.rosterSlots).toEqual(IDP_ROSTER_DEFAULTS);
      expect(next.rosterCustomized).toBe(false);
    });

    it('switches back to DST roster defaults', () => {
      const idpState: WizardState = {
        ...INITIAL_STATE,
        defensiveFormat: 'idp',
        rosterSlots: { ...IDP_ROSTER_DEFAULTS },
      };
      const next = wizardReducer(idpState, {
        type: 'SET_DEFENSIVE_FORMAT',
        format: 'dst',
      });
      expect(next.defensiveFormat).toBe('dst');
      expect(next.rosterSlots).toEqual(DST_ROSTER_DEFAULTS);
    });

    it('is a no-op when format is unchanged', () => {
      const action: WizardAction = {
        type: 'SET_DEFENSIVE_FORMAT',
        format: 'dst',
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next).toBe(INITIAL_STATE);
    });

    it('clears rosterCustomized', () => {
      const customized: WizardState = {
        ...INITIAL_STATE,
        rosterCustomized: true,
      };
      const next = wizardReducer(customized, {
        type: 'SET_DEFENSIVE_FORMAT',
        format: 'idp',
      });
      expect(next.rosterCustomized).toBe(false);
    });
  });

  describe('SET_ROSTER_SLOTS', () => {
    it('updates slots and marks as customized', () => {
      const slots = { QB: 2, RB: 3 };
      const action: WizardAction = { type: 'SET_ROSTER_SLOTS', slots };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.rosterSlots).toEqual(slots);
      expect(next.rosterCustomized).toBe(true);
    });
  });
});

describe('validateStep', () => {
  it('returns null for non-settings steps', () => {
    expect(validateStep('sport', baseState)).toBeNull();
    expect(validateStep('roster', baseState)).toBeNull();
    expect(validateStep('defensive', baseState)).toBeNull();
    expect(validateStep('confirm', baseState)).toBeNull();
  });

  it('returns error when name is empty', () => {
    const state: WizardState = { ...baseState, name: '' };
    expect(validateStep('settings', state)).toBe('League name is required.');
  });

  it('returns error when name is only whitespace', () => {
    const state: WizardState = { ...baseState, name: '   ' };
    expect(validateStep('settings', state)).toBe('League name is required.');
  });

  it('returns error when name exceeds 50 characters', () => {
    const state: WizardState = { ...baseState, name: 'A'.repeat(51) };
    expect(validateStep('settings', state)).toBe(
      'League name must be 50 characters or fewer.',
    );
  });

  it('returns null when name is exactly 50 characters', () => {
    const state: WizardState = { ...baseState, name: 'A'.repeat(50) };
    expect(validateStep('settings', state)).toBeNull();
  });

  it('returns null on the premium step for a non-auction selection regardless of auction fields', () => {
    const state: WizardState = {
      ...baseState,
      selectionMethod: 'standard',
      auctionBudget: 0,
      auctionMinBid: 0,
    };
    expect(validateStep('premium', state)).toBeNull();
  });

  it('returns null for a valid auction budget and minimum bid', () => {
    const state: WizardState = {
      ...baseState,
      selectionMethod: 'auction',
      auctionBudget: 200,
      auctionMinBid: 1,
    };
    expect(validateStep('premium', state)).toBeNull();
  });

  it('returns error when auction budget is out of range', () => {
    const state: WizardState = {
      ...baseState,
      selectionMethod: 'auction',
      auctionBudget: 10_001,
      auctionMinBid: 1,
    };
    expect(validateStep('premium', state)).toBe(
      'Auction budget must be 1–10000.',
    );
  });

  it('returns error when minimum bid is out of range', () => {
    const state: WizardState = {
      ...baseState,
      selectionMethod: 'auction',
      auctionBudget: 200,
      auctionMinBid: 0,
    };
    expect(validateStep('premium', state)).toBe('Minimum bid must be 1–10000.');
  });

  it('returns error when minimum bid exceeds the auction budget', () => {
    const state: WizardState = {
      ...baseState,
      selectionMethod: 'auction',
      auctionBudget: 100,
      auctionMinBid: 150,
    };
    expect(validateStep('premium', state)).toBe(
      'Minimum bid cannot exceed the auction budget.',
    );
  });

  it('returns null on the premium step for a standard waiver regardless of faabBudgetDefault', () => {
    const state: WizardState = {
      ...baseState,
      waiverType: 'standard',
      faabBudgetDefault: 0,
    };
    expect(validateStep('premium', state)).toBeNull();
  });

  it('returns error when faab budget is out of range', () => {
    const state: WizardState = {
      ...baseState,
      waiverType: 'faab',
      faabBudgetDefault: 100_001,
    };
    expect(validateStep('premium', state)).toBe(
      'FAAB budget must be 1–100000.',
    );
  });

  it('returns null on the premium step for a non-custom era filter regardless of custom era years', () => {
    const state: WizardState = { ...baseState, eraFilter: 'all' };
    expect(validateStep('premium', state)).toBeNull();
  });

  it('returns error when custom era years are missing', () => {
    const state: WizardState = { ...baseState, eraFilter: 'custom' };
    expect(validateStep('premium', state)).toBe(
      'Custom era start and end year are required.',
    );
  });

  it('returns error when custom era start year is after the end year', () => {
    const state: WizardState = {
      ...baseState,
      eraFilter: 'custom',
      customEraStartYear: 2000,
      customEraEndYear: 1990,
    };
    expect(validateStep('premium', state)).toBe(
      'Custom era start year cannot be after the end year.',
    );
  });

  it('returns null for a valid custom era range', () => {
    const state: WizardState = {
      ...baseState,
      eraFilter: 'custom',
      customEraStartYear: 1990,
      customEraEndYear: 2000,
    };
    expect(validateStep('premium', state)).toBeNull();
  });

  it('returns null on the premium step when salary cap is disabled regardless of salaryCap', () => {
    const state: WizardState = {
      ...baseState,
      salaryCapEnabled: false,
      salaryCap: undefined,
    };
    expect(validateStep('premium', state)).toBeNull();
  });

  it('returns error when salary cap is enabled but unset', () => {
    const state: WizardState = {
      ...baseState,
      salaryCapEnabled: true,
      salaryCap: undefined,
    };
    expect(validateStep('premium', state)).toBe(
      'Salary cap must be 1–1000000000.',
    );
  });

  it('returns error when salary cap is out of range', () => {
    const state: WizardState = {
      ...baseState,
      salaryCapEnabled: true,
      salaryCap: 1_000_000_001,
    };
    expect(validateStep('premium', state)).toBe(
      'Salary cap must be 1–1000000000.',
    );
  });

  it('returns null for a valid enabled salary cap', () => {
    const state: WizardState = {
      ...baseState,
      salaryCapEnabled: true,
      salaryCap: 50_000_000,
    };
    expect(validateStep('premium', state)).toBeNull();
  });
});
