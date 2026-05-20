/**
 * Regression coverage for LS-4037: when the matchup locks mid-interaction
 * (e.g. status flips from Scheduled → InProgress while the user has a swap
 * click queued), the parent wrapper's mutation handlers must re-check the
 * latest `locked` value via a ref and bail out instead of submitting.
 *
 * Without the ref-based guard, a handler captured at render-time when
 * `locked === false` would still fire `swapPositions` / `updatePosition`
 * after a subsequent rerender with `locked === true`.
 */
import React from 'react';
import { render } from '@testing-library/react';
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
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '../../api/db/graphql.generated';

jest.mock('../../api/db/graphql.generated', () => {
  const actual = jest.requireActual<
    typeof import('../../api/db/graphql.generated')
  >('../../api/db/graphql.generated');
  return {
    ...actual,
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
  spStartsPerMatchup: 2,
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

describe('MatchupRosterEditor — locked-prop race (LS-4037)', () => {
  const swapPositions = jest.fn().mockResolvedValue(undefined);
  const updatePosition = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    swapPositions.mockClear();
    updatePosition.mockClear();
    playersResponse.refetch.mockClear();
    viewPropsRef.current = null;

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
