import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import PreferencesScreen from './preferences';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSetThemePreference = jest.fn();
const mockHasItem = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components', () => ({
  secureStorage: {
    hasItem: (...args: unknown[]): unknown => mockHasItem(...args),
    getItem: (...args: unknown[]): unknown => mockGetItem(...args),
    setItem: (...args: unknown[]): unknown => mockSetItem(...args),
  },
}));

jest.mock('../../context/ThemeContext', () => ({
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
    mockHasItem.mockResolvedValue(false);
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  describe('initial rendering', () => {
    it('renders the Preferences heading', () => {
      render(<PreferencesScreen />);
      expect(screen.getByText('Preferences')).toBeTruthy();
    });

    it('renders all three theme chip options', () => {
      render(<PreferencesScreen />);
      expect(screen.getByText('System')).toBeTruthy();
      expect(screen.getByText('Light')).toBeTruthy();
      expect(screen.getByText('Dark')).toBeTruthy();
    });

    it('renders both default sport chip options', () => {
      render(<PreferencesScreen />);
      expect(screen.getByText('Baseball')).toBeTruthy();
      expect(screen.getByText('Football')).toBeTruthy();
    });

    it('renders both stats format chip options', () => {
      render(<PreferencesScreen />);
      expect(screen.getByText('Standard')).toBeTruthy();
      expect(screen.getByText('Expanded')).toBeTruthy();
    });

    it('renders the Enable animations toggle label', () => {
      render(<PreferencesScreen />);
      expect(screen.getByText('Enable animations')).toBeTruthy();
    });

    it('renders the Show season totals toggle label', () => {
      render(<PreferencesScreen />);
      expect(screen.getByText('Show season totals')).toBeTruthy();
    });
  });

  describe('theme selection', () => {
    it('calls setThemePreference with light when Light chip is pressed', () => {
      render(<PreferencesScreen />);
      fireEvent.press(screen.getByText('Light'));
      expect(mockSetThemePreference).toHaveBeenCalledWith('light');
    });

    it('calls setThemePreference with dark when Dark chip is pressed', () => {
      render(<PreferencesScreen />);
      fireEvent.press(screen.getByText('Dark'));
      expect(mockSetThemePreference).toHaveBeenCalledWith('dark');
    });

    it('calls setThemePreference with system when System chip is pressed', () => {
      render(<PreferencesScreen />);
      fireEvent.press(screen.getByText('System'));
      expect(mockSetThemePreference).toHaveBeenCalledWith('system');
    });
  });

  describe('storage', () => {
    it('calls secureStorage.hasItem on mount to initialise the store', async () => {
      render(<PreferencesScreen />);
      await waitFor(() => {
        expect(mockHasItem).toHaveBeenCalledWith('ls_user_preferences');
      });
    });

    it('calls secureStorage.getItem to load persisted preferences', async () => {
      render(<PreferencesScreen />);
      await waitFor(() => {
        expect(mockGetItem).toHaveBeenCalledWith('ls_user_preferences');
      });
    });

    it('merges stored preferences with defaults when persisted data exists', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({ defaultSport: 'football', statsFormat: 'expanded' }),
      );
      render(<PreferencesScreen />);
      await waitFor(() => {
        expect(mockGetItem).toHaveBeenCalledWith('ls_user_preferences');
      });

      // Trigger a preference change that causes secureStorage.setItem to be called
      fireEvent.press(screen.getByText('Light'));

      await waitFor(() => {
        expect(mockSetItem).toHaveBeenCalled();
      });

      // Assert that the saved preferences include the previously stored values,
      // verifying that they were merged with any defaults.
      const lastCall = mockSetItem.mock.calls[
        mockSetItem.mock.calls.length - 1
      ] as [string, string];
      const savedPrefs = JSON.parse(lastCall[1]) as Record<string, unknown>;

      expect(savedPrefs).toMatchObject({
        defaultSport: 'football',
        statsFormat: 'expanded',
      });
    });
  });
});
