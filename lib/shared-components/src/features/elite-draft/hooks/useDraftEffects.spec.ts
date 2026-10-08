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

describe('useDraftEffects — pick history refetch on completion', () => {
  type Params = Parameters<typeof useDraftEffects>[0];

  function render(overrides: Partial<Params>) {
    const refetchPickHistory = jest.fn();
    const params = {
      ...makeParams(''),
      refetchPickHistory,
      ...overrides,
    } as Params;
    renderHook(() => useDraftEffects(params));
    return { params, refetchPickHistory };
  }

  it('refetches pick history when leagueDraft.draftCompletedAt is set', () => {
    const { params, refetchPickHistory } = render({
      leagueDraft: {
        draftCompletedAt: '2026-01-01T00:00:00Z',
      },
    });

    expect(params.setDraftComplete).toHaveBeenCalledWith(true);
    expect(refetchPickHistory).toHaveBeenCalledTimes(1);
  });

  it('refetches pick history when currentPickInfo.isComplete is true', () => {
    const { params, refetchPickHistory } = render({
      currentPickInfo: { isComplete: true } as Params['currentPickInfo'],
    });

    expect(params.setDraftComplete).toHaveBeenCalledWith(true);
    expect(refetchPickHistory).toHaveBeenCalledTimes(1);
  });

  it('does not refetch pick history while the draft is incomplete', () => {
    const { params, refetchPickHistory } = render({
      leagueDraft: { draftCompletedAt: null },
      currentPickInfo: { isComplete: false } as Params['currentPickInfo'],
    });

    expect(params.setDraftComplete).not.toHaveBeenCalled();
    expect(refetchPickHistory).not.toHaveBeenCalled();
  });

  it('still marks the draft complete when no refetch callback is provided', () => {
    const params = {
      ...makeParams(''),
      currentPickInfo: { isComplete: true },
    } as unknown as Params;
    renderHook(() => useDraftEffects(params));

    expect(params.setDraftComplete).toHaveBeenCalledWith(true);
  });
});
