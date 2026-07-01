/**
 * Tests for StandingsTab (LS-7814).
 *
 * Verifies that StandingsTab correctly wires GraphQL data to the shared
 * StandingsTable component: standings prop, currentUserTeamId, onTeamPress,
 * subtitle, and team-list fallback when standings are empty.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { StandingsTab } from './Standings';

let mockStandings: ReadonlyArray<Record<string, unknown>> = [];
let mockBracket: Record<string, unknown> | null = null;

const mockStandingsTable = jest.fn(() => null);
jest.mock('@legacy-sports/shared-components', () => ({
  StandingsTable: (props: any) => mockStandingsTable(props),
  PlayoffBracket: jest.fn(() => <div data-testid="playoff-bracket" />),
}));

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetLeagueStandingsQuery: jest.fn(() => ({
    data: { getLeagueStandings: mockStandings },
    loading: false,
  })),
  useGetPlayoffBracketQuery: jest.fn(() => ({
    data: { getPlayoffBracket: mockBracket },
  })),
}));

const league = {
  id: 1,
  name: 'Test League',
  playoffEnabled: false,
  playoffFormat: 'Single elimination',
} as any;

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  __typename: 'TeamStanding',
  teamId: '100',
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
  mockBracket = null;
  mockStandingsTable.mockClear();
});

describe('StandingsTab', () => {
  it('passes standings array to StandingsTable', () => {
    const row = makeRow();
    mockStandings = [row];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(mockStandingsTable).toHaveBeenCalledWith(
      expect.objectContaining({ standings: [row] }),
    );
  });

  it('passes currentUserTeamId to StandingsTable', () => {
    mockStandings = [makeRow({ teamId: '42' })];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={42}
        onTeam={jest.fn()}
      />,
    );
    expect(mockStandingsTable).toHaveBeenCalledWith(
      expect.objectContaining({ currentUserTeamId: 42 }),
    );
  });

  it('passes onTeamPress to StandingsTable', () => {
    mockStandings = [makeRow()];
    const onTeam = jest.fn();
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={onTeam}
      />,
    );
    expect(mockStandingsTable).toHaveBeenCalledWith(
      expect.objectContaining({ onTeamPress: onTeam }),
    );
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
    const subtitle = mockStandingsTable.mock.calls[0][0].subtitle as string;
    expect(subtitle).toMatch(/Sorted by W, then PF/);
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
    const subtitle = mockStandingsTable.mock.calls[0][0].subtitle as string;
    expect(subtitle).toMatch(/Sorted by win percentage/);
  });

  it('falls back to teams list when standings are empty', () => {
    mockStandings = [];
    const teams = [
      { id: 10, name: 'Fallback Team', primaryColor: null },
      { id: 11, name: 'Other Team', primaryColor: null },
    ] as any;
    render(
      <StandingsTab
        league={league}
        teams={teams}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const standings = mockStandingsTable.mock.calls[0][0]
      .standings as Array<any>;
    expect(standings).toHaveLength(2);
    expect(standings[0].teamName).toBe('Fallback Team');
    expect(standings[1].teamName).toBe('Other Team');
  });

  it('renders empty StandingsTable when no standings and no teams', () => {
    mockStandings = [];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(mockStandingsTable).toHaveBeenCalledWith(
      expect.objectContaining({ standings: [] }),
    );
  });

  it('renders the playoff bracket when a bracket is present', () => {
    mockStandings = [makeRow()];
    mockBracket = { matchups: [], status: 'pending', championTeam: null };
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.getByTestId('playoff-bracket')).toBeInTheDocument();
  });

  it('hides the playoff bracket when no bracket data is returned', () => {
    mockStandings = [makeRow()];
    mockBracket = null;
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('playoff-bracket')).not.toBeInTheDocument();
  });

  // BLD-032: playoffFormat is a commissioner-configured value and must not be
  // shown to spectators in the standings subtitle (LS-5965).
  it('does not expose playoffFormat in the subtitle shown to all viewers', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, playoffFormat: 'Single elimination' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const subtitle = mockStandingsTable.mock.calls[0][0].subtitle as string;
    expect(subtitle).not.toContain('Single elimination');
  });
});
