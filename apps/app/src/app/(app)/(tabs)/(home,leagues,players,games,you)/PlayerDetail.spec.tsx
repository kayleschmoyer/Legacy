import React from 'react';
import { render, screen } from '@testing-library/react-native';

// import type (erased at compile time — no barrel loaded at runtime) solely to
// type the jest.requireActual generic parameters without triggering boundary rules.
import type {
  PlayerDetailById as PlayerDetailByIdComponent,
  PlayerDetail as PlayerDetailComponent,
} from '@legacy-sports/shared-components';

// ── Component under test ─────────────────────────────────────────────────────
import PlayerDetailScreen, { ErrorBoundary } from './PlayerDetail';
import { ScreenErrorBoundary } from '../../_screenErrorBoundary';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseLocalSearchParams = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    useLocalSearchParams: (
      ...args: unknown[]
    ): Record<string, string | undefined> =>
      mockUseLocalSearchParams(...args) as Record<string, string | undefined>,
    useRouter: () => ({
      back: mockBack,
      replace: mockReplace,
      canGoBack: () => mockCanGoBack,
    }),
    Stack: {
      Screen: ({
        options,
      }: {
        options?: {
          headerLeft?: (props: { canGoBack?: boolean }) => React.ReactNode;
        };
      }) => {
        if (!options?.headerLeft) return ReactActual.createElement(View, null);
        return ReactActual.createElement(
          View,
          { testID: 'stack-screen-header' },
          options.headerLeft({ canGoBack: mockCanGoBack }),
        );
      },
    },
  };
});

// Param-parsing tests use a stub so they can assert the parsed numeric ID
// without exercising Tamagui or the network. Integration tests below bypass
// this via jest.requireActual targeting the specific feature file.
jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlayerDetailById: ({
      playerId,
      initialName,
    }: {
      playerId: number;
      initialName?: string;
    }) => (
      <View
        testID={`player-detail-${playerId}`}
        accessibilityLabel={initialName}
      />
    ),
  };
});

// Tamagui shim — required by the real PlayerDetail / PlayerDetailById components
// used in the integration describe blocks below.
jest.mock('tamagui', () => {
  const {
    View: RNView,
    Text,
    Pressable,
    ScrollView: RNScrollView,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');

  return {
    createTokens: (tokens: unknown) => tokens,
    Button: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(Pressable, { testID, onPress }, children),
    ScrollView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(RNScrollView, { testID }, children),
    Spinner: () => ReactActual.createElement(RNView, { testID: 'spinner' }),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(Text, { testID }, children),
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(RNView, { testID }, children),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(RNView, { testID }, children),
  };
});

// PlayerDetailById is API-backed (LS-8824) — the integration describes below
// render the real component, so the generated query hook is stubbed here.
interface MockPlayerDetailQueryResult {
  data?: unknown;
  loading: boolean;
  error?: { message: string };
}

let mockPlayerDetailQuery: MockPlayerDetailQueryResult = { loading: false };

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerDetailByIdQuery: () => mockPlayerDetailQuery,
}));

jest.mock('@tamagui/lucide-icons', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    ChevronLeft: ({ testID }: { testID?: string; [key: string]: unknown }) =>
      ReactActual.createElement(View, { testID: testID ?? 'chevron-left' }),
  };
});

// ── Tests: route param parsing ────────────────────────────────────────────────

describe('PlayerDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
  });

  it('renders without crashing', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: '1' });
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-1')).toBeTruthy();
  });

  it('parses playerId string to number and passes it to PlayerDetailById', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: '42' });
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-42')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is undefined', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is non-numeric', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: 'abc' });
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
  });

  // LS-8766 — no back affordance of any kind is rendered on this screen any
  // more (no native header, no in-content button). Back navigation is the
  // platform back button / edge-swipe gesture.
  it('renders no back affordance on the invalid-deep-link fallback', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    expect(screen.queryByTestId('player-detail-invalid-back')).toBeNull();
    expect(screen.queryByText('Go Back')).toBeNull();
  });

  it('renders no header back button for a valid playerId', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: '42' });
    render(<PlayerDetailScreen />);
    expect(screen.queryByTestId('player-detail-header-back')).toBeNull();
  });

  it('passes playerName param to PlayerDetailById as initialName', () => {
    mockUseLocalSearchParams.mockReturnValue({
      playerId: '7',
      playerName: 'Jose Ramirez',
    });
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-7').props.accessibilityLabel).toBe(
      'Jose Ramirez',
    );
  });

  it('passes undefined initialName to PlayerDetailById when playerName is absent', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: '7' });
    render(<PlayerDetailScreen />);
    expect(
      screen.getByTestId('player-detail-7').props.accessibilityLabel,
    ).toBeUndefined();
  });
});

// ── Tests: integration with real PlayerDetailById ─────────────────────────────
//
// These tests bypass the @legacy-sports/shared-components stub above to render
// the actual PlayerDetailById component, covering the rendering scenarios that
// param-parsing tests cannot reach.

// Using the direct file path in jest.requireActual (not the package index)
// avoids loading the full shared-components barrel which pulls in native
// dependencies (google-signin) that aren't set up in the Jest environment.
const PLAYER_DETAIL_MODULE =
  '../../../../../../../lib/shared-components/src/features/players/PlayerDetail';

function requireRealPlayerDetailById() {
  return jest.requireActual<{
    PlayerDetailById: typeof PlayerDetailByIdComponent;
  }>(PLAYER_DETAIL_MODULE).PlayerDetailById;
}

describe('PlayerDetailById — render-with-data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerDetailQuery = { loading: false };
  });

  // LS-8824 — 4242 is deliberately outside the removed mock array's 1..2 range:
  // before the fix any such id rendered "Player not found" on mobile.
  it('renders the API-supplied player name and team for a real playerId', () => {
    mockPlayerDetailQuery = {
      loading: false,
      data: {
        player: {
          id: 4242,
          firstName: 'Jose',
          lastName: 'Ramirez',
          eligiblePositions: ['3B'],
          mlbTeam: null,
          careerBatting: {
            primaryPosition: '3B',
            battingAverage: 0.279,
            homeRuns: 246,
            rbi: 878,
            runs: 863,
            hits: 1403,
            onBasePercentage: 0.353,
            sluggingPercentage: 0.503,
          },
          careerPitching: null,
        },
        playerSeasonBatting: [{ season: 2024, team: 'CLE' }],
        playerSeasonPitching: [],
      },
    };
    const PlayerDetailById = requireRealPlayerDetailById();
    render(<PlayerDetailById playerId={4242} />);
    expect(screen.getByText('Jose Ramirez')).toBeTruthy();
    expect(screen.getByText('CLE')).toBeTruthy();
    expect(screen.getByText('246')).toBeTruthy();
  });
});

describe('PlayerDetailById — empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerDetailQuery = { loading: false };
  });

  it('shows "Player not found" when the API returns no player', () => {
    mockPlayerDetailQuery = {
      loading: false,
      data: {
        player: null,
        playerSeasonBatting: [],
        playerSeasonPitching: [],
      },
    };
    const PlayerDetailById = requireRealPlayerDetailById();
    render(<PlayerDetailById playerId={999} />);
    expect(screen.getByText('Player not found')).toBeTruthy();
  });

  it('shows "Player not found" when playerId defaults to 0 (missing route param)', () => {
    const PlayerDetailById = requireRealPlayerDetailById();
    render(<PlayerDetailById playerId={0} />);
    expect(screen.getByText('Player not found')).toBeTruthy();
  });
});

describe('PlayerDetail — error and loading states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "Loading player details…" when loading is true', () => {
    const { PlayerDetail } = jest.requireActual<{
      PlayerDetail: typeof PlayerDetailComponent;
    }>(PLAYER_DETAIL_MODULE);
    render(<PlayerDetail loading />);
    expect(screen.getByText('Loading player details…')).toBeTruthy();
  });

  it('renders an error message when an error string is provided', () => {
    const { PlayerDetail } = jest.requireActual<{
      PlayerDetail: typeof PlayerDetailComponent;
    }>(PLAYER_DETAIL_MODULE);
    render(<PlayerDetail error="Network failure" />);
    expect(screen.getByText('Error: Network failure')).toBeTruthy();
  });
});

// ── Tests: back-nav — ErrorBoundary export ────────────────────────────────────
//
// expo-router uses the named ErrorBoundary export from each route file to wrap
// the screen in an error boundary. Verifying the export is wired to
// ScreenErrorBoundary ensures there is a recovery path (Try Again) whenever
// the player detail screen throws.

describe('PlayerDetailScreen — ErrorBoundary export', () => {
  it('exports ScreenErrorBoundary as ErrorBoundary for expo-router', () => {
    expect(ErrorBoundary).toBe(ScreenErrorBoundary);
  });
});
