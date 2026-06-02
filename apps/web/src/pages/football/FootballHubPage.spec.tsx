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
import { FootballHubPage } from './FootballHubPage';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';

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
jest.mock('../../api/db/graphql.generated', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetUserLeaguesQuery: jest.fn(),
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

function setLeagues(userLeagues: StubLeague[]) {
  mockUseGetUserLeaguesQuery.mockReturnValue({
    data: { userLeagues },
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
});
