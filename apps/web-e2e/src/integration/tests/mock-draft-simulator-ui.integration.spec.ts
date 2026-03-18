/**
 * Mock Draft Simulator UI Integration Test
 *
 * Tests the full mock draft simulator flow end-to-end against real services:
 *   1. Setup screen — verify all settings (teams, rounds, draft position)
 *   2. Click "Start Mock Draft" → mutation → redirect to draft board
 *   3. Draft flow — user picks on their turn, AI picks fire automatically
 *      via the nudge mechanism as each pick deadline expires
 *   4. Draft Complete! — verify mock-draft-specific completion message
 *      ("No rosters were saved") and "Practice Again" CTA
 *
 * Only 1 browser context is needed (commissioner = the single human team).
 * AI teams (autoPick=true) are managed server-side via the `nudgeExpiredDraftPick`
 * mutation that fires on the draft board when each timer expires.
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/mock-draft-simulator-ui.integration.spec.ts
 *
 * Timing note:
 *   The mock draft uses a 30-second pick timer (server default for mock drafts).
 *   With 4 teams and 5 rounds there are 15 AI picks × 30 s ≈ 7.5 minutes of
 *   automated waiting.  The test also nudges the server directly every 5 s so
 *   AI turns resolve within ~35 s each regardless of WebSocket state.
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests.
// ---------------------------------------------------------------------------

interface MockDraftState {
  leagueId: number;
  numTeams: number;
  rosterSize: number;
}

let state: MockDraftState;

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Mock Draft Simulator UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = { leagueId: 0, numTeams: 4, rosterSize: 5 };
  });

  // -----------------------------------------------------------------
  // PHASE 1 — SETUP SCREEN
  // -----------------------------------------------------------------

  test('Phase 1: Setup screen renders with correct settings', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to mock draft setup page', async () => {
      await page.goto('/baseball/mock-draft');
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /Mock Draft Simulator/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Verify "Practice Mode" label is visible', async () => {
      await expect(page.getByText(/Practice Mode/i)).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Verify team count options are displayed', async () => {
      for (const n of [4, 6, 8, 10, 12]) {
        await expect(
          page.getByRole('button', { name: String(n), exact: true }).first(),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    await test.step('Verify rounds (roster size) options are displayed', async () => {
      for (const n of [5, 8, 10, 15]) {
        await expect(
          page.getByRole('button', { name: String(n), exact: true }).first(),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    await test.step('Verify draft position buttons are displayed', async () => {
      // Default is 8 teams, so positions 1–8 should be visible
      await expect(
        page.getByRole('button', { name: '1', exact: true }).first(),
      ).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Select 4 teams — draft position buttons should update to 1–4', async () => {
      await page
        .getByRole('button', { name: '4', exact: true })
        .first()
        .click();
      // After selecting 4 teams, draft position 4 should appear but 5 should not
      await expect(
        page.getByRole('button', { name: '4', exact: true }).first(),
      ).toBeVisible({ timeout: 3_000 });
      // Pick "Position 1" explicitly
      await page
        .getByRole('button', { name: '1', exact: true })
        .first()
        .click();
    });

    await test.step('Select 5 rounds (roster size)', async () => {
      await page
        .getByRole('button', { name: '5', exact: true })
        .first()
        .click();
    });

    await test.step('Verify snake draft description updates for position 1', async () => {
      await expect(
        page.getByText(/you pick.*first every odd round/i),
      ).toBeVisible({ timeout: 3_000 });
    });

    await test.step('Verify "Start Mock Draft" button is present and enabled', async () => {
      await expect(
        page.getByRole('button', { name: /Start Mock Draft/i }),
      ).toBeEnabled({ timeout: 5_000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 2 — START DRAFT & NAVIGATE TO BOARD
  // -----------------------------------------------------------------

  test('Phase 2: Start mock draft and navigate to draft board', async ({
    commissionerPage: page,
  }) => {
    // Allow extra time for the mutation to initialise the mock league
    test.setTimeout(60_000);

    await test.step('Navigate to setup page', async () => {
      await page.goto('/baseball/mock-draft');
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /Mock Draft Simulator/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Configure: 4 teams, 5 rounds, position 1', async () => {
      // Teams: 4
      await page
        .getByRole('button', { name: '4', exact: true })
        .first()
        .click();

      // Roster size: 5
      await page
        .getByRole('button', { name: '5', exact: true })
        .first()
        .click();

      // Draft position: 1
      await page
        .getByRole('button', { name: '1', exact: true })
        .first()
        .click();
    });

    await test.step('Click "Start Mock Draft"', async () => {
      const startBtn = page.getByRole('button', {
        name: /Start Mock Draft/i,
      });
      await expect(startBtn).toBeEnabled({ timeout: 5_000 });
      await startBtn.click();
    });

    await test.step('Wait for redirect to the draft board', async () => {
      await expect(page).toHaveURL(/\/baseball\/league\/\d+\/draft/, {
        timeout: 30_000,
      });
    });

    await test.step('Extract league ID from URL', () => {
      const url = page.url();
      const match = url.match(/\/baseball\/league\/(\d+)\/draft/);
      expect(match).toBeTruthy();
      if (match) {
        state.leagueId = Number(match[1]);
      }
      expect(state.leagueId).toBeGreaterThan(0);
    });

    await test.step('Verify draft board rendered (not an error page)', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      // Draft board renders the "LIVE DRAFT" header for all draft types
      await expect(page.getByText('LIVE DRAFT').first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 3 — MAKE ALL PICKS (USER + AI)
  // -----------------------------------------------------------------

  test('Phase 3: Complete the mock draft — user picks + AI picks', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    // 4 teams × 5 rounds = 20 picks total.
    // User (position 1) makes 5 picks; AI makes 15 picks via the nudge mechanism
    // (30 s pick timer — mock-draft default).  15 × ~35 s ≈ 9 minutes.
    test.setTimeout(15 * 60_000); // 15-minute ceiling

    await test.step('Navigate to draft board', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/draft`);
      await page.waitForLoadState('load');
      await expect(page.getByText('LIVE DRAFT').first()).toBeVisible({
        timeout: 30_000,
      });
      // Give WebSocket time to establish
      await page.waitForTimeout(3_000);
    });

    // ---- Direct-nudge helper -----------------------------------------------
    // Calling autoProcessDraftPicks from Node.js is more reliable than waiting
    // for the in-browser React timer.  The mutation is idempotent: it is a
    // no-op until the server-side deadline actually expires, so polling every
    // 5 seconds is safe.
    const gqlBase =
      process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/';
    async function nudgeDraftPick(): Promise<void> {
      if (!state.leagueId) return;
      await fetch(`${gqlBase}graphql`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commissionerJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `mutation NudgeExpiredDraftPick($leagueId: Int!) {
            autoProcessDraftPicks(leagueId: $leagueId) { picksAutoMade }
          }`,
          variables: { leagueId: state.leagueId },
        }),
      }).catch((_err) => {
        // best-effort nudge — swallow errors; EventBridge is the hard fallback
      });
    }

    const totalPicks = state.numTeams * state.rosterSize; // 4 × 5 = 20
    let pickCount = 0;
    const maxPicks = totalPicks + 5; // safety margin
    let consecutiveMisses = 0;
    // Reload only after 3× the pick timer with no progress (3 × 30 s = 90 s)
    const MAX_MISSES = 90;
    let lastNudgeMs = -Infinity;
    const NUDGE_INTERVAL_MS = 5_000;

    await test.step('Loop: make user picks on each turn; wait for AI picks', async () => {
      while (pickCount < maxPicks) {
        // Check if draft is already complete
        const draftDone = await page
          .getByText('Draft Complete!')
          .isVisible()
          .catch(() => false);
        if (draftDone) break;

        // Is it the user's turn?
        const isMyTurn = await page
          .getByText('YOUR PICK')
          .first()
          .isVisible({ timeout: 2_000 })
          .catch(() => false);

        if (isMyTurn) {
          // Find the first available "Draft X now" button and click it
          const draftBtn = page
            .getByRole('button', { name: /Draft .* now/i })
            .first();
          const btnReady = await draftBtn
            .isVisible({ timeout: 3_000 })
            .catch(() => false);

          if (btnReady) {
            const ariaLabel = await draftBtn
              .getAttribute('aria-label')
              .catch(() => null);
            await draftBtn.click({ force: true });

            // Confirm pick accepted: the button should disappear from available players
            const wasAccepted = ariaLabel
              ? await page
                  .getByRole('button', { name: ariaLabel, exact: true })
                  .waitFor({ state: 'hidden', timeout: 8_000 })
                  .then(() => true)
                  .catch(() => false)
              : true;

            if (wasAccepted) {
              pickCount++;
              consecutiveMisses = 0;
            }
          } else {
            // "YOUR PICK" visible but button not ready — give the UI a moment
            await page.waitForTimeout(1_000);
          }
        } else {
          // AI's turn — nudge the server directly every 5 s and poll for
          // the pick to advance. The browser-side timer also fires, giving two
          // independent mechanisms so either one completing unblocks the draft.
          consecutiveMisses++;

          if (consecutiveMisses > MAX_MISSES) {
            // Force-reload the page to resync state after prolonged inactivity
            await page.reload();
            await page.waitForLoadState('load');
            await page.waitForTimeout(3_000);
            consecutiveMisses = 0;
            lastNudgeMs = -Infinity;
          }

          // Actively nudge the server so AI picks don't depend on the
          // browser-side timer (which page reloads can disrupt).
          const now = Date.now();
          if (now - lastNudgeMs >= NUDGE_INTERVAL_MS) {
            await nudgeDraftPick();
            lastNudgeMs = now;
          }

          await page.waitForTimeout(1_000);
        }
      }

      expect(pickCount).toBeGreaterThan(0);
    });

    await test.step('Verify draft is complete', async () => {
      // Poll until "Draft Complete!" appears (in case we exited loop early)
      await expect(page.getByText('Draft Complete!').first()).toBeVisible({
        timeout: 120_000, // 2-minute final grace period
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — VERIFY MOCK-DRAFT COMPLETION MESSAGE
  // -----------------------------------------------------------------

  test('Phase 4: Verify mock-draft completion screen', async ({
    commissionerPage: page,
  }) => {
    // Each test gets a fresh page context, so navigate to the draft board
    await page.goto(`/baseball/league/${state.leagueId}/draft`);
    await page.waitForLoadState('load');

    await test.step('Verify "Draft Complete!" heading is shown', async () => {
      await expect(page.getByText('Draft Complete!').first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step('Verify "Practice Again" CTA button is shown (mock-draft exclusive)', async () => {
      // "Practice Again" only renders when isMockDraft is true — it may
      // take a moment for the league query to resolve on a cold load.
      // The Apollo cache may not have isMockDraft on the first load, so
      // retry with reloads up to 3 times.
      const practiceBtn = page.getByRole('button', { name: /Practice Again/i });
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await practiceBtn.isVisible({ timeout: 5_000 }).catch(() => false))
          break;
        await page.reload();
        await page.waitForLoadState('load');
        await expect(page.getByText('Draft Complete!').first()).toBeVisible({
          timeout: 15_000,
        });
        await page.waitForTimeout(2_000);
      }
      await expect(practiceBtn).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Verify mock-draft-specific message', async () => {
      // Now that isMockDraft is loaded, check the descriptive text
      await expect(
        page.getByText(/No rosters were saved|practice draft/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('"Practice Again" navigates back to setup screen', async () => {
      await page.getByRole('button', { name: /Practice Again/i }).click();
      await expect(page).toHaveURL(/\/baseball\/mock-draft/, {
        timeout: 10_000,
      });
      await expect(
        page.getByRole('heading', { name: /Mock Draft Simulator/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
