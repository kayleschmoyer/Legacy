import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ── Subject ───────────────────────────────────────────────────────────────────

import LeaguesTab from './leagues';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
}));

const mockUseSafeAreaInsets = jest.fn(() => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

// The ledger itself is covered by its own spec in lib/shared-components; this
// suite verifies the mobile wiring — query usage, navigation, and callbacks.
const mockLedgerScreenProps = jest.fn();
jest.mock('@legacy-sports/shared-components/leagues', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so the module must be pulled in with require(). No ESM alternative; same pattern as the other tab specs.
  const RN = require('react-native') as typeof import('react-native');
  const { View, Text, ActivityIndicator } = RN;
  return {
    LeaguesLedgerScreen: (props: {
      leagues: { leagueId?: number | null; leagueName?: string | null }[];
      loading?: boolean;
      topInset?: number;
      onViewLeague: (s: unknown) => void;
      onCreateLeague: () => void;
      onJoinLeague: () => void;
      onBrowseLeagues: () => void;
    }) => {
      mockLedgerScreenProps(props);
      const {
        leagues,
        loading,
        onViewLeague,
        onCreateLeague,
        onJoinLeague,
        onBrowseLeagues,
      } = props;
      if (loading) return <ActivityIndicator testID="spinner" />;
      return (
        <View testID="leagues-ledger">
          {leagues.length === 0 ? (
            <View testID="leagues-browse-cta" onTouchEnd={onBrowseLeagues} />
          ) : (
            <View testID="leagues-list">
              {leagues.map((league) => (
                <View
                  key={String(league.leagueId)}
                  testID={`league-row-${league.leagueId}`}
                  onTouchEnd={() => onViewLeague(league)}
                >
                  <Text>{league.leagueName}</Text>
                </View>
              ))}
            </View>
          )}
          <View testID="leagues-create-button" onTouchEnd={onCreateLeague} />
          <View testID="leagues-add-button" onTouchEnd={onJoinLeague} />
        </View>
      );
    },
  };
});

const mockUseGetUserLeagueSummariesQuery = jest.fn(() => ({
  data: null,
  loading: false,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeagueSummariesQuery: (...args: unknown[]) =>
    mockUseGetUserLeagueSummariesQuery(...args),
}));

const mockUseAuthorizedUserInfo = jest.fn(() => ({ id: 1, name: 'Test User' }));
jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: (...args: unknown[]) =>
    mockUseAuthorizedUserInfo(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSummaries(
  summaries: Record<string, unknown>[] | null,
  loading = false,
) {
  mockUseGetUserLeagueSummariesQuery.mockReturnValue({
    data: summaries === null ? null : { getUserLeagueSummaries: summaries },
    loading,
  } as ReturnType<typeof mockUseGetUserLeagueSummariesQuery>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeaguesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSummaries(null);
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, name: 'Test User' });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });

  describe('safe-area handling', () => {
    // LS-8758: the header must clear the Android status bar, mirroring the
    // Home tab's `topInset` treatment (LS-8625).
    it('forwards the top safe-area inset to the ledger screen', () => {
      mockUseSafeAreaInsets.mockReturnValue({
        top: 44,
        bottom: 0,
        left: 0,
        right: 0,
      });
      mockSummaries([]);
      render(<LeaguesTab />);
      expect(mockLedgerScreenProps).toHaveBeenCalledWith(
        expect.objectContaining({ topInset: 44 }),
      );
    });
  });

  describe('data source', () => {
    it('reads league summaries with a cache-and-network policy', () => {
      render(<LeaguesTab />);
      expect(mockUseGetUserLeagueSummariesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ fetchPolicy: 'cache-and-network' }),
      );
    });
  });

  describe('loading state', () => {
    it('renders a spinner while leagues are fetching', () => {
      mockSummaries(null, true);
      render(<LeaguesTab />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('keeps rendering cached rows while a background refetch is in flight', () => {
      mockSummaries([{ leagueId: 1, leagueName: 'Cached League' }], true);
      render(<LeaguesTab />);
      expect(screen.queryByTestId('spinner')).toBeNull();
      expect(screen.getByTestId('league-row-1')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('renders the browse CTA when the user has no leagues', () => {
      mockSummaries([]);
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });

    it('also shows the browse CTA when the query returns null data', () => {
      mockSummaries(null);
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });

    it('navigates to league discovery from the browse CTA', () => {
      mockSummaries([]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('leagues-browse-cta'), 'touchEnd');
      expect(mockNavigate).toHaveBeenCalledWith('/league-discovery');
    });
  });

  describe('leagues list', () => {
    it('renders a row for each league when leagues are present', () => {
      mockSummaries([
        { leagueId: 1, leagueName: 'Baseball League', sport: 'baseball' },
        { leagueId: 2, leagueName: 'Football League', sport: 'football' },
      ]);
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-list')).toBeTruthy();
      expect(screen.getByTestId('league-row-1')).toBeTruthy();
      expect(screen.getByTestId('league-row-2')).toBeTruthy();
    });

    it('renders the league name in each row', () => {
      mockSummaries([{ leagueId: 1, leagueName: 'Dynasty Squad' }]);
      render(<LeaguesTab />);
      expect(screen.getByText('Dynasty Squad')).toBeTruthy();
    });
  });

  describe('add actions', () => {
    it('renders the leagues-add-button', () => {
      mockSummaries([]);
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-add-button')).toBeTruthy();
    });

    it('navigates straight to the join-league page when it is pressed', () => {
      mockSummaries([]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('leagues-add-button'), 'touchEnd');
      expect(mockNavigate).toHaveBeenCalledWith('/league/join');
    });

    it('navigates to league creation from the create button', () => {
      mockSummaries([]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('leagues-create-button'), 'touchEnd');
      expect(mockNavigate).toHaveBeenCalledWith('/league/create');
    });
  });

  describe('league row navigation', () => {
    it('pushes to the baseball league-detail route when a baseball row is pressed', () => {
      mockSummaries([
        { leagueId: 7, leagueName: 'My League', sport: 'baseball' },
      ]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('league-row-7'), 'touchEnd');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/baseball/league/[leagueId]',
        params: { leagueId: '7' },
      });
    });

    it('pushes to the football league-detail route when a football row is pressed', () => {
      mockSummaries([
        { leagueId: 9, leagueName: 'My Football League', sport: 'football' },
      ]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('league-row-9'), 'touchEnd');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/football/league/[leagueId]',
        params: { leagueId: '9' },
      });
    });

    it('routes a league with a null sport to the baseball detail route', () => {
      mockSummaries([
        { leagueId: 3, leagueName: 'Mystery League', sport: null },
      ]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('league-row-3'), 'touchEnd');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/baseball/league/[leagueId]',
        params: { leagueId: '3' },
      });
    });

    it('does not navigate when a league has no id', () => {
      mockSummaries([{ leagueId: null, leagueName: 'Broken League' }]);
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('league-row-null'), 'touchEnd');
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('unauthenticated state', () => {
    it('skips the summaries query (UNAUTHENTICATED guard) and shows the empty state', () => {
      // The query has skip: !userInfo?.id — it is skipped for unauthenticated
      // users, preventing an UNAUTHENTICATED GraphQL error.
      mockUseAuthorizedUserInfo.mockReturnValue(
        null as unknown as ReturnType<typeof mockUseAuthorizedUserInfo>,
      );
      mockSummaries(null);
      render(<LeaguesTab />);
      expect(mockUseGetUserLeagueSummariesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });

    it('shows the empty state when userInfo has a null id', () => {
      mockUseAuthorizedUserInfo.mockReturnValue({
        id: null,
        name: null,
      } as unknown as ReturnType<typeof mockUseAuthorizedUserInfo>);
      mockSummaries(null);
      render(<LeaguesTab />);
      expect(mockUseGetUserLeagueSummariesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });
  });
});
