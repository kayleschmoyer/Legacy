/**
 * Notifications Page E2E (LS-4583)
 *
 * Hermetic coverage for the redesigned /notifications route:
 *   - populated: list of notification cards renders with title + message text
 *   - empty:     empty-state copy ("No notifications yet") renders
 *   - error:     error-state copy + retry button render
 *
 * All GraphQL traffic is mocked via route.fulfill — no live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const PAGE_SIZE = 20;

/** Generate N mock notification items starting from a given id offset. */
function makeMockNotifications(
  count: number,
  idOffset = 200,
): typeof MOCK_NOTIFICATIONS {
  return Array.from({ length: count }, (_, i) => ({
    __typename: 'NotificationHistoryItem' as const,
    id: idOffset + i,
    userId: 1,
    notificationType: 'MATCHUP_STARTED',
    channel: 'push',
    matchupId: 100 + i,
    leagueId: 10,
    title: `Matchup ${idOffset + i}`,
    message: `Message for notification ${idOffset + i}.`,
    metadata: null,
    read: false,
    sentAt: agoIso((i + 1) * 60 * 1000),
    readAt: null,
    createdAt: agoIso((i + 1) * 60 * 1000),
  }));
}

const MOCK_NOTIFICATIONS = [
  {
    __typename: 'NotificationHistoryItem',
    id: 101,
    userId: 1,
    notificationType: 'MATCHUP_STARTED',
    channel: 'push',
    matchupId: 100,
    leagueId: 10,
    title: 'Week 5 matchup started',
    message: 'Your matchup against Beantown Bombers has begun.',
    metadata: null,
    read: false,
    sentAt: agoIso(30 * 60 * 1000),
    readAt: null,
    createdAt: agoIso(30 * 60 * 1000),
  },
  {
    __typename: 'NotificationHistoryItem',
    id: 102,
    userId: 1,
    notificationType: 'MATCHUP_ENDED',
    channel: 'push',
    matchupId: 99,
    leagueId: 10,
    title: 'Week 4 matchup complete',
    message: 'You won 112.3 to 98.1 against Sandlot Kings.',
    metadata: null,
    read: true,
    sentAt: agoIso(2 * 24 * 60 * 60 * 1000),
    readAt: agoIso(24 * 60 * 60 * 1000),
    createdAt: agoIso(2 * 24 * 60 * 60 * 1000),
  },
];

async function mockNotifications(
  page: import('@playwright/test').Page,
  opts: { empty?: boolean; historyError?: boolean; unreadCount?: number } = {},
) {
  const { empty = false, historyError = false, unreadCount = 2 } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getnotificationhistory')) {
      if (historyError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load notification history' }],
            data: { getNotificationHistory: null },
          }),
        });
      } else if (empty) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getNotificationHistory: [] } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getNotificationHistory: MOCK_NOTIFICATIONS },
          }),
        });
      }
      return;
    }

    if (postData.includes('getunreadnotificationcount')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getUnreadNotificationCount: empty ? 0 : unreadCount },
        }),
      });
      return;
    }

    await unmockedGraphQLFallback(route);
  });
}

test.describe('Notifications page — /notifications @regression', () => {
  test('renders populated state with notification cards', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/notifications');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Notifications' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Week 5 matchup started' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Week 4 matchup complete' }),
    ).toBeVisible();
    await expect(
      page.getByText('Your matchup against Beantown Bombers has begun.'),
    ).toBeVisible();

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('renders empty state when no notifications', async ({ page }) => {
    await mockNotifications(page, { empty: true });
    await page.goto('/notifications');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { level: 2, name: 'No notifications yet' }),
    ).toBeVisible();
    await expect(page.locator('body')).toContainText('You’re all caught up');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('renders error state with retry button when query fails', async ({
    page,
  }) => {
    await mockNotifications(page, { historyError: true });
    await page.goto('/notifications');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Unable to load your notifications',
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('enables Next button when server returns PAGE_SIZE+1 items', async ({
    page,
  }) => {
    // PAGE_SIZE+1 items means a next page exists.
    const items = makeMockNotifications(PAGE_SIZE + 1);
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('getnotificationhistory')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getNotificationHistory: items } }),
        });
        return;
      }
      if (postData.includes('getunreadnotificationcount')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getUnreadNotificationCount: 0 } }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/notifications');
    await page.waitForLoadState('load');

    const nextBtn = page.getByRole('button', { name: 'Next page' });
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toBeEnabled();
  });

  test('disables Next button when server returns exactly PAGE_SIZE items (regression LS-4096)', async ({
    page,
  }) => {
    // Exactly PAGE_SIZE items means we are on the last page. The old code
    // incorrectly inferred hasNextPage=true from notifications.length===PAGE_SIZE.
    const items = makeMockNotifications(PAGE_SIZE);
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('getnotificationhistory')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getNotificationHistory: items } }),
        });
        return;
      }
      if (postData.includes('getunreadnotificationcount')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getUnreadNotificationCount: 0 } }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/notifications');
    await page.waitForLoadState('load');

    const nextBtn = page.getByRole('button', { name: 'Next page' });
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toBeDisabled();
  });
});
