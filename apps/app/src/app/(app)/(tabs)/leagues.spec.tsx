import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Subject ───────────────────────────────────────────────────────────────────

import LeaguesTab from './leagues';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType<{ testID?: string }>;
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronRight: () => null,
  Plus: () => null,
  Trophy: () => null,
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native') as RNComponents;
  const { View, Text: RNText, ActivityIndicator } = RN;
  return {
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID}>{children}</View>,
    XStack: ({
      children,
      testID,
      onPress,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
    }) =>
      onPress != null ? (
        <View testID={testID} onTouchEnd={onPress}>
          {children}
        </View>
      ) : (
        <View testID={testID}>{children}</View>
      ),
    Card: ({
      children,
      testID,
      onPress,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
    }) => (
      <View testID={testID} onTouchEnd={onPress}>
        {children}
      </View>
    ),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <RNText testID={testID}>{children}</RNText>,
    Button: ({
      children,
      testID,
      onPress,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
    }) => (
      <View testID={testID} onTouchEnd={onPress}>
        {children}
      </View>
    ),
    Spinner: ({ testID }: { testID?: string }) => (
      <ActivityIndicator testID={testID ?? 'spinner'} />
    ),
  };
});

const mockUseGetUserLeaguesQuery = jest.fn(() => ({
  data: null,
  loading: false,
}));

jest.mock('../../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: (...args: unknown[]) =>
    mockUseGetUserLeaguesQuery(...args),
}));

const mockUseAuthorizedUserInfo = jest.fn(() => ({ id: 1, name: 'Test User' }));
jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: (...args: unknown[]) =>
    mockUseAuthorizedUserInfo(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeaguesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserLeaguesQuery.mockReturnValue({ data: null, loading: false });
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, name: 'Test User' });
  });

  describe('loading state', () => {
    it('renders a spinner while leagues are fetching', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({ data: null, loading: true });
      render(<LeaguesTab />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('renders the browse CTA when the user has no leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });

    it('also shows browse CTA when query returns null data', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: null },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });
  });

  describe('leagues list', () => {
    it('renders a row for each league when leagues are present', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            { id: 1, name: 'Baseball League', sport: 'baseball' },
            { id: 2, name: 'Football League', sport: 'football' },
          ],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-list')).toBeTruthy();
      expect(screen.getByTestId('league-row-1')).toBeTruthy();
      expect(screen.getByTestId('league-row-2')).toBeTruthy();
    });

    it('shows the baseball badge ⚾ for baseball leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            { id: 1, name: 'My Baseball League', sport: 'baseball' },
          ],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByText('⚾')).toBeTruthy();
    });

    it('shows the football badge 🏈 for football leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            { id: 1, name: 'My Football League', sport: 'football' },
          ],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByText('🏈')).toBeTruthy();
    });

    it('renders league name in each row', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [{ id: 1, name: 'Dynasty Squad', sport: 'baseball' }],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByText('Dynasty Squad')).toBeTruthy();
    });

    it('renders "Unnamed League" for leagues with null name', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [{ id: 1, name: null, sport: 'baseball' }],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByText('Unnamed League')).toBeTruthy();
    });
  });

  describe('add button', () => {
    it('renders the leagues-add-button', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByTestId('leagues-add-button')).toBeTruthy();
    });

    it('opens an alert when the add button is pressed', () => {
      jest.spyOn(Alert, 'alert');
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('leagues-add-button'), 'touchEnd');
      expect(Alert.alert).toHaveBeenCalledWith(
        'Add League',
        '',
        expect.any(Array),
      );
    });
  });

  describe('league row navigation', () => {
    it('pushes to the league context screen when a row is pressed', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [{ id: 7, name: 'My League', sport: 'baseball' }],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      fireEvent(screen.getByTestId('league-row-7'), 'touchEnd');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/league/[leagueId]',
        params: { leagueId: '7' },
      });
    });
  });

  describe('null/undefined sport', () => {
    it('shows the baseball badge ⚾ when sport is null', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [{ id: 1, name: 'Mystery League', sport: null }] },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByText('⚾')).toBeTruthy();
    });

    it('shows the baseball badge ⚾ when sport is undefined', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [{ id: 1, name: 'No-Sport League', sport: undefined }],
        },
        loading: false,
      });
      render(<LeaguesTab />);
      expect(screen.getByText('⚾')).toBeTruthy();
    });
  });

  describe('unauthenticated state', () => {
    it('skips useGetUserLeaguesQuery (UNAUTHENTICATED guard) and shows empty state', () => {
      // useGetUserLeaguesQuery has skip: !userInfo?.id — query is skipped for
      // unauthenticated users, preventing an UNAUTHENTICATED GraphQL error.
      // Verifies the component handles the unauthenticated scenario gracefully.
      mockUseAuthorizedUserInfo.mockReturnValue(null);
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('UNAUTHENTICATED'),
      });
      render(<LeaguesTab />);
      expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });

    it('shows empty state when userInfo has null id (UNAUTHENTICATED guard via id: null)', () => {
      mockUseAuthorizedUserInfo.mockReturnValue({ id: null, name: null });
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<LeaguesTab />);
      expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
      expect(screen.getByTestId('leagues-browse-cta')).toBeTruthy();
    });
  });
});
