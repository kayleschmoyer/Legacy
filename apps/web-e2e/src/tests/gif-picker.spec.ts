/**
 * GIF Picker E2E Tests (LS-687)
 *
 * Tests the GifPicker component embedded in the League Chat tab
 * on the Overview page at /baseball/league/:id/overview.
 *
 * The Chat sub-tab is one of three in the overview card (Activity | Chat | Scoring).
 * The GIF button has aria-label="Open GIF picker".
 * The Giphy API (non-GraphQL) is intercepted via page.route().
 *
 * All GraphQL queries and Giphy API calls are mocked.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test GIF League',
  description: null,
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 3,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_CHAT_MESSAGES = [
  {
    __typename: 'LeagueChatMessage',
    id: '1',
    userId: 1,
    messageText: 'Hello league!',
    timestamp: agoIso(1_800_000),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { __typename: 'User', username: 'manager1', avatarUrl: null },
  },
];

/** A minimal Giphy API response with one GIF */
const MOCK_GIPHY_RESPONSE = {
  data: [
    {
      id: 'giphy-cat-001',
      title: 'Funny Cat',
      images: {
        fixed_height_small: {
          url: 'https://media.giphy.com/media/giphy-cat-001/giphy_s.gif',
          width: '100',
          height: '75',
        },
        downsized: {
          url: 'https://media.giphy.com/media/giphy-cat-001/giphy-downsized.gif',
          width: '200',
          height: '150',
        },
        original: {
          url: 'https://media.giphy.com/media/giphy-cat-001/giphy.gif',
          width: '400',
          height: '300',
        },
      },
    },
    {
      id: 'giphy-dog-002',
      title: 'Happy Dog',
      images: {
        fixed_height_small: {
          url: 'https://media.giphy.com/media/giphy-dog-002/giphy_s.gif',
          width: '100',
          height: '80',
        },
        downsized: {
          url: 'https://media.giphy.com/media/giphy-dog-002/giphy-downsized.gif',
          width: '200',
          height: '160',
        },
        original: {
          url: 'https://media.giphy.com/media/giphy-dog-002/giphy.gif',
          width: '400',
          height: '320',
        },
      },
    },
  ],
  meta: { status: 200 },
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function mockGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (
      postData.includes('getleaguechatmessages') ||
      postData.includes('getleaguemessages')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getLeagueMessages: MOCK_CHAT_MESSAGES },
        }),
      });
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (
      postData.includes('getleagueactivity') ||
      postData.includes('leagueactivity')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (
      postData.includes('getuserleagues') ||
      postData.includes('getusers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: [] } }),
      });
    } else if (postData.includes('getteammembers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (
      postData.includes('getcurrentmatchup') ||
      postData.includes('getmatchupbyid') ||
      postData.includes('getmatchupsforleague') ||
      postData.includes('getmatchupplayers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (
      postData.includes('getleaguestandings') ||
      postData.includes('leaguestandings')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      postData.includes('getpendingtradeoffers') ||
      postData.includes('pendingtradeoffers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else if (
      postData.includes('getleaguescoring') ||
      postData.includes('leaguescoringprofile')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else {
      // Fall back to the shared baseline mocks in the _apiIsolation fixture.
      // Do NOT use route.continue() — there is no backend in CI.
      await unmockedGraphQLFallback(route);
    }
  });
}

async function mockGiphy(
  page: import('@playwright/test').Page,
  opts: { empty?: boolean } = {},
): Promise<void> {
  await page.route(
    (url) => url.hostname === 'api.giphy.com',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          opts.empty
            ? { data: [], meta: { status: 200 } }
            : MOCK_GIPHY_RESPONSE,
        ),
      });
    },
  );
}

/**
 * In CI the production build has VITE_GIPHY_API_KEY="" (not set at build
 * time), so GifPicker early-exits with an error.  Inject a runtime override
 * via window.__e2eGiphyApiKey before any page scripts run.
 */
async function injectGiphyApiKey(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.addInitScript(() => {
    window.__e2eGiphyApiKey = 'e2e-fake-giphy-key';
  });
}

/** Navigate to overview, switch to Chat sub-tab */
async function goToLeagueChatTab(
  page: import('@playwright/test').Page,
): Promise<void> {
  await injectGiphyApiKey(page);
  await page.goto('/baseball/league/1/overview');
  await page.waitForLoadState('load');
  // Click the "Chat" sub-tab inside the overview card
  await page.getByText('Chat').first().click();
  // Wait for the message input to confirm the chat area loaded
  await expect(page.getByPlaceholder(/message/i).first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('GIF Picker — navigation to chat @smoke', () => {
  test('opens chat sub-tab without errors', async ({ page }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await injectGiphyApiKey(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByText('Chat').first().click();

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows GIF toggle button in the chat input area', async ({ page }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page);

    await expect(
      page.getByRole('button', { name: /open gif picker/i }),
    ).toBeVisible();
  });
});

test.describe('GIF Picker — open and close @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page);
  });

  test('clicking GIF button shows "GIF Search" heading', async ({ page }) => {
    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();
  });

  test('GIF picker shows search input after opening', async ({ page }) => {
    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByPlaceholder(/search gifs/i)).toBeVisible();
  });

  test('GIF picker shows G rating button', async ({ page }) => {
    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();

    // G and PG rating buttons are in the header row
    const buttons = page.locator('button');
    await expect(buttons.filter({ hasText: 'G' }).first()).toBeVisible();
  });

  test('GIF picker shows PG rating button', async ({ page }) => {
    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();

    const buttons = page.locator('button');
    await expect(buttons.filter({ hasText: 'PG' }).first()).toBeVisible();
  });

  test('close button dismisses the GIF picker', async ({ page }) => {
    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();

    await page.getByRole('button', { name: /close gif picker/i }).click();
    await expect(page.getByText('GIF Search')).not.toBeVisible();
  });
});

test.describe('GIF Picker — GIF grid @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page);
    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();
  });

  test('shows GIF buttons with "Send GIF:" aria-label after Giphy load', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: /^Send GIF:/i }).first(),
    ).toBeVisible();
  });

  test('shows the mocked GIF title in aria-label', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Send GIF: Funny Cat' }),
    ).toBeVisible();
  });

  test('shows multiple GIFs from mock response', async ({ page }) => {
    const gifButtons = page.getByRole('button', { name: /^Send GIF:/i });
    await expect(gifButtons).toHaveCount(2);
  });
});

test.describe('GIF Picker — empty state @regression', () => {
  test('shows "No GIFs found" when Giphy returns empty results', async ({
    page,
  }) => {
    await mockGraphQL(page);
    await mockGiphy(page, { empty: true });
    await goToLeagueChatTab(page);

    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();

    await expect(page.getByText('No GIFs found')).toBeVisible();
  });
});

test.describe('GIF Picker — "Powered by GIPHY" footer @regression', () => {
  test('shows GIPHY attribution text when open', async ({ page }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page);

    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText(/Powered by GIPHY/i)).toBeVisible();
  });
});

test.describe('GIF Picker — Cancel button @regression', () => {
  test('Cancel button closes the picker', async ({ page }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page);

    await page.getByRole('button', { name: /open gif picker/i }).click();
    await expect(page.getByText('GIF Search')).toBeVisible();

    // The footer Cancel button also calls onClose
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(page.getByText('GIF Search')).not.toBeVisible();
  });
});
