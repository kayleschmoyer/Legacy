import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import MatchupDetailScreen from './MatchupDetailScreen';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Configurable mock state ──────────────────────────────────────────────────

let mockMatchup: Record<string, unknown> | null = null;
let mockMatchupLoading = false;
let mockMatchupError: { message: string } | null = null;
let mockIsPremium = true;
let mockUserTeamId: number | null = null;
let mockParams: Record<string, string> = { matchupId: '1', leagueId: '10' };

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ navigate: jest.fn() }),
}));

jest.mock('../hooks/useMatchup', () => ({
  useMatchupById: () => ({
    matchup: mockMatchup,
    loading: mockMatchupLoading,
    error: mockMatchupError,
  }),
  useCurrentWeek: () => ({ currentWeek: null }),
  useMatchupsForLeague: () => ({ matchups: [] }),
}));

jest.mock('../../../api/db/graphql.generated', () => ({
  MatchupStatus: {
    Completed: 'completed',
    InProgress: 'in_progress',
    Scheduled: 'scheduled',
  },
  useGetUserTeamIdQuery: () => ({
    data: { userTeamId: mockUserTeamId },
  }),
}));

jest.mock('../../subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: mockIsPremium }),
}));

// Pass-through gate: render children for premium users, otherwise an upgrade
// marker so tests can assert the locked state without the real overlay.
jest.mock('../../subscription/PremiumGate', () => ({
  PremiumGate: ({
    isPremium,
    children,
  }: {
    isPremium: boolean;
    children: React.ReactNode;
  }) => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return isPremium
      ? (children as React.JSX.Element)
      : ReactActual.createElement(Text, null, 'UPGRADE_TO_PREMIUM');
  },
}));

// Render panel slots directly so PremiumGate assertions work end-to-end.
jest.mock('@legacy-sports/shared-components/matchup', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupDetailLayout: ({
      winProbabilityPanel,
      recapPanel,
    }: {
      winProbabilityPanel?: React.ReactNode;
      recapPanel?: React.ReactNode;
      [key: string]: unknown;
    }) =>
      jest
        .requireActual<typeof import('react')>('react')
        .createElement(
          View,
          { testID: 'matchup-detail-layout' },
          winProbabilityPanel,
          recapPanel,
        ),
    MatchupRecapPanel: () =>
      jest
        .requireActual<typeof import('react')>('react')
        .createElement(View, { testID: 'recap-panel' }),
  };
});

jest.mock('@legacy-sports/shared-components', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupRosterComparison: () =>
      jest
        .requireActual<typeof import('react')>('react')
        .createElement(View, { testID: 'roster-comparison' }),
  };
});

jest.mock('../components/MatchupWinProbabilityPanel', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupWinProbabilityPanel: () =>
      jest
        .requireActual<typeof import('react')>('react')
        .createElement(View, { testID: 'win-probability-panel' }),
  };
});

jest.mock('../components/MatchupScoreboard', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupScoreboard: () =>
      jest
        .requireActual<typeof import('react')>('react')
        .createElement(View, { testID: 'scoreboard' }),
  };
});

jest.mock('../components/MatchupRosterEditor', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupRosterEditor: () =>
      jest
        .requireActual<typeof import('react')>('react')
        .createElement(View, { testID: 'roster-editor' }),
  };
});

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  const passthrough =
    (Component: React.ComponentType) =>
    ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement(
        Component as React.ComponentType<{ children?: React.ReactNode }>,
        null,
        children,
      );
  return {
    YStack: passthrough(View),
    Text: passthrough(Text),
    Spinner: () => React.createElement(View, { testID: 'spinner' }),
    ScrollView: passthrough(View),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

const ACTIVE_MATCHUP = {
  id: 1,
  team1Id: 5,
  team2Id: 6,
  status: 'in_progress',
  gamesPerMatchup: 5,
  selectedGamesCount: 2,
  statsLoadingStatus: null,
};

const COMPLETED_MATCHUP = {
  ...ACTIVE_MATCHUP,
  status: 'completed',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMatchup = null;
  mockMatchupLoading = false;
  mockMatchupError = null;
  mockIsPremium = true;
  mockUserTeamId = null;
  mockParams = { matchupId: '1', leagueId: '10' };
});

describe('MatchupDetailScreen', () => {
  it('shows a loading spinner while the matchup is fetching', () => {
    mockMatchupLoading = true;
    render(<MatchupDetailScreen />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows an error message when the matchup fetch fails', () => {
    mockMatchupError = { message: 'Network error' };
    render(<MatchupDetailScreen />);
    expect(screen.getByText('Error loading matchup')).toBeTruthy();
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('shows a not-found message when no matchup is returned', () => {
    render(<MatchupDetailScreen />);
    expect(screen.getByText('Matchup not found')).toBeTruthy();
  });

  it('shows an invalid-league message when leagueId param is missing', () => {
    mockParams = { matchupId: '1' };
    mockMatchup = ACTIVE_MATCHUP;
    render(<MatchupDetailScreen />);
    expect(screen.getByText('Invalid league')).toBeTruthy();
  });

  it('renders the layout when matchup and leagueId are present', () => {
    mockMatchup = ACTIVE_MATCHUP;
    render(<MatchupDetailScreen />);
    expect(screen.getByTestId('matchup-detail-layout')).toBeTruthy();
  });
});

// ── PremiumGate wiring (LS-5021) ─────────────────────────────────────────────
// Verify that win-probability and recap panels are correctly gated.

describe('MatchupDetailScreen — PremiumGate wiring (LS-5021)', () => {
  it('shows the win probability panel for premium users', () => {
    mockMatchup = ACTIVE_MATCHUP;
    mockIsPremium = true;
    render(<MatchupDetailScreen />);
    expect(screen.getByTestId('win-probability-panel')).toBeTruthy();
    expect(screen.queryByText('UPGRADE_TO_PREMIUM')).toBeNull();
  });

  it('gates the win probability panel behind the upgrade prompt for free users', () => {
    mockMatchup = ACTIVE_MATCHUP;
    mockIsPremium = false;
    render(<MatchupDetailScreen />);
    expect(screen.getByText('UPGRADE_TO_PREMIUM')).toBeTruthy();
    expect(screen.queryByTestId('win-probability-panel')).toBeNull();
  });

  it('shows the recap panel for premium users when the matchup is completed', () => {
    mockMatchup = COMPLETED_MATCHUP;
    mockIsPremium = true;
    render(<MatchupDetailScreen />);
    expect(screen.getByTestId('recap-panel')).toBeTruthy();
  });

  it('gates the recap panel behind the upgrade prompt for free users when the matchup is completed', () => {
    mockMatchup = COMPLETED_MATCHUP;
    mockIsPremium = false;
    render(<MatchupDetailScreen />);
    // UPGRADE_TO_PREMIUM appears twice: once for win-probability, once for recap
    const upgrades = screen.getAllByText('UPGRADE_TO_PREMIUM');
    expect(upgrades.length).toBe(2);
    expect(screen.queryByTestId('recap-panel')).toBeNull();
  });

  it('omits the recap panel entirely when the matchup is not yet completed', () => {
    mockMatchup = ACTIVE_MATCHUP;
    mockIsPremium = true;
    render(<MatchupDetailScreen />);
    expect(screen.queryByTestId('recap-panel')).toBeNull();
  });
});
