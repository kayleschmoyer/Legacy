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

import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

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
    state.leagueName = `Announcements E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGER JOINS LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 2: Manager joins the league via invite code', async ({
    managerJwt1,
    managerPage1,
  }) => {
    await joinLeagueAsManager(managerPage1, {
      jwt: managerJwt1,
      inviteCode: state.inviteCode,
      teamName: 'Announcement Readers',
    });
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
      // Wait for the compose form to close before checking the list. The
      // optimistic-clear fix (LS-4533) makes this synchronous, but we still
      // assert it here as a regression guard against future latency-coupling.
      await expect(
        page.getByPlaceholder(/write an announcement/i),
      ).not.toBeVisible({ timeout: 10_000 });
      // Scope the text check to a panel announcement row — against the live
      // backend the same text also surfaces in the league activity feed,
      // which would trigger a strict-mode violation with a bare getByText.
      await expect(
        page
          .locator('[data-testid^="announcement-row-"]')
          .getByText(state.announcementText),
      ).toBeVisible({ timeout: 15_000 });
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
    managerPage1,
  }) => {
    await managerPage1.goto(`/baseball/league/${state.leagueId}/overview`);
    await managerPage1.waitForLoadState('load');

    await test.step('Commissioner Announcements panel is visible (there are announcements)', async () => {
      await expect(
        managerPage1.getByText('Commissioner Announcements'),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Announcement text is displayed to the member', async () => {
      await expect(
        managerPage1.getByText(state.announcementText).first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — MEMBER CANNOT COMPOSE ANNOUNCEMENTS
  // -----------------------------------------------------------------------

  test('Phase 6: Member does not see the "New Announcement" compose button', async ({
    managerPage1,
  }) => {
    await managerPage1.goto(`/baseball/league/${state.leagueId}/overview`);
    await managerPage1.waitForLoadState('load');

    // The panel should still be shown because there are announcements.
    await expect(
      managerPage1.getByText('Commissioner Announcements'),
    ).toBeVisible({ timeout: 15_000 });

    // But the compose button must NOT appear for a regular member.
    await expect(
      managerPage1.getByRole('button', { name: /new announcement/i }),
    ).not.toBeVisible();
  });
});
