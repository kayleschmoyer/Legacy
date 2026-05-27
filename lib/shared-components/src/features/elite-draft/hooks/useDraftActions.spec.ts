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
    if (idx === 1) return [mockMakeDraftPick, { loading: false }];
    if (idx === 2) return [mockPauseDraft, { loading: false }];
    if (idx === 3) return [mockResumeDraft, { loading: false }];
    if (idx === 4) return [mockCommissionerPick, { loading: false }];
    return [mockNoop, { loading: false }];
  },
}));

jest.mock('../../../api/db/graphql.generated', () => ({
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
  } as Parameters<typeof useDraftActions>[0];
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
