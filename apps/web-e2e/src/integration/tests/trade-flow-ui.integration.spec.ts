/**
 * Trade Flow UI Integration Test (LS-750)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Validates the full trade lifecycle:
 *   1. Commissioner creates a 2-team league, manager joins
 *   2. Automated draft populates both rosters with players
 *   3. Commissioner proposes a trade to the manager (via the Trading Center UI)
 *   4. Manager rejects the incoming offer
 *   5. Manager sends a counter-offer back to the commissioner
 *   6. Commissioner accepts the counter-offer
 *   7. API verifies the accepted trade is persisted in the database
 *   8. Both users can see the completed trade in Trade History
 *
 * Prerequisites:
 *   - A running dev/staging environment (or local Docker stack)
 *   - `./ls-cli.ps1 auth login` run so ~/.legacy-sports/auth.json is valid
 *   - At least 1 non-admin user in the database to impersonate as the manager
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/trade-flow-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cleanupLeague } from '../helpers/cleanup-league';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { waitForSeasonActive } from '../helpers/wait-for-season-active';
import { test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface TradeFlowState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** Commissioner's team ID (resolved via API after draft) */
  commissionerTeamId: number;
  /** Manager's team ID (resolved via API after draft) */
  managerTeamId: number;
  /** ID of the trade the commissioner proposed (for history verification) */
  proposedTradeId: number;
  /** ID of the counter-offer the manager proposed */
  counterTradeId: number;
}

let state: TradeFlowState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Trades tab and wait for the Trading Center heading to appear.
 */
async function goToTrades(page: Page, leagueId: number): Promise<void> {
  await page.goto(`/baseball/league/${leagueId}/trades`);
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/trades/, { timeout: 15000 });
  await expect(page.getByTestId('trade-center-heading')).toBeVisible({
    timeout: 20000,
  });
}

/**
 * Use the 4-step "Propose Trade" UI dialog to send a trade offer.
 *
 * @param page          - Playwright Page authenticated as the proposing user
 * @param toTeamName    - Visible name of the receiving team to click
 *
 * The dialog flow: Select Team → Select offering players (first available) →
 * Select requesting players (first available) → Confirm and Send.
 */
async function proposeTradeViaUI(
  page: Page,
  toTeamName: string | RegExp,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /Propose Trade/i });

  // Open the dialog
  const proposeBtn = page
    .getByRole('button', { name: /propose trade/i })
    .first();
  await expect(proposeBtn).toBeVisible({ timeout: 10000 });
  await proposeBtn.click();

  // Step 1: Select the target team
  await expect(
    page.getByText(/select the team you want to trade with/i),
  ).toBeVisible({ timeout: 10000 });
  const teamBtn = page.getByText(toTeamName, { exact: false }).first();
  await expect(teamBtn).toBeVisible({ timeout: 10000 });
  await teamBtn.click();

  // Step 2: Select at least one player to offer (first available)
  await expect(page.getByText(/you will give/i).first()).toBeVisible({
    timeout: 10000,
  });

  // Wait for player buttons to render (not just the always-present close button).
  // Using .first() races against myPlayers loading — the X close button resolves
  // immediately before data arrives. Poll until count > 1 (close + ≥1 player).
  const dialogButtons = dialog.getByRole('button');
  await expect
    .poll(async () => dialogButtons.count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  const dialogCount = await dialogButtons.count();

  // Click the first player button (skip navigation/step buttons)
  let playerClicked = false;
  for (let i = 0; i < dialogCount; i++) {
    const btn = dialogButtons.nth(i);
    const text = (await btn.textContent()) ?? '';
    const trimmed = text.trim();
    // Player name buttons have substantial text and don't match navigation labels
    if (
      trimmed.length > 3 &&
      !/^(?:[←→]\s*)?(?:next|back|send|propose|review|cancel|confirm|\d|✓)(?:\s*[←→])?$/i.test(
        trimmed,
      ) &&
      !/next.*select|select their/i.test(trimmed)
    ) {
      await btn.click();
      playerClicked = true;
      break;
    }
  }
  expect(playerClicked).toBe(true);

  // Click "Next — Select Their Players" (must wait — appears after selection)
  const nextBtn = page.getByRole('button', {
    name: /Next.*Select Their Players/i,
  });
  await expect(nextBtn).toBeVisible({ timeout: 10_000 });
  await nextBtn.click();

  // Step 3: Select at least one player to request (first available)
  await expect(page.getByText(/give you/i).first()).toBeVisible({
    timeout: 10000,
  });

  // Wait for player list to load. The 'request' step always has 2 non-player
  // buttons (X close + ← Back), so poll until count > 2 to ensure at least
  // one player button has rendered (mirrors Step 2's poll but with threshold 2).
  const dialogButtons2 = dialog.getByRole('button');
  await expect
    .poll(async () => dialogButtons2.count(), { timeout: 15_000 })
    .toBeGreaterThan(2);
  const dialogCount2 = await dialogButtons2.count();

  let requestPlayerClicked = false;
  for (let i = 0; i < dialogCount2; i++) {
    const btn = dialogButtons2.nth(i);
    const text = (await btn.textContent()) ?? '';
    const trimmed = text.trim();
    if (
      trimmed.length > 3 &&
      !/^(?:[←→]\s*)?(?:next|back|send|propose|review|cancel|confirm|\d|✓)(?:\s*[←→])?$/i.test(
        trimmed,
      ) &&
      !/review trade/i.test(trimmed)
    ) {
      await btn.click();
      requestPlayerClicked = true;
      break;
    }
  }
  expect(requestPlayerClicked).toBe(true);

  // Click "Review Trade" (must wait — appears after selection)
  const reviewBtn = page.getByRole('button', { name: /Review Trade/i });
  await expect(reviewBtn).toBeVisible({ timeout: 10_000 });
  await reviewBtn.click();

  // Step 4: Confirm — click "Send Trade Offer"
  await expect(
    page.getByRole('button', { name: /Send Trade Offer/i }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Send Trade Offer/i }).click();

  // The dialog should close after successful submission
  await expect(
    page.getByRole('button', { name: /Send Trade Offer/i }),
  ).not.toBeVisible({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Serial test suite — phases share `state` and must run in order.
// ---------------------------------------------------------------------------

test.describe
  .serial('Trade Flow UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      commissionerTeamId: 0,
      managerTeamId: 0,
      proposedTradeId: 0,
      counterTradeId: 0,
    };
  });

  // Layer-2 per-test league cleanup (LS-4539). Removes orphans even when the
  // test body throws — Playwright still runs afterAll on test failure. Process
  // crashes are caught by global-teardown (Layer 3) and the next run's
  // pre-run sweep in global-setup (Layer 1).
  test.afterAll(async ({ apiCommissioner }) => {
    await cleanupLeague(apiCommissioner, state.leagueId);
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (commissioner creates a 2-team league)
  // -----------------------------------------------------------------

  test('Phase 1: Commissioner creates a 2-team league', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Trade Flow E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
      teamCount: 2,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------
  // PHASE 2 — MANAGER JOINS THE LEAGUE
  // -----------------------------------------------------------------

  test('Phase 2: Manager joins the league', async ({
    managerJwt1,
    managerPage1,
  }) => {
    // Dedicated managerPage1 context instead of switchUser — avoids the
    // AUTH_LOGOUT race documented in LS-3672/LS-3705 and applied to
    // playoff-bracket-ui Phase 2 in LS-4270. The commissioner's browser
    // context is untouched, so no "Restore commissioner identity" step
    // is needed before later phases reuse `commissionerPage`.
    await test.step('Manager 1 joins via the invite code UI', async () => {
      // Full join orchestration lives in joinLeagueAsManager (LS-4447).
      await joinLeagueAsManager(managerPage1, {
        jwt: managerJwt1,
        inviteCode: state.inviteCode,
        teamName: 'Trade Busters',
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT (populates both rosters)
  // -----------------------------------------------------------------

  test('Phase 3: Automated draft populates both rosters', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    // Automated drafts can take 120–240s; allow generous time for Lambda cold starts
    test.setTimeout(360_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Switch draft mode to Automated', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: 'Draft Settings',
        exact: true,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      const automatedBtn = page.getByTestId('option-automated');
      await expect(automatedBtn).toBeVisible({ timeout: 5000 });
      await automatedBtn.click();

      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 5000 });
      await saveBtn.click();
      // Save button is disabled iff `!hasChanges || saving`. handleSave sets
      // hasChanges=false on success, so the button stays disabled post-save —
      // it does NOT return to enabled. Waiting for `toBeEnabled` here was a
      // logic error introduced by LS-4457 and always timed out (LS-4480).
      // The correct deterministic signal is `toBeDisabled`, matching the
      // LS-4352 precedent in league-activity-feed-ui.
      await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
    });

    await test.step('Start the draft', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      const confirmBtn = page.getByTestId('confirm-next-step');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for Season Active status', async () => {
      await waitForSeasonActive(page, state.leagueId, {
        deadlineMs: 240_000,
        api: apiCommissioner,
      });
    });

    await test.step('Verify commissioner roster was populated', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
      const playerButtons = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH)$/i,
      });
      await expect(playerButtons.first()).toBeVisible({ timeout: 15000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — RESOLVE TEAM IDs via API
  // -----------------------------------------------------------------

  test('Phase 4: Resolve commissioner and manager team IDs', async ({
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Fetch league teams and assign IDs', async () => {
      const data = await gqlFetch<{
        leagueTeams: Array<{
          id: number;
          name: string;
          managerId: number | null;
        }>;
      }>(
        commissionerJwt,
        `query GetLeagueTeams($leagueId: Int!) {
            leagueTeams(leagueId: $leagueId) { id name managerId }
          }`,
        { leagueId: state.leagueId },
      );

      expect(data.leagueTeams.length).toBeGreaterThanOrEqual(2);

      // Identify each user's team directly via the userTeamId query
      const { userTeamId: commTeamId } = await gqlFetch<{
        userTeamId: number;
      }>(
        commissionerJwt,
        `query GetUserTeamId($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
        { leagueId: state.leagueId },
      );
      const { userTeamId: mgrTeamId } = await gqlFetch<{
        userTeamId: number;
      }>(
        managerJwt1,
        `query GetUserTeamId($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
        { leagueId: state.leagueId },
      );

      expect(commTeamId).toBeTruthy();
      expect(mgrTeamId).toBeTruthy();

      state.commissionerTeamId = commTeamId;
      state.managerTeamId = mgrTeamId;
      expect(state.commissionerTeamId).toBeGreaterThan(0);
      expect(state.managerTeamId).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — COMMISSIONER PROPOSES TRADE TO MANAGER (via UI)
  // -----------------------------------------------------------------

  test('Phase 5: Commissioner proposes a trade offer', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to Trades tab', async () => {
      await goToTrades(page, state.leagueId);
    });

    await test.step("Propose a trade to the manager's team", async () => {
      await proposeTradeViaUI(page, /trade busters/i);
    });

    await test.step('Verify the outgoing trade offer appears in the UI', async () => {
      await expect(
        page.getByText('Outgoing Offers', { exact: true }).first(),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText('To: Trade Busters', { exact: false }).first(),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Verify the trade was persisted via API', async () => {
      let proposedTradeId = 0;

      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamTradeOffers: Array<{
                id: number;
                status: string;
                proposingTeamId: number;
                receivingTeamId: number;
              }>;
            }>(
              commissionerJwt,
              `query GetTeamTradeOffers($teamId: Int!, $status: String) {
                  teamTradeOffers(teamId: $teamId, status: $status) {
                    id status proposingTeamId receivingTeamId
                  }
                }`,
              { teamId: state.commissionerTeamId, status: 'pending' },
            );

            const pending = data.teamTradeOffers.filter(
              (t) =>
                t.proposingTeamId === state.commissionerTeamId &&
                t.receivingTeamId === state.managerTeamId,
            );

            if (pending.length > 0) {
              proposedTradeId = pending[0].id;
            }
            return pending.length;
          },
          {
            timeout: 20_000,
            intervals: [1_000, 2_000, 3_000],
            message:
              `Proposed trade (proposingTeamId=${state.commissionerTeamId}, ` +
              `receivingTeamId=${state.managerTeamId}) not found ` +
              'in teamTradeOffers API response',
          },
        )
        .toBeGreaterThan(0);

      state.proposedTradeId = proposedTradeId;
      expect(state.proposedTradeId).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — MANAGER REJECTS THE OFFER (via UI)
  // -----------------------------------------------------------------

  test('Phase 6: Manager rejects the incoming trade offer', async ({
    managerPage1,
    commissionerJwt,
  }) => {
    // Dedicated managerPage1 context instead of switchUser — avoids the
    // AUTH_LOGOUT race documented in LS-3672/LS-3705/LS-3735 and fixed here
    // per LS-3767. The commissioner's browser context is untouched.
    await test.step('Navigate to Trades tab as manager', async () => {
      await managerPage1.goto(`/baseball/league/${state.leagueId}/trades`);
      await managerPage1.waitForLoadState('load');
      await expect(
        managerPage1.getByTestId('trade-center-heading'),
      ).toBeVisible({ timeout: 20000 });
    });

    await test.step('Verify incoming offer is visible', async () => {
      await expect(
        managerPage1.getByText('Incoming Offers', { exact: false }),
      ).toBeVisible({ timeout: 10000 });
      await expect(managerPage1.getByText(/from:/i).first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Click Reject on the incoming offer', async () => {
      const rejectBtn = managerPage1
        .getByRole('button', { name: /Reject/i })
        .first();
      await expect(rejectBtn).toBeVisible({ timeout: 10000 });
      await rejectBtn.click();
      // The Reject button disappears (or the row re-renders) once the
      // rejectTradeOffer mutation returns; the API poll in the next step
      // also gates on `status === 'rejected'` so this UI wait is a
      // best-effort signal that the click landed (LS-4457).
      await expect(rejectBtn).toBeHidden({ timeout: 15_000 });
    });

    await test.step('Verify trade is marked rejected via API', async () => {
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamTradeOffers: Array<{ id: number; status: string }>;
            }>(
              commissionerJwt,
              `query GetTeamTradeOffers($teamId: Int!) {
                  teamTradeOffers(teamId: $teamId) { id status }
                }`,
              { teamId: state.commissionerTeamId },
            );
            const trade = data.teamTradeOffers.find(
              (t) => t.id === state.proposedTradeId,
            );
            return trade?.status;
          },
          {
            timeout: 15_000,
            intervals: [1_000, 2_000, 3_000],
            message: `Trade ${state.proposedTradeId} did not reach 'rejected' status`,
          },
        )
        .toBe('rejected');
    });
  });

  // -----------------------------------------------------------------
  // PHASE 7 — MANAGER SENDS A COUNTER-OFFER (via UI)
  // A counter is: reject the original → propose a new trade in reverse.
  // Phase 6 handled the rejection; here the manager now proposes back.
  // -----------------------------------------------------------------

  test('Phase 7: Manager sends a counter-offer to the commissioner', async ({
    managerPage1,
    managerJwt1,
  }) => {
    // Dedicated managerPage1 context (LS-3767) — no switchUser race.
    await test.step('Navigate to Trades tab as manager', async () => {
      await managerPage1.goto(`/baseball/league/${state.leagueId}/trades`);
      await managerPage1.waitForLoadState('load');
      await expect(
        managerPage1.getByTestId('trade-center-heading'),
      ).toBeVisible({ timeout: 20000 });
    });

    await test.step("Propose a counter-offer to the commissioner's team", async () => {
      // The commissioner's team name is whatever was auto-named at league creation.
      // We target it by excluding "Trade Busters" (the manager's own team name).
      // Use a general approach: click Propose Trade and select the first other team.
      const proposeBtn = managerPage1
        .getByRole('button', { name: /propose trade/i })
        .first();
      await expect(proposeBtn).toBeVisible({ timeout: 10000 });
      await proposeBtn.click();

      // Step 1: Select the first team shown (commissioner's team)
      await expect(
        managerPage1.getByText(/select the team you want to trade with/i),
      ).toBeVisible({ timeout: 10000 });

      // Pick the first team button in the dialog
      const counterDialog = managerPage1.getByRole('dialog', {
        name: /Propose Trade/i,
      });
      const teamButtons = counterDialog.getByRole('button');
      // Wait for the dialog to populate with team buttons. The standard
      // backdrop/header carries ~1 button; > 1 means at least one
      // team-selection button has rendered (replaces a fixed 1s wait —
      // LS-4457).
      await expect
        .poll(async () => teamButtons.count(), {
          timeout: 15_000,
          intervals: [500, 1_000],
          message: 'Propose Trade dialog never populated with team buttons',
        })
        .toBeGreaterThan(1);
      const teamCount = await teamButtons.count();
      let teamClicked = false;
      for (let i = 0; i < teamCount; i++) {
        const btn = teamButtons.nth(i);
        const text = (await btn.textContent()) ?? '';
        const trimmed = text.trim();
        if (
          trimmed.length > 2 &&
          !/^(?:[←→]\s*)?(?:next|back|send|propose|review|cancel|confirm|\d|✓)(?:\s*[←→])?$/i.test(
            trimmed,
          )
        ) {
          await btn.click();
          teamClicked = true;
          break;
        }
      }
      expect(teamClicked).toBe(true);

      // Step 2: Select offering player (first available)
      await expect(
        managerPage1.getByText(/you will give/i).first(),
      ).toBeVisible({
        timeout: 10000,
      });
      const offerBtns = counterDialog.getByRole('button');
      // Same race as Phase 5: poll until count > 1 so player buttons are loaded.
      await expect
        .poll(async () => offerBtns.count(), { timeout: 15_000 })
        .toBeGreaterThan(1);
      const offerCount = await offerBtns.count();
      let offerPlayerClicked = false;
      for (let i = 0; i < offerCount; i++) {
        const btn = offerBtns.nth(i);
        const text = (await btn.textContent()) ?? '';
        const trimmed = text.trim();
        if (
          trimmed.length > 3 &&
          !/^(?:[←→]\s*)?(?:next|back|send|propose|review|cancel|confirm|\d|✓)(?:\s*[←→])?$/i.test(
            trimmed,
          )
        ) {
          await btn.click();
          offerPlayerClicked = true;
          break;
        }
      }
      expect(offerPlayerClicked).toBe(true);

      // Click "Next — Select Their Players" (must wait — appears after selection)
      const nextBtn2 = managerPage1.getByRole('button', {
        name: /Next.*Select Their Players/i,
      });
      await expect(nextBtn2).toBeVisible({ timeout: 10_000 });
      await nextBtn2.click();

      // Step 3: Select requesting player (first available)
      await expect(managerPage1.getByText(/give you/i).first()).toBeVisible({
        timeout: 10000,
      });
      const requestBtns = counterDialog.getByRole('button');
      // Wait for at least one player button to load. The dialog always has a
      // Close (X) button in the header (empty text) and a Back button at the
      // bottom — so count > 2 means at least one player button is present.
      // Using .first() here races against theirPlayers loading: the Close button
      // is always first in DOM and resolves immediately before data arrives.
      await expect
        .poll(async () => requestBtns.count(), { timeout: 15_000 })
        .toBeGreaterThan(2);
      const requestCount = await requestBtns.count();
      let requestPlayerClicked2 = false;
      for (let i = 0; i < requestCount; i++) {
        const btn = requestBtns.nth(i);
        const text = (await btn.textContent()) ?? '';
        const trimmed = text.trim();
        if (
          trimmed.length > 3 &&
          !/^(?:[←→]\s*)?(?:next|back|send|propose|review|cancel|confirm|\d|✓)(?:\s*[←→])?$/i.test(
            trimmed,
          )
        ) {
          await btn.click();
          requestPlayerClicked2 = true;
          break;
        }
      }
      expect(requestPlayerClicked2).toBe(true);

      // Click "Review Trade" (must wait — appears after selection)
      const reviewBtn2 = managerPage1.getByRole('button', {
        name: /Review Trade/i,
      });
      await expect(reviewBtn2).toBeVisible({ timeout: 10_000 });
      await reviewBtn2.click();

      // Step 4: Send
      await expect(
        managerPage1.getByRole('button', { name: /Send Trade Offer/i }),
      ).toBeVisible({ timeout: 10000 });
      await managerPage1
        .getByRole('button', { name: /Send Trade Offer/i })
        .click();
      await expect(
        managerPage1.getByRole('button', { name: /Send Trade Offer/i }),
      ).not.toBeVisible({ timeout: 15000 });
    });

    await test.step('Verify counter-offer is visible as outgoing', async () => {
      await expect(
        managerPage1.getByText('Outgoing Offers', { exact: true }),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Verify counter-offer persisted via API', async () => {
      // Use polling to account for eventual visibility across Lambda instances.
      // The mutation commits synchronously, but a subsequent query may hit a
      // different Lambda/connection that hasn't yet observed the committed row.
      let counterTradeId = 0;

      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamTradeOffers: Array<{
                id: number;
                status: string;
                proposingTeamId: number;
                receivingTeamId: number;
              }>;
            }>(
              managerJwt1,
              `query GetTeamTradeOffers($teamId: Int!, $status: String) {
                  teamTradeOffers(teamId: $teamId, status: $status) {
                    id status proposingTeamId receivingTeamId
                  }
                }`,
              { teamId: state.managerTeamId, status: 'pending' },
            );

            const counter = data.teamTradeOffers.find(
              (t) =>
                t.proposingTeamId === state.managerTeamId &&
                t.receivingTeamId === state.commissionerTeamId,
            );

            if (counter) {
              counterTradeId = counter.id;
            }
            return counter?.id ?? 0;
          },
          {
            timeout: 20_000,
            intervals: [1_000, 2_000, 3_000],
            message:
              `Counter-offer (proposingTeamId=${state.managerTeamId}, ` +
              `receivingTeamId=${state.commissionerTeamId}) not found ` +
              'in teamTradeOffers API response',
          },
        )
        .toBeGreaterThan(0);

      state.counterTradeId = counterTradeId;
    });
  });

  // -----------------------------------------------------------------
  // PHASE 8 — COMMISSIONER ACCEPTS THE COUNTER-OFFER (via UI)
  // -----------------------------------------------------------------

  test('Phase 8: Commissioner accepts the counter-offer', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to Trades tab as commissioner', async () => {
      await goToTrades(page, state.leagueId);
    });

    await test.step('Verify the counter-offer appears in Incoming Offers', async () => {
      await expect(
        page.getByText('Incoming Offers', { exact: false }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/from:/i).first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Click Accept on the counter-offer', async () => {
      const acceptBtn = page.getByRole('button', { name: /Accept/i }).first();
      await expect(acceptBtn).toBeVisible({ timeout: 10000 });
      await acceptBtn.click();
      // The Accept button disappears (or the row re-renders) once the
      // acceptTradeOffer mutation returns; the API poll in the next step
      // also gates on `status === 'accepted'` so this UI wait is a
      // best-effort signal that the click landed (LS-4457).
      await expect(acceptBtn).toBeHidden({ timeout: 15_000 });
    });

    await test.step('Verify the accepted trade is persisted via API', async () => {
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamTradeOffers: Array<{ id: number; status: string }>;
            }>(
              commissionerJwt,
              `query GetTeamTradeOffers($teamId: Int!) {
                  teamTradeOffers(teamId: $teamId) { id status }
                }`,
              { teamId: state.commissionerTeamId },
            );
            const trade = data.teamTradeOffers.find(
              (t) => t.id === state.counterTradeId,
            );
            return trade?.status;
          },
          {
            timeout: 20_000,
            intervals: [1_000, 2_000, 3_000],
            message: `Counter-offer ${state.counterTradeId} did not reach 'accepted' status`,
          },
        )
        .toBe('accepted');
    });

    await test.step('Verify rejected offer is gone from Incoming Offers', async () => {
      // The Incoming Offers section should now be empty (no pending offers remain)
      await expect(page.getByText(/No incoming trade offers/i)).toBeVisible({
        timeout: 10000,
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 9 — TRADE HISTORY (both users verify completed trades)
  // -----------------------------------------------------------------

  test('Phase 9: Trade history shows completed trades for both users', async ({
    commissionerPage: page,
    managerPage1,
  }) => {
    await test.step('Commissioner sees accepted trade in Trade History', async () => {
      await goToTrades(page, state.leagueId);

      // Expand Trade History
      const historyBtn = page.getByRole('button', {
        name: /Trade History/i,
      });
      await expect(historyBtn).toBeVisible({ timeout: 10000 });
      await historyBtn.click();

      // Should see at least one completed trade card
      await expect(page.getByText(/ACCEPTED|REJECTED/i).first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Manager sees the accepted trade in Trade History', async () => {
      // Dedicated managerPage1 context (LS-3767) — no switchUser race.
      await managerPage1.goto(`/baseball/league/${state.leagueId}/trades`);
      await managerPage1.waitForLoadState('load');
      await expect(
        managerPage1.getByTestId('trade-center-heading'),
      ).toBeVisible({ timeout: 20000 });

      const historyBtn2 = managerPage1.getByRole('button', {
        name: /Trade History/i,
      });
      await expect(historyBtn2).toBeVisible({ timeout: 10000 });
      await historyBtn2.click();

      // Both the original rejected offer and the accepted counter should appear
      await expect(
        managerPage1.getByText(/ACCEPTED|REJECTED/i).first(),
      ).toBeVisible({
        timeout: 15000,
      });

      const completedBadges = managerPage1.getByText(/ACCEPTED|REJECTED/i);
      const count = await completedBadges.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });
});
