import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// import type (erased at compile time — no barrel loaded at runtime) solely to
// type the jest.requireActual generic parameters without triggering boundary rules.
import type {
  PlayerDetailById as PlayerDetailByIdComponent,
  PlayerDetail as PlayerDetailComponent,
} from '@legacy-sports/shared-components';

// ── Component under test ─────────────────────────────────────────────────────
import PlayerDetailScreen, { ErrorBoundary } from './PlayerDetail';
import { ScreenErrorBoundary } from './_screenErrorBoundary';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseLocalSearchParams = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: (
    ...args: unknown[]
  ): Record<string, string | undefined> =>
    mockUseLocalSearchParams(...args) as Record<string, string | undefined>,
  useRouter: () => ({ back: mockBack }),
}));

// Param-parsing tests use a stub so they can assert the parsed numeric ID
// without exercising Tamagui or the network. Integration tests below bypass
// this via jest.requireActual targeting the specific feature file.
jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlayerDetailById: ({ playerId }: { playerId: number }) => (
      <View testID={`player-detail-${playerId}`} />
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

// ── Tests: route param parsing ────────────────────────────────────────────────

describe('PlayerDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(screen.getByTestId('player-detail-invalid-back')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is undefined', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
    expect(screen.getByTestId('player-detail-invalid-back')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is non-numeric', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: 'abc' });
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
    expect(screen.getByTestId('player-detail-invalid-back')).toBeTruthy();
  });

  it('calls router.back when the Go Back button is pressed on the fallback screen', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    fireEvent.press(screen.getByTestId('player-detail-invalid-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
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
  '../../../../../lib/shared-components/src/features/players/PlayerDetail';

describe('PlayerDetailById — render-with-data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders player name and team for a known playerId', () => {
    const { PlayerDetailById } = jest.requireActual<{
      PlayerDetailById: typeof PlayerDetailByIdComponent;
    }>(PLAYER_DETAIL_MODULE);
    render(<PlayerDetailById playerId={1} />);
    expect(screen.getByText('Babe Ruth')).toBeTruthy();
    expect(screen.getByText('New York Yankees')).toBeTruthy();
  });

  it('renders a second player correctly', () => {
    const { PlayerDetailById } = jest.requireActual<{
      PlayerDetailById: typeof PlayerDetailByIdComponent;
    }>(PLAYER_DETAIL_MODULE);
    render(<PlayerDetailById playerId={2} />);
    expect(screen.getByText('Ty Cobb')).toBeTruthy();
    expect(screen.getByText('Detroit Tigers')).toBeTruthy();
  });
});

describe('PlayerDetailById — empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "Player not found" for an unknown playerId', () => {
    const { PlayerDetailById } = jest.requireActual<{
      PlayerDetailById: typeof PlayerDetailByIdComponent;
    }>(PLAYER_DETAIL_MODULE);
    render(<PlayerDetailById playerId={999} />);
    expect(screen.getByText('Player not found')).toBeTruthy();
  });

  it('shows "Player not found" when playerId defaults to 0 (missing route param)', () => {
    const { PlayerDetailById } = jest.requireActual<{
      PlayerDetailById: typeof PlayerDetailByIdComponent;
    }>(PLAYER_DETAIL_MODULE);
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
