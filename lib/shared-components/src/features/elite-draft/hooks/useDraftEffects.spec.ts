/**
 * useDraftEffects — draft-order diagnostics (LS-10811).
 *
 * The current-pick read is now skipped until a draft starts, so the
 * DRAFT_TEAMS_NOT_CONFIGURED error can only reach this hook for a draft that
 * is running without seats — the case the commissioner-recovery copy exists
 * for. Lock that mapping so the recovery message keeps showing there.
 */
import { renderHook } from '@testing-library/react';
import { useDraftEffects } from './useDraftEffects';

function makeParams(currentPickErrorMessage: string) {
  return {
    league: { id: 1, draftStatus: 'in-progress' } as Parameters<
      typeof useDraftEffects
    >[0]['league'],
    leagueDraft: null,
    currentPickInfo: null,
    currentPickErrorMessage,
    currentPickTeamId: null,
    isMyPick: false,
    draftOrderMissing: false,
    searchTerm: '',
    teamNameById: () => 'Team',
    setDraftComplete: jest.fn(),
    setDraftPaused: jest.fn(),
    setDraftOrderMissing: jest.fn(),
    setCurrentPickLoadError: jest.fn(),
    setInitError: jest.fn(),
    setUrgentMessage: jest.fn(),
    setLiveMessage: jest.fn(),
    setPlayerSearch: jest.fn(),
  };
}

describe('useDraftEffects — draft order diagnostics (LS-10811)', () => {
  it('shows the re-start recovery message for a live draft with no seats', () => {
    const params = makeParams('No teams configured for this draft');
    renderHook(() => useDraftEffects(params));

    expect(params.setDraftOrderMissing).toHaveBeenCalledWith(true);
    expect(params.setInitError).toHaveBeenCalledWith(
      expect.stringContaining('Re-start the live draft'),
    );
    expect(params.setCurrentPickLoadError).toHaveBeenLastCalledWith(null);
  });

  it('shows no recovery message when the current pick loads cleanly', () => {
    const params = makeParams('');
    renderHook(() => useDraftEffects(params));

    expect(params.setInitError).not.toHaveBeenCalled();
    expect(params.setDraftOrderMissing).not.toHaveBeenCalledWith(true);
  });
});
