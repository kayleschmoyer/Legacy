import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import {
  ThemeProvider,
  ThemeServerSync,
  useThemeContext,
} from './ThemeContext';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

const mockSecureHasItem = jest.fn().mockResolvedValue(false);
const mockSecureGetItem = jest.fn().mockResolvedValue(null);
const mockSecureSetItem = jest.fn().mockResolvedValue(undefined);
jest.mock('@legacy-sports/shared-components', () => ({
  secureStorage: {
    hasItem: (...args: unknown[]): unknown => mockSecureHasItem(...args),
    getItem: (...args: unknown[]): unknown => mockSecureGetItem(...args),
    setItem: (...args: unknown[]): unknown => mockSecureSetItem(...args),
  },
}));

let mockUserData: { user: { themePreference: string | null } } | undefined;
const mockUseGetUserByIdQuery = jest.fn((_options?: unknown) => ({
  data: mockUserData,
}));
const mockUpdateUserTheme = jest.fn().mockResolvedValue(undefined);
jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: (options: unknown): unknown =>
    mockUseGetUserByIdQuery(options),
  useUpdateUserThemeMutation: (): unknown => [mockUpdateUserTheme],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function Harness({
  userId,
  onPreference,
}: {
  userId: number | undefined;
  onPreference?: (pref: string) => void;
}): React.JSX.Element {
  const { themePreference, setThemePreference } = useThemeContext();
  onPreference?.(themePreference);
  return (
    <>
      <ThemeServerSync userId={userId} />
      {/* Expose a setter for tests that need to trigger a local change */}
      <Pressable onPress={() => setThemePreference('dark')} testID="set-dark" />
    </>
  );
}

function renderHarness(
  userId: number | undefined,
  onPreference?: (pref: string) => void,
) {
  return render(
    <ThemeProvider>
      <Harness userId={userId} onPreference={onPreference} />
    </ThemeProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThemeServerSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureHasItem.mockResolvedValue(false);
    mockSecureGetItem.mockResolvedValue(null);
    mockSecureSetItem.mockResolvedValue(undefined);
    mockUserData = undefined;
    mockUseGetUserByIdQuery.mockImplementation(() => ({ data: mockUserData }));
    mockUpdateUserTheme.mockResolvedValue(undefined);
  });

  it('adopts the server theme preference on hydration, overriding a fresh-install default', async () => {
    mockSecureGetItem.mockResolvedValue(null); // fresh install: no local value
    mockUserData = { user: { themePreference: 'dark' } };

    const seen: string[] = [];
    await act(async () => {
      renderHarness(42, (pref) => seen.push(pref));
      await Promise.resolve();
    });

    expect(seen).toContain('dark');
  });

  it('does not touch local preference when the server has no saved preference', async () => {
    mockSecureGetItem.mockResolvedValue('light');
    mockUserData = { user: { themePreference: null } };

    const seen: string[] = [];
    await act(async () => {
      renderHarness(42, (pref) => seen.push(pref));
      await Promise.resolve();
    });

    expect(seen[seen.length - 1]).toBe('light');
  });

  it('pushes a user-driven preference change to the server via updateUserTheme', async () => {
    mockSecureGetItem.mockResolvedValue('light');
    mockUserData = { user: { themePreference: 'light' } };

    const { getByTestId } = renderHarness(42);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(getByTestId('set-dark'));
      await Promise.resolve();
    });

    expect(mockUpdateUserTheme).toHaveBeenCalledWith({
      variables: { themePreference: 'dark' },
    });
  });

  it('skips the query when there is no authenticated user', async () => {
    await act(async () => {
      renderHarness(undefined);
      await Promise.resolve();
    });

    expect(mockUseGetUserByIdQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });
});
