/**
 * Notification Dropdown Navigation E2E (LS-4086)
 *
 * Regression guard: clicking a notification item in the bell dropdown must
 * navigate the user to a route relevant to the notification's type —
 * matchup-style notifications route to `/matchup/:matchupId`, trade
 * notifications route to the league trades tab, etc. — and the dropdown
 * must close on click. Before LS-4086, the dropdown only marked the
 * notification as read with no navigation.
 *
 * All GraphQL requests are mocked; no live backend is required.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

type MockNotification = {
  __typename: 'NotificationHistoryItem';
  id: number;
  userId: number;
  notificationType: string;
  channel: string;
  matchupId: number | null;
  leagueId: number | null;
  tradeOfferId?: number | null;
  title: string;
  message: string;
  metadata: string | null;
  read: boolean;
  sentAt: string;
  readAt: string | null;
  createdAt: string;
};

const MATCHUP_NOTIFICATION: MockNotification = {
  __typename: 'NotificationHistoryItem',
  id: 1001,
  userId: 1,
  notificationType: 'matchup_started',
  channel: 'push',
  matchupId: 555,
  leagueId: 77,
  title: 'Matchup Started',
  message: 'Your Week 5 matchup has begun!',
  metadata: null,
  read: false,
  sentAt: agoIso(15 * 60 * 1000),
  readAt: null,
  createdAt: agoIso(15 * 60 * 1000),
};

const TRADE_NOTIFICATION: MockNotification = {
  __typename: 'NotificationHistoryItem',
  id: 1002,
  userId: 1,
  notificationType: 'trade_proposed',
  channel: 'push',
  matchupId: null,
  leagueId: 88,
  title: 'New Trade Offer',
  message: 'Team Alpha has proposed a trade.',
  metadata: null,
  read: false,
  sentAt: agoIso(30 * 60 * 1000),
  readAt: null,
  createdAt: agoIso(30 * 60 * 1000),
};

async function mockDropdownNotifications(
  page: import('@playwright/test').Page,
  notifications: MockNotification[],
) {
  // The HomePage (`/`) opens the first-run onboarding tutorial for a user with
  // no leagues, whose full-screen modal overlay intermittently intercepts the
  // notifications-trigger click (flaky under parallel load). Mark onboarding
  // complete so the welcome modal never mounts during these navigation tests.
  await page.addInitScript(() => {
    window.localStorage.setItem('ls_onboarding_complete', 'true');
  });

  await page.route(isGraphQLEndpoint, async (route) => {
    // Match on the exact GraphQL operationName to avoid accidental
    // substring collisions (e.g. `getNotificationHistory` matching a
    // hypothetical `getNotificationHistoryDetails`).
    const operationName = extractOperationName(route);

    if (operationName === 'GetNotificationHistory') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getNotificationHistory: notifications },
        }),
      });
    } else if (operationName === 'GetUnreadNotificationCount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getUnreadNotificationCount: notifications.filter((n) => !n.read)
              .length,
          },
        }),
      });
    } else if (operationName === 'MarkNotificationAsRead') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { markNotificationAsRead: true },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('NotificationDropdown – click navigation @regression', () => {
  test('clicking a matchup notification navigates to /matchup/:matchupId and closes the dropdown', async ({
    page,
    notificationsPage,
    isMobile,
  }) => {
    // Desktop-only affordance at the mobile viewport — exposed by the
    // LS-9658 full mobile sweep (LS-9660).
    test.skip(
      isMobile,
      'drives the desktop notification-bell dropdown, hidden at the mobile viewport (notifications-page.spec.ts covers the mobile surface; LS-9693)',
    );
    await mockDropdownNotifications(page, [MATCHUP_NOTIFICATION]);
    await page.goto('/');
    await page.waitForLoadState('load');

    await notificationsPage.openBellDropdown();

    await notificationsPage.expectDropdownItem(MATCHUP_NOTIFICATION.id);
    await notificationsPage.clickDropdownItem(MATCHUP_NOTIFICATION.id);

    // Dropdown closes (the item is no longer in the DOM).
    await notificationsPage.expectDropdownItemHidden(MATCHUP_NOTIFICATION.id);

    // URL navigated to the matchup redirect route.
    await expect(page).toHaveURL(
      new RegExp(`/matchup/${MATCHUP_NOTIFICATION.matchupId}$`),
    );
  });

  test('clicking a trade notification navigates to the trade center', async ({
    page,
    notificationsPage,
    isMobile,
  }) => {
    // Desktop-only affordance at the mobile viewport — exposed by the
    // LS-9658 full mobile sweep (LS-9660).
    test.skip(
      isMobile,
      'drives the desktop notification-bell dropdown, hidden at the mobile viewport (notifications-page.spec.ts covers the mobile surface; LS-9693)',
    );
    await mockDropdownNotifications(page, [TRADE_NOTIFICATION]);
    await page.goto('/');
    await page.waitForLoadState('load');

    await notificationsPage.openBellDropdown();

    await notificationsPage.expectDropdownItem(TRADE_NOTIFICATION.id);
    await notificationsPage.clickDropdownItem(TRADE_NOTIFICATION.id);

    await expect(page).toHaveURL(
      new RegExp(`/trade-center\\?leagueId=${TRADE_NOTIFICATION.leagueId}$`),
    );
  });

  test('clicking a trade notification with a tradeOfferId navigates to the trade center with offerId param', async ({
    page,
    notificationsPage,
    isMobile,
  }) => {
    // Desktop-only affordance at the mobile viewport — exposed by the
    // LS-9658 full mobile sweep (LS-9660).
    test.skip(
      isMobile,
      'drives the desktop notification-bell dropdown, hidden at the mobile viewport (notifications-page.spec.ts covers the mobile surface; LS-9693)',
    );
    const tradeNotificationWithOffer: MockNotification = {
      ...TRADE_NOTIFICATION,
      id: 1003,
      tradeOfferId: 42,
    };
    await mockDropdownNotifications(page, [tradeNotificationWithOffer]);
    await page.goto('/');
    await page.waitForLoadState('load');

    await notificationsPage.openBellDropdown();

    await notificationsPage.expectDropdownItem(tradeNotificationWithOffer.id);
    await notificationsPage.clickDropdownItem(tradeNotificationWithOffer.id);

    await expect(page).toHaveURL(
      new RegExp(
        `/trade-center\\?leagueId=${tradeNotificationWithOffer.leagueId}&offerId=${tradeNotificationWithOffer.tradeOfferId}$`,
      ),
    );
  });
});
