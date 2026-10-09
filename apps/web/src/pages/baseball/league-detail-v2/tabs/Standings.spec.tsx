/**
 * Tests for StandingsTab (LS-7814).
 *
 * Verifies that StandingsTab correctly wires GraphQL data to the shared
 * StandingsTable component: standings prop, currentUserTeamId, onTeamPress,
 * subtitle, and team-list fallback when standings are empty.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { StandingsTab } from './Standings';

let mockStandings: ReadonlyArray<Record<string, unknown>> = [];
let mockBracket: Record<string, unknown> | null = null;
let mockBracketPrevious: Record<string, unknown> | null | undefined;
let mockCurrentWeek: number | null = null;

const mockStandingsTable = jest.fn(() => null);
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  StandingsTable: (props: any) => mockStandingsTable(props),
  DEFAULT_SORT_KEY: 'winPct',
  DEFAULT_SORT_DIRECTION: 'desc',
  describeStandingsSort: (key: string, dir: string) =>
    `Sorted by ${{ winPct: 'win percentage', pointsFor: 'PF', team: 'team name' }[key]} ${dir === 'asc' ? '↑' : '↓'}`,
  PlayoffBracket: jest.fn(() => <div data-testid="playoff-bracket" />),
}));

const mockUseGetLeagueStandingsQuery = jest.fn((_args?: unknown) => ({
  data: { getLeagueStandings: mockStandings },
  loading: false,
}));

// Honours `skip` the way Apollo does, so a test that renders a bracket also
// proves the query was actually allowed to run (LS-9901).
const mockUseGetPlayoffBracketQuery = jest.fn(
  (options: { skip?: boolean } = {}) => ({
    data: options.skip ? undefined : { getPlayoffBracket: mockBracket },
    previousData: options.skip
      ? undefined
      : mockBracketPrevious === undefined
        ? undefined
        : { getPlayoffBracket: mockBracketPrevious },
  }),
);
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetLeagueStandingsQuery: (args?: unknown) =>
    mockUseGetLeagueStandingsQuery(args),
  useGetPlayoffBracketQuery: (args?: unknown) =>
    mockUseGetPlayoffBracketQuery(args as { skip?: boolean }),
}));

jest.mock('../../../../hooks/useMatchup', () => ({
  useCurrentWeek: () => ({ currentWeek: mockCurrentWeek }),
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
  mockBracketPrevious = undefined;
  mockCurrentWeek = null;
  mockStandingsTable.mockClear();
  mockUseGetLeagueStandingsQuery.mockClear();
  mockUseGetPlayoffBracketQuery.mockClear();
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

  it('passes getTeamUrl to StandingsTable that maps teamId to the baseball team route', () => {
    mockStandings = [makeRow({ teamId: '7' })];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const { getTeamUrl } = mockStandingsTable.mock.calls[0][0] as {
      getTeamUrl: (id: number) => string;
    };
    expect(typeof getTeamUrl).toBe('function');
    expect(getTeamUrl(7)).toBe('/baseball/teams/7');
    expect(getTeamUrl(42)).toBe('/baseball/teams/42');
  });

  it('maps teamId to the football team route for football leagues (LS-6438)', () => {
    mockStandings = [makeRow({ teamId: '7' })];
    render(
      <StandingsTab
        league={{ ...league, sport: 'football' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const { getTeamUrl } = mockStandingsTable.mock.calls[0][0] as {
      getTeamUrl: (id: number) => string;
    };
    expect(getTeamUrl(7)).toBe('/football/teams/7');
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

  it.each(['football', 'baseball'])(
    'default %s subtitle matches the default win-percentage order',
    (sport) => {
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={{ ...league, sport }}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      const subtitle = mockStandingsTable.mock.calls[0][0].subtitle as string;
      expect(subtitle).toBe('1 teams · Sorted by win percentage ↓');
    },
  );

  it('updates the subtitle when the table sort changes', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, sport: 'football' }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    const { onSortChange } = mockStandingsTable.mock.calls[0][0] as {
      onSortChange: (key: string, dir: string) => void;
    };
    act(() => onSortChange('pointsFor', 'desc'));
    const last = mockStandingsTable.mock.calls.at(-1)?.[0] as {
      subtitle: string;
    };
    expect(last.subtitle).toBe('1 teams · Sorted by PF ↓');
    act(() => onSortChange('team', 'asc'));
    const last2 = mockStandingsTable.mock.calls.at(-1)?.[0] as {
      subtitle: string;
    };
    expect(last2.subtitle).toBe('1 teams · Sorted by team name ↑');
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

  // LS-9901: the bracket section silently disappeared on the deployed app even
  // though `getPlayoffBracket` returned the bracket. Two fragilities caused it:
  // the query was gated on `league.playoffEnabled` (async league data that the
  // page refetches on every WebSocket reconnect), and cache-first pinned a
  // pre-bracket `null` for the rest of the session.
  describe('bracket resilience (LS-9901)', () => {
    it('queries the bracket even when playoffEnabled is false', () => {
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={{ ...league, playoffEnabled: false }}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      expect(mockUseGetPlayoffBracketQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: false }),
      );
    });

    it('queries the bracket when playoffEnabled is null', () => {
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={{ ...league, playoffEnabled: null }}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      expect(mockUseGetPlayoffBracketQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: false }),
      );
    });

    it('skips the bracket query only when the league has no id', () => {
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={{ ...league, id: null }}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      expect(mockUseGetPlayoffBracketQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
    });

    it('revalidates the bracket on mount rather than trusting the cache', () => {
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={league}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      expect(mockUseGetPlayoffBracketQuery).toHaveBeenCalledWith(
        expect.objectContaining({ fetchPolicy: 'cache-and-network' }),
      );
    });

    it('keeps showing the last good bracket when a refetch returns null', () => {
      mockStandings = [makeRow()];
      mockBracket = null;
      mockBracketPrevious = {
        matchups: [],
        status: 'scheduled',
        championTeam: null,
      };
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
  });

  it('hides the playoff bracket when no bracket data is returned', () => {
    mockStandings = [makeRow()];
    mockBracket = null;
    mockBracketPrevious = undefined;
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

  // LS-6344: median-game / "all-play" standings column visibility follows
  // league.medianGameEnabled.
  it('passes showMedianRecord=true when league.medianGameEnabled is true', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={{ ...league, medianGameEnabled: true }}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(mockStandingsTable).toHaveBeenCalledWith(
      expect.objectContaining({ showMedianRecord: true }),
    );
  });

  it('passes showMedianRecord=false when league.medianGameEnabled is false or unset', () => {
    mockStandings = [makeRow()];
    render(
      <StandingsTab
        league={league}
        teams={[]}
        myTeamId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(mockStandingsTable).toHaveBeenCalledWith(
      expect.objectContaining({ showMedianRecord: false }),
    );
  });

  // LS-6341: historical "as of Week N" standings via a week selector.
  describe('week selector', () => {
    it('does not render a week selector when the league has no current week yet', () => {
      mockCurrentWeek = null;
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
        screen.queryByLabelText('Select week for historical standings'),
      ).not.toBeInTheDocument();
    });

    it('renders a week selector with options 1..currentWeek plus Current', () => {
      mockCurrentWeek = 3;
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={league}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      const select = screen.getByLabelText(
        'Select week for historical standings',
      );
      const optionValues = Array.from(select.querySelectorAll('option')).map(
        (o) => o.value,
      );
      expect(optionValues).toEqual(['current', '1', '2', '3']);
    });

    it('defaults to current standings (throughWeek: null)', () => {
      mockCurrentWeek = 3;
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={league}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );
      expect(mockUseGetLeagueStandingsQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({ throughWeek: null }),
        }),
      );
    });

    it('re-queries standings with the selected week as throughWeek', () => {
      mockCurrentWeek = 5;
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={league}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );

      const select = screen.getByLabelText(
        'Select week for historical standings',
      );
      fireEvent.change(select, { target: { value: '2' } });

      expect(mockUseGetLeagueStandingsQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({ throughWeek: 2 }),
        }),
      );
    });

    it('includes "As of Week N" in the subtitle once a historical week is selected', () => {
      mockCurrentWeek = 5;
      mockStandings = [makeRow()];
      render(
        <StandingsTab
          league={league}
          teams={[]}
          myTeamId={null}
          onTeam={jest.fn()}
        />,
      );

      const select = screen.getByLabelText(
        'Select week for historical standings',
      );
      fireEvent.change(select, { target: { value: '4' } });

      const subtitle = mockStandingsTable.mock.calls[
        mockStandingsTable.mock.calls.length - 1
      ][0].subtitle as string;
      expect(subtitle).toContain('As of Week 4');
    });
  });
});
