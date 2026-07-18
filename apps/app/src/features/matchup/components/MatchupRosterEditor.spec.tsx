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
});
