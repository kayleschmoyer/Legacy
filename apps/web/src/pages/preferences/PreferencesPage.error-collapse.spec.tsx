/**
 * LS-7093 (PRF-022) — when the notifications query fails, the error card must
 * stay visible: a persisted "collapsed" preference cannot hide it, and the
 * header toggle cannot collapse it. The stored preference is left untouched so
 * it reapplies once the query recovers.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NetworkStatus } from '@apollo/client';
import { useGetUserNotificationPreferencesQuery } from '@legacy-sports/graphql';
import PreferencesPage from './PreferencesPage';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
interface MockProps {
  children?: React.ReactNode;
  onPress?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  disabled?: boolean;
  role?: string;
  tabIndex?: number;
  'aria-busy'?: boolean;
  'aria-expanded'?: boolean;
  'aria-disabled'?: boolean;
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
  return <span>{children}</span>;
}
function MockSeparator(): React.ReactElement {
  return <hr />;
}
function MockBox({
  children,
  onPress,
  onKeyDown,
  role,
  tabIndex,
  'aria-expanded': ariaExpanded,
  'aria-disabled': ariaDisabled,
}: MockProps): React.ReactElement {
  return (
    <div
      onClick={onPress}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-expanded={ariaExpanded}
      aria-disabled={ariaDisabled}
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
const COLLAPSED_KEY = 'ls_prefs_sections_collapsed';

function notificationsHeader(): HTMLElement {
  return screen.getByRole('button', { name: /notifications/i });
}

describe('PreferencesPage notifications error state (LS-7093)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      COLLAPSED_KEY,
      JSON.stringify({ notifications: true }),
    );
    mockUseQuery.mockReturnValue({
      data: undefined,
      error: new Error('boom'),
      loading: false,
      networkStatus: NetworkStatus.error,
      refetch: jest.fn(),
    });
  });

  it('keeps the error card expanded even when the section was persisted as collapsed', () => {
    render(<PreferencesPage />);
    expect(notificationsHeader()).toHaveAttribute('aria-expanded', 'true');
    const body = screen
      .getByText('Unable to load preferences')
      .closest('[aria-hidden]');
    expect(body).toHaveAttribute('aria-hidden', 'false');
  });

  it('ignores header presses while in the error state and keeps the stored preference', () => {
    render(<PreferencesPage />);
    fireEvent.click(notificationsHeader());
    fireEvent.keyDown(notificationsHeader(), { key: 'Enter' });
    expect(notificationsHeader()).toHaveAttribute('aria-expanded', 'true');
    expect(notificationsHeader()).toHaveAttribute('aria-disabled', 'true');
    expect(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}')).toEqual({
      notifications: true,
    });
  });

  it('honours the collapsed preference again once the query recovers', () => {
    mockUseQuery.mockReturnValue({
      data: { getUserNotificationPreferences: { closeGameThreshold: 5 } },
      error: undefined,
      loading: false,
      networkStatus: NetworkStatus.ready,
      refetch: jest.fn(),
    });
    render(<PreferencesPage />);
    expect(notificationsHeader()).toHaveAttribute('aria-expanded', 'false');
  });
});
