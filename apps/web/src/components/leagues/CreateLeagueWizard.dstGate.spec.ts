import { FOOTBALL_DST_DATA_AVAILABLE } from '@legacy-sports/utils';
import { INITIAL_STATE, wizardReducer } from './CreateLeagueWizard';

// New football leagues default to IDP while no team-defense players exist,
// so the wizard never lands on an unfillable DST slot (LS-10727).
describe('CreateLeagueWizard defaults — D/ST gate (LS-10727)', () => {
  const expectedFormat = FOOTBALL_DST_DATA_AVAILABLE ? 'dst' : 'idp';

  it('starts on the available defensive format', () => {
    expect(INITIAL_STATE.defensiveFormat).toBe(expectedFormat);
  });

  it('picking football lands on the available format and its slot set', () => {
    const next = wizardReducer(INITIAL_STATE, {
      type: 'SET_SPORT',
      sport: 'FOOTBALL',
    });
    expect(next.defensiveFormat).toBe(expectedFormat);
    expect('DST' in next.rosterSlots).toBe(FOOTBALL_DST_DATA_AVAILABLE);
  });
});
