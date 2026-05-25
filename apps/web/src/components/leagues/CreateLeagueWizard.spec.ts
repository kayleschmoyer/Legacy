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
  it('returns 3-step flow for baseball', () => {
    expect(getSteps('BASEBALL')).toEqual(['sport', 'settings', 'confirm']);
  });

  it('returns 5-step flow for football', () => {
    expect(getSteps('FOOTBALL')).toEqual([
      'sport',
      'settings',
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
    it('updates name, numTeams, and draftType', () => {
      const action: WizardAction = {
        type: 'SET_SETTINGS',
        settings: { name: 'My League', numTeams: 14, draftType: 'auction' },
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.name).toBe('My League');
      expect(next.numTeams).toBe(14);
      expect(next.draftType).toBe('auction');
    });

    it('does not touch sport or roster', () => {
      const action: WizardAction = {
        type: 'SET_SETTINGS',
        settings: { name: 'X', numTeams: 8, draftType: 'snake' },
      };
      const next = wizardReducer(INITIAL_STATE, action);
      expect(next.sport).toBe(INITIAL_STATE.sport);
      expect(next.rosterSlots).toBe(INITIAL_STATE.rosterSlots);
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
});
