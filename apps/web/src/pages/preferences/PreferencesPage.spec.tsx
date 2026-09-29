/**
 * LS-7095 (PRF-024) — the notifications "Retry" button must show a pending
 * state (disabled + spinner) while the refetch is in flight so a double-click
 * cannot fire two refetches.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NetworkStatus } from '@apollo/client';
import { useGetUserNotificationPreferencesQuery } from '@legacy-sports/graphql';
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
function MockBox({ children }: MockProps): React.ReactElement {
  return <div>{children}</div>;
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
