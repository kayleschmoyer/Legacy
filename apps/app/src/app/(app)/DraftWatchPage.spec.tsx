import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import DraftWatchPage from './DraftWatchPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockWebsocketUrl: string | undefined = undefined;
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return { websocketUrl: mockWebsocketUrl };
  },
}));

const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ leagueId: '42' }),
  useRouter: () => ({ navigate: mockNavigate }),
}));

const mockUseKeepAwake = jest.fn();
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: (...args: unknown[]) => {
    mockUseKeepAwake(...args);
  },
}));

let spectatorScreenProps: Record<string, unknown> | undefined;
jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SpectatorScreen: (props: Record<string, unknown>) => {
      spectatorScreenProps = props;
      return <View testID="spectator-screen" />;
    },
  };
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue('mock-jwt'),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DraftWatchPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebsocketUrl = undefined;
    spectatorScreenProps = undefined;
  });

  it('keeps the screen awake for big-screen/tablet use', async () => {
    render(<DraftWatchPage />);
    expect(mockUseKeepAwake).toHaveBeenCalledWith('draft-watch');
    await waitFor(() =>
      expect(spectatorScreenProps?.websocketToken).toBeDefined(),
    );
  });

  it('renders the SpectatorScreen with the parsed league id', async () => {
    render(<DraftWatchPage />);
    expect(screen.getByTestId('spectator-screen')).toBeTruthy();
    await waitFor(() => expect(spectatorScreenProps?.leagueId).toBe(42));
  });

  it('passes the keychain JWT through as the websocket token', async () => {
    render(<DraftWatchPage />);
    await waitFor(() => {
      expect(spectatorScreenProps?.websocketToken).toBe('mock-jwt');
    });
  });

  it('falls back to an empty websocketUrl when unconfigured', async () => {
    render(<DraftWatchPage />);
    expect(spectatorScreenProps?.websocketUrl).toBe('');
    await waitFor(() =>
      expect(spectatorScreenProps?.websocketToken).toBeDefined(),
    );
  });

  it('uses the configured websocketUrl when present', async () => {
    mockWebsocketUrl = 'wss://example.com/ws';
    render(<DraftWatchPage />);
    expect(spectatorScreenProps?.websocketUrl).toBe('wss://example.com/ws');
    await waitFor(() =>
      expect(spectatorScreenProps?.websocketToken).toBeDefined(),
    );
  });
});
