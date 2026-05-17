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

import type { APIRequestContext } from '@playwright/test';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { waitForSeasonActive } from '../integration/helpers/wait-for-season-active';

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
    // Flag-based gate: all requests during the first navigation get 'queued';
    // flipped to true before the second navigation so all subsequent requests
    // get 'completed'. Using a flag (vs callCount <= 1) avoids the race where
    // two GetLeagueById calls on the first navigation would push callCount past
    // 1 mid-navigation and serve 'completed' prematurely (LS-4403).
    let serveCompleted = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('"getleaguebyid"') ||
        postData.includes('"getleague"')
      ) {
        callCount += 1;
        const draftStatus = serveCompleted ? 'completed' : 'queued';
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

    // Flip before second navigation: all subsequent league requests → completed
    serveCompleted = true;

    // Second poll: completed — badge must be visible after networkidle
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Season Active')).toBeVisible();

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

// ── reload() vs goto() after draft-start navigation (LS-4306) ────────────────
//
// After a draft starts the app navigates to the draft board
// (/baseball/league/:id/draft). The old inline wait loop used page.reload(),
// which re-fetches whichever URL the page is on — never returning to the
// commissioner panel where "Season Active" is rendered. waitForSeasonActive
// always uses page.goto(commissionerUrl) to guarantee it checks the right page.
//
// These tests document and guard that contract: reload() on the draft board
// misses the commissioner badge; goto(commissionerUrl) always finds it.
//
// Note: /baseball/league/:id renders "Season Active" in LeagueHero when
// draftStatus='completed', so the draft board URL is used here as the
// realistic "navigated away" destination — it does not render that badge.

test.describe('Commissioner — reload vs goto after draft-start navigation (LS-4306)', () => {
  test('page.reload() misses Season Active when page has navigated away from commissioner', async ({
    page,
  }) => {
    await setupLeagueMock(page, 'completed');
    // After a draft completes the app lands on the draft board, not the
    // commissioner panel. Simulate that navigation here.
    await page.goto('/baseball/league/1/draft');
    await page.waitForLoadState('networkidle');

    // page.reload() stays on the draft board — the commissioner badge is not
    // rendered there, so "Season Active" is never visible.
    // Explicit waitFor ensures Apollo hydration has settled before asserting
    // absence, avoiding the networkidle-vs-hydration race (LS-4430).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByText('Season Active').waitFor({ state: 'hidden' });
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

// ── Deterministic backend-polling path (LS-4344) ──────────────────────────────
//
// Guards the `api`-parameter code path of waitForSeasonActive introduced in
// LS-4321. This path polls `league.draftStatus` directly from the backend
// before asserting the UI badge — eliminating the Apollo cache/render race
// that caused repeated flakes across 6+ specs (LS-4237 → LS-4344).
//
// The key invariant: when `api` is provided, the helper must NOT assert the UI
// until the backend has confirmed draftStatus is `active` or `completed`. The
// test simulates a queued → completed transition over multiple API poll cycles.

test.describe('Commissioner — deterministic api-polling path (LS-4344)', () => {
  test('waitForSeasonActive with api waits for backend draftStatus before asserting UI badge', async ({
    page,
  }) => {
    let apiPollCount = 0;

    // page.route() intercepts only requests originating from the page itself
    // (XHRs/fetch from React). It does NOT intercept requests made via
    // page.request — those go through Playwright's APIRequestContext in Node
    // and bypass the page-level route table (LS-4348). The UI's
    // GetLeagueById call still goes through page.route, so mock it normally.
    await setupLeagueMock(page, 'completed');

    // Stub APIRequestContext so the deterministic backend-poll branch runs
    // hermetically. First poll → queued; subsequent polls → completed,
    // simulating the draftStatus transition the helper is designed to wait
    // for. Only the methods graphql.ts consumes (post + a minimal response
    // object exposing ok/status/json/text) need to be implemented.
    const apiStub = {
      post: () => {
        apiPollCount += 1;
        const draftStatus = apiPollCount >= 2 ? 'completed' : 'queued';
        const payload = { data: { league: { draftStatus } } };
        const body = JSON.stringify(payload);
        return Promise.resolve({
          ok: () => true,
          status: () => 200,
          json: () => Promise.resolve(payload),
          text: () => Promise.resolve(body),
        });
      },
    } as unknown as APIRequestContext;

    // Start on a non-commissioner URL to simulate post-draft-start state
    await page.goto('/baseball/league/1');
    await page.waitForLoadState('networkidle');

    await waitForSeasonActive(page, 1, {
      api: apiStub,
      deadlineMs: 30_000,
    });

    // Badge visible after the deterministic path completes
    await expect(page.getByText('Season Active')).toBeVisible();

    // API was actually polled (not just UI checked) — confirms the gating logic ran
    expect(apiPollCount).toBeGreaterThanOrEqual(2);
  });
});

// ── Draft mode save-completion guard (LS-4352) ────────────────────────────────
//
// Guards against the race condition where a fixed 1s wait after "Save Draft
// Settings" was insufficient under CI load: if UpdateDraftSettings took >1s,
// startDraft would read stale draftMode='live' from the DB and start a live
// draft instead of an automated one.
//
// The fix: wait for the Save button to become disabled (hasChanges=false after
// save success) before proceeding. This test verifies that the button correctly
// transitions through enabled (hasChanges=true) → disabled (saving=true or
// hasChanges=false) using a slow mocked mutation to surface the timing gap.

test.describe('Commissioner — draft mode save-completion guard (LS-4352)', () => {
  test('Save button becomes disabled during/after slow UpdateDraftSettings', async ({
    page,
  }) => {
    let mutationFired = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('"getleaguebyid"') ||
        postData.includes('"getleague"')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: makeLeague() } }),
        });
      } else if (postData.includes('"getleaguedraft"')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getLeagueDraft: {
                __typename: 'Draft',
                id: 1,
                leagueId: 1,
                draftMode: 'live',
                selectionMethod: 'standard',
                draftOrder: 'snake',
                currentPick: 0,
                pickTimeLimitSeconds: 120,
                draftStartedAt: null,
                draftCompletedAt: null,
                scheduledAt: null,
              },
            },
          }),
        });
      } else if (postData.includes('"updatedraftsettings"')) {
        mutationFired = true;
        // Simulate mutation latency (e.g. CI DB write delay)
        await new Promise<void>((r) => setTimeout(r, 800));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              updateDraftSettings: {
                __typename: 'Draft',
                id: 1,
                leagueId: 1,
                draftMode: 'automated',
                selectionMethod: 'random',
                draftOrder: 'snake',
                currentPick: 0,
                pickTimeLimitSeconds: 120,
                playerPool: 'all',
                draftStartedAt: null,
                draftCompletedAt: null,
                scheduledAt: null,
              },
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    const draftSettingsBtn = page.getByRole('button', {
      name: /Draft Settings/i,
    });
    await expect(draftSettingsBtn).toBeVisible({ timeout: 10_000 });
    await draftSettingsBtn.click();

    // Use data-testid selector — same as the integration spec fix (LS-4352)
    const automatedBtn = page.getByTestId('option-automated');
    await expect(automatedBtn).toBeVisible({ timeout: 5_000 });
    await automatedBtn.click();

    const saveBtn = page.getByRole('button', {
      name: /Save Draft Settings/i,
    });
    // Button must be enabled before save (hasChanges=true after mode change)
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Button must become disabled while the mutation is in-flight (saving=true)
    // and remain disabled after completion (hasChanges=false). A fixed 1s
    // waitForTimeout races against slow mutations under CI load (LS-4352).
    await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
    expect(mutationFired).toBe(true);
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
