/**
 * Tests for the shared LeagueDetailFreeAgentsTab (LS-7818, LS-9098).
 *
 * Mirrors the behavioral coverage the web v2 tab used to own before the
 * extraction: hitter/pitcher column sets, nullable-name handling, the
 * spectator banner, the claim-action gating, and the sport-conditional
 * football position-group filters + sort-by-projection control.
 */

import React from 'react';
import { useFootballPlayersQuery } from '@legacy-sports/graphql';
import {
  type FreeAgentsTabLeague,
  LeagueDetailFreeAgentsTab,
} from './LeagueDetailFreeAgentsTab';
import { fireEvent, render, screen } from '../../test-utils';

let mockPlayers: ReadonlyArray<Record<string, unknown>> = [];
let mockFootballPlayers: ReadonlyArray<Record<string, unknown>> = [];
let mockFootballHasNextPage = false;
let mockFootballEndCursor: string | null = null;
let mockLeagueTeams: ReadonlyArray<Record<string, unknown>> | null = null;

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayersWithStatsQuery: jest.fn(() => ({
    data: { players: mockPlayers },
    loading: false,
  })),
  useFootballPlayersQuery: jest.fn(() => ({
    data: {
      footballPlayers: {
        nodes: mockFootballPlayers,
        pageInfo: {
          hasNextPage: mockFootballHasNextPage,
          endCursor: mockFootballEndCursor,
        },
      },
    },
    loading: false,
  })),
  useGetLeagueTeamsQuery: jest.fn(() => ({
    data: { leagueTeams: mockLeagueTeams },
    loading: false,
  })),
  GetTeamMembers: 'GetTeamMembers',
}));

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: jest.fn() }),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ArrowDown: () => null,
  ArrowUp: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Eye: () => null,
  Info: () => null,
  Search: () => null,
}));

interface MockBoxProps {
  children?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  role?: string;
}
interface MockInputProps {
  value?: string;
  onChangeText?: (next: string) => void;
  placeholder?: string;
}

jest.mock('tamagui', () => {
  const Box = ({ children, onPress, testID, role }: MockBoxProps) => (
    <div onClick={onPress} data-testid={testID} role={role}>
      {children}
    </div>
  );
  const Txt = ({ children, onPress, testID }: MockBoxProps) => (
    <span onClick={onPress} data-testid={testID}>
      {children}
    </span>
  );
  const Input = ({ value, onChangeText, placeholder }: MockInputProps) => (
    <input
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    ScrollView: Box,
    YStack: Box,
    XStack: Box,
    Text: Txt,
    Input,
  };
});

const league: FreeAgentsTabLeague = {
  id: 1,
  sport: 'baseball',
  waiverEnabled: false,
  waiverType: null,
  faabBudgetDefault: null,
  gamesPerMatchup: 5,
};

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

const claimAction = (player: { id: number }) => (
  <button type="button" data-testid="claim-free-agent-button">
    claim {player.id}
  </button>
);

/**
 * `projectedFantasyPoints` is always NULL in production (LS-9772 — no
 * projections/ADP pipeline exists yet); the default fixture reflects that
 * and drives PROJ from `careerStats` instead, the way the component now does.
 */
const makeFootballPlayer = (overrides: Record<string, unknown> = {}) => ({
  id: 20,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  projectedFantasyPoints: null,
  careerStats: {
    fantasyPoints: 340,
    passing: { g: 17, yds: 4800, td: 38, int: 10, rating: 105.2 },
    rushing: null,
    receiving: null,
    kicking: null,
    defense: null,
    idp: null,
  },
  ...overrides,
});

beforeEach(() => {
  mockPlayers = [];
  mockFootballPlayers = [];
  mockFootballHasNextPage = false;
  mockFootballEndCursor = null;
  mockLeagueTeams = null;
});

describe('LeagueDetailFreeAgentsTab', () => {
  it('defaults to the Hitters group and shows the hitter stat columns', () => {
    render(
      <LeagueDetailFreeAgentsTab league={league} isMember myTeamId={42} />,
    );
    expect(screen.getByTestId('fa-col-AVG')).toBeInTheDocument();
    expect(screen.getByTestId('fa-col-HR')).toBeInTheDocument();
    expect(screen.queryByTestId('fa-col-ERA')).not.toBeInTheDocument();
  });

  it('switches to pitcher columns when the Pitchers toggle is pressed', () => {
    render(
      <LeagueDetailFreeAgentsTab league={league} isMember myTeamId={42} />,
    );
    fireEvent.click(screen.getByText('Pitchers'));
    expect(screen.getByTestId('fa-col-ERA')).toBeInTheDocument();
    expect(screen.queryByTestId('fa-col-AVG')).not.toBeInTheDocument();
  });

  it('renders a partial name (not the literal "null") when a name part is missing', () => {
    mockPlayers = [makePlayer({ firstName: null, lastName: 'Cobb' })];
    render(
      <LeagueDetailFreeAgentsTab league={league} isMember myTeamId={42} />,
    );
    expect(screen.getByText('Cobb')).toBeInTheDocument();
    expect(screen.queryByText(/^null/)).not.toBeInTheDocument();
  });

  it('renders "Unknown Player" when both name parts are missing', () => {
    mockPlayers = [makePlayer({ firstName: null, lastName: null })];
    render(
      <LeagueDetailFreeAgentsTab league={league} isMember myTeamId={42} />,
    );
    expect(screen.getByText('Unknown Player')).toBeInTheDocument();
  });

  it('shows the Spectator Mode banner when the viewer is not a member', () => {
    render(
      <LeagueDetailFreeAgentsTab
        league={league}
        isMember={false}
        myTeamId={null}
      />,
    );
    expect(screen.getByText('Spectator Mode')).toBeInTheDocument();
  });

  it('renders the claim action only when the viewer is on a team', () => {
    mockPlayers = [makePlayer()];
    const { rerender } = render(
      <LeagueDetailFreeAgentsTab
        league={league}
        isMember
        myTeamId={42}
        renderClaimAction={claimAction}
      />,
    );
    expect(screen.getByTestId('claim-free-agent-button')).toBeInTheDocument();

    rerender(
      <LeagueDetailFreeAgentsTab
        league={league}
        isMember={false}
        myTeamId={null}
        renderClaimAction={claimAction}
      />,
    );
    expect(
      screen.queryByTestId('claim-free-agent-button'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Spectator')).toBeInTheDocument();
  });

  it('does not render a row for a player whose id is null (LS-4045)', () => {
    mockPlayers = [makePlayer({ id: null })];
    render(
      <LeagueDetailFreeAgentsTab
        league={league}
        isMember
        myTeamId={42}
        renderClaimAction={claimAction}
      />,
    );
    expect(
      screen.queryByTestId('claim-free-agent-button'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('No players found')).toBeInTheDocument();
  });

  it('does not render hitter/pitcher toggles for football leagues', () => {
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football' }}
        isMember
        myTeamId={42}
      />,
    );
    expect(screen.queryByText('Pitchers')).not.toBeInTheDocument();
    expect(screen.queryByText('Hitters')).not.toBeInTheDocument();
  });

  it('renders QB/RB/WR/TE/K/DST position filters for a non-IDP football league', () => {
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football', defensiveFormat: 'dst' }}
        isMember
        myTeamId={42}
      />,
    );
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
      expect(screen.getByTestId(`position-filter-${pos}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('position-filter-DL')).not.toBeInTheDocument();
  });

  it('adds IDP DL/LB/DB position filters when the league defensiveFormat is idp', () => {
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football', defensiveFormat: 'idp' }}
        isMember
        myTeamId={42}
      />,
    );
    for (const pos of ['DL', 'LB', 'DB']) {
      expect(screen.getByTestId(`position-filter-${pos}`)).toBeInTheDocument();
    }
  });

  it('renders football players with a Proj column and a sort-by-projection control', () => {
    mockFootballPlayers = [makeFootballPlayer()];
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football' }}
        isMember
        myTeamId={42}
      />,
    );
    expect(screen.getByTestId('fa-col-PROJ')).toBeInTheDocument();
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
    expect(screen.getByTestId('sort-by-projection')).toBeInTheDocument();
  });

  describe('server-side football query (LS-10683)', () => {
    const lastFootballVariables = () => {
      const calls = jest.mocked(useFootballPlayersQuery).mock.calls;
      return calls[calls.length - 1]?.[0]?.variables;
    };

    it('sends no sort until the projection control is pressed, then sorts the whole pool by fpg server-side', () => {
      mockFootballPlayers = [makeFootballPlayer()];
      render(
        <LeagueDetailFreeAgentsTab
          league={{ ...league, id: 14111, sport: 'football' }}
          isMember
          myTeamId={42}
        />,
      );
      expect(lastFootballVariables()).toMatchObject({
        sortBy: undefined,
        sortDir: undefined,
        leagueId: 14111,
        excludeRostered: true,
      });

      fireEvent.click(screen.getByTestId('sort-by-projection'));
      expect(lastFootballVariables()).toMatchObject({
        sortBy: 'fpg',
        sortDir: 'desc',
        leagueId: 14111,
        excludeRostered: true,
        after: undefined,
      });
    });

    it('keeps the projection sort when paging and resets to page 1 when the sort changes', () => {
      mockFootballPlayers = [makeFootballPlayer()];
      mockFootballHasNextPage = true;
      mockFootballEndCursor = '50';
      render(
        <LeagueDetailFreeAgentsTab
          league={{ ...league, sport: 'football' }}
          isMember
          myTeamId={42}
        />,
      );
      fireEvent.click(screen.getByTestId('sort-by-projection'));
      fireEvent.click(screen.getByTestId('football-next-page'));
      expect(lastFootballVariables()).toMatchObject({
        sortBy: 'fpg',
        sortDir: 'desc',
        after: '50',
      });

      fireEvent.click(screen.getByTestId('sort-by-projection'));
      expect(lastFootballVariables()).toMatchObject({
        sortBy: 'fpg',
        sortDir: 'asc',
        after: undefined,
      });
    });

    it('sends only offensive positions under ALL for a non-IDP league', () => {
      render(
        <LeagueDetailFreeAgentsTab
          league={{ ...league, sport: 'football', defensiveFormat: 'dst' }}
          isMember
          myTeamId={42}
        />,
      );
      expect(lastFootballVariables()?.positions).toEqual([
        'QB',
        'RB',
        'WR',
        'TE',
        'K',
        'DST',
      ]);
    });

    it('includes the IDP positions under ALL for an IDP league', () => {
      render(
        <LeagueDetailFreeAgentsTab
          league={{ ...league, sport: 'football', defensiveFormat: 'idp' }}
          isMember
          myTeamId={42}
        />,
      );
      expect(lastFootballVariables()?.positions).toEqual([
        'QB',
        'RB',
        'WR',
        'TE',
        'K',
        'DST',
        'DL',
        'LB',
        'DB',
      ]);
    });

    it('derives PROJ from the most games across categories, matching the server fpg divisor', () => {
      mockFootballPlayers = [
        makeFootballPlayer({
          careerStats: {
            fantasyPoints: 400,
            // A one-game trick-play pass must not shrink the divisor.
            passing: { g: 1, yds: 20, td: 0, int: 0, rating: null },
            rushing: { g: 20, yds: 1500, td: 10 },
            receiving: null,
            kicking: null,
            defense: null,
            idp: null,
          },
        }),
      ];
      render(
        <LeagueDetailFreeAgentsTab
          league={{ ...league, sport: 'football' }}
          isMember
          myTeamId={42}
        />,
      );
      // 400 career fantasy points / 20 games * 5 games-per-matchup = 100.0
      expect(screen.getByText('100.0')).toBeInTheDocument();
    });
  });

  it('renders passing stat columns with real values from careerStats for the QB filter (LS-9772)', () => {
    mockFootballPlayers = [makeFootballPlayer()];
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football', defensiveFormat: 'dst' }}
        isMember
        myTeamId={42}
      />,
    );
    fireEvent.click(screen.getByTestId('position-filter-QB'));
    expect(screen.getByTestId('fa-col-QB_YDS')).toBeInTheDocument();
    expect(screen.getByTestId('fa-col-QB_TD')).toBeInTheDocument();
    expect(screen.getByText('4,800')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    // 340 career fantasy points / 17 games * 5 games-per-matchup = 100.0
    expect(screen.getByText('100.0')).toBeInTheDocument();
  });

  it('renders rushing stat columns with real values from careerStats for the RB filter (LS-9772)', () => {
    mockFootballPlayers = [
      makeFootballPlayer({
        id: 21,
        firstName: 'Christian',
        lastName: 'McCaffrey',
        position: 'RB',
        careerStats: {
          fantasyPoints: 272,
          passing: null,
          rushing: { g: 16, yds: 1459, td: 14 },
          receiving: null,
          kicking: null,
          defense: null,
          idp: null,
        },
      }),
    ];
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football', defensiveFormat: 'dst' }}
        isMember
        myTeamId={42}
      />,
    );
    fireEvent.click(screen.getByTestId('position-filter-RB'));
    expect(screen.getByTestId('fa-col-RB_YDS')).toBeInTheDocument();
    expect(screen.getByTestId('fa-col-RB_TD')).toBeInTheDocument();
    expect(screen.getByText('1,459')).toBeInTheDocument();
  });

  it('shows a "—" PROJ placeholder rather than crashing when a player has no careerStats', () => {
    mockFootballPlayers = [makeFootballPlayer({ careerStats: null })];
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football' }}
        isMember
        myTeamId={42}
      />,
    );
    expect(screen.getByTestId('fa-col-PROJ')).toBeInTheDocument();
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
  });

  describe('FAAB budget display (FLD-028)', () => {
    const faabLeague: FreeAgentsTabLeague = {
      ...league,
      waiverEnabled: true,
      waiverType: 'faab',
      faabBudgetDefault: 100,
    };

    it('shows the remaining FAAB budget on a baseball FAAB league', () => {
      mockLeagueTeams = [{ id: 42, faabBudget: 73 }];
      render(
        <LeagueDetailFreeAgentsTab
          league={faabLeague}
          isMember
          myTeamId={42}
        />,
      );
      expect(screen.getByText('My FAAB Budget: $73')).toBeInTheDocument();
    });

    it('shows the remaining FAAB budget on a football FAAB league', () => {
      mockLeagueTeams = [{ id: 42, faabBudget: 55 }];
      render(
        <LeagueDetailFreeAgentsTab
          league={{ ...faabLeague, sport: 'football' }}
          isMember
          myTeamId={42}
        />,
      );
      expect(screen.getByText('My FAAB Budget: $55')).toBeInTheDocument();
    });

    it('does not show a FAAB budget badge for a non-FAAB league', () => {
      mockLeagueTeams = [{ id: 42, faabBudget: 73 }];
      render(
        <LeagueDetailFreeAgentsTab league={league} isMember myTeamId={42} />,
      );
      expect(screen.queryByText(/My FAAB Budget/)).not.toBeInTheDocument();
    });

    it('does not show a FAAB budget badge when the viewer has no team on record', () => {
      mockLeagueTeams = [{ id: 99, faabBudget: 73 }];
      render(
        <LeagueDetailFreeAgentsTab
          league={faabLeague}
          isMember
          myTeamId={42}
        />,
      );
      expect(screen.queryByText(/My FAAB Budget/)).not.toBeInTheDocument();
    });
  });
});
