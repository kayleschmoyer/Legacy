/**
 * On This Day Feed E2E Tests
 *
 * Validates the "On This Day in Baseball History" feed rendered on the home
 * page (/). Tests cover:
 *   - Batting entry rendering and player navigation
 *   - Pitching entry rendering
 *   - Transactions & Signings section
 *   - Empty state message
 *   - Error state message
 *
 * Both GraphQL operations (GetOnThisDay + GetOnThisDayEvents) are mocked so
 * no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function battingEntry(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'OnThisDayEntry',
    entryType: 'batting',
    playerId: 101,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    season: 1927,
    gameIdentifier: 'NYA192709300',
    homeRuns: 2,
    rbi: 4,
    hits: 3,
    doubles: 1,
    triples: 0,
    atBats: 4,
    baseOnBalls: 1,
    runs: 2,
    strikeouts: 0,
    inningsPitched: null,
    earnedRuns: null,
    saves: null,
    wins: null,
    hitsAllowed: null,
    walksAllowed: null,
    ...overrides,
  };
}

function pitchingEntry(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'OnThisDayEntry',
    entryType: 'pitching',
    playerId: 202,
    firstName: 'Bob',
    lastName: 'Gibson',
    brefId: 'gibsobo01',
    season: 1968,
    gameIdentifier: 'SLN196808010',
    homeRuns: null,
    rbi: null,
    hits: null,
    doubles: null,
    triples: null,
    atBats: null,
    baseOnBalls: null,
    runs: null,
    strikeouts: 17,
    inningsPitched: 9.0,
    earnedRuns: 0,
    saves: null,
    wins: 1,
    hitsAllowed: 4,
    walksAllowed: 2,
    ...overrides,
  };
}

function transactionEvent(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'OnThisDayEvent',
    id: 1,
    year: 2000,
    eventType: 'TR',
    description: 'Traded to the Yankees for prospects.',
    playerName: 'Roger Clemens',
    fromTeam: 'BOS',
    toTeam: 'NYA',
    ...overrides,
  };
}

/**
 * Install route mocks for both OnThisDay GraphQL operations.
 * Call inside test.beforeEach or at the start of each test.
 */
async function mockOnThisDay(
  page: import('@playwright/test').Page,
  options: {
    entries?: ReturnType<typeof battingEntry>[];
    events?: ReturnType<typeof transactionEvent>[];
    entriesError?: boolean;
  } = {},
) {
  const {
    entries = [battingEntry()],
    events = [],
    entriesError = false,
  } = options;

  await page.route(
    (url) =>
      url.toString().includes('/graphql') && !url.toString().includes('/@fs/'),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('getonthisday') && !postData.includes('events')) {
        if (entriesError) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { onThisDay: null },
              errors: [{ message: 'Failed to load historical data' }],
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { onThisDay: entries } }),
          });
        }
      } else if (postData.includes('getonthisdayevents')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { onThisDayEvents: events } }),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('On This Day Feed @smoke', () => {
  test('renders the "On This Day" section heading on the home page', async ({
    page,
  }) => {
    await mockOnThisDay(page);
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(
      page.getByText('On This Day', { exact: true }).first(),
    ).toBeVisible();
  });

  test('displays a batting entry with player name and stat summary', async ({
    page,
  }) => {
    await mockOnThisDay(page, {
      entries: [battingEntry()],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    // Player name should appear
    await expect(page.getByText('Babe Ruth')).toBeVisible();

    // Season badge
    await expect(page.getByText('1927')).toBeVisible();

    // Batting stat summary (hits-for-atBats pattern)
    await expect(page.getByText(/3-for-4/)).toBeVisible();
  });

  test('displays a pitching entry with IP and strikeout summary', async ({
    page,
  }) => {
    await mockOnThisDay(page, {
      entries: [pitchingEntry()],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.getByText('Bob Gibson')).toBeVisible();
    await expect(page.getByText('1968')).toBeVisible();

    // Pitching summary includes innings pitched and strikeouts
    await expect(page.getByText(/9.*IP/)).toBeVisible();
    await expect(page.getByText(/17.*K/)).toBeVisible();
  });

  test('renders multiple entries in a list', async ({ page }) => {
    await mockOnThisDay(page, {
      entries: [
        battingEntry({ playerId: 101, firstName: 'Babe', lastName: 'Ruth' }),
        pitchingEntry({ playerId: 202, firstName: 'Bob', lastName: 'Gibson' }),
      ],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.getByText('Babe Ruth')).toBeVisible();
    await expect(page.getByText('Bob Gibson')).toBeVisible();
  });
});

test.describe('On This Day Feed — Transactions @smoke', () => {
  test('shows the Transactions & Signings section when events are present', async ({
    page,
  }) => {
    await mockOnThisDay(page, {
      entries: [],
      events: [transactionEvent()],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/transactions.*signings/i).first(),
    ).toBeVisible();

    // Player name and event description
    await expect(page.getByText('Roger Clemens')).toBeVisible();
    await expect(
      page.getByText(/traded to the yankees/i).first(),
    ).toBeVisible();

    // Year badge in the event row
    await expect(page.getByText(/Trade.*2000/)).toBeVisible();
  });

  test('shows a signing event with the correct label', async ({ page }) => {
    await mockOnThisDay(page, {
      entries: [],
      events: [
        transactionEvent({
          eventType: 'SFA',
          description: 'Signed as a free agent.',
          playerName: 'Alex Rodriguez',
          year: 2001,
        }),
      ],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.getByText('Alex Rodriguez')).toBeVisible();
    await expect(page.getByText(/Signed.*2001/)).toBeVisible();
  });
});

test.describe('On This Day Feed — Empty & Error States @regression', () => {
  test('shows empty state message when no entries or events are returned', async ({
    page,
  }) => {
    await mockOnThisDay(page, { entries: [], events: [] });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/no notable performances found/i).first(),
    ).toBeVisible();
  });

  test('shows error message when the query fails', async ({ page }) => {
    await mockOnThisDay(page, { entriesError: true, events: [] });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/could not load historical data/i).first(),
    ).toBeVisible();
  });
});

test.describe('On This Day Feed — Player Navigation @regression', () => {
  test('clicking a batting entry row navigates to the player profile page', async ({
    page,
  }) => {
    await mockOnThisDay(page, {
      entries: [battingEntry({ playerId: 101 })],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    // Wait for the entry to be visible
    const entryRow = page.getByRole('link', {
      name: /view babe ruth profile/i,
    });
    await expect(entryRow).toBeVisible();

    await entryRow.click();
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/players\/101/);
  });
});
