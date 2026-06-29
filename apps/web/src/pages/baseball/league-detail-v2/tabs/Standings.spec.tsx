/**
 * Tests for StandingsTab (LS-7814).
 *
 * The standings table is now the shared `StandingsTable` from
 * `@legacy-sports/shared-components` (the web-only custom table was deleted).
 * These tests verify the tab's own responsibilities: wiring standings/props
 * through to the shared table, the team-list fallback, subtitle computation,
 * and the playoff bracket gate. Column rendering, Win % formatting, division
 * grouping, and the "You" highlight are covered by the shared component's own
 * spec (lib/shared-components/.../StandingsTable.spec.tsx).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { StandingsTable } from '@legacy-sports/shared-components';
import { StandingsTab } from './Standings';

let mockStandings: ReadonlyArray<Record<string, unknown>> = [];
let mockBracket: Record<string, unknown> | null = null;

jest.mock('@legacy-sports/shared-components', () => ({
  StandingsTable: jest.fn(() => <div data-testid="standings-table" />),
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

const StandingsTableMock = StandingsTable as unknown as jest.Mock;

const league = {
  id: 1,
  name: 'Test League',
  sport: 'baseball',
  playoffEnabled: false,
  playoffFormat: 'Single elimination',
} as any;

const makeRow = (overrides: Record<string, unknown> = {}) => ({
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

interface CapturedProps {
  standings: Array<Record<string, unknown>>;
  loading?: boolean;
  currentUserTeamId: number | null;
  onTeamPress: unknown;
  subtitle: string;
}

const lastProps = (): CapturedProps =>
  StandingsTableMock.mock.calls[
    StandingsTableMock.mock.calls.length - 1
  ][0] as CapturedProps;

beforeEach(() => {
  mockStandings = [];
  mockBracket = null;
  StandingsTableMock.mockClear();
});

describe('StandingsTab', () => {
  it('passes fetched standings through to the shared StandingsTable', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(screen.getByTestId('standings-table')).toBeInTheDocument();
    expect(lastProps().standings).toHaveLength(1);
    expect(lastProps().standings[0].teamName).toBe('Team A');
  });

  it('wires currentUserTeamId and onTeamPress through to the shared table', () => {
    const onTeam = jest.fn();
    mockStandings = [makeRow({ teamId: '42' })];
    render(
      <StandingsTab league={league} teams={[]} myTeamId={42} onTeam={onTeam} />,
    );
    expect(lastProps().currentUserTeamId).toBe(42);
    expect(lastProps().onTeamPress).toBe(onTeam);
  });

  it('falls back to the team list when no standings are available', () => {
    mockStandings = [];
    render(
      <StandingsTab
        league={league}
        teams={
          [
            { id: 7, name: 'Fallback FC', primaryColor: '#ff0033' },
            { id: 8, name: 'Bench United' },
          ] as any
        }
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const { standings } = lastProps();
    expect(standings).toHaveLength(2);
    expect(standings[0]).toMatchObject({
      teamId: '7',
      teamName: 'Fallback FC',
    });
    expect(standings[0].wins).toBeNull();
  });

  it('passes an empty array when there are no standings and no teams', () => {
    mockStandings = [];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(lastProps().standings).toHaveLength(0);
  });

  it('shows a football subtitle for football leagues', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, sport: 'football' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(lastProps().subtitle).toMatch(/then PF/);
  });

  it('shows a baseball subtitle for baseball leagues', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, sport: 'baseball' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(lastProps().subtitle).toMatch(/Sorted by win percentage$/);
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
});
