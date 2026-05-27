/**
 * Regression guard for LS-4094: when a new notification arrives while the
 * dropdown is closed, the polling unread count updates but the cached
 * notification history stays stale, briefly flashing the old list on the
 * next open. The fix evicts `getNotificationHistory` from the Apollo cache
 * whenever the unread count changes while the dropdown is closed, so the
 * next open fetches fresh data.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import {
  getNotificationLink,
  NotificationDropdown,
} from './NotificationDropdown';

type UnreadCountResult = { data: { getUnreadNotificationCount: number } };
type HistoryResult = { data: undefined; loading: boolean };

const mockEvict = jest.fn();
const mockGc = jest.fn();
const mockUseGetUnreadNotificationCountQuery = jest.fn<
  UnreadCountResult,
  unknown[]
>();
const mockUseGetNotificationHistoryQuery = jest.fn<HistoryResult, unknown[]>();

jest.mock('@apollo/client/react', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@apollo/client/react',
  );
  return {
    ...actual,
    useApolloClient: () => ({
      cache: { evict: mockEvict, gc: mockGc },
    }),
  };
});

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUnreadNotificationCountQuery: (...args: unknown[]): UnreadCountResult =>
    mockUseGetUnreadNotificationCountQuery(...args),
  useGetNotificationHistoryQuery: (...args: unknown[]): HistoryResult =>
    mockUseGetNotificationHistoryQuery(...args),
  useMarkNotificationAsReadMutation: () => [jest.fn(), { loading: false }],
  useMarkAllNotificationsAsReadMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy(
    {},
    {
      get: () => Icon,
    },
  );
});

jest.mock('tamagui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Button = ({
    children,
    onPress,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
  }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  );
  const Spinner = () => <span />;
  const styled = (_Component: unknown) => Passthrough;
  return new Proxy(
    { Button, Spinner, styled },
    {
      get: (target, prop) =>
        (target as Record<string | symbol, unknown>)[prop] ?? Passthrough,
    },
  );
});

jest.mock('@legacy-sports/shared-components/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return new Proxy(
    {},
    {
      get: () => Passthrough,
    },
  );
});

jest.mock('./NavDropdownShared', () => ({
  DROPDOWN_BORDER: 'transparent',
  NAV_DROPDOWN_ANIMATION: 'none',
}));

const renderDropdown = () =>
  render(
    <MemoryRouter>
      <NotificationDropdown />
    </MemoryRouter>,
  );

const setUnreadCount = (count: number): void => {
  mockUseGetUnreadNotificationCountQuery.mockReturnValue({
    data: { getUnreadNotificationCount: count },
  });
};

describe('NotificationDropdown — LS-4094 stale-history invalidation', () => {
  beforeEach(() => {
    mockEvict.mockReset();
    mockGc.mockReset();
    mockUseGetUnreadNotificationCountQuery.mockReset();
    mockUseGetNotificationHistoryQuery.mockReset();
    mockUseGetNotificationHistoryQuery.mockReturnValue({
      data: undefined,
      loading: false,
    });
    setUnreadCount(0);
  });

  it('evicts cached notification history when the unread count changes while the dropdown is closed', () => {
    const { rerender } = renderDropdown();

    expect(mockEvict).not.toHaveBeenCalled();

    act(() => {
      setUnreadCount(3);
      rerender(
        <MemoryRouter>
          <NotificationDropdown />
        </MemoryRouter>,
      );
    });

    expect(mockEvict).toHaveBeenCalledWith({
      fieldName: 'getNotificationHistory',
    });
    expect(mockGc).toHaveBeenCalledTimes(1);
  });

  it('does not evict on initial mount even when the count is non-zero', () => {
    setUnreadCount(5);
    renderDropdown();
    expect(mockEvict).not.toHaveBeenCalled();
  });

  it('does not evict when the unread count is unchanged', () => {
    setUnreadCount(2);
    const { rerender } = renderDropdown();

    act(() => {
      rerender(
        <MemoryRouter>
          <NotificationDropdown />
        </MemoryRouter>,
      );
    });

    expect(mockEvict).not.toHaveBeenCalled();
  });
});

describe('getNotificationLink — LS-4086 dropdown navigation routing', () => {
  it('routes matchup notifications with a matchupId to /matchup/:id', () => {
    expect(
      getNotificationLink({
        notificationType: 'matchup_started',
        matchupId: 42,
        leagueId: 7,
      }),
    ).toBe('/matchup/42');
    expect(
      getNotificationLink({
        notificationType: 'MATCHUP_CLOSE_GAME',
        matchupId: 99,
        leagueId: null,
      }),
    ).toBe('/matchup/99');
    expect(
      getNotificationLink({
        notificationType: 'reminder_lineup',
        matchupId: 5,
      }),
    ).toBe('/matchup/5');
  });

  it('routes result notifications with a matchupId to /matchup/:id', () => {
    expect(
      getNotificationLink({
        notificationType: 'matchup_ended',
        matchupId: 17,
      }),
    ).toBe('/matchup/17');
    expect(
      getNotificationLink({
        notificationType: 'game_lost',
        matchupId: 21,
      }),
    ).toBe('/matchup/21');
  });

  it('falls back to /notifications when a matchup-category notification has no matchupId', () => {
    expect(
      getNotificationLink({
        notificationType: 'matchup_started',
        matchupId: null,
        leagueId: 7,
      }),
    ).toBe('/notifications');
  });

  it('routes trade notifications with a leagueId to the trades tab', () => {
    expect(
      getNotificationLink({
        notificationType: 'trade_proposed',
        leagueId: 12,
      }),
    ).toBe('/baseball/league/12/trades');
  });

  it('falls back to /notifications when a trade notification has no leagueId', () => {
    expect(
      getNotificationLink({
        notificationType: 'trade_proposed',
        leagueId: null,
      }),
    ).toBe('/notifications');
  });

  it('routes draft notifications with a leagueId to the league page', () => {
    expect(
      getNotificationLink({
        notificationType: 'draft_completed',
        leagueId: 33,
      }),
    ).toBe('/baseball/league/33');
    expect(
      getNotificationLink({
        notificationType: 'DRAFT_STARTED',
        leagueId: 8,
      }),
    ).toBe('/baseball/league/8');
  });

  it('routes subscription/trial system notifications to /profile/subscription', () => {
    expect(
      getNotificationLink({ notificationType: 'subscription_updated' }),
    ).toBe('/profile/subscription');
    expect(getNotificationLink({ notificationType: 'trial_will_end' })).toBe(
      '/profile/subscription',
    );
  });

  it('does not route unrelated types that merely contain "subscription" or "trial"', () => {
    // Guard against the previous broad substring match — an unrelated type
    // that happens to contain "subscription" should fall back to /notifications.
    expect(
      getNotificationLink({
        notificationType: 'commissioner_subscription_to_league_updates',
      }),
    ).toBe('/notifications');
    expect(
      getNotificationLink({ notificationType: 'free_trial_recommendation' }),
    ).toBe('/notifications');
  });

  it('falls back to /notifications for unknown or missing notification types', () => {
    expect(getNotificationLink({ notificationType: null })).toBe(
      '/notifications',
    );
    expect(getNotificationLink({ notificationType: undefined })).toBe(
      '/notifications',
    );
    expect(getNotificationLink({ notificationType: '' })).toBe(
      '/notifications',
    );
    expect(
      getNotificationLink({
        notificationType: 'commissioner_announcement',
        leagueId: 4,
      }),
    ).toBe('/notifications');
  });
});
