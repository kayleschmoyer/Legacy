/**
 * LS-10716 regression: the onboarding tutorial must only auto-open for a
 * confirmed new user — a successful, empty league-summaries response. A failed
 * query (offline, flaky network) leaves the summaries empty too, and used to
 * be read as "no leagues", opening the tutorial over the dashboard error state
 * for an existing user.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';

interface SummariesResult {
  data?: { getUserLeagueSummaries: unknown[] | null };
  loading: boolean;
  error?: Error;
}

const mockUseSummaries = jest.fn<SummariesResult, []>();
type PrefsResult = {
  data?: { getUserPreferences: { onboardingCompletedAt: string | null } };
  loading: boolean;
  error?: Error;
};
const mockUsePrefs = jest.fn<PrefsResult, []>();
const mockUpdatePrefs = jest.fn(() => Promise.resolve({}));
const mockHomeScreen = jest.fn<null, [{ error: boolean; loading: boolean }]>();

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  hasStoredSession: () => true,
  useAuth: () => ({ user: { id: 42, username: 'qa' }, isLoading: false }),
}));

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  computePrimarySport: () => 'baseball',
  mergeLeagueStandings: (summaries: unknown[]) => summaries,
  OnThisDayFeed: () => null,
}));

jest.mock('@legacy-sports/shared-components/sports', () => ({
  HomeScreen: (props: { error: boolean; loading: boolean }) =>
    mockHomeScreen(props),
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  OnboardingTutorial: () => <div data-testid="onboarding-tutorial" />,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeagueSummariesQuery: () => ({
    ...mockUseSummaries(),
    refetch: jest.fn(),
  }),
  useGetUserLeagueStandingsQuery: () => ({ data: undefined }),
  useGetArchivedUserLeagueSummariesLazyQuery: () => [
    jest.fn(),
    { data: undefined, loading: false },
  ],
  useGetArchivedUserLeagueSummariesQuery: () => ({ data: undefined }),
  useGetMyMockDraftUsageQuery: () => ({ data: undefined }),
  useGetUserPreferencesQuery: () => mockUsePrefs(),
  useUpdateUserPreferencesMutation: () => [mockUpdatePrefs],
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../utils/onboardingTutorialWeb', () => ({
  onboardingTutorialAnalytics: {},
  renderOnboardingLink: () => null,
}));

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'dark' }),
}));

jest.mock('../../hooks/useIsPremium', () => ({ useIsPremium: () => false }));

describe('HomePage onboarding gate (LS-10716)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseSummaries.mockReset();
    mockHomeScreen.mockReset();
    mockUsePrefs.mockReset();
    mockUsePrefs.mockReturnValue({
      data: { getUserPreferences: { onboardingCompletedAt: null } },
      loading: false,
    });
    mockUpdatePrefs.mockClear();
    mockHomeScreen.mockReturnValue(null);
  });

  it('does not open the tutorial when the leagues query fails', () => {
    mockUseSummaries.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('Network error'),
    });

    render(<HomePage />);

    expect(screen.queryByTestId('onboarding-tutorial')).not.toBeInTheDocument();
    expect(mockHomeScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: true }),
    );
  });

  it('does not open the tutorial when the query fails behind cached empty data', () => {
    mockUseSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
      error: new Error('Network error'),
    });

    render(<HomePage />);

    expect(screen.queryByTestId('onboarding-tutorial')).not.toBeInTheDocument();
  });

  it('does not open the tutorial while the leagues query is loading', () => {
    mockUseSummaries.mockReturnValue({ data: undefined, loading: true });

    render(<HomePage />);

    expect(screen.queryByTestId('onboarding-tutorial')).not.toBeInTheDocument();
  });

  it('opens the tutorial for a new user with a successful empty response', () => {
    mockUseSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
    });

    render(<HomePage />);

    expect(screen.getByTestId('onboarding-tutorial')).toBeInTheDocument();
  });

  it('does not open the tutorial for a user who has leagues', () => {
    mockUseSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [{ leagueId: 1, sport: 'baseball' }] },
      loading: false,
    });

    render(<HomePage />);

    expect(screen.queryByTestId('onboarding-tutorial')).not.toBeInTheDocument();
  });

  it('does not open the tutorial when localStorage access throws', () => {
    mockUseSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
    });
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });

    try {
      render(<HomePage />);
    } finally {
      getItem.mockRestore();
    }

    expect(screen.queryByTestId('onboarding-tutorial')).not.toBeInTheDocument();
  });

  // LS-10723: the reconnect refetch (apollo-client.ts) re-runs the failed
  // summaries query; the page must drop the error card for the leagues
  // without the user pressing Retry, and the recovery must not be read as a
  // new user (LS-10716).
  it('clears the error state when the leagues query recovers after reconnect', () => {
    mockUseSummaries.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('Network error'),
    });
    const { rerender } = render(<HomePage />);
    expect(mockHomeScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: true }),
    );

    mockUseSummaries.mockReturnValue({ data: undefined, loading: true });
    rerender(<HomePage />);
    expect(mockHomeScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: false, loading: true }),
    );

    const leagues = [{ leagueId: 1, sport: 'baseball' }];
    mockUseSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: leagues },
      loading: false,
    });
    rerender(<HomePage />);
    expect(mockHomeScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: false, loading: false, leagues }),
    );
    expect(screen.queryByTestId('onboarding-tutorial')).not.toBeInTheDocument();
  });

  describe('server-side completion flag (LS-6890)', () => {
    const newUser = {
      data: { getUserLeagueSummaries: [] },
      loading: false,
    };

    it('does not open the tutorial when the server says it was completed', () => {
      mockUseSummaries.mockReturnValue(newUser);
      mockUsePrefs.mockReturnValue({
        data: {
          getUserPreferences: { onboardingCompletedAt: '2026-01-01T00:00:00Z' },
        },
        loading: false,
      });

      render(<HomePage />);

      expect(
        screen.queryByTestId('onboarding-tutorial'),
      ).not.toBeInTheDocument();
    });

    it('waits for the preferences query before deciding', () => {
      mockUseSummaries.mockReturnValue(newUser);
      mockUsePrefs.mockReturnValue({ data: undefined, loading: true });

      render(<HomePage />);

      expect(
        screen.queryByTestId('onboarding-tutorial'),
      ).not.toBeInTheDocument();
    });

    it('falls back to localStorage when the preferences query fails', () => {
      mockUseSummaries.mockReturnValue(newUser);
      mockUsePrefs.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('offline'),
      });

      render(<HomePage />);

      expect(screen.getByTestId('onboarding-tutorial')).toBeInTheDocument();
    });

    it('backfills the server when only localStorage has the flag', () => {
      mockUseSummaries.mockReturnValue(newUser);
      window.localStorage.setItem('ls_onboarding_complete', 'true');

      render(<HomePage />);

      expect(
        screen.queryByTestId('onboarding-tutorial'),
      ).not.toBeInTheDocument();
      expect(mockUpdatePrefs).toHaveBeenCalledWith({
        variables: { input: { markOnboardingComplete: true } },
      });
    });
  });
});
