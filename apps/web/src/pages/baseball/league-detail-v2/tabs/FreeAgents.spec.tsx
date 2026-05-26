/**
 * Tests for FreeAgentsTab (LS-4637).
 *
 * Covers the redesign acceptance criteria:
 *   1. Renders Hitters group by default with appropriate stat columns.
 *   2. Toggling to Pitchers swaps the column set (HR/RBI → ERA/W/K/...).
 *   3. Nullable player names render a partial / "Unknown Player" — not the
 *      literal string "null" (regression guard for Cycle 1 bot finding).
 *   4. Spectator mode banner renders when isMember is false.
 *   5. Claim button is shown only when both isMember and myTeamId are present.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need runtime require */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { FreeAgentsTab } from './FreeAgents';

let mockPlayers: ReadonlyArray<Record<string, unknown>> = [];

jest.mock('../../../../api/db/graphql.generated', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetPlayersWithStatsQuery: jest.fn(() => ({
    data: { players: mockPlayers },
    loading: false,
  })),
}));

jest.mock('../../../../hooks/useLeagueTakenPlayers', () => ({
  useLeagueTakenPlayers: jest.fn(() => ({
    takenPlayerIds: new Set<number>(),
    loading: false,
  })),
}));

jest.mock('../../../../features/baseball/WaiverClaimModal', () => ({
  WaiverClaimModal: ({ player }: { player: { id: number } }) => (
    <div data-testid="waiver-claim-modal">claim {player.id}</div>
  ),
}));

jest.mock('../../../../features/baseball/LeagueFreeAgents', () => ({
  buildFreeAgentAriaLabel: (first?: string | null, last?: string | null) =>
    `Add ${[first, last].filter(Boolean).join(' ')}`,
}));

const league = {
  id: 1,
  name: 'Test League',
  waiverEnabled: false,
  waiverType: null,
  faabBudgetDefault: null,
  gamesPerMatchup: 5,
} as any;

const makePlayer = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  firstName: 'Walter',
  lastName: 'Johnson',
  eligiblePositions: ['SP'],
  primaryEra: null,
  scoring: {
    hitterScore: null,
    pitchingScore: 4200,
    hitterAvgPointsPerGame: null,
    pitchingAvgPointsPerGame: 12.5,
  },
  careerBatting: null,
  careerPitching: {
    wins: 417,
    losses: 279,
    era: 2.17,
    saves: 34,
    strikeouts: 3508,
    baseOnBalls: 1363,
    hits: 4913,
    outsRecorded: 16596,
  },
  ...overrides,
});

beforeEach(() => {
  mockPlayers = [];
});

describe('FreeAgentsTab', () => {
  it('defaults to the Hitters group and shows the hitter stat columns', () => {
    mockPlayers = [];
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    expect(
      screen.getByRole('columnheader', { name: 'AVG' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'HR' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'ERA' }),
    ).not.toBeInTheDocument();
  });

  it('switches to pitcher columns when the Pitchers toggle is pressed', () => {
    mockPlayers = [];
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pitchers' }));
    expect(
      screen.getByRole('columnheader', { name: 'ERA' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'AVG' }),
    ).not.toBeInTheDocument();
  });

  it('renders a partial name (not the literal "null") when a name part is missing', () => {
    mockPlayers = [makePlayer({ firstName: null, lastName: 'Cobb' })];
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    expect(screen.getByText('Cobb')).toBeInTheDocument();
    expect(screen.queryByText(/^null/)).not.toBeInTheDocument();
  });

  it('renders "Unknown Player" when both first and last names are missing', () => {
    mockPlayers = [makePlayer({ firstName: null, lastName: null })];
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    expect(screen.getByText('Unknown Player')).toBeInTheDocument();
  });

  it('shows the Spectator Mode banner when the viewer is not a member', () => {
    mockPlayers = [];
    render(<FreeAgentsTab league={league} isMember={false} myTeamId={null} />);
    expect(screen.getByText('Spectator Mode')).toBeInTheDocument();
  });

  it('shows the Claim button only when the viewer is on a team', () => {
    mockPlayers = [makePlayer()];
    const { rerender } = render(
      <FreeAgentsTab league={league} isMember myTeamId={42} />,
    );
    expect(screen.getByTestId('claim-free-agent-button')).toBeInTheDocument();

    rerender(
      <FreeAgentsTab league={league} isMember={false} myTeamId={null} />,
    );
    expect(
      screen.queryByTestId('claim-free-agent-button'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Spectator')).toBeInTheDocument();
  });

  it('opens the waiver claim modal when the Claim button is clicked', () => {
    mockPlayers = [makePlayer({ id: 77 })];
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    fireEvent.click(screen.getByTestId('claim-free-agent-button'));
    expect(screen.getByTestId('waiver-claim-modal')).toHaveTextContent(
      'claim 77',
    );
  });

  it('does not render a claim button for a player whose id is null (LS-4045)', () => {
    mockPlayers = [makePlayer({ id: null })];
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    expect(
      screen.queryByTestId('claim-free-agent-button'),
    ).not.toBeInTheDocument();
  });

  it('renders the football player pool placeholder for football leagues', () => {
    render(
      <FreeAgentsTab
        league={{ ...league, sport: 'football' }}
        isMember
        myTeamId={42}
      />,
    );
    expect(screen.getByText('Football Player Pool')).toBeInTheDocument();
  });

  it('does not render hitter/pitcher toggles for football leagues', () => {
    render(
      <FreeAgentsTab
        league={{ ...league, sport: 'football' }}
        isMember
        myTeamId={42}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Pitchers' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Hitters' }),
    ).not.toBeInTheDocument();
  });
});
