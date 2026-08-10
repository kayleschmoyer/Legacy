/**
 * LS-5184 — Football Hub proactive free-tier league-cap gating.
 *
 * Covers:
 *   1. Free user below the cap: "Create League" navigates to the creation form.
 *   2. Free user at the 3-league cap: "Create League" opens the upgrade modal
 *      instead of navigating (proactive gating, not a post-submit backend error).
 *   3. Premium user at/above the cap: "Create League" still navigates.
 *   4. Gating is suppressed while premium status is still resolving.
 *   5. The cap counts leagues across all sports (not just football).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  useGetLeagueTeamsQuery,
  useGetMatchupByIdQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { FootballHubPage } from './FootballHubPage';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';

// ---------------------------------------------------------------------------
// Module mocks (factories must not reference outer scope — configured per-test)
// ---------------------------------------------------------------------------

jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('@legacy-sports/shared-components/football', () => ({
  NFLHome: jest.fn(),
}));
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../components/UpgradeModal', () => ({ UpgradeModal: jest.fn() }));
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: jest.fn(),
}));
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  MatchupStatus: {
    Cancelled: 'cancelled',
    Completed: 'completed',
    InProgress: 'in_progress',
    Scheduled: 'scheduled',
  },
  useGetUserLeaguesQuery: jest.fn(),
  useGetMatchupByIdQuery: jest.fn(),
  useGetLeagueTeamsQuery: jest.fn(),
}));

const mockNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockNFLHome = NFLHome as jest.MockedFunction<typeof NFLHome>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUpgradeModal = UpgradeModal as jest.MockedFunction<
  typeof UpgradeModal
>;
const mockUseIsPremiumStatus = useIsPremiumStatus as jest.MockedFunction<
  typeof useIsPremiumStatus
>;
const mockUseGetUserLeaguesQuery =
  useGetUserLeaguesQuery as jest.MockedFunction<typeof useGetUserLeaguesQuery>;
const mockUseGetMatchupByIdQuery =
  useGetMatchupByIdQuery as jest.MockedFunction<typeof useGetMatchupByIdQuery>;
const mockUseGetLeagueTeamsQuery =
  useGetLeagueTeamsQuery as jest.MockedFunction<typeof useGetLeagueTeamsQuery>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StubLeague {
  id: number;
  name: string;
  sport: string;
  draftStatus: string;
  currentWeekNumber: number;
  weekAdvanceStatus: string | null;
  currentMatchup?: number | null;
}

function leaguesOfCount(n: number, sport = 'football'): StubLeague[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `League ${i + 1}`,
    sport,
    draftStatus: 'completed',
    currentWeekNumber: 1,
    weekAdvanceStatus: null,
  }));
}

// `userLeagueCount` defaults to the array length so existing callers of this
// helper (which pass fewer leagues than the page size) keep working
// unchanged; tests exercising pagination pass an explicit `userLeagueCount`
// that diverges from `userLeagues.length` (LS-9101).
function setLeagues(userLeagues: StubLeague[], userLeagueCount?: number) {
  mockUseGetUserLeaguesQuery.mockReturnValue({
    data: {
      userLeagues,
      userLeagueCount: userLeagueCount ?? userLeagues.length,
    },
    loading: false,
    error: undefined,
  } as ReturnType<typeof useGetUserLeaguesQuery>);
}

const navigateSpy = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReturnValue(navigateSpy);
  mockNFLHome.mockImplementation(
    ({ onCreateLeague }: React.ComponentProps<typeof NFLHome>) => (
      <button data-testid="create-league-button" onClick={onCreateLeague}>
        Create League
      </button>
    ),
  );
  mockUpgradeModal.mockImplementation(
    ({ open, featureName }: React.ComponentProps<typeof UpgradeModal>) =>
      open ? <div data-testid="upgrade-modal">{featureName}</div> : null,
  );
  mockUseAuth.mockReturnValue({ user: { id: 1 } } as ReturnType<
    typeof useAuth
  >);
  mockUseIsPremiumStatus.mockReturnValue({
    isPremium: false,
    isLoading: false,
  });
  mockUseGetMatchupByIdQuery.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
  } as ReturnType<typeof useGetMatchupByIdQuery>);
  mockUseGetLeagueTeamsQuery.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
  } as ReturnType<typeof useGetLeagueTeamsQuery>);
  setLeagues([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FootballHubPage — free-tier league cap gating (LS-5184)', () => {
  it('navigates to the create form when a free user is below the cap', () => {
    setLeagues(leaguesOfCount(2));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).toHaveBeenCalledWith('/football/league/create');
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('opens the upgrade modal (no navigation) when a free user is at the cap', () => {
    setLeagues(leaguesOfCount(3));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });

  it('lets premium users at/above the cap navigate to the create form', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    setLeagues(leaguesOfCount(5));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).toHaveBeenCalledWith('/football/league/create');
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('does not gate while premium status is still resolving', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: true,
    });
    setLeagues(leaguesOfCount(4));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).toHaveBeenCalledWith('/football/league/create');
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('counts leagues across all sports toward the cap', () => {
    // 2 baseball + 1 football = 3 total → at cap even though only 1 is football.
    setLeagues([...leaguesOfCount(2, 'baseball'), ...leaguesOfCount(1)]);

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });

  it('still gates a power user whose league count exceeds the userLeagues page size (LS-9101)', () => {
    // userLeagues is server-paginated at 50 (see userLeagues resolver); a user
    // with 60 leagues gets back an array of only 50, but userLeagueCount — the
    // authoritative, unpaginated total — is 60. The cap must be derived from
    // that total, not from the truncated array's length (which is 50, itself
    // >= the cap, but would mask the bug if the gate ever regressed to reading
    // array length directly since 50 also happens to be >= 3).
    setLeagues(leaguesOfCount(50), 60);

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });
});

describe('FootballHubPage — null-sport league handling (FBH-001)', () => {
  it('includes null-sport (legacy/un-migrated) leagues alongside football leagues', () => {
    setLeagues([
      ...leaguesOfCount(1, 'football'),
      ...leaguesOfCount(1, 'baseball'),
      { ...leaguesOfCount(1)[0], id: 99, name: 'Legacy League', sport: null },
    ] as unknown as StubLeague[]);

    render(<FootballHubPage />);

    const leaguesProp = mockNFLHome.mock.calls[0][0].leagues as Array<{
      id: string | number;
      name: string;
    }>;
    expect(leaguesProp.map((l) => l.name)).toEqual([
      'League 1',
      'Legacy League',
    ]);
  });
});

describe('FootballHubPage — matchup highlight wiring (LS-5407)', () => {
  it('passes a matchupHighlight with both team names and the week when the league has a scheduled matchup', () => {
    setLeagues([{ ...leaguesOfCount(1)[0], id: 1, currentMatchup: 10 }]);
    mockUseGetMatchupByIdQuery.mockReturnValue({
      data: {
        getMatchupById: {
          id: 10,
          leagueId: 1,
          weekNumber: 3,
          team1Id: 1,
          team2Id: 2,
          status: 'scheduled',
        },
      },
      loading: false,
      error: undefined,
    } as ReturnType<typeof useGetMatchupByIdQuery>);
    mockUseGetLeagueTeamsQuery.mockReturnValue({
      data: {
        leagueTeams: [
          { id: 1, name: 'Alpha Offense' },
          { id: 2, name: 'Beta Defense' },
        ],
      },
      loading: false,
      error: undefined,
    } as ReturnType<typeof useGetLeagueTeamsQuery>);

    render(<FootballHubPage />);

    const highlight = mockNFLHome.mock.calls[0][0].matchupHighlight;
    expect(highlight).toMatchObject({
      weekNumber: 3,
      awayTeamName: 'Beta Defense',
      homeTeamName: 'Alpha Offense',
      status: 'pre',
    });
  });

  it('passes null matchupHighlight when no league has a current matchup', () => {
    setLeagues([{ ...leaguesOfCount(1)[0], id: 1, currentMatchup: null }]);

    render(<FootballHubPage />);

    const highlight = mockNFLHome.mock.calls[0][0].matchupHighlight;
    expect(highlight).toBeNull();
  });
});
