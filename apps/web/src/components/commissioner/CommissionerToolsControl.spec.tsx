/**
 * Regression guard for LS-4040: rapid double-clicks on the Edit Matchup Scores
 * "Save Scores" button could fire the editMatchupScore mutation twice because
 * Apollo's `loading` flag propagates via React state and lags a render behind
 * the second click. A synchronous useRef guard in handleEdit prevents the
 * second concurrent invocation from firing the mutation.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import {
  EditMatchupScoresSection,
  SwapMatchupTeamsSection,
} from './CommissionerToolsControl';

const mockEditScore = jest.fn();
const mockSwap = jest.fn();
const mockGetMatchupsQuery = jest.fn();

jest.mock('../../api/db/graphql.generated', () => ({
  useGetMatchupsForLeagueQuery: (...args: unknown[]): unknown =>
    mockGetMatchupsQuery(...args),
  useEditMatchupScoreMutation: () => [mockEditScore, { loading: false }],
  // Stubs for the other hooks pulled in by the parent module's top-level imports.
  useBulkDropTeamPlayersMutation: () => [jest.fn(), { loading: false }],
  useForceAddPlayerMutation: () => [jest.fn(), { loading: false }],
  useForceDropPlayerMutation: () => [jest.fn(), { loading: false }],
  useGetCommissionerAuditLogsQuery: () => ({ data: undefined, loading: false }),
  useGetLeagueTeamsQuery: () => ({ data: { leagueTeams: [] }, loading: false }),
  useGetTeamMembersQuery: () => ({ data: undefined }),
  useRecalculateLeagueMatchupScoresMutation: () => [
    jest.fn(),
    { loading: false },
  ],
  useSetTeamLockMutation: () => [jest.fn(), { loading: false }],
  useSwapMatchupTeamsMutation: () => [mockSwap, { loading: false }],
  useUpdateCommissionerNoteMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy(
    {},
    {
      get: () => Icon,
    },
  );
});

// Tamagui — render Input as a real <input> mapping onChangeText → onChange,
// Button as a real <button> mapping onPress → onClick, and everything else as
// a passthrough div so jsdom doesn't choke on RN/Tamagui style injection.
jest.mock('tamagui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Input = ({
    value,
    onChangeText,
    accessibilityLabel,
  }: {
    value?: string;
    onChangeText?: (v: string) => void;
    accessibilityLabel?: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value ?? ''}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  const Button = ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {children}
    </button>
  );
  const Spinner = () => <span data-testid="spinner" />;
  return new Proxy(
    { Input, Button, Spinner },
    {
      get: (target, prop) =>
        (target as Record<string | symbol, unknown>)[prop] ?? Passthrough,
    },
  );
});

describe('EditMatchupScoresSection — LS-4040 double-submit guard', () => {
  beforeEach(() => {
    mockEditScore.mockReset();
    mockGetMatchupsQuery.mockReturnValue({
      data: {
        getMatchupsForLeague: [
          {
            id: '101',
            weekNumber: 1,
            team1Id: 1,
            team2Id: 2,
            team1Score: 0,
            team2Score: 0,
            status: 'completed',
          },
        ],
      },
      loading: false,
    });
  });

  it('fires editMatchupScore only once when Save Scores is clicked twice in rapid succession', async () => {
    // First click resolves slowly so the second click happens while the first
    // is still in flight — the exact race the ref guard protects against.
    let resolveFirst: (v: {
      data: { editMatchupScore: { message: string } };
    }) => void = () => {
      throw new Error('resolveFirst called before mutation in-flight');
    };
    mockEditScore.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mockEditScore.mockResolvedValue({
      data: { editMatchupScore: { message: 'Scores updated' } },
    });

    type Teams = React.ComponentProps<typeof EditMatchupScoresSection>['teams'];
    const teams: Teams = [
      { id: 1, name: 'Team A' },
      { id: 2, name: 'Team B' },
    ] as unknown as Teams;

    render(<EditMatchupScoresSection leagueId={1} teams={teams} />);

    fireEvent.change(screen.getByLabelText('Select matchup to edit'), {
      target: { value: '101' },
    });
    fireEvent.change(screen.getByLabelText('Team 1 score'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText('Team 2 score'), {
      target: { value: '90' },
    });

    const saveButton = screen.getByRole('button', { name: /save scores/i });

    // Two rapid synchronous clicks — without the ref guard both would pass the
    // disabled check (which depends on Apollo's React-state `loading` flag).
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(mockEditScore).toHaveBeenCalledTimes(1);

    await act(() => {
      resolveFirst({
        data: { editMatchupScore: { message: 'Scores updated' } },
      });
      return Promise.resolve();
    });
  });
});

describe('SwapMatchupTeamsSection — LS-4055 same-week validation', () => {
  const matchups = [
    {
      id: '201',
      weekNumber: 3,
      team1Id: 1,
      team2Id: 2,
      team1Score: 0,
      team2Score: 0,
      status: 'scheduled',
    },
    {
      id: '202',
      weekNumber: 3,
      team1Id: 3,
      team2Id: 4,
      team1Score: 0,
      team2Score: 0,
      status: 'scheduled',
    },
    {
      id: '301',
      weekNumber: 8,
      team1Id: 5,
      team2Id: 6,
      team1Score: 0,
      team2Score: 0,
      status: 'scheduled',
    },
  ];

  type Teams = React.ComponentProps<typeof SwapMatchupTeamsSection>['teams'];
  const teams: Teams = [
    { id: 1, name: 'Team A' },
    { id: 2, name: 'Team B' },
    { id: 3, name: 'Team C' },
    { id: 4, name: 'Team D' },
    { id: 5, name: 'Team E' },
    { id: 6, name: 'Team F' },
  ] as unknown as Teams;

  beforeEach(() => {
    mockSwap.mockReset();
    mockGetMatchupsQuery.mockReturnValue({
      data: { getMatchupsForLeague: matchups },
      loading: false,
    });
  });

  it('rejects swap when matchups are from different weeks', () => {
    const onError = jest.fn();
    render(
      <SwapMatchupTeamsSection leagueId={1} teams={teams} onError={onError} />,
    );

    fireEvent.change(screen.getByLabelText('Matchup A'), {
      target: { value: '201' },
    });
    fireEvent.change(screen.getByLabelText('Matchup B'), {
      target: { value: '301' },
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /swap teams/i }));
    });

    expect(onError).toHaveBeenCalledWith(
      new Error('Both matchups must be from the same week'),
    );
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('allows swap when matchups are from the same week', async () => {
    mockSwap.mockResolvedValue({
      data: { swapMatchupTeams: { message: 'Teams swapped' } },
    });
    const onSuccess = jest.fn();
    render(
      <SwapMatchupTeamsSection
        leagueId={1}
        teams={teams}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText('Matchup A'), {
      target: { value: '201' },
    });
    fireEvent.change(screen.getByLabelText('Matchup B'), {
      target: { value: '202' },
    });

    fireEvent.click(screen.getByRole('button', { name: /swap teams/i }));
    await act(() => Promise.resolve());

    expect(mockSwap).toHaveBeenCalledTimes(1);
    expect(mockSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { matchupId1: 201, matchupId2: 202, reason: undefined },
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith('Teams swapped');
  });
});
