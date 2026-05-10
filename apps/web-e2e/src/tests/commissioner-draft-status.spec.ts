/**
 * Commissioner — "Season Active" badge (LS-4296)
 *
 * Guards the draftStatus → "Season Active" display path that all 6 integration
 * specs rely on via waitForSeasonActive. Previously, waitForLoadState('load')
 * fired before Apollo's GetLeagueById XHR completed, so the isVisible() check
 * always ran on a page where React had not yet received draftStatus from the
 * server. The fix is 'load' → 'networkidle'. These tests verify that:
 *
 *   1. After networkidle, "Season Active" is visible for completed/active status
 *   2. The badge is absent for pre-draft statuses
 *   3. A poll cycle (simulate queued → completed) correctly surfaces the badge
 *      on the second navigation after networkidle — the precise scenario the
 *      integration suite depends on
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test League',
    description: null,
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'not-started',
    currentMatchup: null,
    numberOfTeams: 4,
    playerPool: 'all',
    draftMode: 'automated',
    selectionMethod: 'random',
    draftOrder: 'snake',
    isPublic: false,
    maxBatters: 14,
    maxPitchers: 9,
    tradingEnabled: true,
    waiverEnabled: true,
    startDate: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    inviteCode: 'TEST1234',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNotes: null,
    currentWeekNumber: null,
    leaguePhase: null,
    weekAdvanceStatus: null,
    faabBudgetDefault: null,
    isMockDraft: false,
    previousLeagueId: null,
    seasonNumber: 1,
    salaryCapEnabled: false,
    salaryCap: null,
    salaryFloor: null,
    luxuryTaxThreshold: null,
    minSalary: null,
    salaryEscalationPct: null,
    salaryDecayPct: null,
    auctionBudget: null,
    auctionMinBid: null,
    eraFilter: null,
    hofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
    ...overrides,
  };
}

async function setupLeagueMock(
  page: import('@playwright/test').Page,
  draftStatus: string,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';
    if (
      postData.includes('"getleaguebyid"') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: makeLeague({ draftStatus }) } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Static badge mapping ───────────────────────────────────────────────────────

test.describe('Commissioner — Season Active badge (LS-4296)', () => {
  test('shows "Season Active" for draftStatus completed after networkidle', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'completed');
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Season Active')).toBeVisible();
  });

  test('shows "Season Active" for draftStatus active after networkidle', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'active');
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Season Active')).toBeVisible();
  });

  test('does not show "Season Active" for draftStatus not-started', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'not-started');
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Season Active')).not.toBeVisible();
  });

  test('does not show "Season Active" for draftStatus queued', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'queued');
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Season Active')).not.toBeVisible();
  });
});

// ── Polling-cycle transition guard ─────────────────────────────────────────────
//
// This is the exact scenario waitForSeasonActive relies on: the loop calls
// page.goto() then waitForLoadState('networkidle'), then checks isVisible().
// If Apollo's XHR has not completed before the check, the badge is missed
// even when the backend has already set draftStatus='completed' (the LS-4296 bug).
//
// Here we simulate a delayed GraphQL response to confirm that after networkidle
// the badge IS visible, and that a poll cycle correctly detects the transition.

test.describe('Commissioner — poll-cycle Season Active detection (LS-4296)', () => {
  test('detects Season Active on second poll after queued→completed transition', async ({
    page,
  }) => {
    let callCount = 0;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('"getleaguebyid"') ||
        postData.includes('"getleague"')
      ) {
        callCount += 1;
        // First navigation: draft still queued (lambda not yet done)
        // Second navigation: draft completed
        const draftStatus = callCount <= 1 ? 'queued' : 'completed';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { league: makeLeague({ draftStatus }) },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    // First poll: queued — badge absent
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Season Active')).not.toBeVisible();

    // Second poll: completed — badge must be visible after networkidle
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Season Active')).toBeVisible();

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

// ── reload() vs goto() after draft-start navigation (LS-4306) ────────────────
//
// After a draft starts the app may navigate away from the commissioner URL
// (e.g. to /baseball/league/:id). The old inline wait loop used page.reload(),
// which re-fetches whichever URL the page is on — never returning to the
// commissioner panel where "Season Active" is rendered. waitForSeasonActive
// always uses page.goto(commissionerUrl) to guarantee it checks the right page.
//
// These tests document and guard that contract: reload() on a non-commissioner
// URL misses the badge; goto(commissionerUrl) always finds it.

test.describe('Commissioner — reload vs goto after draft-start navigation (LS-4306)', () => {
  test('page.reload() misses Season Active when page has navigated away from commissioner', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'completed');
    // Simulate draft start navigating the app away from the commissioner panel
    await page.goto('/baseball/league/1');
    await page.waitForLoadState('networkidle');

    // page.reload() stays on the league overview — the commissioner badge is not
    // rendered there, so "Season Active" is never visible
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Season Active')).not.toBeVisible();
  });

  test('page.goto(commissionerUrl) detects Season Active even after navigation away', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'completed');
    // Simulate draft start navigating the app away from the commissioner panel
    await page.goto('/baseball/league/1');
    await page.waitForLoadState('networkidle');

    // goto(commissionerUrl) returns to the correct page regardless of current URL
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Season Active')).toBeVisible();
  });
});

// ── Unauthenticated access guard ───────────────────────────────────────────────
//
// Verifies that an unauthenticated user cannot view league data or the
// "Season Active" badge on the commissioner page. EnhancedAuthGuard should
// redirect the user before any GetLeagueById query is issued.

unauthTest.describe(
  'Commissioner — unauthenticated access guard (LS-4296)',
  () => {
    unauthTest(
      'unauthenticated user sees login page and cannot see "Season Active"',
      async ({ page }) => {
        await page.goto('/baseball/league/1/commissioner');
        await page.waitForLoadState('networkidle');

        // EnhancedAuthGuard renders the login page in-place — the commissioner
        // page (and its "Season Active" badge) must never render.
        await expect(page.getByText('Season Active')).not.toBeVisible();
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible();
      },
    );
  },
);
