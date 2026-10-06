import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import JoinLeagueRoute from './join';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    dismissTo: mockDismissTo,
    navigate: mockNavigate,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

interface BrowseQueryOptions {
  variables?: Record<string, unknown>;
  skip?: boolean;
}

const mockJoinByCode = jest.fn();
const mockValidateCode = jest.fn();
const mockJoinPublic = jest.fn();
let mockPublicLeagues: unknown[] = [];
let mockPublicLeaguesCount = 0;
let browseQueryOptions: BrowseQueryOptions | null = null;

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useJoinLeagueByCodeMutation: () => [mockJoinByCode, { loading: false }],
  useValidateInviteCodeLazyQuery: () => [mockValidateCode, { loading: false }],
  useJoinPublicLeagueMutation: () => [mockJoinPublic, { loading: false }],
  useGetPublicLeaguesQuery: (options: BrowseQueryOptions) => {
    browseQueryOptions = options;
    return {
      data: { publicLeagues: mockPublicLeagues },
      loading: false,
      refetch: jest.fn(),
    };
  },
  useGetPublicLeaguesCountQuery: () => ({
    data: { publicLeaguesCount: mockPublicLeaguesCount },
    refetch: jest.fn(),
  }),
}));

// The shared screen is exercised directly by its own spec in
// lib/shared-components; here we assert only the wrapper's contract with it —
// which props the route derives from the URL and the navigation callbacks.
type ScreenProps = Record<string, unknown>;

let capturedProps: ScreenProps | null = null;

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  JoinLeagueScreen: (props: ScreenProps) => {
    capturedProps = props;
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="join-screen">join-screen</Text>;
  },
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

function lastProps(): ScreenProps {
  if (!capturedProps) throw new Error('JoinLeagueScreen was never rendered');
  return capturedProps;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JoinLeagueRoute (two-tab Invite or Browse — LS-8812)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockPublicLeagues = [];
    mockPublicLeaguesCount = 0;
    capturedProps = null;
    browseQueryOptions = null;
  });

  it('renders the shared Join screen', () => {
    render(<JoinLeagueRoute />);
    expect(screen.getByTestId('join-screen')).toBeTruthy();
  });

  describe('sport derived from the entry route (AC2)', () => {
    it('defaults to baseball when no sport param is present', () => {
      render(<JoinLeagueRoute />);
      expect(lastProps().sport).toBe('baseball');
    });

    it('uses football when the football wrapper passes it through', () => {
      mockParams = { sport: 'football' };
      render(<JoinLeagueRoute />);
      expect(lastProps().sport).toBe('football');
    });

    it('falls back to baseball for an unrecognized sport', () => {
      mockParams = { sport: 'cricket' };
      render(<JoinLeagueRoute />);
      expect(lastProps().sport).toBe('baseball');
    });
  });

  describe('deep link (AC3)', () => {
    it('forwards the invite code so the invite tab pre-fills it', () => {
      mockParams = { sport: 'baseball', inviteCode: 'ABC12XYZ' };
      render(<JoinLeagueRoute />);
      expect(lastProps().initialInviteCode).toBe('ABC12XYZ');
      expect(lastProps().initialTab).toBe('invite');
    });

    it('opens the browse tab when ?tab=browse is passed', () => {
      mockParams = { tab: 'browse' };
      render(<JoinLeagueRoute />);
      expect(lastProps().initialTab).toBe('browse');
    });
  });

  describe('invite code validation wiring (AC5)', () => {
    it('resolves the league behind a code via useValidateInviteCodeLazyQuery', async () => {
      mockValidateCode.mockResolvedValue({
        data: { validateInviteCode: { leagueId: 7, leagueName: 'Legacy' } },
      });

      render(<JoinLeagueRoute />);
      const validate = lastProps().validateInviteCode as (
        code: string,
      ) => Promise<unknown>;

      await expect(validate('ABC12XYZ')).resolves.toEqual({
        leagueId: 7,
        leagueName: 'Legacy',
      });
      expect(mockValidateCode).toHaveBeenCalledWith({
        variables: { code: 'ABC12XYZ' },
      });
    });

    it('resolves null for an unknown code', async () => {
      mockValidateCode.mockResolvedValue({
        data: { validateInviteCode: null },
      });

      render(<JoinLeagueRoute />);
      const validate = lastProps().validateInviteCode as (
        code: string,
      ) => Promise<unknown>;

      await expect(validate('NOPENOPE')).resolves.toBeNull();
    });
  });

  describe('join by code (AC5)', () => {
    it('navigates to the entry sport league on success', async () => {
      mockParams = { sport: 'football' };
      mockJoinByCode.mockResolvedValue({
        data: { joinLeagueByCode: { leagueId: 77 } },
      });

      render(<JoinLeagueRoute />);
      const join = lastProps().onJoinByCode as (
        code: string,
        team: string,
      ) => void;
      join('ABC12XYZ', 'My Team');

      expect(mockJoinByCode).toHaveBeenCalledWith({
        variables: { inviteCode: 'ABC12XYZ', teamName: 'My Team' },
      });
      await waitFor(() =>
        expect(mockDismissTo).toHaveBeenCalledWith(
          '/(tabs)/(leagues)/football/league/77',
        ),
      );
    });
  });

  describe('browse tab (AC8)', () => {
    it('skips the browse query until the tab is opened', () => {
      render(<JoinLeagueRoute />);
      expect(browseQueryOptions?.skip).toBe(true);
    });

    it('runs the browse query immediately when entered on the browse tab', () => {
      mockParams = { tab: 'browse' };
      render(<JoinLeagueRoute />);
      expect(browseQueryOptions?.skip).toBe(false);
    });

    it('scopes the browse query to the entry sport', () => {
      mockParams = { sport: 'football', tab: 'browse' };
      render(<JoinLeagueRoute />);
      expect(browseQueryOptions?.variables?.sport).toBe('football');
    });

    it('passes the server-side total count through for the results header', () => {
      mockParams = { tab: 'browse' };
      mockPublicLeaguesCount = 12;
      render(<JoinLeagueRoute />);
      expect(lastProps().browseTotalCount).toBe(12);
    });

    it('routes a public join by the joined league sport, not hard-coded baseball', async () => {
      mockParams = { tab: 'browse' };
      mockJoinPublic.mockResolvedValue({
        data: { joinPublicLeague: { success: true, leagueId: 42 } },
      });

      render(<JoinLeagueRoute />);
      const joinPublic = lastProps().onJoinPublic as (
        league: Record<string, unknown>,
        team: string,
      ) => void;
      joinPublic({ id: 42, sport: 'football' }, 'My Team');

      await waitFor(() =>
        expect(mockDismissTo).toHaveBeenCalledWith(
          '/(tabs)/(leagues)/football/league/42',
        ),
      );
    });

    it('surfaces a failed public join inline rather than via an alert', async () => {
      mockParams = { tab: 'browse' };
      mockJoinPublic.mockResolvedValue({
        data: {
          joinPublicLeague: { success: false, message: 'League is full' },
        },
      });

      render(<JoinLeagueRoute />);
      const joinPublic = lastProps().onJoinPublic as (
        league: Record<string, unknown>,
        team: string,
      ) => void;
      joinPublic({ id: 42, sport: 'baseball' }, 'My Team');

      await waitFor(() =>
        expect(lastProps().browseJoinError).toBe('League is full'),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('closes back to the previous screen', () => {
    render(<JoinLeagueRoute />);
    (lastProps().onClose as () => void)();
    expect(mockBack).toHaveBeenCalled();
  });
});
