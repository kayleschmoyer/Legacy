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
 *
 * Element access goes through the injected `leaguePage` semantic object
 * (LS-8096 / ADR-0015) — the spec is selector-free; GraphQL/Giphy mocks stay
 * inline (ADR-0015 §6).
 */

import { test } from '../fixtures/pages';
import type { LeaguePage } from '../pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { hostMatcher } from '../utils/route-matchers';

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
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operation === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (
      operation === 'getleaguechatmessages' ||
      operation === 'getleaguemessages'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getLeagueMessages: MOCK_CHAT_MESSAGES },
        }),
      });
    } else if (operation === 'getleagueannouncements') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (operation === 'getleagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (operation === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: [] } }),
      });
    } else if (operation === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (
      operation === 'getmatchupbyid' ||
      operation === 'getmatchupsforleague' ||
      operation === 'getmatchupplayers'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (operation === 'getleaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      operation === 'getleaguescoringprofile' ||
      operation === 'updateleaguescoringprofile'
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

/**
 * A 1×1 transparent GIF, used to fulfil the thumbnail image requests the
 * GifPicker fires against media.giphy.com after the search/trending response
 * loads.  Without this, those <img> requests fall through to the API-isolation
 * catch-all (HTTP 401 "Blocked by E2E API isolation"), the browser fires the
 * <img onError> handler, and every GIF button flips to the disabled "Image
 * unavailable" state — racing the test's "Send GIF:" assertions and flaking
 * non-deterministically (LS-7703).
 */
const ONE_BY_ONE_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

async function mockGiphy(
  page: import('@playwright/test').Page,
  opts: { empty?: boolean } = {},
): Promise<void> {
  await page.route(hostMatcher('api.giphy.com'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        opts.empty ? { data: [], meta: { status: 200 } } : MOCK_GIPHY_RESPONSE,
      ),
    });
  });

  // Serve the GIF thumbnails themselves so the <img> elements load
  // successfully and the buttons stay in their "Send GIF:" state. Tests that
  // exercise the broken-thumbnail fallback register their own media.giphy.com
  // route *after* this one, which takes precedence (Playwright matches routes
  // in LIFO order).
  await page.route(hostMatcher('media.giphy.com'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: ONE_BY_ONE_GIF,
    });
  });
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
  leaguePage: LeaguePage,
): Promise<void> {
  await injectGiphyApiKey(page);
  await leaguePage.gotoDetail(1, 'overview');
  // Click the "Chat" sub-tab inside the overview card
  await leaguePage.openTab('Chat', { exact: true });
  // Wait for the message input to confirm the chat area loaded
  await leaguePage.chatInput.expectVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('GIF Picker — navigation to chat @smoke', () => {
  test('opens chat sub-tab without errors', async ({ page, leaguePage }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await injectGiphyApiKey(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.openTab('Chat', { exact: true });

    await leaguePage.expectNoAppError();
  });

  test('shows GIF toggle button in the chat input area', async ({
    page,
    leaguePage,
  }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page, leaguePage);

    await leaguePage.button(/open gif picker/i).expectVisible();
  });
});

test.describe('GIF Picker — open and close @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page, leaguePage);
  });

  test('clicking GIF button shows "GIF Search" heading', async ({
    leaguePage,
  }) => {
    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();
  });

  test('GIF picker shows search input after opening', async ({
    leaguePage,
  }) => {
    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.placeholder(/search gifs/i).expectVisible();
  });

  test('GIF picker shows G rating button', async ({ leaguePage }) => {
    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();

    // G and PG rating buttons are in the header row. exact:true avoids
    // substring collisions with unrelated buttons whose accessible name
    // contains "G" (e.g. a league-switcher chip labeled "Test GIF League"),
    // which .filter({hasText: 'G'}).first() picked up depending on DOM
    // order at narrower viewports (LS-9493).
    await leaguePage.button('G', { exact: true }).expectVisible();
  });

  test('GIF picker shows PG rating button', async ({ leaguePage }) => {
    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();

    await leaguePage.button('PG', { exact: true }).expectVisible();
  });

  test('close button dismisses the GIF picker', async ({ leaguePage }) => {
    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();

    await leaguePage.button(/close gif picker/i).tap();
    await leaguePage.text('GIF Search').expectHidden();
  });
});

test.describe('GIF Picker — GIF grid @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page, leaguePage);
    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();
    // Wait for the GIF grid to populate before individual tests start asserting.
    // GifPicker fires two trending fetches on mount (Effect 1 immediately, Effect 2
    // after a 400 ms debounce). The debounced re-fetch sets loading=true, which
    // temporarily removes GIF buttons from the DOM. Waiting here ensures beforeEach
    // only returns once at least one GIF button is visible, so the test body never
    // races against the loading window (LS-5987).
    await leaguePage
      .button(/^Send GIF:/i)
      .first()
      .expectVisible();
  });

  test('shows GIF buttons with "Send GIF:" aria-label after Giphy load', async ({
    leaguePage,
  }) => {
    await leaguePage
      .button(/^Send GIF:/i)
      .first()
      .expectVisible();
  });

  test('shows the mocked GIF title in aria-label', async ({ leaguePage }) => {
    await leaguePage.button('Send GIF: Funny Cat').expectVisible();
  });

  test('shows multiple GIFs from mock response', async ({ leaguePage }) => {
    await leaguePage.button(/^Send GIF:/i).expectCount(2);
  });
});

test.describe('GIF Picker — empty state @regression', () => {
  test('shows "No GIFs found" when Giphy returns empty results', async ({
    page,
    leaguePage,
  }) => {
    await mockGraphQL(page);
    await mockGiphy(page, { empty: true });
    await goToLeagueChatTab(page, leaguePage);

    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();

    await leaguePage.text('No GIFs found').expectVisible();
  });
});

test.describe('GIF Picker — broken thumbnail fallback @regression', () => {
  test('shows "Image unavailable" placeholder when GIF thumbnail fails to load (LS-4106)', async ({
    page,
    leaguePage,
  }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    // Make every Giphy media thumbnail fail (simulates CDN/CORS failure).
    await page.route(hostMatcher('media.giphy.com'), async (route) => {
      await route.fulfill({ status: 404, body: '' });
    });
    await goToLeagueChatTab(page, leaguePage);

    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();

    // Placeholder text replaces the broken thumbnail (both mocked GIFs fail,
    // so the placeholder renders twice — assert the collection's first).
    await leaguePage.text('Image unavailable').first().expectVisible();

    // The failed GIF button is disabled so it cannot be sent.
    const failedButton = leaguePage.button(/^Image unavailable:/i).first();
    await failedButton.expectVisible();
    await failedButton.expectDisabled();
  });
});

test.describe('GIF Picker — "Powered by GIPHY" footer @regression', () => {
  test('shows GIPHY attribution text when open', async ({
    page,
    leaguePage,
  }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page, leaguePage);

    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text(/Powered by GIPHY/i).expectVisible();
  });
});

test.describe('GIF Picker — Cancel button @regression', () => {
  test('Cancel button closes the picker', async ({ page, leaguePage }) => {
    await mockGraphQL(page);
    await mockGiphy(page);
    await goToLeagueChatTab(page, leaguePage);

    await leaguePage.button(/open gif picker/i).tap();
    await leaguePage.text('GIF Search').expectVisible();

    // The footer Cancel button also calls onClose
    await leaguePage.button(/^Cancel$/i).tap();
    await leaguePage.text('GIF Search').expectHidden();
  });
});
