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
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { MatchupRosterEditorView } from '@legacy-sports/shared-components/roster';
import { MatchupRosterEditor } from './MatchupRosterEditor';
import {
  type MatchupFragment,
  MatchupStatus,
} from '../../api/db/graphql.generated';
import {
  useSwapMatchupPlayerPositions,
  useUpdateMatchupPlayerPosition,
} from '../../hooks/useMatchup';
import {
  useGetMatchupByIdLazyQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '../../api/db/graphql.generated';

jest.mock('../../api/db/graphql.generated', () => {
  const actual = jest.requireActual<
    typeof import('../../api/db/graphql.generated')
  >('../../api/db/graphql.generated');
  return {
    ...actual,
    useGetMatchupByIdLazyQuery: jest.fn(),
    useGetMatchupPlayersQuery: jest.fn(),
    useGetPositionsForLeagueQuery: jest.fn(),
  };
});

jest.mock('../../hooks/useMatchup', () => ({
  useSwapMatchupPlayerPositions: jest.fn(),
  useUpdateMatchupPlayerPosition: jest.fn(),
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
} as MatchupFragment;

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
