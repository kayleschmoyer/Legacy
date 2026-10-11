/**
 * Matchup Detail — GA4 `matchup_viewed` analytics tracking (LS-7628)
 *
 * Covers the GA4 event MatchupDetailPage already fires on each unique matchup
 * view (apps/web/src/pages/matchup/MatchupDetailPage.tsx:73-84):
 *   - Fires exactly once on initial load with the correct payload.
 *   - Silently no-ops (no gtag call, no thrown error) when the GA
 *     measurement ID is unset — the CI/E2E build default.
 *
 * All GraphQL responses are mocked so no live backend is required. The GA
 * measurement ID is only observable in E2E via the window.__e2eGaMeasurementId
 * runtime override (apps/web/src/config/environment.ts) — the E2E build never
 * sets VITE_GA_MEASUREMENT_ID, mirroring the existing __e2eWsUrl pattern.
 */
import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;
const E2E_GA_MEASUREMENT_ID = 'G-E2ETEST123';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 3,
  team1Id: 1,
  team2Id: 2,
  team1Score: 42.5,
  team2Score: 38.1,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 4,
  startTime: null,
  endTime: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

async function mockMatchupGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [MOCK_MATCHUP] },
        }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
      });
    } else if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

/**
 * Injects a deterministic GA4 measurement ID via `window.__e2eGaMeasurementId`
 * so `initializeAnalytics()` configures `window.gtag` in this hermetic build
 * (apps/web/src/config/environment.ts reads this override when
 * `navigator.webdriver === true`).
 *
 * The app assigns `window.gtag = function gtag() {...}` itself during startup
 * (apps/web/src/utils/analytics.ts), which would clobber a plain pre-set stub.
 * Instead, define `gtag` as an accessor so whatever function the app assigns
 * gets transparently wrapped: every call is still recorded into
 * `window.__gtagCalls` and forwarded to the real implementation.
 */
async function injectGaMeasurementId(page: import('@playwright/test').Page) {
  await page.addInitScript((measurementId: string) => {
    (
      window as unknown as { __e2eGaMeasurementId: string }
    ).__e2eGaMeasurementId = measurementId;
    (window as unknown as { __gtagCalls: unknown[] }).__gtagCalls = [];

    let realGtag: ((...args: unknown[]) => void) | undefined;
    Object.defineProperty(window, 'gtag', {
      configurable: true,
      get() {
        return realGtag;
      },
      set(fn: (...args: unknown[]) => void) {
        realGtag = (...args: unknown[]) => {
          (window as unknown as { __gtagCalls: unknown[] }).__gtagCalls.push(
            args,
          );
          return fn(...args);
        };
      },
    });
  }, E2E_GA_MEASUREMENT_ID);
}

async function getGtagCalls(
  page: import('@playwright/test').Page,
): Promise<unknown[][]> {
  return page.evaluate(
    () => (window as unknown as { __gtagCalls: unknown[][] }).__gtagCalls,
  );
}

// ---------------------------------------------------------------------------
// Tests — matchup_viewed fires with the correct payload
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – matchup_viewed GA4 event @regression', () => {
  test('fires exactly once on initial load with matchup_id/league_id/week_number and no PII', async ({
    page,
  }) => {
    await injectGaMeasurementId(page);
    await mockMatchupGraphQL(page);

    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    await expect
      .poll(async () => {
        const calls = await getGtagCalls(page);
        return calls.filter(
          (call) => call[0] === 'event' && call[1] === 'matchup_viewed',
        ).length;
      })
      .toBe(1);

    const calls = await getGtagCalls(page);
    const [, , payload] = calls.find(
      (call) => call[0] === 'event' && call[1] === 'matchup_viewed',
    ) as [string, string, Record<string, unknown>];

    expect(payload).toMatchObject({
      matchup_id: MATCHUP_ID,
      league_id: LEAGUE_ID,
      week_number: MOCK_MATCHUP.weekNumber,
      category: 'matchup',
    });
    // No PII (user id, name, email) in the payload — only numeric IDs,
    // week number, category, and the non-identifying subscription tier.
    const allowedKeys = [
      'matchup_id',
      'league_id',
      'week_number',
      'category',
      'subscription_tier',
    ];
    for (const key of Object.keys(payload)) {
      expect(allowedKeys).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — silent no-op without a GA measurement ID
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – matchup_viewed GA4 no-op @regression', () => {
  test('does not call gtag and does not throw when the GA measurement ID is unset', async ({
    page,
  }) => {
    // No injectGaMeasurementId() call — mirrors the real E2E/CI build, which
    // sets no VITE_GA_MEASUREMENT_ID, so window.gtag is never assigned.
    await mockMatchupGraphQL(page);

    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    const gtagType = await page.evaluate(
      () => typeof (window as unknown as { gtag?: unknown }).gtag,
    );
    expect(gtagType).toBe('undefined');
  });
});
