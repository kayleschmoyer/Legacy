/**
 * useDraftActions — re-entry guard regression test for LS-2681
 *
 * Verifies that handleMakePick and handleCommissionerPick use synchronous
 * useRef guards (not Apollo's async `loading` flag) to prevent the same
 * pick slot from being submitted twice by a rapid second invocation that
 * fires before Apollo has had a chance to flip its `loading` boolean.
 */

import { act, renderHook } from '@testing-library/react';

// Jest hoists jest.mock above imports; references inside the factory must
// be allow-listed (prefixed with `mock`) so they can be safely captured.
const mockInitializeLiveDraft = jest.fn();
const mockMakeDraftPick = jest.fn();
const mockPauseDraft = jest.fn();
const mockResumeDraft = jest.fn();
const mockCommissionerPick = jest.fn();
const mockNoop = jest.fn();
const mockCallCounter = { current: 0 };

jest.mock('@apollo/client/react', () => ({
  useMutation: () => {
    const idx = mockCallCounter.current++;
    // Order matches useMutation call order in useDraftActions:
    //   0: INITIALIZE_LIVE_DRAFT
    //   1: MAKE_DRAFT_PICK
    //   2: PAUSE_DRAFT
    //   3: RESUME_DRAFT
    //   4: COMMISSIONER_PICK
    //   5: COMMISSIONER_SET_AUTOPICK_DISABLED
    //   6: NUDGE_EXPIRED_DRAFT_PICK
    //   7: SET_DRAFT_ORDER
    //   8: ADD_TO_DRAFT_QUEUE
    //   9: REMOVE_FROM_DRAFT_QUEUE
    //  10: TOGGLE_DRAFT_AUTO_PICK
    if (idx === 0) return [mockInitializeLiveDraft, { loading: false }];
    if (idx === 1) return [mockMakeDraftPick, { loading: false }];
    if (idx === 2) return [mockPauseDraft, { loading: false }];
    if (idx === 3) return [mockResumeDraft, { loading: false }];
    if (idx === 4) return [mockCommissionerPick, { loading: false }];
    return [mockNoop, { loading: false }];
  },
}));

jest.mock('@legacy-sports/graphql', () => ({
  AddToDraftQueue: 'AddToDraftQueue',
  CommissionerPick: 'CommissionerPick',
  CommissionerSetDraftAutoPickDisabled: 'CommissionerSetDraftAutoPickDisabled',
  InitializeLiveDraft: 'InitializeLiveDraft',
  MakeDraftPick: 'MakeDraftPick',
  NudgeExpiredDraftPick: 'NudgeExpiredDraftPick',
  PauseDraft: 'PauseDraft',
  RemoveFromDraftQueue: 'RemoveFromDraftQueue',
  ResumeDraft: 'ResumeDraft',
  SetDraftOrder: 'SetDraftOrder',
  ToggleDraftAutoPick: 'ToggleDraftAutoPick',
}));

// eslint-disable-next-line import/first
import { useDraftActions } from './useDraftActions';

function makeParams(
  overrides: Partial<Parameters<typeof useDraftActions>[0]> = {},
) {
  return {
    leagueId: 1,
    draftId: 42,
    myTeamId: 7,
    isMyPick: true,
    draftPaused: false,
    autoPickDisabled: false,
    leagueTeams: [],
    customDraftOrder: null,
    queuedPlayerIds: new Set<number>(),
    showToast: jest.fn(),
    setDraftPaused: jest.fn(),
    setDraftOrderMissing: jest.fn(),
    setInitError: jest.fn(),
    setAutoPickDisabled: jest.fn(),
    setCommPickMode: jest.fn(),
    setUrgentMessage: jest.fn(),
    refetchDraft: jest.fn(),
    refetchLeague: jest.fn(),
    refetchCurrentPick: jest.fn(),
    refetchPickHistory: jest.fn(),
    refetchAvailablePlayers: jest.fn(),
    refetchQueue: jest.fn().mockResolvedValue(undefined),
    refetchAutoPickStatuses: jest.fn(),
    autoPickTeamIds: new Set<string>(),
    ...overrides,
  };
}

describe('useDraftActions re-entry guards (LS-2681)', () => {
  beforeEach(() => {
    mockCallCounter.current = 0;
    mockMakeDraftPick.mockReset();
    mockPauseDraft.mockReset();
    mockResumeDraft.mockReset();
    mockCommissionerPick.mockReset();
    mockNoop.mockReset();
  });

  it('handleMakePick rejects a second concurrent call before the first resolves, even though Apollo loading is still false', async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    mockMakeDraftPick.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result } = renderHook(() => useDraftActions(makeParams()));

    let firstPromise: Promise<void> = Promise.resolve();
    let secondPromise: Promise<void> = Promise.resolve();
    act(() => {
      firstPromise = result.current.handleMakePick(101);
      secondPromise = result.current.handleMakePick(202);
    });

    // The synchronous ref must have blocked the second call even though
    // pickLoading is still false at the time of the second invocation.
    expect(mockMakeDraftPick).toHaveBeenCalledTimes(1);
    expect(mockMakeDraftPick).toHaveBeenCalledWith({
      variables: { draftId: 42, playerId: 101 },
      context: { suppressGlobalError: true },
    });

    await act(async () => {
      resolveFirst({ data: {} });
      await firstPromise;
      await secondPromise;
    });

    // After the first pick resolves, the ref is released so a later pick
    // can fire normally.
    mockMakeDraftPick.mockResolvedValueOnce({ data: {} });
    await act(async () => {
      await result.current.handleMakePick(303);
    });
    expect(mockMakeDraftPick).toHaveBeenCalledTimes(2);
    expect(mockMakeDraftPick).toHaveBeenLastCalledWith({
      variables: { draftId: 42, playerId: 303 },
      context: { suppressGlobalError: true },
    });
  });

  it('handleMakePick releases the ref on error so the next pick can fire', async () => {
    mockMakeDraftPick.mockRejectedValueOnce(
      new Error('Player has already been drafted'),
    );

    const { result } = renderHook(() => useDraftActions(makeParams()));

    await act(async () => {
      await result.current.handleMakePick(101);
    });

    mockMakeDraftPick.mockResolvedValueOnce({ data: {} });
    await act(async () => {
      await result.current.handleMakePick(202);
    });

    expect(mockMakeDraftPick).toHaveBeenCalledTimes(2);
  });

  it('handleCommissionerPick rejects a second concurrent call before the first resolves', async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    mockCommissionerPick.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result } = renderHook(() => useDraftActions(makeParams()));

    let firstPromise: Promise<void> = Promise.resolve();
    let secondPromise: Promise<void> = Promise.resolve();
    act(() => {
      firstPromise = result.current.handleCommissionerPick(101);
      secondPromise = result.current.handleCommissionerPick(202);
    });

    expect(mockCommissionerPick).toHaveBeenCalledTimes(1);
    expect(mockCommissionerPick).toHaveBeenCalledWith({
      variables: { draftId: 42, playerId: 101 },
    });

    await act(async () => {
      resolveFirst({ data: {} });
      await firstPromise;
      await secondPromise;
    });
  });
});

describe('useDraftActions ineligible-player feedback (LS-8066)', () => {
  beforeEach(() => {
    mockCallCounter.current = 0;
    mockMakeDraftPick.mockReset();
    mockNoop.mockReset();
  });

  // Each eligibility-rejection message from the backend
  // (lib/db-client/src/lib/DraftUtils.ts) must surface as a visible warning
  // toast rather than falling through to setUrgentMessage, which the native
  // mobile screen does not render.
  it.each([
    'Player does not meet the minimum career games requirement (500)',
    'Player does not meet the minimum career seasons requirement (3)',
    'This league is restricted to Hall of Fame players. This player is not in the Hall of Fame.',
    'Player has no recorded seasons in the Modern era and is not eligible for this league.',
  ])('shows a warning toast for: %s', async (message) => {
    mockMakeDraftPick.mockRejectedValueOnce(new Error(message));
    const showToast = jest.fn();
    const setUrgentMessage = jest.fn();
    const refetchAvailablePlayers = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(
        makeParams({ showToast, setUrgentMessage, refetchAvailablePlayers }),
      ),
    );

    await act(async () => {
      await result.current.handleMakePick(101);
    });

    expect(showToast).toHaveBeenCalledWith(message, 'warning');
    // The urgent-banner channel (invisible on native) must not be used.
    expect(setUrgentMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('Draft pick failed'),
    );
    expect(refetchAvailablePlayers).toHaveBeenCalled();
  });

  it('still routes a genuinely unexpected pick failure to the urgent banner', async () => {
    mockMakeDraftPick.mockRejectedValueOnce(new Error('kaboom'));
    const showToast = jest.fn();
    const setUrgentMessage = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ showToast, setUrgentMessage })),
    );

    await act(async () => {
      await result.current.handleMakePick(101);
    });

    expect(setUrgentMessage).toHaveBeenCalledWith('Draft pick failed: kaboom');
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('useDraftActions auto-pick toggle refetch (LS-7978)', () => {
  beforeEach(() => {
    mockCallCounter.current = 0;
    mockNoop.mockReset();
  });

  it('calls refetchDraft after enabling auto-pick so the timer sees the expired deadline', async () => {
    mockNoop.mockResolvedValueOnce({ data: {} });
    const refetchDraft = jest.fn();
    const refetchAutoPickStatuses = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ refetchDraft, refetchAutoPickStatuses })),
    );

    // Default autoPickTeamIds is empty, so enable = true (toggle ON)
    await act(async () => {
      await result.current.handleToggleUserAutoPick();
    });

    expect(refetchAutoPickStatuses).toHaveBeenCalledTimes(1);
    expect(refetchDraft).toHaveBeenCalledTimes(1);
  });

  it('does NOT call refetchDraft when disabling auto-pick', async () => {
    mockNoop.mockResolvedValueOnce({ data: {} });
    const refetchDraft = jest.fn();
    const refetchAutoPickStatuses = jest.fn();

    // myTeamId is 7; include it in autoPickTeamIds so isMyTeamAutoPick = true → enable = false
    const { result } = renderHook(() =>
      useDraftActions(
        makeParams({
          refetchDraft,
          refetchAutoPickStatuses,
          autoPickTeamIds: new Set(['7']),
        }),
      ),
    );

    await act(async () => {
      await result.current.handleToggleUserAutoPick();
    });

    expect(refetchAutoPickStatuses).toHaveBeenCalledTimes(1);
    expect(refetchDraft).not.toHaveBeenCalled();
  });
});

describe('useDraftActions auto-pick toggle optimistic update (LS-8786)', () => {
  beforeEach(() => {
    mockCallCounter.current = 0;
    mockNoop.mockReset();
  });

  it('flips isMyTeamAutoPick synchronously before the mutation resolves', async () => {
    let resolveToggle: (v: unknown) => void = () => undefined;
    mockNoop.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveToggle = resolve;
        }),
    );
    const refetchAutoPickStatuses = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ refetchAutoPickStatuses })),
    );

    expect(result.current.isMyTeamAutoPick).toBe(false);

    let togglePromise: Promise<void> = Promise.resolve();
    act(() => {
      togglePromise = result.current.handleToggleUserAutoPick();
    });

    // The pill must flip immediately, before the mutation round-trip
    // completes — this is the regression gate for LS-8786.
    expect(result.current.isMyTeamAutoPick).toBe(true);

    await act(async () => {
      resolveToggle({ data: {} });
      await togglePromise;
    });
  });

  it('reverts the optimistic flip and surfaces a toast when the mutation fails', async () => {
    mockNoop.mockRejectedValueOnce(new Error('network error'));
    const showToast = jest.fn();
    const refetchAutoPickStatuses = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useDraftActions(
        makeParams({
          showToast,
          refetchAutoPickStatuses,
          autoPickTeamIds: new Set(['7']),
        }),
      ),
    );

    expect(result.current.isMyTeamAutoPick).toBe(true);

    await act(async () => {
      await result.current.handleToggleUserAutoPick();
    });

    // Optimistic override clears once the round-trip settles, so the value
    // falls back to the (unchanged, static-in-this-test) server truth.
    expect(result.current.isMyTeamAutoPick).toBe(true);
    expect(showToast).toHaveBeenCalledWith('network error', 'error');
  });
});

describe('useDraftActions pause/resume optimistic update (LS-4834)', () => {
  beforeEach(() => {
    mockCallCounter.current = 0;
    mockMakeDraftPick.mockReset();
    mockPauseDraft.mockReset();
    mockResumeDraft.mockReset();
    mockCommissionerPick.mockReset();
    mockNoop.mockReset();
  });

  it('handlePauseDraft sets draftPaused=true synchronously before awaiting the mutation', async () => {
    let resolvePause: (v: unknown) => void = () => undefined;
    mockPauseDraft.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePause = resolve;
        }),
    );
    const setDraftPaused = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ setDraftPaused })),
    );

    let pausePromise: Promise<void> = Promise.resolve();
    act(() => {
      pausePromise = result.current.handlePauseDraft();
    });

    // Before the mutation resolves, draftPaused must already be true so the
    // timer freezes immediately — this is the regression gate for LS-4834.
    expect(setDraftPaused).toHaveBeenCalledWith(true);
    expect(mockPauseDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePause({ data: {} });
      await pausePromise;
    });

    // No revert on success.
    expect(setDraftPaused).not.toHaveBeenCalledWith(false);
  });

  it('handlePauseDraft reverts draftPaused to false when the mutation fails', async () => {
    mockPauseDraft.mockRejectedValueOnce(new Error('network error'));
    const setDraftPaused = jest.fn();
    const showToast = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ setDraftPaused, showToast })),
    );

    await act(async () => {
      await result.current.handlePauseDraft();
    });

    expect(setDraftPaused).toHaveBeenNthCalledWith(1, true);
    expect(setDraftPaused).toHaveBeenNthCalledWith(2, false);
    expect(showToast).toHaveBeenCalledWith('network error', 'error');
  });

  it('handleResumeDraft sets draftPaused=false synchronously before awaiting the mutation', async () => {
    let resolveResume: (v: unknown) => void = () => undefined;
    mockResumeDraft.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        }),
    );
    const setDraftPaused = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ draftPaused: true, setDraftPaused })),
    );

    let resumePromise: Promise<void> = Promise.resolve();
    act(() => {
      resumePromise = result.current.handleResumeDraft();
    });

    expect(setDraftPaused).toHaveBeenCalledWith(false);
    expect(mockResumeDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveResume({ data: {} });
      await resumePromise;
    });

    expect(setDraftPaused).not.toHaveBeenCalledWith(true);
  });

  it('handleResumeDraft reverts draftPaused to true when the mutation fails', async () => {
    mockResumeDraft.mockRejectedValueOnce(new Error('boom'));
    const setDraftPaused = jest.fn();
    const showToast = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(
        makeParams({ draftPaused: true, setDraftPaused, showToast }),
      ),
    );

    await act(async () => {
      await result.current.handleResumeDraft();
    });

    expect(setDraftPaused).toHaveBeenNthCalledWith(1, false);
    expect(setDraftPaused).toHaveBeenNthCalledWith(2, true);
    expect(showToast).toHaveBeenCalledWith('boom', 'error');
  });
});

describe('useDraftActions handleInitializeDraft state-machine error handling (LS-9168)', () => {
  beforeEach(() => {
    mockCallCounter.current = 0;
    mockInitializeLiveDraft.mockReset();
  });

  it('surfaces a clear, actionable message and resyncs league state when the draft is already paused', async () => {
    mockInitializeLiveDraft.mockRejectedValueOnce(
      new Error("Cannot initialize draft: current status is 'paused'"),
    );
    const setInitError = jest.fn();
    const refetchLeague = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ setInitError, refetchLeague })),
    );

    await act(async () => {
      await result.current.handleInitializeDraft();
    });

    expect(setInitError).toHaveBeenLastCalledWith(
      'This draft is already paused. Resume it from the draft board instead of starting a new one.',
    );
    expect(refetchLeague).toHaveBeenCalled();
  });

  it('surfaces a clear message and resyncs league state for any other current-status rejection', async () => {
    mockInitializeLiveDraft.mockRejectedValueOnce(
      new Error("Cannot initialize draft: current status is 'in-progress'"),
    );
    const setInitError = jest.fn();
    const refetchLeague = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ setInitError, refetchLeague })),
    );

    await act(async () => {
      await result.current.handleInitializeDraft();
    });

    expect(setInitError).toHaveBeenLastCalledWith(
      'This draft has already been started. Refresh to see its current state.',
    );
    expect(refetchLeague).toHaveBeenCalled();
  });

  it('falls back to the raw error message for unrelated failures', async () => {
    mockInitializeLiveDraft.mockRejectedValueOnce(new Error('network error'));
    const setInitError = jest.fn();
    const refetchLeague = jest.fn();

    const { result } = renderHook(() =>
      useDraftActions(makeParams({ setInitError, refetchLeague })),
    );

    await act(async () => {
      await result.current.handleInitializeDraft();
    });

    expect(setInitError).toHaveBeenLastCalledWith('network error');
    expect(refetchLeague).not.toHaveBeenCalled();
  });
});
