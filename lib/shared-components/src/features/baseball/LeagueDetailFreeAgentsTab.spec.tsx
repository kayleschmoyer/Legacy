/**
 * Tests for the shared LeagueDetailFreeAgentsTab (LS-7818).
 *
 * Mirrors the behavioral coverage the web v2 tab used to own before the
 * extraction: hitter/pitcher column sets, nullable-name handling, the
 * spectator banner, the claim-action gating, and the football placeholder.
 */

import React from 'react';
import {
  type FreeAgentsTabLeague,
  LeagueDetailFreeAgentsTab,
} from './LeagueDetailFreeAgentsTab';
import { fireEvent, render, screen } from '../../test-utils';

let mockPlayers: ReadonlyArray<Record<string, unknown>> = [];

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayersWithStatsQuery: jest.fn(() => ({
    data: { players: mockPlayers },
    loading: false,
  })),
  useGetLeagueTeamsQuery: jest.fn(() => ({
    data: { leagueTeams: null },
    loading: false,
  })),
  GetTeamMembers: 'GetTeamMembers',
}));

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: jest.fn() }),
}));

jest.mock('@tamagui/lucide-icons', () => ({
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

beforeEach(() => {
  mockPlayers = [];
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

  it('renders the football player pool placeholder for football leagues', () => {
    render(
      <LeagueDetailFreeAgentsTab
        league={{ ...league, sport: 'football' }}
        isMember
        myTeamId={42}
      />,
    );
    expect(screen.getByText('Football Player Pool')).toBeInTheDocument();
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
});
