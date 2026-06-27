/**
 * NFL Players — view-mode toggle E2E tests (LS-8016)
 *
 * Verifies the view-mode toggle on /football/players:
 *   1. Stored preference round-trip — preference set in localStorage is re-hydrated
 *      on mount; clicking a toggle persists the new value; reload honours it.
 *   2. Responsive default (desktop) — no stored preference, wide viewport → table.
 *   3. Responsive default (mobile)  — no stored preference, narrow viewport → cards.
 *   4. localStorage-unavailable fallback — when getItem/setItem throw (e.g.
 *      private-browsing), the page renders without crashing and falls back to the
 *      responsive default; toggle interaction also doesn't crash.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/football/players';
const VIEW_MODE_KEY = 'football_players_view_mode';

// Desktop = wider than Tamagui's sm breakpoint (maxWidth 800).
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
// Mobile = within the sm breakpoint (maxWidth 800).
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// ── Shared mock data ──────────────────────────────────────────────────────────

const MAHOMES = {
  __typename: 'FootballPlayer',
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

const ALLEN = {
  __typename: 'FootballPlayer',
  id: 2,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  pfrId: 'AlleJo02',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

function playersResponse() {
  return {
    data: {
      footballPlayers: {
        nodes: [MAHOMES, ALLEN],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

async function mockFootballPlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    footballplayers: (route) => fulfillJson(route, playersResponse()),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Locator for the cards grid container (only present in cards view). */
function cardsContainer(page: import('@playwright/test').Page) {
  return page.getByTestId('player-list-cards');
}

/** Locator for the table container (only present in table view). */
function tableContainer(page: import('@playwright/test').Page) {
  return page.getByTestId('player-list-table');
}

/** Click the "Cards view" toggle button. */
async function clickCardsToggle(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.getByRole('button', { name: 'Cards view' }).click();
}

/** Click the "Table view" toggle button. */
async function clickTableToggle(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.getByRole('button', { name: 'Table view' }).click();
}

// ── 1. Stored preference round-trip ──────────────────────────────────────────

test.describe('view-mode toggle — stored preference round-trip @regression', () => {
  test('pre-seeded cards preference is re-hydrated on initial load', async ({
    page,
  }) => {
    // addInitScript runs before each page script on every navigation,
    // so for round-trip tests that involve reload we avoid using it to seed
    // the view-mode key. Here there is only one navigation, so it is safe.
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, 'cards');
    }, VIEW_MODE_KEY);

    await mockFootballPlayers(page);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(cardsContainer(page)).toBeVisible();
    await expect(tableContainer(page)).not.toBeVisible();
  });

  test('clicking toggle persists preference and reload re-hydrates it', async ({
    page,
  }) => {
    // No view-mode initScript — starts fresh (no key in localStorage).
    // Desktop default is table.
    await mockFootballPlayers(page);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(tableContainer(page)).toBeVisible();

    // Switch to cards — the app calls localStorage.setItem('…', 'cards').
    await clickCardsToggle(page);
    await expect(cardsContainer(page)).toBeVisible();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      VIEW_MODE_KEY,
    );
    expect(stored).toBe('cards');

    // Reload — no initScript touches the view-mode key, so 'cards' survives.
    await page.reload();

    await expect(cardsContainer(page)).toBeVisible();
    await expect(tableContainer(page)).not.toBeVisible();
  });

  test('switching from cards to table updates localStorage', async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, 'cards');
    }, VIEW_MODE_KEY);

    await mockFootballPlayers(page);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(cardsContainer(page)).toBeVisible();

    await clickTableToggle(page);

    await expect(tableContainer(page)).toBeVisible();
    await expect(cardsContainer(page)).not.toBeVisible();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      VIEW_MODE_KEY,
    );
    expect(stored).toBe('table');
  });
});

// ── 2 & 3. Responsive defaults (no stored preference) ────────────────────────

test.describe('view-mode toggle — responsive default @regression', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure no stored preference so the responsive default takes effect.
    // addInitScript is safe here because these tests do not reload.
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key);
    }, VIEW_MODE_KEY);
    await mockFootballPlayers(page);
  });

  test('desktop viewport (>800px) defaults to table view', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(tableContainer(page)).toBeVisible();
    await expect(cardsContainer(page)).not.toBeVisible();
  });

  test('mobile viewport (≤800px) defaults to cards view', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(cardsContainer(page)).toBeVisible();
    await expect(tableContainer(page)).not.toBeVisible();
  });
});

// ── 4. localStorage-unavailable fallback ─────────────────────────────────────

test.describe('view-mode toggle — localStorage unavailable @regression', () => {
  test('page renders without crash when localStorage throws on read', async ({
    page,
  }) => {
    // Override only the view-mode key so auth localStorage reads are unaffected.
    await page.addInitScript((key) => {
      const _get = window.localStorage.getItem.bind(window.localStorage);
      const _set = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.getItem = function (k) {
        if (k === key) throw new DOMException('SecurityError');
        return _get(k);
      };
      window.localStorage.setItem = function (k, v) {
        if (k === key) throw new DOMException('SecurityError');
        return _set(k, v);
      };
    }, VIEW_MODE_KEY);

    await mockFootballPlayers(page);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // On desktop the responsive fallback is table.
    await expect(tableContainer(page)).toBeVisible();
  });

  test('toggle click does not crash when localStorage.setItem throws', async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      const _get = window.localStorage.getItem.bind(window.localStorage);
      const _set = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.getItem = function (k) {
        if (k === key) throw new DOMException('SecurityError');
        return _get(k);
      };
      window.localStorage.setItem = function (k, v) {
        if (k === key) throw new DOMException('SecurityError');
        return _set(k, v);
      };
    }, VIEW_MODE_KEY);

    await mockFootballPlayers(page);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    // Click cards — setItem throws but the app must not crash.
    await clickCardsToggle(page);

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // UI state switches even though persistence failed.
    await expect(cardsContainer(page)).toBeVisible();
  });
});
