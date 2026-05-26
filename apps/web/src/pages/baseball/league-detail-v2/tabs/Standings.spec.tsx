/**
 * Tests for StandingsTab (LS-4637).
 *
 * Covers the redesign acceptance criteria:
 *   1. Win % column renders with .xxx (leading-zero stripped) formatting.
 *   2. Division grouping activates when ≥2 distinct divisionIds are present;
 *      single division renders flat.
 *   3. "You" chip renders on the viewer's own row.
 *   4. Empty state renders when neither standings nor teams are provided.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need runtime require */
import React from 'react';
import { render, screen, within } from '@testing-library/react';

import { StandingsTab } from './Standings';

let mockStandings: ReadonlyArray<Record<string, unknown>> = [];

jest.mock('../../../../api/db/graphql.generated', () => ({
  PlayoffMatchupStatus: { Completed: 'completed' },
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetLeagueStandingsQuery: jest.fn(() => ({
    data: { getLeagueStandings: mockStandings },
    loading: false,
  })),
  useGetPlayoffBracketQuery: jest.fn(() => ({
    data: { getPlayoffBracket: null },
  })),
}));

const league = {
  id: 1,
  name: 'Test League',
  playoffEnabled: false,
  playoffFormat: 'Single elimination',
} as any;

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  teamId: 100,
  teamName: 'Team A',
  wins: 8,
  losses: 4,
  ties: 0,
  winPercentage: 0.667,
  pointsFor: 1200,
  pointsAgainst: 1100,
  avatarUrl: null,
  primaryColor: null,
  secondaryColor: null,
  divisionId: null,
  ...overrides,
});

beforeEach(() => {
  mockStandings = [];
});

describe('StandingsTab', () => {
  it('renders the Win % column header (AC: design adds Win %)', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(
      screen.getByRole('columnheader', { name: 'Win %' }),
    ).toBeInTheDocument();
  });

  it('formats Win % as .xxx with leading zero stripped', () => {
    mockStandings = [makeRow({ winPercentage: 0.625 })];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.getByText('.625')).toBeInTheDocument();
  });

  it('renders a flat list when only one division is present', () => {
    mockStandings = [
      makeRow({ teamId: 100, teamName: 'Solo Div', divisionId: 1 }),
      makeRow({ teamId: 101, teamName: 'Also Solo', divisionId: 1 }),
    ];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.queryByText(/^Division /)).not.toBeInTheDocument();
  });

  it('groups teams by division when ≥2 divisions are present', () => {
    mockStandings = [
      makeRow({
        teamId: 100,
        teamName: 'East A',
        divisionId: 1,
        winPercentage: 0.8,
      }),
      makeRow({
        teamId: 101,
        teamName: 'West A',
        divisionId: 2,
        winPercentage: 0.7,
      }),
      makeRow({
        teamId: 102,
        teamName: 'East B',
        divisionId: 1,
        winPercentage: 0.4,
      }),
    ];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.getByText('Division 1')).toBeInTheDocument();
    expect(screen.getByText('Division 2')).toBeInTheDocument();
  });

  it('shows "You" chip on the viewer\'s row', () => {
    mockStandings = [
      makeRow({ teamId: 42, teamName: 'My Crew' }),
      makeRow({ teamId: 99, teamName: 'Rival' }),
    ];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={42}
        onTeam={jest.fn()}
      />,
    );
    const myRow = screen.getByText('My Crew').closest('tr');
    expect(myRow).not.toBeNull();
    expect(within(myRow as HTMLElement).getByText('You')).toBeInTheDocument();
    const rivalRow = screen.getByText('Rival').closest('tr');
    expect(
      within(rivalRow as HTMLElement).queryByText('You'),
    ).not.toBeInTheDocument();
  });

  it('only applies a backend-supplied primaryColor if it matches a safe CSS color shape', () => {
    mockStandings = [
      makeRow({ teamId: 100, teamName: 'Hex Team', primaryColor: '#ff0033' }),
      makeRow({
        teamId: 101,
        teamName: 'Unsafe Team',
        primaryColor: 'url(javascript:alert(1))',
      }),
    ];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const hexRow = screen.getByText('Hex Team').closest('tr');
    const unsafeRow = screen.getByText('Unsafe Team').closest('tr');
    expect(hexRow).not.toBeNull();
    expect(unsafeRow).not.toBeNull();
    const hexAvatar = (hexRow as HTMLElement).querySelector('.ls-avatar');
    const unsafeAvatar = (unsafeRow as HTMLElement).querySelector('.ls-avatar');
    expect((hexAvatar as HTMLElement).style.background).toBe('rgb(255, 0, 51)');
    expect((unsafeAvatar as HTMLElement).style.background).toBe('');
  });

  it('renders the empty-state message when no standings and no teams', () => {
    mockStandings = [];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(
      screen.getByText('No teams have joined this league yet.'),
    ).toBeInTheDocument();
  });

  it('shows football subtitle "Sorted by W, then PF" for football leagues', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, sport: 'football' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.getByText(/Sorted by W, then PF/)).toBeInTheDocument();
  });

  it('shows baseball subtitle "Sorted by win percentage" for baseball leagues', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, sport: 'baseball' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.getByText(/Sorted by win percentage/)).toBeInTheDocument();
  });
});
