/**
 * League QR Code & Invite Link — UI Integration Test (LS-592)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Flow:
 *   1. Commissioner creates a new league
 *   2. Overview page shows the "Invite Friends" card with invite URL and code
 *   3. Copy invite link button shows "Copied" feedback after click
 *   4. Copy invite code button shows "Copied" feedback after click
 *   5. QR code toggle — "Show" reveals the SVG; "Hide" removes it
 *   6. Header "Invite" button (quick-share) shows "Copied!" feedback after click
 *   7. End-to-end: manager navigates to invite URL and joins the league
 *   8. Backend verification: league member count increases after join
 *
 * Run:
 *   cd D:\code\legacy-sports-worktrees\LS-592-league-qr-invite-integration-test
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/league-qr-invite-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { waitForJoinPageValidation } from '../helpers/wait-for-join-page';
import { switchUser, test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface InviteState {
  leagueId: number;
  leagueName: string;
  inviteCode: string;
  inviteUrl: string;
}

let state: InviteState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
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
  .serial('League QR Code & Invite Link UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      leagueName: '',
      inviteCode: '',
      inviteUrl: '',
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `QR Invite E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — INVITE SECTION IS VISIBLE ON OVERVIEW
  // -----------------------------------------------------------------------

  test('Phase 2: Invite Friends card shows invite URL and invite code', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/overview`);
    await page.waitForLoadState('load');

    await test.step('"Invite Friends" card heading is visible', async () => {
      await expect(page.getByText('Invite Friends')).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('"Share Link" section shows a URL containing the join path', async () => {
      // The invite URL rendered inside the Share Link box contains /baseball/league/join/
      const urlBox = page
        .locator('text=/\\/baseball\\/league\\/join\\//')
        .first();
      await expect(urlBox).toBeVisible({ timeout: 15_000 });
      const displayedUrl = (await urlBox.textContent()) ?? '';
      expect(displayedUrl).toMatch(/\/baseball\/league\/join\/[A-Z0-9]+/);
      state.inviteUrl = displayedUrl.trim();
    });

    await test.step('"Manual Code" section shows an 8-character alphanumeric code', async () => {
      await expect(page.getByText('Manual Code', { exact: false })).toBeVisible(
        { timeout: 10_000 },
      );
      const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
      await expect(codeLocator).toBeVisible({ timeout: 10_000 });
      state.inviteCode = (await codeLocator.textContent()) ?? '';
      expect(state.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — COPY INVITE LINK FEEDBACK
  // -----------------------------------------------------------------------

  test('Phase 3: "Copy" invite link button shows "Copied" feedback', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/overview`);
    await page.waitForLoadState('load');

    // Grant clipboard write permissions for this context.
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);

    await test.step('Wait for "Invite Friends" section to load', async () => {
      await expect(page.getByText('Invite Friends')).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Click "Copy" button next to invite link', async () => {
      const copyBtn = page.getByRole('button', {
        name: /copy invite link/i,
      });
      await expect(copyBtn).toBeVisible({ timeout: 10_000 });
      await copyBtn.click();
    });

    await test.step('Button changes to "Copied" state', async () => {
      // The button text changes to "Copied" and reverts after 2 s.
      await expect(
        page.getByRole('button', { name: /copy invite link/i }),
      ).toContainText('Copied', { timeout: 5_000 });
    });

    await test.step('Screen-reader status message confirms copy', async () => {
      await expect(
        page.getByRole('status').filter({ hasText: /invite link copied/i }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — COPY INVITE CODE FEEDBACK
  // -----------------------------------------------------------------------

  test('Phase 4: "Copy" invite code button shows "Copied" feedback', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/overview`);
    await page.waitForLoadState('load');

    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);

    await test.step('Wait for invite code button', async () => {
      await expect(page.getByText('Manual Code', { exact: false })).toBeVisible(
        { timeout: 15_000 },
      );
      const copyCodeBtn = page.getByRole('button', {
        name: /copy invite code/i,
      });
      await expect(copyCodeBtn).toBeVisible({ timeout: 10_000 });
      await copyCodeBtn.click();
    });

    await test.step('Button changes to "Copied" state', async () => {
      await expect(
        page.getByRole('button', { name: /copy invite code/i }),
      ).toContainText('Copied', { timeout: 5_000 });
    });

    await test.step('Screen-reader status message confirms copy', async () => {
      await expect(
        page.getByRole('status').filter({ hasText: /invite code copied/i }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — QR CODE TOGGLE
  // -----------------------------------------------------------------------

  test('Phase 5: QR code "Show"/"Hide" toggle works correctly', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/overview`);
    await page.waitForLoadState('load');

    await test.step('QR Code section is visible', async () => {
      await expect(page.getByText('QR Code', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('QR code SVG is hidden by default', async () => {
      await expect(page.locator('svg[role="img"]')).not.toBeVisible();
      // Verify "Show QR Code" label on the toggle button
      await expect(
        page.getByRole('button', { name: /show qr code/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('Clicking "Show" reveals the QR code SVG', async () => {
      await page.getByRole('button', { name: /show qr code/i }).click();
      // QRCodeSVG renders an <svg> element; wait for it to appear
      await expect(page.locator('svg').last()).toBeVisible({ timeout: 10_000 });
      // Button label should flip to "Hide"
      await expect(
        page.getByRole('button', { name: /hide qr code/i }),
      ).toBeVisible({ timeout: 5_000 });
      // "Scan to join league" caption should appear below the QR code
      await expect(page.getByText('Scan to join league')).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Clicking "Hide" removes the QR code', async () => {
      await page.getByRole('button', { name: /hide qr code/i }).click();
      await expect(page.getByText('Scan to join league')).not.toBeVisible({
        timeout: 5_000,
      });
      // Toggle button flips back to "Show"
      await expect(
        page.getByRole('button', { name: /show qr code/i }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — HEADER INVITE QUICK-SHARE BUTTON
  // -----------------------------------------------------------------------

  test('Phase 6: Header "Invite" quick-share button shows "Copied!" feedback', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/overview`);
    await page.waitForLoadState('load');

    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);

    await test.step('Header "Invite" button is visible', async () => {
      const inviteBtn = page.getByRole('button', {
        name: /share invite link/i,
      });
      await expect(inviteBtn).toBeVisible({ timeout: 15_000 });
      await inviteBtn.click();
    });

    await test.step('Button changes to "Copied!" state', async () => {
      await expect(
        page.getByRole('button', { name: /share invite link/i }),
      ).toContainText('Copied!', { timeout: 5_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — MANAGER JOINS VIA INVITE URL (end-to-end functional proof)
  // -----------------------------------------------------------------------

  test('Phase 7: Manager joins the league via the invite URL', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    const joinUrl = `/baseball/league/join/${state.inviteCode}`;
    await switchUser(page, managerJwt1, joinUrl);
    await page.waitForLoadState('load');

    await test.step('Join page shows available spot', async () => {
      await waitForJoinPageValidation(page);
    });

    await test.step('Manager enters a team name and joins', async () => {
      await page.getByTestId('team-name').fill('QR Code Joiners');
      const joinBtn = page.getByRole('button', { name: /Join League/i });
      await expect(joinBtn).toBeEnabled({ timeout: 5_000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 15_000,
      });
    });

    // Restore commissioner identity for the next phase.
    await switchUser(page, commissionerJwt);
  });

  // -----------------------------------------------------------------------
  // PHASE 8 — BACKEND VERIFICATION: MEMBER COUNT
  // -----------------------------------------------------------------------

  test('Phase 8: Backend confirms the manager has joined the league', async ({
    commissionerJwt,
  }) => {
    await expect
      .poll(
        async () => {
          const data = await gqlFetch<{
            leagueTeams: Array<{ id: number }>;
          }>(
            commissionerJwt,
            `query GetLeagueTeams($leagueId: Int!) {
               leagueTeams(leagueId: $leagueId) { id }
             }`,
            { leagueId: state.leagueId },
          );
          return data.leagueTeams.length;
        },
        {
          timeout: 15_000,
          intervals: [1_000, 2_000, 3_000],
          message: `League ${state.leagueId} should have 2 teams after manager joined`,
        },
      )
      .toBeGreaterThanOrEqual(2);
  });
});
