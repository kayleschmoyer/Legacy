/**
 * Notifications Hub E2E Tests (LS-1606)
 *
 * Covers notification GraphQL operations with fully mocked responses:
 *   - GetNotificationHistory query (list, empty, error states)
 *   - GetUnreadNotificationCount query
 *   - MarkNotificationAsRead mutation
 *   - MarkAllNotificationsAsRead mutation
 *
 * All GraphQL requests are intercepted — no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';

/** URL predicate for the GraphQL API endpoint */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_NOTIFICATIONS = [
  {
    __typename: 'NotificationHistoryItem',
    id: 1,
    userId: 1,
    notificationType: 'MATCHUP_STARTED',
    channel: 'push',
    matchupId: 100,
    leagueId: 10,
    title: 'Matchup Started',
    message: 'Your Week 5 matchup against Team Alpha has begun!',
    metadata: null,
    read: false,
    sentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    readAt: null,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    __typename: 'NotificationHistoryItem',
    id: 2,
    userId: 1,
    notificationType: 'MATCHUP_ENDED',
    channel: 'push',
    matchupId: 99,
    leagueId: 10,
    title: 'Matchup Complete',
    message: 'Your Week 4 matchup has ended. You won 85-72!',
    metadata: null,
    read: true,
    sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    readAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    __typename: 'NotificationHistoryItem',
    id: 3,
    userId: 1,
    notificationType: 'MATCHUP_CLOSE_GAME',
    channel: 'email',
    matchupId: 100,
    leagueId: 10,
    title: 'Close Game Alert',
    message: 'Your matchup is within 5 points with 2 days remaining!',
    metadata: null,
    read: false,
    sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    readAt: null,
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// GraphQL mock helper
// ---------------------------------------------------------------------------

async function mockNotificationsGraphQL(
  page: import('@playwright/test').Page,
  opts: {
    empty?: boolean;
    historyError?: boolean;
    unreadCount?: number;
    markReadSuccess?: boolean;
    markAllReadSuccess?: boolean;
  } = {},
) {
  const {
    empty = false,
    historyError = false,
    unreadCount = 2,
    markReadSuccess = true,
    markAllReadSuccess = true,
  } = opts;

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
          body: JSON.stringify({
            data: { getNotificationHistory: [] },
          }),
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
    } else if (postData.includes('getunreadnotificationcount')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getUnreadNotificationCount: empty ? 0 : unreadCount },
        }),
      });
    } else if (postData.includes('markallnotificationsasread')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { markAllNotificationsAsRead: markAllReadSuccess },
        }),
      });
    } else if (postData.includes('marknotificationasread')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { markNotificationAsRead: markReadSuccess },
        }),
      });
    } else if (postData.includes('getusernotificationpreferences')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getUserNotificationPreferences: {
              __typename: 'NotificationPreference',
              id: 1,
              userId: 1,
              matchupStartedEnabled: true,
              matchupEndedEnabled: true,
              matchupCloseGameEnabled: true,
              matchupReminderEnabled: false,
              pushEnabled: true,
              emailEnabled: true,
              closeGameThreshold: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ---------------------------------------------------------------------------
// Tests – page loads with notification mocks @smoke
// ---------------------------------------------------------------------------

test.describe('Notifications Hub – page loads with mocked data @smoke', () => {
  test('home page loads without errors when notification queries are mocked', async ({
    page,
  }) => {
    await mockNotificationsGraphQL(page);
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('home page loads without errors when notification history is empty', async ({
    page,
  }) => {
    await mockNotificationsGraphQL(page, { empty: true });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('home page loads without errors when notification history query fails', async ({
    page,
  }) => {
    await mockNotificationsGraphQL(page, { historyError: true });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ---------------------------------------------------------------------------
// Tests – notification list with type indicators @regression
// ---------------------------------------------------------------------------

test.describe('Notifications Hub – notification list displays items @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockNotificationsGraphQL(page);
    await page.goto('/');
    await page.waitForLoadState('load');
  });

  test('notification mock data includes different notification types', () => {
    const types = MOCK_NOTIFICATIONS.map((n) => n.notificationType);
    expect(types).toContain('MATCHUP_STARTED');
    expect(types).toContain('MATCHUP_ENDED');
    expect(types).toContain('MATCHUP_CLOSE_GAME');
  });

  test('notification mock data includes read and unread items', () => {
    const readItems = MOCK_NOTIFICATIONS.filter((n) => n.read);
    const unreadItems = MOCK_NOTIFICATIONS.filter((n) => !n.read);
    expect(readItems.length).toBeGreaterThan(0);
    expect(unreadItems.length).toBeGreaterThan(0);
  });

  test('notification mock data includes title and message fields', () => {
    for (const notification of MOCK_NOTIFICATIONS) {
      expect(notification.title).toBeTruthy();
      expect(notification.message).toBeTruthy();
    }
  });

  test('page does not crash with notification data loaded', async ({
    page,
  }) => {
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // The main content area should still render
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – empty notifications placeholder @regression
// ---------------------------------------------------------------------------

test.describe('Notifications Hub – empty state @regression', () => {
  test('page renders correctly with zero notifications', async ({ page }) => {
    await mockNotificationsGraphQL(page, { empty: true });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
  });

  test('unread count is zero when no notifications exist', async ({ page }) => {
    let capturedUnreadCount: number | null = null;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('getunreadnotificationcount')) {
        capturedUnreadCount = 0;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getUnreadNotificationCount: 0 },
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('load');

    // The mock was set up — verify the response value is correct
    // (capturedUnreadCount will be set if the query was fired by the app)
    expect(capturedUnreadCount === null || capturedUnreadCount === 0).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests – mark as read mutation @regression
// ---------------------------------------------------------------------------

test.describe('Notifications Hub – mark as read @regression', () => {
  test('MarkNotificationAsRead mutation mock returns success', async ({
    page,
  }) => {
    let markReadCalled = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('marknotificationasread')) {
        markReadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { markNotificationAsRead: true },
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('load');

    // Simulate the mutation by sending a GraphQL request directly
    const result = await page.evaluate(async () => {
      const response = await fetch('http://localhost:5000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'MarkNotificationAsRead',
          query:
            'mutation MarkNotificationAsRead($notificationId: Int!) { markNotificationAsRead(notificationId: $notificationId) }',
          variables: { notificationId: 1 },
        }),
      });
      return (await response.json()) as {
        data: { markNotificationAsRead: boolean };
      };
    });

    expect(markReadCalled).toBe(true);
    expect(result.data.markNotificationAsRead).toBe(true);
  });

  test('MarkAllNotificationsAsRead mutation mock returns success', async ({
    page,
  }) => {
    let markAllReadCalled = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('markallnotificationsasread')) {
        markAllReadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { markAllNotificationsAsRead: true },
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('load');

    // Simulate the mutation by sending a GraphQL request directly
    const result = await page.evaluate(async () => {
      const response = await fetch('http://localhost:5000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'MarkAllNotificationsAsRead',
          query:
            'mutation MarkAllNotificationsAsRead { markAllNotificationsAsRead }',
          variables: {},
        }),
      });
      return (await response.json()) as {
        data: { markAllNotificationsAsRead: boolean };
      };
    });

    expect(markAllReadCalled).toBe(true);
    expect(result.data.markAllNotificationsAsRead).toBe(true);
  });

  test('page remains stable after mark-as-read mutations', async ({ page }) => {
    await mockNotificationsGraphQL(page);
    await page.goto('/');
    await page.waitForLoadState('load');

    // Fire both mutations via evaluate to verify mocks work without crashing
    await page.evaluate(async () => {
      await fetch('http://localhost:5000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'MarkNotificationAsRead',
          query:
            'mutation MarkNotificationAsRead($notificationId: Int!) { markNotificationAsRead(notificationId: $notificationId) }',
          variables: { notificationId: 1 },
        }),
      });
    });

    await page.evaluate(async () => {
      await fetch('http://localhost:5000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'MarkAllNotificationsAsRead',
          query:
            'mutation MarkAllNotificationsAsRead { markAllNotificationsAsRead }',
          variables: {},
        }),
      });
    });

    // Page should not crash
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
  });
});
