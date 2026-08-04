/**
 * useDraftTimer — readOnly mode (LS-8942).
 *
 * The spectator screen mounts the timer with `readOnly: true`, which must
 * never call `nudgeExpiredDraftPick` — at 0:00 the clock waits for the
 * server. The default (member draft room) nudge behavior must be unchanged.
 */
import { act, renderHook } from '@testing-library/react';
import { useDraftTimer } from './useDraftTimer';
import type { CurrentDraftPickInfo } from '../types';

const currentPickInfo: CurrentDraftPickInfo = {
  draftId: 42,
  teamId: 7,
  round: 2,
  pickNumber: 3,
  overallPick: 13,
  isComplete: false,
};

function makeParams(
  overrides: Partial<Parameters<typeof useDraftTimer>[0]> = {},
) {
  return {
    draftId: 42,
    leagueId: 1,
    draftComplete: false,
    draftOrderMissing: false,
    draftPaused: false,
    currentPickInfo,
    // Expired one second ago — timeRemaining computes to 0.
    pickDeadline: new Date(Date.now() - 1000),
    leagueDraft: null,
    setPickDeadline: jest.fn(),
    setPickTimeLimitSeconds: jest.fn(),
    setAutoPickDisabled: jest.fn(),
    nudgeExpiredDraftPick: jest.fn().mockResolvedValue(undefined),
    refetchDraft: jest.fn(),
    refetchCurrentPick: jest.fn(),
    refetchPickHistory: jest.fn(),
    refetchAvailablePlayers: jest.fn(),
    ...overrides,
  };
}

describe('useDraftTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('nudges the server once the clock expires (default member behavior)', () => {
    const params = makeParams();
    renderHook(() => useDraftTimer(params));
    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(params.nudgeExpiredDraftPick).toHaveBeenCalledWith({
      variables: { leagueId: 1 },
    });
  });

  it('never nudges in readOnly mode, even at 0:00', () => {
    const params = makeParams({ readOnly: true });
    renderHook(() => useDraftTimer(params));
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(params.nudgeExpiredDraftPick).not.toHaveBeenCalled();
  });

  it('tolerates an absent nudge mutation in readOnly mode', () => {
    const params = makeParams({
      readOnly: true,
      nudgeExpiredDraftPick: undefined,
    });
    const { result } = renderHook(() => useDraftTimer(params));
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current.timeRemaining).toBe(0);
  });
});
