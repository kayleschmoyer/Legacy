import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
// ── Component under test ─────────────────────────────────────────────────────
import PreferencesScreen from './preferences';
import { AUTHORIZED_CONTEXT as MOCKED_AUTHORIZED_CONTEXT } from '../../../../common/auth/AuthorizedUserContext';

interface MockUser {
  id: number;
  email: string | null;
  username: string;
  isAdmin: boolean;
  about: string | null;
}

jest.mock('../../../../common/auth/AuthorizedUserContext', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    AUTHORIZED_CONTEXT: ReactActual.createContext<MockUser | null>(null),
  };
});

const AUTHORIZED_CONTEXT =
  MOCKED_AUTHORIZED_CONTEXT as unknown as React.Context<MockUser | null>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSetThemePreference = jest.fn();
const mockSecureHasItem = jest.fn();
const mockSecureGetItem = jest.fn();
const mockSecureSetItem = jest.fn();
const mockAsyncStorageGetItem = jest.fn();
const mockAsyncStorageSetItem = jest.fn();
const mockEnableDeviceLogging = jest.fn();
const mockDisableDeviceLogging = jest.fn();
const mockShareCurrentLogFile = jest.fn();

// The screen reads and writes the server-side audio preference (LS-10111).
// This spec renders without an Apollo provider — matching the module-mocking
// style it already uses for the other side effects — so the two generated
// hooks are stubbed rather than wrapping every case in a MockedProvider.
const mockUpdateUserPreferences = jest.fn();
let mockServerPreferences: { audioEnabled: boolean } | null = null;

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserPreferencesQuery: () => ({
    data: mockServerPreferences
      ? { getUserPreferences: mockServerPreferences }
      : undefined,
  }),
  useUpdateUserPreferencesMutation: () => [mockUpdateUserPreferences],
}));

jest.mock('../../../../features/device-logs/deviceLogs', () => ({
  DEVICE_LOGS_PREF_KEY: 'enable_device_logs',
  enableDeviceLogging: (...args: unknown[]): unknown =>
    mockEnableDeviceLogging(...args),
  disableDeviceLogging: (...args: unknown[]): unknown =>
    mockDisableDeviceLogging(...args),
  shareCurrentLogFile: (...args: unknown[]): unknown =>
    mockShareCurrentLogFile(...args),
}));

function renderWithUser(isAdmin: boolean): void {
  const user: MockUser = {
    id: 1,
    email: 'a@b.com',
    username: 'tester',
    isAdmin,
    about: null,
  };
  render(
    <AUTHORIZED_CONTEXT.Provider value={user}>
      <PreferencesScreen />
    </AUTHORIZED_CONTEXT.Provider>,
  );
}

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components', () => ({
  secureStorage: {
    hasItem: (...args: unknown[]): unknown => mockSecureHasItem(...args),
    getItem: (...args: unknown[]): unknown => mockSecureGetItem(...args),
    setItem: (...args: unknown[]): unknown => mockSecureSetItem(...args),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]): unknown => mockAsyncStorageGetItem(...args),
    setItem: (...args: unknown[]): unknown => mockAsyncStorageSetItem(...args),
  },
}));

jest.mock('../../../../context/ThemeContext', () => ({
  useThemeContext: () => ({
    themePreference: 'system' as const,
    setThemePreference: (...args: unknown[]): void => {
      mockSetThemePreference(...args);
    },
  }),
}));

jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    createTokens: (tokens: unknown) => tokens,
    H1: ({
      children,
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(Text, null, children),
    Paragraph: ({
      children,
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(Text, null, children),
    Separator: () => React.createElement(View, { testID: 'separator' }),
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      [key: string]: unknown;
    }) =>
      React.createElement(
        Pressable,
        { onPress, disabled, testID: 'tamagui-button' },
        React.createElement(Text, null, children),
      ),
    Switch: Object.assign(
      ({
        checked,
        onCheckedChange,
        testID,
      }: {
        checked?: boolean;
        onCheckedChange?: (v: boolean) => void;
        testID?: string;
        [key: string]: unknown;
      }) =>
        React.createElement(Pressable, {
          testID: testID ?? 'switch',
          onPress: () => onCheckedChange?.(!checked),
        }),
      { Thumb: (): null => null },
    ),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Text, { testID }, children),
    XStack: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return React.createElement(Pressable, { testID, onPress }, children);
      }
      return React.createElement(View, { testID }, children);
    },
    YStack: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return React.createElement(Pressable, { testID, onPress }, children);
      }
      return React.createElement(View, { testID }, children);
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PreferencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureHasItem.mockResolvedValue(false);
    mockSecureGetItem.mockResolvedValue(null);
    mockSecureSetItem.mockResolvedValue(undefined);
    mockAsyncStorageGetItem.mockResolvedValue(null);
    mockAsyncStorageSetItem.mockResolvedValue(undefined);
    mockEnableDeviceLogging.mockResolvedValue(undefined);
    mockShareCurrentLogFile.mockResolvedValue(undefined);
    mockServerPreferences = null;
  });

  describe('sound effects preference (LS-10111)', () => {
    it('renders the toggle', () => {
      renderWithUser(false);
      expect(screen.getByText('Sound effects')).toBeTruthy();
      expect(screen.getByTestId('audio-enabled-toggle')).toBeTruthy();
    });

    it('starts off, so the first press opts in rather than out', async () => {
      // Audio is never on by default — the first press must turn it ON.
      renderWithUser(false);

      fireEvent.press(screen.getByTestId('audio-enabled-toggle'));

      await waitFor(() => {
        expect(mockUpdateUserPreferences).toHaveBeenCalledWith({
          variables: { input: { audioEnabled: true } },
        });
      });
    });

    it('hydrates from the server so the opt-in follows the account', async () => {
      // Already opted in on another device: the first press here must turn it
      // OFF, which is only true if the server value won over the local default.
      mockServerPreferences = { audioEnabled: true };
      renderWithUser(false);

      await waitFor(() => {
        expect(screen.getByTestId('audio-enabled-toggle')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('audio-enabled-toggle'));

      await waitFor(() => {
        expect(mockUpdateUserPreferences).toHaveBeenCalledWith({
          variables: { input: { audioEnabled: false } },
        });
      });
    });
  });

  describe('initial rendering', () => {
    it('renders the Preferences heading', () => {
      renderWithUser(false);
      expect(screen.getByText('Preferences')).toBeTruthy();
    });

    it('renders all three theme chip options', () => {
      renderWithUser(false);
      expect(screen.getByText('System')).toBeTruthy();
      expect(screen.getByText('Light')).toBeTruthy();
      expect(screen.getByText('Dark')).toBeTruthy();
    });

    it('renders both default sport chip options', () => {
      renderWithUser(false);
      expect(screen.getByText('Baseball')).toBeTruthy();
      expect(screen.getByText('Football')).toBeTruthy();
    });

    it('renders both stats format chip options', () => {
      renderWithUser(false);
      expect(screen.getByText('Standard')).toBeTruthy();
      expect(screen.getByText('Expanded')).toBeTruthy();
    });

    it('renders the Enable animations toggle label', () => {
      renderWithUser(false);
      expect(screen.getByText('Enable animations')).toBeTruthy();
    });

    it('renders the Show season totals toggle label', () => {
      renderWithUser(false);
      expect(screen.getByText('Show season totals')).toBeTruthy();
    });
  });

  describe('theme selection', () => {
    it('calls setThemePreference with light when Light chip is pressed', () => {
      renderWithUser(false);
      fireEvent.press(screen.getByText('Light'));
      expect(mockSetThemePreference).toHaveBeenCalledWith('light');
    });

    it('calls setThemePreference with dark when Dark chip is pressed', () => {
      renderWithUser(false);
      fireEvent.press(screen.getByText('Dark'));
      expect(mockSetThemePreference).toHaveBeenCalledWith('dark');
    });

    it('calls setThemePreference with system when System chip is pressed', () => {
      renderWithUser(false);
      fireEvent.press(screen.getByText('System'));
      expect(mockSetThemePreference).toHaveBeenCalledWith('system');
    });
  });

  describe('auto-save banner (LS-7663)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    async function flushLoad(): Promise<void> {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it('shows no banner and writes nothing after the initial load', async () => {
      renderWithUser(false);
      await flushLoad();

      expect(mockAsyncStorageGetItem).toHaveBeenCalled();
      expect(screen.queryByText('Preferences saved')).toBeNull();
      expect(mockAsyncStorageSetItem).not.toHaveBeenCalled();
    });

    it('shows no banner when persisted prefs differ from the defaults', async () => {
      mockAsyncStorageGetItem.mockResolvedValue(
        JSON.stringify({ defaultSport: 'football', statsFormat: 'expanded' }),
      );
      renderWithUser(false);
      await flushLoad();

      expect(screen.queryByText('Preferences saved')).toBeNull();
      expect(mockAsyncStorageSetItem).not.toHaveBeenCalled();
    });

    it('shows no banner when server preferences hydrate after load', async () => {
      mockServerPreferences = { audioEnabled: true };
      renderWithUser(false);
      await flushLoad();

      expect(screen.queryByText('Preferences saved')).toBeNull();
      expect(mockAsyncStorageSetItem).not.toHaveBeenCalled();
    });

    it('shows the banner and saves after a user edit, then hides it after 2s', async () => {
      jest.useFakeTimers();
      renderWithUser(false);
      await flushLoad();

      fireEvent.press(screen.getByText('Expanded'));
      await flushLoad();

      expect(screen.getByText('Preferences saved')).toBeTruthy();
      expect(mockAsyncStorageSetItem).toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(screen.queryByText('Preferences saved')).toBeNull();
    });

    it('keeps the banner for 2s after a theme edit despite the context sync', async () => {
      jest.useFakeTimers();
      renderWithUser(false);
      await flushLoad();

      fireEvent.press(screen.getByText('Light'));
      await flushLoad();
      expect(screen.getByText('Preferences saved')).toBeTruthy();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(screen.queryByText('Preferences saved')).toBeNull();
    });
  });

  describe('storage', () => {
    it('calls AsyncStorage.getItem on mount to load persisted preferences', async () => {
      renderWithUser(false);
      await waitFor(() => {
        expect(mockAsyncStorageGetItem).toHaveBeenCalledWith(
          'ls_user_preferences',
        );
      });
    });

    it('merges stored preferences with defaults when persisted data exists', async () => {
      mockAsyncStorageGetItem.mockResolvedValueOnce(
        JSON.stringify({ defaultSport: 'football', statsFormat: 'expanded' }),
      );
      renderWithUser(false);
      await waitFor(() => {
        expect(mockAsyncStorageGetItem).toHaveBeenCalledWith(
          'ls_user_preferences',
        );
      });

      fireEvent.press(screen.getByText('Light'));

      await waitFor(() => {
        expect(mockAsyncStorageSetItem).toHaveBeenCalled();
      });

      const lastCall = mockAsyncStorageSetItem.mock.calls[
        mockAsyncStorageSetItem.mock.calls.length - 1
      ] as [string, string];
      const savedPrefs = JSON.parse(lastCall[1]) as Record<string, unknown>;

      expect(savedPrefs).toMatchObject({
        defaultSport: 'football',
        statsFormat: 'expanded',
      });
    });

    it('saves updated preferences through AsyncStorage', async () => {
      renderWithUser(false);

      fireEvent.press(screen.getByText('Expanded'));

      await waitFor(() => {
        expect(mockAsyncStorageSetItem).toHaveBeenCalledWith(
          'ls_user_preferences',
          expect.any(String),
        );
      });
    });
  });

  describe('section collapse (LS-7096)', () => {
    it('renders every section expanded by default', async () => {
      renderWithUser(false);
      await waitFor(() => {
        expect(mockAsyncStorageGetItem).toHaveBeenCalledWith(
          'ls_prefs_sections_collapsed',
        );
      });
      expect(screen.getByText('Theme')).toBeTruthy();
      expect(screen.getByText('Default sport')).toBeTruthy();
    });

    it('hides the section body and persists the state when a header is pressed', async () => {
      renderWithUser(false);

      fireEvent.press(screen.getByTestId('section-header-appearance'));

      expect(screen.queryByText('Theme')).toBeNull();
      expect(screen.getByText('Default sport')).toBeTruthy();
      await waitFor(() => {
        expect(mockAsyncStorageSetItem).toHaveBeenCalledWith(
          'ls_prefs_sections_collapsed',
          JSON.stringify({ appearance: true, sports: false, admin: false }),
        );
      });
    });

    it('expands a collapsed section when its header is pressed again', () => {
      renderWithUser(false);

      fireEvent.press(screen.getByTestId('section-header-appearance'));
      fireEvent.press(screen.getByTestId('section-header-appearance'));

      expect(screen.getByText('Theme')).toBeTruthy();
    });

    it('restores persisted collapse state on mount', async () => {
      mockAsyncStorageGetItem.mockImplementation((key: string) =>
        Promise.resolve(
          key === 'ls_prefs_sections_collapsed'
            ? JSON.stringify({ sports: true })
            : null,
        ),
      );
      renderWithUser(false);

      await waitFor(() => {
        expect(screen.queryByText('Default sport')).toBeNull();
      });
      expect(screen.getByText('Theme')).toBeTruthy();
    });

    it('falls back to expanded when the stored value is corrupt', async () => {
      mockAsyncStorageGetItem.mockImplementation((key: string) =>
        Promise.resolve(key === 'ls_prefs_sections_collapsed' ? '{oops' : null),
      );
      renderWithUser(false);

      await waitFor(() => {
        expect(mockAsyncStorageGetItem).toHaveBeenCalledWith(
          'ls_prefs_sections_collapsed',
        );
      });
      expect(screen.getByText('Theme')).toBeTruthy();
    });

    it('lets admins collapse the Admin Tools section', () => {
      renderWithUser(true);

      fireEvent.press(screen.getByTestId('section-header-admin'));

      expect(screen.queryByTestId('device-logs-toggle')).toBeNull();
    });
  });

  describe('Admin Tools section', () => {
    it('does not render for non-admin users', () => {
      renderWithUser(false);
      expect(screen.queryByText('Admin Tools')).toBeNull();
      expect(screen.queryByText('Write logs to device')).toBeNull();
    });

    it('renders for admin users', () => {
      renderWithUser(true);
      expect(screen.getByText('Admin Tools')).toBeTruthy();
      expect(screen.getByText('Write logs to device')).toBeTruthy();
      expect(screen.getByText('Share log file')).toBeTruthy();
    });

    it('persists enable_device_logs=true and enables logging when toggled on', async () => {
      mockSecureHasItem.mockResolvedValue(false);
      mockSecureGetItem.mockResolvedValue(null);

      renderWithUser(true);

      // Wait for the hook's initial load to complete.
      await waitFor(() => {
        expect(mockSecureHasItem).toHaveBeenCalledWith('enable_device_logs');
      });

      // Switches in render order: [enableAnimations, showSeasonTotals, writeLogsToDevice].
      fireEvent.press(screen.getByTestId('device-logs-toggle'));

      await waitFor(() => {
        expect(mockSecureSetItem).toHaveBeenCalledWith(
          'enable_device_logs',
          'true',
        );
      });
      await waitFor(() => {
        expect(mockEnableDeviceLogging).toHaveBeenCalled();
      });
    });

    it('persists enable_device_logs=false and disables logging when toggled off', async () => {
      mockSecureHasItem.mockResolvedValue(true);
      mockSecureGetItem.mockImplementation((key: string) =>
        Promise.resolve(key === 'enable_device_logs' ? 'true' : null),
      );

      renderWithUser(true);

      await waitFor(() => {
        expect(mockEnableDeviceLogging).toHaveBeenCalled();
      });

      // Switches in render order: [enableAnimations, showSeasonTotals, writeLogsToDevice].
      fireEvent.press(screen.getByTestId('device-logs-toggle'));

      await waitFor(() => {
        expect(mockSecureSetItem).toHaveBeenCalledWith(
          'enable_device_logs',
          'false',
        );
      });
      expect(mockDisableDeviceLogging).toHaveBeenCalled();
    });

    it('invokes shareCurrentLogFile when the Share log file button is pressed', async () => {
      mockSecureHasItem.mockResolvedValue(true);
      mockSecureGetItem.mockImplementation((key: string) =>
        Promise.resolve(key === 'enable_device_logs' ? 'true' : null),
      );

      renderWithUser(true);

      await waitFor(() => {
        expect(mockEnableDeviceLogging).toHaveBeenCalled();
      });

      fireEvent.press(screen.getByText('Share log file'));
      await waitFor(() => {
        expect(mockShareCurrentLogFile).toHaveBeenCalled();
      });
    });

    it('renders the error message when sharing the log file fails', async () => {
      mockSecureHasItem.mockResolvedValue(true);
      mockSecureGetItem.mockImplementation((key: string) =>
        Promise.resolve(key === 'enable_device_logs' ? 'true' : null),
      );
      mockShareCurrentLogFile.mockRejectedValue(
        new Error('No log file exists yet for today.'),
      );

      renderWithUser(true);

      await waitFor(() => {
        expect(mockEnableDeviceLogging).toHaveBeenCalled();
      });

      fireEvent.press(screen.getByText('Share log file'));
      await waitFor(() => {
        expect(
          screen.getByText('No log file exists yet for today.'),
        ).toBeTruthy();
      });
    });
  });
});
