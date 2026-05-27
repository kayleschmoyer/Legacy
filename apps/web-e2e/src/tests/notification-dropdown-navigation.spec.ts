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

import { expect, test } from '../fixtures/auth-enhanced';
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
  }) => {
    await mockDropdownNotifications(page, [MATCHUP_NOTIFICATION]);
    await page.goto('/');
    await page.waitForLoadState('load');

    const trigger = page.getByTestId('notifications-trigger');
    await trigger.click();

    const item = page.getByTestId(
      `notification-item-${MATCHUP_NOTIFICATION.id}`,
    );
    await expect(item).toBeVisible();
    await item.click();

    // Dropdown closes (the item is no longer in the DOM).
    await expect(item).toBeHidden();

    // URL navigated to the matchup redirect route.
    await expect(page).toHaveURL(
      new RegExp(`/matchup/${MATCHUP_NOTIFICATION.matchupId}$`),
    );
  });

  test('clicking a trade notification navigates to the league trades tab', async ({
    page,
  }) => {
    await mockDropdownNotifications(page, [TRADE_NOTIFICATION]);
    await page.goto('/');
    await page.waitForLoadState('load');

    await page.getByTestId('notifications-trigger').click();

    const item = page.getByTestId(`notification-item-${TRADE_NOTIFICATION.id}`);
    await expect(item).toBeVisible();
    await item.click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${TRADE_NOTIFICATION.leagueId}/trades$`),
    );
  });
});
