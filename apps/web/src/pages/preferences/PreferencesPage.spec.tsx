/**
 * LS-7095 (PRF-024) — the notifications "Retry" button must show a pending
 * state (disabled + spinner) while the refetch is in flight so a double-click
 * cannot fire two refetches.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NetworkStatus } from '@apollo/client';
import {
  useGetUserNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '@legacy-sports/graphql';
import PreferencesPage from './PreferencesPage';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
// Function declarations are hoisted, so the lazily-run factory can reference
// these `Mock*` helpers (babel-plugin-jest-hoist permits the `mock` prefix).
interface MockProps {
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  'aria-busy'?: boolean;
  'aria-checked'?: boolean;
  'aria-label'?: string;
  role?: string;
}
function MockButton({
  children,
  onPress,
  disabled,
  'aria-busy': ariaBusy,
}: MockProps): React.ReactElement {
  return (
    <button onClick={onPress} disabled={disabled} aria-busy={ariaBusy}>
      {children}
    </button>
  );
}
function MockParagraph({ children }: MockProps): React.ReactElement {
  return <p>{children}</p>;
}
function MockSeparator(): React.ReactElement {
  return <hr />;
}
// Only the toggle switches are made interactive; other roles stay unexposed so
// the section-header buttons don't collide with the Retry-button queries below.
function MockBox({
  children,
  onPress,
  role,
  'aria-checked': ariaChecked,
  'aria-label': ariaLabel,
}: MockProps): React.ReactElement {
  return (
    <div
      onClick={onPress}
      role={role === 'switch' ? role : undefined}
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: MockButton,
  Paragraph: MockParagraph,
  Separator: MockSeparator,
  XStack: MockBox,
  YStack: MockBox,
}));
// The shared icon mock lacks Bell/LogIn/SunMoon; every deep icon import maps to
// that one file, so this factory replaces it for this spec only.
jest.mock('@tamagui/lucide-icons/icons/Bell', () => {
  const icon = (): null => null;
  return {
    Bell: icon,
    Check: icon,
    ChevronDown: icon,
    LogIn: icon,
    Minus: icon,
    Plus: icon,
    SunMoon: icon,
    Trophy: icon,
  };
});
jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({
    themePreference: 'system',
    resolvedTheme: 'light',
    setThemePreference: jest.fn(),
  }),
}));
jest.mock('@legacy-sports/graphql', () => ({
  GetUserNotificationPreferences: 'GetUserNotificationPreferences-document',
  useGetUserNotificationPreferencesQuery: jest.fn(),
  useGetUserPreferencesQuery: jest.fn(() => ({ data: undefined })),
  useUpdateNotificationPreferencesMutation: jest.fn(() => [jest.fn()]),
  useUpdateUserPreferencesMutation: jest.fn(() => [jest.fn()]),
}));

const mockUseQuery = useGetUserNotificationPreferencesQuery as jest.Mock;

function mockQueryState(
  networkStatus: NetworkStatus,
  refetch: jest.Mock,
): void {
  mockUseQuery.mockReturnValue({
    data: undefined,
    error: new Error('boom'),
    loading: networkStatus === NetworkStatus.refetch,
    networkStatus,
    refetch,
  });
}

describe('PreferencesPage notification save failure (LS-7082)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tells the user a save failed, keeps the toggle, and retries instead of reverting', async () => {
    const refetch = jest.fn().mockResolvedValue({});
    const updateQuery = jest.fn();
    mockUseQuery.mockReturnValue({
      data: {
        getUserNotificationPreferences: {
          __typename: 'NotificationPreferences',
          pushEnabled: true,
        },
      },
      error: undefined,
      loading: false,
      networkStatus: NetworkStatus.ready,
      refetch,
      updateQuery,
    });
    const updatePrefs = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: undefined });
    (useUpdateNotificationPreferencesMutation as jest.Mock).mockReturnValue([
      updatePrefs,
    ]);

    render(<PreferencesPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Push notifications' }));
    await act(() => jest.advanceTimersByTimeAsync(300));

    expect(updatePrefs).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/couldn.t save — retrying/i)).toBeTruthy();
    // The failure must not revert the UI by refetching the server state.
    expect(refetch).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTimeAsync(2000));
    expect(updatePrefs).toHaveBeenCalledTimes(2);
    expect(updatePrefs.mock.calls[1][0].variables.input).toEqual({
      pushEnabled: false,
    });
    expect(screen.queryByText(/couldn.t save/i)).toBeNull();
  });
});

describe('PreferencesPage notifications Retry (LS-7095)', () => {
  it('requests network-status updates so refetch state is observable', () => {
    mockQueryState(NetworkStatus.error, jest.fn());
    render(<PreferencesPage />);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ notifyOnNetworkStatusChange: true }),
    );
  });

  it('is enabled when idle and refetches on press', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockQueryState(NetworkStatus.error, refetch);
    render(<PreferencesPage />);
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).not.toBeDisabled();
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('is disabled and busy during refetch, so it cannot fire a second refetch', () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockQueryState(NetworkStatus.refetch, refetch);
    render(<PreferencesPage />);
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(refetch).not.toHaveBeenCalled();
  });
});
