/**
 * Regression coverage for:
 *
 * LS-4037: when the matchup locks mid-interaction (e.g. status flips from
 * Scheduled → InProgress while the user has a swap click queued), the parent
 * wrapper's mutation handlers must re-check the latest `locked` value via a
 * ref and bail out instead of submitting.
 *
 * LS-4051: immediately before submitting, handlers must re-query the server
 * (network-only) to verify the matchup is still Scheduled. If the server
 * reports a non-Scheduled status, the mutation must be skipped and the UI
 * must transition to locked state.
 *
 * LS-5894 (BMD-024): the pre-flight check must skip the network round-trip
 * when the last confirmed-Scheduled check is under 5s old, and must re-check
 * over the network once that window has elapsed.
 */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MatchupRosterEditorView } from '@legacy-sports/shared-components/roster';
import {
  type MatchupFragment,
  MatchupStatus,
  Sport,
} from '@legacy-sports/graphql';
import {
  useGetMatchupByIdLazyQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '@legacy-sports/graphql';
import { MatchupRosterEditor } from './MatchupRosterEditor';
import {
  useSetOptimalLineup,
  useSwapMatchupPlayerPositions,
  useUpdateMatchupPlayerPosition,
} from '../../hooks/useMatchup';
import { useHasEntitlement } from '../../hooks/useIsPremium';

jest.mock('@legacy-sports/graphql', () => {
  const actual = jest.requireActual<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );
  return {
    ...actual,
    useGetMatchupByIdLazyQuery: jest.fn(),
    useGetMatchupPlayersQuery: jest.fn(),
    useGetPositionsForLeagueQuery: jest.fn(),
  };
});

jest.mock('../../hooks/useMatchup', () => ({
  useSetOptimalLineup: jest.fn(),
  useSwapMatchupPlayerPositions: jest.fn(),
  useUpdateMatchupPlayerPosition: jest.fn(),
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useHasEntitlement: jest.fn(),
}));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({
    children,
    featureName,
  }: {
    children: React.ReactNode;
    featureName: string;
  }) => (
    <div data-testid="premium-gate" data-feature={featureName}>
      {children}
    </div>
  ),
}));

// Capture the props the wrapper passes into the shared View so the test can
// invoke the bound handlers directly — sidestepping Tamagui rendering.
const viewPropsRef: {
  current: React.ComponentProps<typeof MatchupRosterEditorView> | null;
} = { current: null };

jest.mock('@legacy-sports/shared-components/roster', () => ({
  POSITION_SLOT_ORDER: { SP: 0 },
  MatchupRosterEditorView: (
    props: React.ComponentProps<typeof MatchupRosterEditorView>,
  ) => {
    viewPropsRef.current = props;
    return null;
  },
}));

const matchup: MatchupFragment = {
  __typename: 'Matchup',
  id: '1234',
  weekNumber: 5,
  leagueId: 849,
  team1Id: 10,
  team2Id: 20,
  team1Score: 0,
  team2Score: 0,
  status: MatchupStatus.Scheduled,
  statsLoadingStatus: null,
  gamesPerMatchup: 10,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 5,
  startTime: null,
  endTime: null,
  team1: { __typename: 'Team', id: 10, name: 'Team A' },
  team2: { __typename: 'Team', id: 20, name: 'Team B' },
};

const playersResponse = {
  data: {
    getMatchupPlayers: [
      {
        __typename: 'MatchupPlayer',
        id: '101',
        positionId: 1,
        teamId: 10,
        season: 2026,
        player: {
          __typename: 'Player',
          firstName: 'Alice',
          lastName: 'Anders',
          eligiblePositions: ['SP'],
        },
      },
      {
        __typename: 'MatchupPlayer',
        id: '102',
        positionId: null,
        teamId: 10,
        season: 2026,
        player: {
          __typename: 'Player',
          firstName: 'Bob',
          lastName: 'Bryant',
          eligiblePositions: ['SP'],
        },
      },
    ],
  },
  loading: false,
  refetch: jest.fn().mockResolvedValue(undefined),
};

const positionsResponse = {
  data: {
    leaguePositions: [{ id: 1, positionType: 'SP' }],
  },
  loading: false,
};

const scheduledStatusResponse = {
  data: { getMatchupById: { ...matchup, status: MatchupStatus.Scheduled } },
};

// Default mocks for the optimizer hooks shared by every describe block below
// (most don't pass `sport`, so the button never renders, but the hooks are
// still called unconditionally and must not return undefined).
beforeEach(() => {
  (useSetOptimalLineup as jest.Mock).mockReturnValue({
    optimizeLineup: jest.fn().mockResolvedValue(undefined),
    loading: false,
  });
  (useHasEntitlement as jest.Mock).mockReturnValue(false);
});

describe('MatchupRosterEditor — empty roster state (LS-5898)', () => {
  const fetchMatchupStatus = jest.fn();
  const emptyPlayersResponse = {
    data: { getMatchupPlayers: [] },
    loading: false,
    refetch: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    fetchMatchupStatus.mockClear();
    emptyPlayersResponse.refetch.mockClear();
    viewPropsRef.current = null;

    (useGetMatchupByIdLazyQuery as jest.Mock).mockReturnValue([
      fetchMatchupStatus,
      {},
    ]);
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue(
      emptyPlayersResponse,
    );
    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue(
      positionsResponse,
    );
    (useSwapMatchupPlayerPositions as jest.Mock).mockReturnValue({
      swapPositions: jest.fn(),
      loading: false,
    });
    (useUpdateMatchupPlayerPosition as jest.Mock).mockReturnValue({
      updatePosition: jest.fn(),
      loading: false,
    });
  });

  it('renders an explanatory empty-state card instead of null when there are no players', () => {
    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    expect(
      screen.getByText(
        'No roster found for this matchup. Contact your commissioner.',
      ),
    ).toBeInTheDocument();
    expect(viewPropsRef.current).toBeNull();
  });

  it('refetches players when the retry button is pressed', () => {
    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    fireEvent.click(screen.getByText('Retry'));

    expect(emptyPlayersResponse.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('MatchupRosterEditor — locked-prop race (LS-4037)', () => {
  const swapPositions = jest.fn().mockResolvedValue(undefined);
  const updatePosition = jest.fn().mockResolvedValue(undefined);
  const fetchMatchupStatus = jest
    .fn()
    .mockResolvedValue(scheduledStatusResponse);

  beforeEach(() => {
    swapPositions.mockClear();
    updatePosition.mockClear();
    fetchMatchupStatus.mockClear();
    fetchMatchupStatus.mockResolvedValue(scheduledStatusResponse);
    playersResponse.refetch.mockClear();
    viewPropsRef.current = null;

    (useGetMatchupByIdLazyQuery as jest.Mock).mockReturnValue([
      fetchMatchupStatus,
      {},
    ]);
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue(playersResponse);
    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue(
      positionsResponse,
    );
    (useSwapMatchupPlayerPositions as jest.Mock).mockReturnValue({
      swapPositions,
      loading: false,
    });
    (useUpdateMatchupPlayerPosition as jest.Mock).mockReturnValue({
      updatePosition,
      loading: false,
    });
  });

  it('skips the swap mutation when the matchup locks after the handler was captured', async () => {
    const { rerender } = render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const capturedSwap = viewPropsRef.current?.onSwapPositions;
    if (!capturedSwap) throw new Error('expected onSwapPositions to be set');

    // Matchup locks mid-flow (e.g. status flips to InProgress over WS).
    rerender(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={true}
      />,
    );

    await capturedSwap('101', null, '102', 1);

    expect(swapPositions).not.toHaveBeenCalled();
    expect(playersResponse.refetch).not.toHaveBeenCalled();
  });

  it('skips the move mutation when the matchup locks after the handler was captured', async () => {
    const { rerender } = render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const capturedMove = viewPropsRef.current?.onMoveToPosition;
    if (!capturedMove) throw new Error('expected onMoveToPosition to be set');

    rerender(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={true}
      />,
    );

    await capturedMove('102', 1);

    expect(updatePosition).not.toHaveBeenCalled();
    expect(playersResponse.refetch).not.toHaveBeenCalled();
  });

  it('still fires the mutation while the matchup remains unlocked', async () => {
    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const swap = viewPropsRef.current?.onSwapPositions;
    if (!swap) throw new Error('expected onSwapPositions to be set');
    await swap('101', null, '102', 1);

    expect(swapPositions).toHaveBeenCalledTimes(1);
    expect(playersResponse.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('MatchupRosterEditor — server-side lock re-check (LS-4051)', () => {
  const swapPositions = jest.fn().mockResolvedValue(undefined);
  const updatePosition = jest.fn().mockResolvedValue(undefined);
  const fetchMatchupStatus = jest.fn();

  beforeEach(() => {
    swapPositions.mockClear();
    updatePosition.mockClear();
    fetchMatchupStatus.mockClear();
    playersResponse.refetch.mockClear();
    viewPropsRef.current = null;

    (useGetMatchupByIdLazyQuery as jest.Mock).mockReturnValue([
      fetchMatchupStatus,
      {},
    ]);
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue(playersResponse);
    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue(
      positionsResponse,
    );
    (useSwapMatchupPlayerPositions as jest.Mock).mockReturnValue({
      swapPositions,
      loading: false,
    });
    (useUpdateMatchupPlayerPosition as jest.Mock).mockReturnValue({
      updatePosition,
      loading: false,
    });
  });

  it('skips swap and locks UI when server reports InProgress', async () => {
    fetchMatchupStatus.mockResolvedValue({
      data: {
        getMatchupById: { ...matchup, status: MatchupStatus.InProgress },
      },
    });

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const swap = viewPropsRef.current?.onSwapPositions;
    if (!swap) throw new Error('expected onSwapPositions to be set');
    await act(async () => {
      await swap('101', null, '102', 1);
    });

    expect(swapPositions).not.toHaveBeenCalled();
    expect(playersResponse.refetch).not.toHaveBeenCalled();
    expect(viewPropsRef.current?.locked).toBe(true);
  });

  it('skips move and locks UI when server reports InProgress', async () => {
    fetchMatchupStatus.mockResolvedValue({
      data: {
        getMatchupById: { ...matchup, status: MatchupStatus.InProgress },
      },
    });

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const move = viewPropsRef.current?.onMoveToPosition;
    if (!move) throw new Error('expected onMoveToPosition to be set');
    await act(async () => {
      await move('101', 1);
    });

    expect(updatePosition).not.toHaveBeenCalled();
    expect(playersResponse.refetch).not.toHaveBeenCalled();
    expect(viewPropsRef.current?.locked).toBe(true);
  });

  it('locks UI when pre-flight fetch throws a network error', async () => {
    fetchMatchupStatus.mockRejectedValue(new Error('Network error'));

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const swap = viewPropsRef.current?.onSwapPositions;
    if (!swap) throw new Error('expected onSwapPositions to be set');
    await act(async () => {
      await swap('101', null, '102', 1);
    });

    expect(swapPositions).not.toHaveBeenCalled();
    expect(viewPropsRef.current?.locked).toBe(true);
  });

  it('fires mutations and does not lock UI when server confirms Scheduled', async () => {
    fetchMatchupStatus.mockResolvedValue(scheduledStatusResponse);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const swap = viewPropsRef.current?.onSwapPositions;
    if (!swap) throw new Error('expected onSwapPositions to be set');
    await swap('101', null, '102', 1);

    expect(swapPositions).toHaveBeenCalledTimes(1);
    expect(playersResponse.refetch).toHaveBeenCalledTimes(1);
    expect(viewPropsRef.current?.locked).toBe(false);
  });

  it('does not lock UI when swapPositions mutation throws', async () => {
    fetchMatchupStatus.mockResolvedValue(scheduledStatusResponse);
    swapPositions.mockRejectedValue(new Error('Mutation failed'));

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const swap = viewPropsRef.current?.onSwapPositions;
    if (!swap) throw new Error('expected onSwapPositions to be set');
    await act(async () => {
      await swap('101', null, '102', 1);
    });

    expect(swapPositions).toHaveBeenCalledTimes(1);
    expect(viewPropsRef.current?.locked).toBe(false);
  });

  it('does not lock UI when updatePosition mutation throws', async () => {
    fetchMatchupStatus.mockResolvedValue(scheduledStatusResponse);
    updatePosition.mockRejectedValue(new Error('Mutation failed'));

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const move = viewPropsRef.current?.onMoveToPosition;
    if (!move) throw new Error('expected onMoveToPosition to be set');
    await act(async () => {
      await move('101', 1);
    });

    expect(updatePosition).toHaveBeenCalledTimes(1);
    expect(viewPropsRef.current?.locked).toBe(false);
  });
});

describe('MatchupRosterEditor — pre-flight cache TTL (LS-5894 / BMD-024)', () => {
  const swapPositions = jest.fn().mockResolvedValue(undefined);
  const updatePosition = jest.fn().mockResolvedValue(undefined);
  const fetchMatchupStatus = jest
    .fn()
    .mockResolvedValue(scheduledStatusResponse);

  beforeEach(() => {
    swapPositions.mockClear();
    updatePosition.mockClear();
    fetchMatchupStatus.mockClear();
    fetchMatchupStatus.mockResolvedValue(scheduledStatusResponse);
    playersResponse.refetch.mockClear();
    viewPropsRef.current = null;

    (useGetMatchupByIdLazyQuery as jest.Mock).mockReturnValue([
      fetchMatchupStatus,
      {},
    ]);
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue(playersResponse);
    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue(
      positionsResponse,
    );
    (useSwapMatchupPlayerPositions as jest.Mock).mockReturnValue({
      swapPositions,
      loading: false,
    });
    (useUpdateMatchupPlayerPosition as jest.Mock).mockReturnValue({
      updatePosition,
      loading: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips the network pre-flight on a second swap within 5s of a confirmed check', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const swap = viewPropsRef.current?.onSwapPositions;
    if (!swap) throw new Error('expected onSwapPositions to be set');

    await act(async () => {
      await swap('101', null, '102', 1);
    });
    expect(fetchMatchupStatus).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_000_000 + 4_000); // 4s later — still within TTL
    await act(async () => {
      await swap('101', null, '102', 1);
    });

    expect(fetchMatchupStatus).toHaveBeenCalledTimes(1);
    expect(swapPositions).toHaveBeenCalledTimes(2);
  });

  it('re-checks over the network once the 5s TTL has elapsed', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2_000_000);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
      />,
    );

    const move = viewPropsRef.current?.onMoveToPosition;
    if (!move) throw new Error('expected onMoveToPosition to be set');

    await act(async () => {
      await move('101', 1);
    });
    expect(fetchMatchupStatus).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(2_000_000 + 5_001); // just past the TTL
    await act(async () => {
      await move('101', 1);
    });

    expect(fetchMatchupStatus).toHaveBeenCalledTimes(2);
    expect(updatePosition).toHaveBeenCalledTimes(2);
  });
});

describe('MatchupRosterEditor — Optimize My Lineup (LS-6378)', () => {
  const swapPositions = jest.fn().mockResolvedValue(undefined);
  const updatePosition = jest.fn().mockResolvedValue(undefined);
  const optimizeLineup = jest.fn().mockResolvedValue([]);
  const fetchMatchupStatus = jest
    .fn()
    .mockResolvedValue(scheduledStatusResponse);

  beforeEach(() => {
    swapPositions.mockClear();
    updatePosition.mockClear();
    optimizeLineup.mockClear();
    optimizeLineup.mockResolvedValue([]);
    fetchMatchupStatus.mockClear();
    fetchMatchupStatus.mockResolvedValue(scheduledStatusResponse);
    playersResponse.refetch.mockClear();
    viewPropsRef.current = null;

    (useGetMatchupByIdLazyQuery as jest.Mock).mockReturnValue([
      fetchMatchupStatus,
      {},
    ]);
    (useGetMatchupPlayersQuery as jest.Mock).mockReturnValue(playersResponse);
    (useGetPositionsForLeagueQuery as jest.Mock).mockReturnValue(
      positionsResponse,
    );
    (useSwapMatchupPlayerPositions as jest.Mock).mockReturnValue({
      swapPositions,
      loading: false,
    });
    (useUpdateMatchupPlayerPosition as jest.Mock).mockReturnValue({
      updatePosition,
      loading: false,
    });
    (useSetOptimalLineup as jest.Mock).mockReturnValue({
      optimizeLineup,
      loading: false,
    });
  });

  it('does not render the button for a non-football matchup', () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(true);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
        sport={Sport.Baseball}
      />,
    );

    expect(screen.queryByText('Optimize My Lineup')).not.toBeInTheDocument();
  });

  it('shows a premium upsell instead of an active button for a free football user', () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(false);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
        sport={Sport.Football}
      />,
    );

    expect(screen.getByTestId('premium-gate')).toHaveAttribute(
      'data-feature',
      'Optimize My Lineup',
    );
    expect(screen.getByText('Optimize My Lineup')).toBeDisabled();
  });

  it('calls setOptimalLineup and refetches players when a premium football user clicks the button', async () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(true);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={false}
        sport={Sport.Football}
      />,
    );

    expect(screen.queryByTestId('premium-gate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Optimize My Lineup'));

    await waitFor(() => expect(optimizeLineup).toHaveBeenCalledWith(1234, 10));
    expect(playersResponse.refetch).toHaveBeenCalledTimes(1);
  });

  it('hides the button entirely once the matchup is locked, even for a premium user', () => {
    (useHasEntitlement as jest.Mock).mockReturnValue(true);

    render(
      <MatchupRosterEditor
        matchup={matchup}
        userTeamId={10}
        leagueId={849}
        locked={true}
        sport={Sport.Football}
      />,
    );

    expect(screen.queryByText('Optimize My Lineup')).not.toBeInTheDocument();
  });
});
