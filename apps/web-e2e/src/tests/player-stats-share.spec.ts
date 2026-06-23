/**
 * Player Stats Page — Share Current View (LS-5597)
 *
 * Covers the three-tier share fallback chain in PlayerStatsRoute.handleShare:
 *
 *   clipboard-fallback    — navigator.share absent, clipboard available →
 *                           toast "Link copied to clipboard."
 *   manual-copy-message   — neither share nor clipboard available →
 *                           toast "Could not share link. Copy the URL below
 *                           manually." with a pre-selected URL input
 *   abort-error silenced  — navigator.share present but rejects AbortError →
 *                           no toast (user dismissed the sheet, not an error)
 *
 * GraphQL operations fall through to the BASELINE_GRAPHQL_RESPONSES auto-fixture
 * (empty stats → empty-state page; share button is unconditionally rendered).
 * Browser API availability is controlled via page.addInitScript before navigation.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── GraphQL mock ──────────────────────────────────────────────────────────────

const EMPTY_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

/**
 * Mount a minimal player-stats GraphQL mock that returns empty data sets.
 * The empty state still renders the share button (it is unconditional in the
 * shared component). Unrecognised operations fall through to the baseline.
 * Must be called before page.goto().
 */
async function mockPlayerStatsEmpty(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    getcareerbattingstats: (route) =>
      fulfillJson(route, {
        data: {
          careerBattingStats: {
            __typename: 'CareerBattingConnection',
            totalCount: 0,
            edges: [],
            pageInfo: EMPTY_PAGE_INFO,
          },
        },
      }),
    getcareerpitchingstatscount: (route) =>
      fulfillJson(route, { data: { careerPitchingStatsCount: 0 } }),
    getcareerpitchingstats: (route) =>
      fulfillJson(route, { data: { careerPitchingStats: [] } }),
  });
}

// ── Browser-API mock helpers ──────────────────────────────────────────────────

/**
 * Simulate desktop Chrome: navigator.share absent, clipboard.writeText resolves.
 * Must be called before page.goto().
 */
async function mockClipboardFallback(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      configurable: true,
      get() {
        return { writeText: () => Promise.resolve() };
      },
    });
  });
}

/**
 * Simulate a locked-down context: both navigator.share and navigator.clipboard
 * absent. The handler degrades to the manual-copy message.
 * Must be called before page.goto().
 */
async function mockNoShareApis(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });
}

/**
 * Simulate a user dismissing the native share sheet: navigator.share present
 * but rejects with AbortError.
 * Must be called before page.goto().
 */
async function mockShareAbortError(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      writable: true,
      value() {
        return Promise.reject(
          new DOMException('The user aborted a request.', 'AbortError'),
        );
      },
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Player Stats — share: clipboard-fallback variant (LS-5597) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockClipboardFallback(page);
    await mockPlayerStatsEmpty(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();
  });

  test('share button is visible on the stats page', async ({ playersPage }) => {
    await playersPage.stats.expectShareButtonVisible();
  });

  test('clicking share shows "Link copied to clipboard." toast', async ({
    playersPage,
  }) => {
    await playersPage.stats.clickShare();
    await playersPage.stats.expectShareToast('Link copied to clipboard.');
  });

  test('sr-only live region announces the copy confirmation for screen readers', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.clickShare();
    // PlayerStatsRoute renders a sr-only aria-live="polite" div that carries
    // the same liveMsg. Exclude elements with data-announcer-seq (framework
    // announcer widgets) to target only the host page's live region.
    await expect(
      page.locator('div.sr-only[aria-live="polite"]:not([data-announcer-seq])'),
    ).toContainText('Link copied to clipboard.');
  });
});

test.describe('Player Stats — share: manual-copy fallback variant (LS-5597) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockNoShareApis(page);
    await mockPlayerStatsEmpty(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();
  });

  test('shows "Could not share link." toast when neither share API is available', async ({
    playersPage,
  }) => {
    await playersPage.stats.clickShare();
    await playersPage.stats.expectShareToast(
      'Could not share link. Copy the URL below manually.',
    );
  });

  test('fallback URL input is visible so the user can copy the link manually', async ({
    playersPage,
  }) => {
    await playersPage.stats.clickShare();
    await playersPage.stats.expectShareFallbackInput();
  });

  test('fallback URL input value contains a /players/stats deep link', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.clickShare();
    await expect(page.getByLabel('Shareable link to copy')).toHaveValue(
      /\/players\/stats/,
    );
  });
});

test.describe('Player Stats — share: AbortError silenced (LS-5597) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockShareAbortError(page);
    await mockPlayerStatsEmpty(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();
  });

  test('no toast appears when user dismisses the native share sheet', async ({
    playersPage,
  }) => {
    await playersPage.stats.clickShare();
    // AbortError is intentionally swallowed — dismissal is a user choice,
    // not an error; no confirmation or failure toast should appear.
    await playersPage.stats.expectShareToastHidden();
  });
});
