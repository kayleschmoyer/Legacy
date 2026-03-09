/**
 * Commissioner Announcements — UI Integration Test (LS-694)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Flow:
 *   1. Commissioner creates a new league
 *   2. Manager joins via invite code
 *   3. Commissioner posts an announcement via the UI
 *   4. Verify the announcement persists in the backend (API query)
 *   5. Manager sees the announcement on the league overview page
 *   6. Manager has no "New Announcement" compose button
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/commissioner-announcements-ui.integration.spec.ts
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface AnnouncementsState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  announcementText: string;
}

let state: AnnouncementsState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Switch the logged-in user by writing a new JWT into localStorage. */
async function switchUser(
  page: Page,
  jwt: string,
  url?: string,
): Promise<void> {
  if (url) {
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  } else {
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
}

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ??
    'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/'
  ).replace(/\/?$/, '/') + 'graphql';

/** Fire a raw GraphQL query against the live backend (Node fetch, no browser). */
async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error('GraphQL response contained no data');
  return json.data;
}

// ---------------------------------------------------------------------------
// Serial test suite — phases share `state` and must run in order.
// ---------------------------------------------------------------------------

test.describe
  .serial('Commissioner Announcements UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      announcementText: '',
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to create league page', async () => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /Create Baseball League/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Fill in league name, choose 4 teams, and submit', async () => {
      state.leagueName = `Announcements E2E ${Date.now()}`;
      await page
        .getByPlaceholder('Enter your league name')
        .fill(state.leagueName);
      await page
        .getByRole('button', { name: '4', exact: true })
        .first()
        .click();
      await page.getByRole('button', { name: /create league/i }).click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 30_000,
      });
    });

    await test.step('Extract league ID from the URL', () => {
      const match = page.url().match(/\/baseball\/league\/(\d+)/);
      expect(match).toBeTruthy();
      state.leagueId = Number(match![1]);
      expect(state.leagueId).toBeGreaterThan(0);
    });

    await test.step('Read invite code from the overview page', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.getByText('Manual Code', { exact: false })).toBeVisible(
        { timeout: 15_000 },
      );
      const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
      await expect(codeLocator).toBeVisible({ timeout: 10_000 });
      state.inviteCode = (await codeLocator.textContent()) ?? '';
      expect(state.inviteCode).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGER JOINS LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 2: Manager joins the league via invite code', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    const joinUrl = `/baseball/league/join/${state.inviteCode}`;
    await switchUser(page, managerJwt1, joinUrl);
    await page.waitForLoadState('load');

    await expect(page.getByText(/spot(s)?\s+available/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId('team-name').fill('Announcement Readers');
    const joinBtn = page.getByRole('button', { name: /Join League/i });
    await expect(joinBtn).toBeEnabled({ timeout: 5_000 });
    await joinBtn.click();

    await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
      timeout: 15_000,
    });

    // Restore commissioner identity for subsequent phases.
    await switchUser(page, commissionerJwt);
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — COMMISSIONER POSTS ANNOUNCEMENT VIA UI
  // -----------------------------------------------------------------------

  test('Phase 3: Commissioner posts an announcement via the UI', async ({
    commissionerPage: page,
  }) => {
    state.announcementText = `Integration test announcement — ${Date.now()}`;

    await test.step('Navigate to league overview and find the announcement panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.getByText('Commissioner Announcements')).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Open the compose form via "New Announcement" button', async () => {
      await page.getByRole('button', { name: /new announcement/i }).click();
      await expect(page.getByPlaceholder(/write an announcement/i)).toBeVisible(
        { timeout: 10_000 },
      );
      // Post button is disabled while textarea is empty
      await expect(
        page.getByRole('button', { name: /post announcement/i }),
      ).toBeDisabled();
    });

    await test.step('Type the announcement text', async () => {
      await page
        .getByPlaceholder(/write an announcement/i)
        .fill(state.announcementText);
      await expect(
        page.getByRole('button', { name: /post announcement/i }),
      ).toBeEnabled();
    });

    await test.step('Submit and verify announcement appears in the list', async () => {
      await page.getByRole('button', { name: /post announcement/i }).click();
      await expect(page.getByText(state.announcementText)).toBeVisible({
        timeout: 15_000,
      });
      // Compose form closes after a successful post.
      await expect(
        page.getByPlaceholder(/write an announcement/i),
      ).not.toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — API VERIFICATION (backend persistence)
  // -----------------------------------------------------------------------

  test('Phase 4: Announcement persists in the backend', async ({
    commissionerJwt,
  }) => {
    await expect
      .poll(
        async () => {
          const data = await gqlFetch<{
            getLeagueAnnouncements: Array<{ messageText: string }>;
          }>(
            commissionerJwt,
            `query GetLeagueAnnouncements($leagueId: Int!) {
                 getLeagueAnnouncements(leagueId: $leagueId) {
                   id
                   messageText
                   timestamp
                   messageType
                   sender { username }
                 }
               }`,
            { leagueId: state.leagueId },
          );
          return data.getLeagueAnnouncements.map((a) => a.messageText);
        },
        {
          timeout: 15_000,
          intervals: [1_000, 2_000, 3_000],
          message: `Announcement "${state.announcementText}" not found in backend within 15s`,
        },
      )
      .toContain(state.announcementText);
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — MEMBER SEES THE ANNOUNCEMENT
  // -----------------------------------------------------------------------

  test('Phase 5: Member sees the announcement on league overview', async ({
    commissionerPage: page,
    managerJwt1,
  }) => {
    await switchUser(
      page,
      managerJwt1,
      `/baseball/league/${state.leagueId}/overview`,
    );
    await page.waitForLoadState('load');

    await test.step('Commissioner Announcements panel is visible (there are announcements)', async () => {
      await expect(page.getByText('Commissioner Announcements')).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Announcement text is displayed to the member', async () => {
      await expect(page.getByText(state.announcementText)).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — MEMBER CANNOT COMPOSE ANNOUNCEMENTS
  // -----------------------------------------------------------------------

  test('Phase 6: Member does not see the "New Announcement" compose button', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await switchUser(
      page,
      managerJwt1,
      `/baseball/league/${state.leagueId}/overview`,
    );
    await page.waitForLoadState('load');

    // The panel should still be shown because there are announcements.
    await expect(page.getByText('Commissioner Announcements')).toBeVisible({
      timeout: 15_000,
    });

    // But the compose button must NOT appear for a regular member.
    await expect(
      page.getByRole('button', { name: /new announcement/i }),
    ).not.toBeVisible();

    // Restore commissioner identity.
    await switchUser(page, commissionerJwt);
  });
});
