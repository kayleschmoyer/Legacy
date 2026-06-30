import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type MLBHomeLeagueCap } from '@legacy-sports/shared-components/baseball';
import { BaseballScreen } from './BaseballScreen';

interface HarnessLeague {
  id?: number | null;
  name?: string | null;
  sport?: string | null;
}
interface MLBHomeHarnessProps {
  userName?: string;
  loading?: boolean;
  error?: boolean;
  isAuthenticated?: boolean;
  leagues: HarnessLeague[];
  leagueCap?: MLBHomeLeagueCap;
  onViewLeague: (id: number) => void;
  onJoinLeague: () => void;
  onCreateLeague: (input: Record<string, unknown>) => Promise<void>;
}
interface LeaguesQueryResult {
  data?: { myLeagues: HarnessLeague[] };
  loading: boolean;
  error?: Error;
  refetch: () => void;
}

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../UpgradeModal', () => ({
  UpgradeModal: ({
    open,
    featureName,
  }: {
    open: boolean;
    featureName?: string;
  }) => (open ? <div data-testid="upgrade-modal">{featureName}</div> : null),
}));

const mockUseAuth = jest.fn(() => ({
  isLoading: false,
  user: { username: 'schmoyer21@gmail.com' },
}));
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

interface MLBHomeHarnessPropsExtended extends MLBHomeHarnessProps {
  onMockDraft?: () => void;
  onMockDraftUpgrade?: () => void;
  onSwitchSport?: (sport: string) => void;
}

// Capture the props the wrapper feeds into the shared component and expose
// buttons that fire its callbacks so we can assert the data wiring.
jest.mock('@legacy-sports/shared-components/baseball', () => ({
  MLBHome: (props: MLBHomeHarnessPropsExtended) => (
    <div data-testid="mlb-home">
      <span>userName:{props.userName}</span>
      <span>loading:{String(props.loading)}</span>
      <span>error:{String(props.error)}</span>
      <span>auth:{String(props.isAuthenticated)}</span>
      <span>leagues:{props.leagues.map((l) => l.name).join(',')}</span>
      <span data-testid="at-limit">{String(!!props.leagueCap?.atLimit)}</span>
      <span data-testid="has-switch-sport">
        {String(!!props.onSwitchSport)}
      </span>
      <button onClick={() => props.onViewLeague(7)}>view</button>
      <button onClick={() => props.onJoinLeague()}>join</button>
      {props.onMockDraft ? (
        <button onClick={() => props.onMockDraft?.()}>mock-draft</button>
      ) : null}
      {props.onMockDraftUpgrade ? (
        <button onClick={() => props.onMockDraftUpgrade?.()}>
          mock-draft-upgrade
        </button>
      ) : null}
      {props.onSwitchSport ? (
        <button onClick={() => props.onSwitchSport?.('football')}>
          switch-sport
        </button>
      ) : null}
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
      {props.leagueCap ? (
        <button onClick={() => props.leagueCap?.onUpgrade()}>upgrade</button>
      ) : null}
    </div>
  ),
}));

const mockCreateLeague = jest.fn();
const mockRefetch = jest.fn();
const mockUseGetMyLeaguesQuery: jest.MockedFunction<
  (opts: {
    variables?: { sport?: string };
    skip?: boolean;
  }) => LeaguesQueryResult
> = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetMyLeaguesQuery: (opts: {
    variables?: { sport?: string };
    skip?: boolean;
  }) => mockUseGetMyLeaguesQuery(opts),
  useCreateLeagueAndTeamsMutation: () => [mockCreateLeague, { loading: false }],
  useGetStripePricesQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
  GetMyLeagues: {},
  Sport: { Baseball: 'baseball', Football: 'football' },
}));

const mockUseIsPremiumStatus = jest.fn(() => ({
  isPremium: false,
  isLoading: false,
}));
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: () => mockUseIsPremiumStatus(),
}));

const mockUseFeatureIsOn = jest.fn(() => false);
jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureIsOn: (flag: string) => mockUseFeatureIsOn(flag),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isLoading: false,
    user: { username: 'schmoyer21@gmail.com' },
  });
  mockUseGetMyLeaguesQuery.mockReturnValue({
    data: {
      myLeagues: [{ id: 1, name: 'Saturday Sluggers', sport: 'baseball' }],
    },
    loading: false,
    error: undefined,
    refetch: mockRefetch,
  });
  mockCreateLeague.mockResolvedValue({
    data: { createLeagueAndTeams: { league: { id: 123 } } },
  });
  mockUseIsPremiumStatus.mockReturnValue({
    isPremium: false,
    isLoading: false,
  });
  mockUseFeatureIsOn.mockReturnValue(false);
});

describe('BaseballScreen (web MLBHome wrapper)', () => {
  it('maps query leagues into MLBHome and strips the email domain from userName', () => {
    render(<BaseballScreen />);
    expect(screen.getByText('leagues:Saturday Sluggers')).toBeInTheDocument();
    expect(screen.getByText('userName:schmoyer21')).toBeInTheDocument();
    expect(screen.getByText('auth:true')).toBeInTheDocument();
  });

  it('passes the loading guard while data is undefined and no error', () => {
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    expect(screen.getByText('loading:true')).toBeInTheDocument();
  });

  it('surfaces the error flag when the query fails', () => {
    mockUseGetMyLeaguesQuery.mockReturnValue({
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

  it('wires onMockDraft to navigate to /baseball/mock-draft', () => {
    render(<BaseballScreen />);
    fireEvent.click(screen.getByText('mock-draft'));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/mock-draft');
  });

  it('wires onMockDraftUpgrade to open the mock-draft UpgradeModal', async () => {
    render(<BaseballScreen />);
    fireEvent.click(screen.getByText('mock-draft-upgrade'));
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('upgrade-modal').textContent).toContain(
      'Unlimited mock drafts',
    );
  });

  it('omits onSwitchSport when football_enabled flag is off (LS-5815)', () => {
    mockUseFeatureIsOn.mockReturnValue(false);
    render(<BaseballScreen />);
    expect(screen.getByTestId('has-switch-sport').textContent).toBe('false');
  });

  it('passes onSwitchSport and navigates when football_enabled flag is on (LS-5815)', () => {
    mockUseFeatureIsOn.mockReturnValue(true);
    render(<BaseballScreen />);
    expect(screen.getByTestId('has-switch-sport').textContent).toBe('true');
    fireEvent.click(screen.getByText('switch-sport'));
    expect(mockNavigate).toHaveBeenCalledWith('/football');
  });
});

// LS-5806: leagueCap gating is mobile-only on web; BaseballScreen does not
// pass the leagueCap prop to MLBHome so atLimit is always false on web.
describe('BaseballScreen — free-tier league cap gating (LS-5804/LS-5806)', () => {
  function leaguesOfCount(n: number) {
    return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `L${i}` }));
  }

  it('does not set atLimit when user is below the cap', () => {
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: { myLeagues: leaguesOfCount(2) },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    expect(screen.getByTestId('at-limit').textContent).toBe('false');
  });

  it('never sets atLimit on web (web does not hard-gate creation) but upgrade CTA navigates to /pricing', () => {
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: { myLeagues: leaguesOfCount(3) },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    // Web always passes atLimit: false so the create button stays enabled (LS-5869).
    expect(screen.getByTestId('at-limit').textContent).toBe('false');
    // The upgrade CTA is still present and navigates to /pricing.
    fireEvent.click(screen.getByText('upgrade'));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('does not set atLimit for a premium user at/above the cap', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: { myLeagues: leaguesOfCount(5) },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    expect(screen.getByTestId('at-limit').textContent).toBe('false');
  });

  it('does not gate while premium status is still resolving', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: true,
    });
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: { myLeagues: leaguesOfCount(4) },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    expect(screen.getByTestId('at-limit').textContent).toBe('false');
  });

  it('counts baseball leagues from myLeagues toward the cap count display (LS-5795)', () => {
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: {
        myLeagues: [
          { id: 1, name: 'Baseball A' },
          { id: 2, name: 'Baseball B' },
          { id: 3, name: 'Baseball C' },
        ],
      },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
    render(<BaseballScreen />);
    // atLimit is always false on web even when the baseball count hits the cap.
    expect(screen.getByTestId('at-limit').textContent).toBe('false');
    // The upgrade CTA appears once the cap is reached.
    expect(screen.getByText('upgrade')).toBeInTheDocument();
  });
});
