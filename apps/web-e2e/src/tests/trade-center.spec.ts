/**
 * Standalone Trade Center route (`/trade-center`) E2E tests — LS-8460.
 *
 * `trading-center.spec.ts` covers the per-league Trades tab; this spec covers
 * the standalone `TradeCenterPage` route and its premium trade-analyzer teaser,
 * which had no E2E coverage. All GraphQL is mocked so the tests are hermetic
 * (no live backend in CI).
 *
 * The spec body speaks only page-object verbs (ADR-0015/0016): all selectors
 * live in the driver-verb {@link TradeCenterPage} page object
 * (`src/pages/trade-center.page.ts`), which is written against the
 * platform-neutral `AppDriver`. Mocking/identity stay here in the spec, never
 * in the page object (ADR-0015 §6). Entitlement tier is pinned with the
 * one-line `useTier` helper (LS-8056).
 */
import type { Page } from '@playwright/test';
import { test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { userLeaguesResponse } from '../mocks/graphql';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { PlaywrightWebDriver } from '../driver';
import { TradeCenterPage } from '../pages';

/** Construct the driver-verb page object over the raw Playwright page. */
function tradeCenterPage(page: Page): TradeCenterPage {
  return new TradeCenterPage(new PlaywrightWebDriver(page));
}

const DEEP_LINK_LEAGUE = 'Alpha League';

/**
 * Deep-link precondition: the user has one active-phase league (so the
 * `?leagueId=` param can resolve it) and a team in it (so the trades view
 * renders instead of the "not a member" branch). Everything else — the
 * league-detail, teams, positions, and trade-offer queries the shared
 * `TradingCenter` fires — falls through to the baseline mocks.
 *
 * `GetUserTeamId` is overridden to the V2 scalar shape (`userTeamId: 1`); the
 * baseline still returns the legacy wrapped `{ teamId }` object, which the V2
 * page reads as a non-null truthy value and would misroute (mirrors the
 * override in `trading-center.spec.ts`).
 */
async function mockDeepLinkLeague(page: Page): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();
    if (op === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          userLeaguesResponse([
            { id: 1, name: DEEP_LINK_LEAGUE, leaguePhase: 'active' },
          ]),
        ),
      });
    } else if (op === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── AC1: the standalone route renders with its core sections ─────────────────

test.describe('Trade Center route — renders @critical', () => {
  test('renders the standalone route with its core sections for an authed user', async ({
    page,
  }) => {
    const tradeCenter = tradeCenterPage(page);

    await tradeCenter.goto();

    await tradeCenter.expectLoaded();
    await tradeCenter.expectLeagueSelectPrompt();
    await tradeCenter.expectTradeAnalyzerSection();
  });
});

// ── AC2: trade-analyzer teaser premium gating ────────────────────────────────

test.describe('Trade Center — trade analyzer premium teaser @critical', () => {
  test('free user sees the premium gate on the trade analyzer', async ({
    page,
  }) => {
    await useTier(page, 'free');
    const tradeCenter = tradeCenterPage(page);

    await tradeCenter.goto();

    await tradeCenter.expectTradeAnalyzerSection();
    await tradeCenter.expectAnalyzerGated();
  });

  test('premium user sees the unlocked coming-soon trade analyzer', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    const tradeCenter = tradeCenterPage(page);

    await tradeCenter.goto();

    await tradeCenter.expectTradeAnalyzerSection();
    await tradeCenter.expectAnalyzerUnlocked();
  });
});

// ── AC3: deep-linking with leagueId / offerId query params ────────────────────

test.describe('Trade Center — deep linking @critical', () => {
  test('leagueId/offerId query params land on the selected league trades', async ({
    page,
  }) => {
    await mockDeepLinkLeague(page);
    const tradeCenter = tradeCenterPage(page);

    await tradeCenter.gotoDeepLink(1, 42);

    await tradeCenter.expectLandedOnLeague(DEEP_LINK_LEAGUE);
  });
});
