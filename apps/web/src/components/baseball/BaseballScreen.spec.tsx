import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BaseballScreen } from './BaseballScreen';

interface HarnessLeague {
  id?: number | null;
  name?: string | null;
}
interface MLBHomeHarnessProps {
  userName?: string;
  loading?: boolean;
  error?: boolean;
  isAuthenticated?: boolean;
  leagues: HarnessLeague[];
  onViewLeague: (id: number) => void;
  onJoinLeague: () => void;
  onCreateLeague: (input: Record<string, unknown>) => Promise<void>;
}
interface LeaguesQueryResult {
  data?: { userLeagues: HarnessLeague[] };
  loading: boolean;
  error?: Error;
  refetch: () => void;
}

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../PageMeta', () => ({ PageMeta: () => null }));

const mockUseAuth = jest.fn(() => ({
  isLoading: false,
  user: { username: 'schmoyer21@gmail.com' },
}));
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Capture the props the wrapper feeds into the shared component and expose
// buttons that fire its callbacks so we can assert the data wiring.
jest.mock('@legacy-sports/shared-components/baseball', () => ({
  MLBHome: (props: MLBHomeHarnessProps) => (
    <div data-testid="mlb-home">
      <span>userName:{props.userName}</span>
      <span>loading:{String(props.loading)}</span>
      <span>error:{String(props.error)}</span>
      <span>auth:{String(props.isAuthenticated)}</span>
      <span>leagues:{props.leagues.map((l) => l.name).join(',')}</span>
      <button onClick={() => props.onViewLeague(7)}>view</button>
      <button onClick={() => props.onJoinLeague()}>join</button>
      <button
        onClick={() =>
          void props.onCreateLeague({
            leagueName: 'My League',
            numberOfTeams: 8,
            numberOfDivisions: 2,
            playerPool: 'all',
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            maxRosterSize: 25,
            isPublic: false,
          })
        }
      >
        create
      </button>
    </div>
  ),
}));

const mockCreateLeague = jest.fn();
const mockRefetch = jest.fn();
const mockUseGetUserLeaguesQuery: jest.MockedFunction<
  (opts: { skip?: boolean }) => LeaguesQueryResult
> = jest.fn();
jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: (opts: { skip?: boolean }) =>
    mockUseGetUserLeaguesQuery(opts),
  useCreateLeagueAndTeamsMutation: () => [mockCreateLeague, { loading: false }],
  GetUserLeagues: {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isLoading: false,
    user: { username: 'schmoyer21@gmail.com' },
  });
  mockUseGetUserLeaguesQuery.mockReturnValue({
    data: { userLeagues: [{ id: 1, name: 'Saturday Sluggers' }] },
    loading: false,
    error: undefined,
    refetch: mockRefetch,
  });
  mockCreateLeague.mockResolvedValue({
    data: { createLeagueAndTeams: { league: { id: 123 } } },
  });
});

describe('BaseballScreen (web MLBHome wrapper)', () => {
  it('maps query leagues into MLBHome and strips the email domain from userName', () => {
    render(<BaseballScreen />);
    expect(screen.getByText('leagues:Saturday Sluggers')).toBeInTheDocument();
    expect(screen.getByText('userName:schmoyer21')).toBeInTheDocument();
    expect(screen.getByText('auth:true')).toBeInTheDocument();
  });

  it('passes the loading guard while data is undefined and no error', () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    expect(screen.getByText('loading:true')).toBeInTheDocument();
  });

  it('surfaces the error flag when the query fails', () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('boom'),
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    expect(screen.getByText('error:true')).toBeInTheDocument();
    // Error path is not treated as the loading guard.
    expect(screen.getByText('loading:false')).toBeInTheDocument();
  });

  it('runs the create mutation with the dialog payload and navigates on success', async () => {
    render(<BaseballScreen />);
    fireEvent.click(screen.getByText('create'));
    expect(mockCreateLeague).toHaveBeenCalledWith({
      variables: {
        input: expect.objectContaining({
          leagueName: 'My League',
          numberOfTeams: 8,
          tradingEnabled: true,
          waiverEnabled: true,
        }),
      },
    });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/123'),
    );
  });

  it('wires navigation callbacks', () => {
    render(<BaseballScreen />);
    fireEvent.click(screen.getByText('view'));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/7');
    fireEvent.click(screen.getByText('join'));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/join');
  });
});
