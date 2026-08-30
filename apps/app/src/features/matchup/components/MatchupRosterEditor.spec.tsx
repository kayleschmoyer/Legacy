import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { MatchupStatus } from '@legacy-sports/graphql';

import { MatchupRosterEditor } from './MatchupRosterEditor';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock(
  'tamagui',
  () =>
    jest.requireActual<typeof import('../../../__test-utils__/tamagui-mocks')>(
      '../../../__test-utils__/tamagui-mocks',
    ).tamaguiMocks,
);

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

// Capture the props MatchupRosterEditorView is rendered with so tests can
// both assert on `locked` and trigger the swap/move callbacks directly,
// without needing to reproduce the shared view's internal drag/drop UI.
let lastViewProps: Record<string, unknown> | null = null;
jest.mock('@legacy-sports/shared-components', () => ({
  isStatsLoading: (): boolean => false,
  POSITION_SLOT_ORDER: {},
  MatchupRosterEditorView: (props: Record<string, unknown>) => {
    lastViewProps = props;
    return null;
  },
}));

const mockUseGetMatchupPlayersQuery = jest.fn();
const mockUseGetPositionsForLeagueQuery = jest.fn();
const mockUseGetMatchupByIdLazyQuery = jest.fn();
const mockSwapPositionsMutation = jest.fn();
const mockUpdatePositionMutation = jest.fn();
const mockUndoSwapMutation = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: {
    Scheduled: 'SCHEDULED',
    InProgress: 'IN_PROGRESS',
    Completed: 'COMPLETED',
  },
  useGetMatchupPlayersQuery: (opts: unknown): unknown =>
    mockUseGetMatchupPlayersQuery(opts),
  useGetPositionsForLeagueQuery: (opts: unknown): unknown =>
    mockUseGetPositionsForLeagueQuery(opts),
  useGetMatchupByIdLazyQuery: (opts: unknown): unknown =>
    mockUseGetMatchupByIdLazyQuery(opts),
  useSwapMatchupPlayerPositionsMutation: (): unknown => [
    mockSwapPositionsMutation,
    { loading: false },
  ],
  useUpdateMatchupPlayerPositionMutation: (): unknown => [
    mockUpdatePositionMutation,
    { loading: false },
  ],
  useUndoMatchupPlayerSwapMutation: (): unknown => [
    mockUndoSwapMutation,
    { loading: false },
  ],
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SCHEDULED = 'SCHEDULED' as MatchupStatus;
const IN_PROGRESS = 'IN_PROGRESS' as MatchupStatus;

const PLAYERS = [
  {
    id: '1',
    positionId: 5,
    teamId: 101,
    season: 2025,
    player: { firstName: 'Ada', lastName: 'Lovelace', eligiblePositions: [] },
  },
];

function primeMocks() {
  mockUseGetMatchupPlayersQuery.mockReturnValue({
    data: { getMatchupPlayers: PLAYERS },
    loading: false,
    error: undefined,
    refetch: jest.fn(() => Promise.resolve()),
  });
  mockUseGetPositionsForLeagueQuery.mockReturnValue({
    data: { leaguePositions: [] },
  });
}

describe('MatchupRosterEditor (mobile)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastViewProps = null;
    primeMocks();
  });

  it('polls getMatchupPlayers every 30s so roster data stays fresh (LS-5895)', () => {
    primeMocks();
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    expect(mockUseGetMatchupPlayersQuery).toHaveBeenCalledWith(
      expect.objectContaining({ pollInterval: 30_000 }),
    );
  });

  it('passes the locked prop through unchanged when no mutation has failed', () => {
    primeMocks();
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    expect(lastViewProps?.locked).toBe(false);
  });

  it('locks the editor after a rejected swap reveals the matchup is no longer Scheduled (LS-5895)', async () => {
    primeMocks();
    mockSwapPositionsMutation.mockRejectedValue(
      new Error('Cannot modify roster after the matchup has started'),
    );
    const fetchMatchupStatus = jest.fn(() =>
      Promise.resolve({ data: { getMatchupById: { status: IN_PROGRESS } } }),
    );
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([fetchMatchupStatus]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    expect(lastViewProps?.locked).toBe(false);

    const onSwapPositions = lastViewProps?.onSwapPositions as (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onSwapPositions('1', 5, '2', 6);
    });

    expect(fetchMatchupStatus).toHaveBeenCalledWith({
      variables: { id: 1 },
    });
    expect(lastViewProps?.locked).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Failed to swap positions. Please try again.',
    );
  });

  it('does not lock the editor when a rejected mutation reveals the matchup is still Scheduled', async () => {
    primeMocks();
    mockSwapPositionsMutation.mockRejectedValue(new Error('transient'));
    const fetchMatchupStatus = jest.fn(() =>
      Promise.resolve({ data: { getMatchupById: { status: SCHEDULED } } }),
    );
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([fetchMatchupStatus]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    const onSwapPositions = lastViewProps?.onSwapPositions as (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onSwapPositions('1', 5, '2', 6);
    });

    expect(lastViewProps?.locked).toBe(false);
  });

  // ── Undo prompt (LS-6376) ──────────────────────────────────────────────────

  /**
   * `handleUndo` runs fire-and-forget from the Alert button's `onPress`
   * (its promise is discarded), so tests can't `await` the press directly —
   * this drains enough microtask ticks for its `await mutation` / `await
   * refetch` chain to fully settle.
   */
  async function flushMicrotasks(rounds = 5): Promise<void> {
    for (let i = 0; i < rounds; i += 1) {
      await Promise.resolve();
    }
  }

  /** Pulls the 'Undo' button's onPress out of the last Alert.alert call. */
  function getUndoAlertOnPress(): () => void {
    const alertMock = Alert.alert as jest.Mock;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    const [title, , buttons] = lastCall;
    expect(title).toBe('Lineup updated');
    const undoButton = buttons.find((b) => b.text === 'Undo');
    expect(undoButton?.onPress).toBeInstanceOf(Function);
    if (!undoButton?.onPress) {
      throw new Error('Undo button onPress not found in Alert.alert call');
    }
    return undoButton.onPress;
  }

  it('offers an Undo prompt with the swapId after a successful swap', async () => {
    primeMocks();
    mockSwapPositionsMutation.mockResolvedValue({
      data: {
        swapMatchupPlayerPositions: [
          { id: '1', swapId: 'swap-abc' },
          { id: '2', swapId: 'swap-abc' },
        ],
      },
    });
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    const onSwapPositions = lastViewProps?.onSwapPositions as (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onSwapPositions('1', 5, '2', 6);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Lineup updated',
      'Tap Undo to revert this change.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Undo' }),
        expect.objectContaining({ text: 'Dismiss', style: 'cancel' }),
      ]),
    );

    const undoOnPress = getUndoAlertOnPress();
    await act(async () => {
      undoOnPress();
      await flushMicrotasks();
    });

    expect(mockUndoSwapMutation).toHaveBeenCalledWith({
      variables: { swapId: 'swap-abc' },
    });
  });

  it('offers an Undo prompt with the swapId after a successful single-position move', async () => {
    primeMocks();
    mockUpdatePositionMutation.mockResolvedValue({
      data: { updateMatchupPlayerPosition: { id: '1', swapId: 'move-xyz' } },
    });
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    const onMoveToPosition = lastViewProps?.onMoveToPosition as (
      playerId: string,
      positionId: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onMoveToPosition('1', 7);
    });

    const undoOnPress = getUndoAlertOnPress();
    await act(async () => {
      undoOnPress();
      await flushMicrotasks();
    });

    expect(mockUndoSwapMutation).toHaveBeenCalledWith({
      variables: { swapId: 'move-xyz' },
    });
  });

  it('does not offer an Undo prompt when the mutation response has no swapId', async () => {
    primeMocks();
    mockSwapPositionsMutation.mockResolvedValue({
      data: { swapMatchupPlayerPositions: [{ id: '1' }, { id: '2' }] },
    });
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    const onSwapPositions = lastViewProps?.onSwapPositions as (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onSwapPositions('1', 5, '2', 6);
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('refetches players and shows no error after a successful undo', async () => {
    primeMocks();
    const refetch = jest.fn(() => Promise.resolve());
    mockUseGetMatchupPlayersQuery.mockReturnValue({
      data: { getMatchupPlayers: PLAYERS },
      loading: false,
      error: undefined,
      refetch,
    });
    mockSwapPositionsMutation.mockResolvedValue({
      data: {
        swapMatchupPlayerPositions: [
          { id: '1', swapId: 'swap-abc' },
          { id: '2', swapId: 'swap-abc' },
        ],
      },
    });
    mockUndoSwapMutation.mockResolvedValue({
      data: { undoMatchupPlayerSwap: [{ id: '1' }, { id: '2' }] },
    });
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    const onSwapPositions = lastViewProps?.onSwapPositions as (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onSwapPositions('1', 5, '2', 6);
    });
    refetch.mockClear();

    const undoOnPress = getUndoAlertOnPress();
    await act(async () => {
      undoOnPress();
      await flushMicrotasks();
    });

    expect(mockUndoSwapMutation).toHaveBeenCalledWith({
      variables: { swapId: 'swap-abc' },
    });
    expect(refetch).toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('shows an error and logs when undoing a swap fails', async () => {
    primeMocks();
    mockSwapPositionsMutation.mockResolvedValue({
      data: {
        swapMatchupPlayerPositions: [
          { id: '1', swapId: 'swap-abc' },
          { id: '2', swapId: 'swap-abc' },
        ],
      },
    });
    mockUndoSwapMutation.mockRejectedValue(new Error('undo window expired'));
    mockUseGetMatchupByIdLazyQuery.mockReturnValue([jest.fn()]);

    render(
      <MatchupRosterEditor
        matchupId={1}
        leagueId={10}
        userTeamId={101}
        matchupStatus={SCHEDULED}
        locked={false}
      />,
    );

    const onSwapPositions = lastViewProps?.onSwapPositions as (
      player1Id: string,
      newPosition1Id: number | null,
      player2Id: string,
      newPosition2Id: number | null,
    ) => Promise<void>;

    await act(async () => {
      await onSwapPositions('1', 5, '2', 6);
    });

    const undoOnPress = getUndoAlertOnPress();
    (Alert.alert as jest.Mock).mockClear();
    await act(async () => {
      undoOnPress();
      await flushMicrotasks();
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to undo matchup player swap:',
      expect.any(Error),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Failed to undo. Please try again.',
    );
  });
});
