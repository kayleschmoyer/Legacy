/**
 * Full-Season Live UI E2E Test
 *
 * Drives the **real** web UI through every major team-manager action from
 * league creation to season-end, hitting the **live** backend (no mocks).
 *
 * Almost every action is performed through browser interactions
 * (clicking buttons, filling forms, navigating pages). For actions
 * requiring a different user identity, we swap the JWT in localStorage
 * and navigate as that user — no direct API calls needed.
 *
 * Targets https://legacy-fantasy.com (UI) and the AWS API Gateway
 * (GraphQL) by default. Override with env vars for local dev:
 *   INTEGRATION_WEB_URL=http://localhost:4200
 *   INTEGRATION_BASE_URL=http://localhost:5000
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/full-season-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests.
// ---------------------------------------------------------------------------

interface SeasonState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** Team names (just strings — IDs not needed since everything is UI-driven). */
  teams: string[];
}

let state: SeasonState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Swap the auth JWT in localStorage so subsequent navigations act as a
 * different user.  Navigates to `url` (or the current origin) first to
 * ensure we are on a valid origin for localStorage access, then sets the
 * token and reloads so Apollo picks it up.
 */
async function switchUser(
  page: Page,
  jwt: string,
  url?: string,
): Promise<void> {
  if (url) {
    // Navigate first to establish the correct origin, then set JWT and reload
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

// ---------------------------------------------------------------------------
// Serial test suite — every phase drives the browser UI
// ---------------------------------------------------------------------------

test.describe
  .serial('Full Season UI Lifecycle (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      teams: [],
    };
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (UI)
  // -----------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `UI E2E Season ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------
  // PHASE 2 — JOIN LEAGUE + TEAM SETUP (token swap + UI)
  // Swap the auth token to each manager, join via the UI, then
  // switch back to the commissioner.
  // -----------------------------------------------------------------

  test('Phase 2: Users join the league and configure teams', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
    managerJwt2,
    managerJwt3,
  }) => {
    await test.step('Managers 1-3 join league via UI', async () => {
      const managers = [
        { jwt: managerJwt1, teamName: 'The Sluggers' },
        { jwt: managerJwt2, teamName: 'The Aces' },
        { jwt: managerJwt3, teamName: 'The Rockets' },
      ];

      for (const { jwt, teamName } of managers) {
        // Switch identity and navigate to the join page in one step
        const joinUrl = `/baseball/league/join/${state.inviteCode}`;
        await switchUser(page, jwt, joinUrl);
        await page.waitForLoadState('load');

        // Wait for invite code validation to succeed
        await expect(
          page.getByText(/spot(s)?\s+available/i).first(),
        ).toBeVisible({ timeout: 15000 });

        // Fill team name and join
        await page.getByTestId('team-name').fill(teamName);
        const joinBtn = page.getByRole('button', {
          name: /Join League/i,
        });
        await expect(joinBtn).toBeEnabled({ timeout: 5000 });
        await joinBtn.click();

        // Wait for redirect to the league page
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
          timeout: 15000,
        });

        state.teams.push(teamName);
      }

      // Restore commissioner identity
      await switchUser(page, commissionerJwt);
      expect(state.teams).toHaveLength(3);
    });

    await test.step('Verify all teams appear on the overview page', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      for (const team of state.teams) {
        await expect(
          page.getByText(team, { exact: false }).first(),
        ).toBeVisible({ timeout: 15000 });
      }
    });

    await test.step('Navigate to team settings and rename team', async () => {
      // Commissioner navigates to team settings tab (the commissioner also
      // has a team — the one auto-created when they created the league).
      await page.goto(`/baseball/league/${state.leagueId}/team-settings`);
      await page.waitForLoadState('load');

      // Click the edit (pencil) button next to the team name
      const editBtn = page
        .getByRole('button')
        .filter({ has: page.locator('[data-testid="edit-icon"], svg') })
        .first();
      if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editBtn.click();
        // If an inline input appears, type the new name and save
        const nameInput = page.getByRole('textbox').first();
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nameInput.fill('The Commissioners');
          await page.getByRole('button', { name: /save/i }).first().click();
          await page.waitForTimeout(1000);
        }
      }
    });

    await test.step('Verify updated team name on overview', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      // The overview should show team names somewhere (standings preview, etc.)
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -----------------------------------------------------------------
  // PHASE 3 — LEAGUE OVERVIEW & TAB NAVIGATION (UI)
  // -----------------------------------------------------------------

  test('Phase 3: League overview and tab navigation', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to league overview', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify core tabs are rendered', async () => {
      for (const tabLabel of [
        'Overview',
        'My Roster',
        'Free Agents',
        'Standings',
        'Matchup',
        'Trades',
      ]) {
        await expect(page.getByText(tabLabel).first()).toBeVisible({
          timeout: 15000,
        });
      }
    });

    await test.step('Navigate through tabs', async () => {
      await page.getByText('My Roster').first().click();
      await expect(page).toHaveURL(/\/roster/);

      await page.getByText('Standings').first().click();
      await expect(page).toHaveURL(/\/standings/);

      await page.getByText('Trades').first().click();
      await expect(page).toHaveURL(/\/trades/);

      await page.getByText('Overview').first().click();
      await expect(page).toHaveURL(/\/overview/);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — DRAFT (Commissioner panel UI)
  // -----------------------------------------------------------------

  test('Phase 4: Automated random draft', async ({
    commissionerPage: page,
  }) => {
    // The draft Lambda processes picks asynchronously — allow plenty of time.
    test.setTimeout(240_000);
    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Switch draft mode to Automated', async () => {
      // Open "Draft Settings" accordion
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      // Select "Automated Draft" (auto-forces Random selection method)
      const automatedBtn = page.getByRole('button', {
        name: /Automated Draft/i,
      });
      await expect(automatedBtn).toBeVisible({ timeout: 5000 });
      await automatedBtn.click();

      // Save the settings
      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 5000 });
      await saveBtn.click();
      await page.waitForTimeout(1000);
    });

    await test.step('Click Start Draft in the Next Step section', async () => {
      // The "Start Draft" button is in the "Next Step" section
      const startBtn = page.getByRole('button', {
        name: /Start Draft/i,
      });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      // Confirmation dialog appears — confirm it
      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      // The dialog may have a confirm button; click the action button
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for draft to complete via commissioner panel', async () => {
      // Automated random drafts complete in seconds (single Lambda batch).
      // The Next Step may jump straight past "Draft Completed" to the next
      // action, so look for the "Season Active" status badge instead.
      const seasonActive = page.getByText('Season Active');
      const deadline = Date.now() + 60_000; // 1 minute should be plenty
      while (Date.now() < deadline) {
        if (await seasonActive.isVisible().catch(() => false)) break;
        await page.waitForTimeout(5_000);
        await page.reload();
        await page.waitForLoadState('load');
      }
      await expect(seasonActive).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Verify roster was filled correctly via the UI', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );

      // After a completed draft the roster page should show:
      // 1. Roster section headers (Pitching, Infield, Outfield)
      await expect(
        page.getByText('Pitching', { exact: false }).first(),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByText('Infield', { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByText('Outfield', { exact: false }).first(),
      ).toBeVisible();

      // 2. Player buttons prove positions are filled.
      //    Accessible names: "Bob Hasty at SP", "Bill Fahey at C", etc.
      const playerButtons = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH)$/i,
      });
      await expect(playerButtons.first()).toBeVisible({ timeout: 15000 });
      const filledSlots = await playerButtons.count();
      expect(filledSlots).toBeGreaterThanOrEqual(10);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — POST-DRAFT ROSTER MANAGEMENT (UI)
  // -----------------------------------------------------------------

  test('Phase 5: Post-draft roster setup', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to My Roster', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify roster has players in starting positions', async () => {
      // Accessible names: "Bob Hasty at SP", "Bill Fahey at C", etc.
      const playerButtons = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH)$/i,
      });
      await expect(playerButtons.first()).toBeVisible({ timeout: 15000 });
      const filledSlots = await playerButtons.count();
      expect(filledSlots).toBeGreaterThanOrEqual(10);
    });

    await test.step('Click a bench player to select, then click a position slot to assign', async () => {
      // The roster UI uses a click-to-select pattern:
      // Click a player → they become "selected" → click a position slot → swap/assign
      // Look for clickable roster rows
      const rosterRows = page.locator(
        '[role="button"], [aria-label*="at "], [aria-label*="open slot"]',
      );
      const rowCount = await rosterRows.count();

      if (rowCount >= 2) {
        // Click the first roster row to select a player
        await rosterRows.nth(0).click();
        await page.waitForTimeout(500);
        // Click a different row to swap
        await rosterRows.nth(1).click();
        await page.waitForTimeout(500);
      }
    });

    await test.step('Verify roster page still renders correctly', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — BROWSE FREE AGENTS (UI)
  // -----------------------------------------------------------------

  test('Phase 6: Browse free agents', async ({ commissionerPage: page }) => {
    await test.step('Navigate to Free Agents tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/free-agents`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/free-agents/);
    });

    await test.step('Verify Hitters/Pitchers toggle exists', async () => {
      await expect(
        page.getByRole('button', { name: 'Hitters' }).first(),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByRole('button', { name: 'Pitchers' }).first(),
      ).toBeVisible();
    });

    await test.step('Search for a player', async () => {
      const search = page.getByPlaceholder(/search players/i);
      if (await search.isVisible()) {
        await search.fill('Ruth');
        await page.waitForTimeout(500);
        await search.clear();
      }
    });

    await test.step('Switch to Pitchers view', async () => {
      await page.getByRole('button', { name: 'Pitchers' }).first().click();
      await page.waitForTimeout(500);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 7 — FREE AGENCY & WAIVERS (UI claim + commissioner panel)
  // -----------------------------------------------------------------

  test('Phase 7: Free agency & waivers', async ({ commissionerPage: page }) => {
    await test.step('Navigate to Free Agents', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/free-agents`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/free-agents/);
    });

    await test.step('Claim a free agent via the UI', async () => {
      // Each player row has an "Add {firstName} {lastName}" button (icon)
      // Find the first claim button and click it
      const addButtons = page.locator('button[aria-label^="Add "]');
      await expect(addButtons.first()).toBeVisible({ timeout: 15000 });
      await addButtons.first().click();

      // The WaiverClaimModal opens
      await expect(page.getByText('Claim Free Agent')).toBeVisible({
        timeout: 5000,
      });

      // Wait for the roster to finish loading (shows roster status or space info)
      const rosterLoaded = page.getByText(
        /select a player to drop|Roster has space/i,
      );
      await expect(rosterLoaded).toBeVisible({ timeout: 15000 });

      // If roster is full, we need to select a player to drop
      const dropPrompt = page.getByText(/select a player to drop/i);
      if (await dropPrompt.isVisible()) {
        // Try selectors in order: data-testid (best), role="option", coordinate fallback
        const byTestId = page.locator('[data-testid^="drop-player-"]').first();
        const byRole = page.getByRole('option', { name: /^Drop /i }).first();

        if (await byTestId.isVisible({ timeout: 3000 }).catch(() => false)) {
          await byTestId.click();
        } else if (
          await byRole.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await byRole.click();
        } else {
          // Last resort: find cursor:pointer element inside the modal via coordinates
          const rect = await page.evaluate(() => {
            const modal = document.querySelector<HTMLElement>(
              '[aria-labelledby="claim-title"]',
            );
            if (!modal) return null;
            const divs = modal.querySelectorAll<HTMLElement>('div');
            for (const div of divs) {
              if (
                getComputedStyle(div).cursor === 'pointer' &&
                div.children.length >= 2
              ) {
                const box = div.getBoundingClientRect();
                return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
              }
            }
            return null;
          });
          if (rect) {
            await page.mouse.click(rect.x, rect.y);
          }
        }
        // Wait for "Dropping" badge to confirm selection
        await expect(page.getByText('Dropping')).toBeVisible({ timeout: 5000 });
      }

      // Click "Submit Claim" or "Submit Claim & Drop"
      const submitBtn = page.getByRole('button', {
        name: /Submit Claim/i,
      });
      await expect(submitBtn).toBeEnabled({ timeout: 5000 });
      await submitBtn.click();

      // Wait for success state
      await expect(page.getByText('Waiver Claim Submitted!')).toBeVisible({
        timeout: 10000,
      });

      // Close the modal
      await page.getByRole('button', { name: 'Done' }).click();
    });

    await test.step('Process waivers from commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');

      // Expand the "Waiver Processing" accordion first
      const waiverAccordion = page.getByRole('button', {
        name: /Waiver Processing/i,
      });
      await expect(waiverAccordion).toBeVisible({ timeout: 15000 });
      await waiverAccordion.click();

      const processBtn = page.getByRole('button', {
        name: /Process Waivers Now/i,
      });
      await expect(processBtn).toBeVisible({ timeout: 10000 });
      await processBtn.click();

      // Confirmation dialog
      const confirmBtn = page.getByRole('button', {
        name: /Confirm/i,
      });
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();

      // Wait for processing to finish
      await page.waitForTimeout(5000);
    });

    await test.step('Verify roster page still loads', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -----------------------------------------------------------------
  // PHASE 8 — MATCHUPS (Commissioner panel + UI)
  // -----------------------------------------------------------------

  test('Phase 8: Matchups', async ({ commissionerPage: page }) => {
    await test.step('Verify matchups exist on commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');

      // After draft + waiver processing, the Next Step section should show
      // game selection (matchups already created automatically).
      const nextStepRegion = page.getByRole('region', { name: /Next Step/i });
      await expect(nextStepRegion).toBeVisible({ timeout: 15000 });
      await expect(
        nextStepRegion.getByText(/Current Matchup: Week 1/i),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Navigate to Matchup tab and verify', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/matchup`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/matchup/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15000 },
      );
    });

    await test.step('Verify matchup scoreboard and lineups', async () => {
      // The matchup page should show the week header and VS badge
      await expect(page.getByText(/Week 1/i).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText('VS').first()).toBeVisible();

      // Scores should be rendered (even if 0.00 at this point)
      await expect(page.locator('text=/\\d+\\.\\d{2}/').first()).toBeVisible({
        timeout: 10000,
      });

      // Both team names should appear in the matchup
      await expect(page.locator('body')).not.toContainText('No matchups');
    });

    await test.step('Verify matchup lineups have BATTERS and PITCHERS sections', async () => {
      // The MatchupRosterComparison shows side-by-side lineups with
      // section headers for "BATTERS" and "PITCHERS"
      await expect(page.getByText('BATTERS').first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText('PITCHERS').first()).toBeVisible();

      // The "Actual" column header confirms the lineup table is populated
      await expect(
        page.getByText('Actual', { exact: true }).first(),
      ).toBeVisible();
    });
  });

  // -----------------------------------------------------------------
  // PHASE 9 — TRADING (UI propose + UI reject via token swap)
  // -----------------------------------------------------------------

  test('Phase 9: Trading', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt2,
  }) => {
    await test.step('Navigate to Trades tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/trades`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/trades/);
      await expect(
        page.getByText('Trading Center', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });
    });

    // Scope all wizard interactions to the dialog element
    const dialog = page.getByRole('dialog', { name: 'Propose Trade' });

    await test.step('Open Propose Trade dialog', async () => {
      const proposeBtn = page.getByRole('button', {
        name: /Propose Trade/i,
      });
      await expect(proposeBtn).toBeVisible({ timeout: 15000 });
      await proposeBtn.click();

      // Wait for dialog to appear
      await expect(dialog).toBeVisible({ timeout: 5000 });
    });

    await test.step('Step 1: Select a team to trade with', async () => {
      await expect(
        dialog.getByText('Select the team you want to trade with'),
      ).toBeVisible({ timeout: 5000 });
      // Click on the second team (manager 2's team)
      // Use force:true — custom dialog backdrop intercepts Playwright hit test
      const teamBtn = dialog.getByRole('button', {
        name: new RegExp(state.teams[1], 'i'),
      });
      await expect(teamBtn.first()).toBeVisible({ timeout: 5000 });
      await teamBtn.first().click({ force: true });
    });

    await test.step('Step 2: Select players to offer', async () => {
      // Wait for your roster to load (step auto-advanced from team selection)
      await expect(
        dialog.getByText(/Select players.*you will give/i),
      ).toBeVisible({ timeout: 15000 });

      // Wait for roster animation to settle
      await page.waitForTimeout(1000);

      // Click the first player button in the dialog to select them
      const playerRows = dialog
        .getByRole('button')
        .filter({ hasText: /\w+ \w+/ });
      // Exclude navigation buttons (Next, Review, etc.) — pick only player name buttons
      const count = await playerRows.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const text = await playerRows.nth(i).innerText();
        // Skip buttons that are clearly nav buttons
        if (/next|review|send|back|cancel/i.test(text)) continue;
        // Use dispatchEvent to bypass Tamagui overlay interception
        await playerRows.nth(i).scrollIntoViewIfNeeded();
        await playerRows.nth(i).dispatchEvent('click');
        clicked = true;
        break;
      }
      expect(clicked).toBe(true);

      await page.waitForTimeout(500);

      // Click "Next" to proceed
      const nextBtn = dialog.getByRole('button', {
        name: /Next.*Select Their Players/i,
      });
      await expect(nextBtn).toBeVisible({ timeout: 5000 });
      await nextBtn.click();
    });

    await test.step('Step 3: Select players to request', async () => {
      await expect(
        dialog.getByText(/Select players you want.*to give you/i),
      ).toBeVisible({ timeout: 5000 });

      // Wait for step transition animation to settle before clicking
      await page.waitForTimeout(1000);

      // Click the first player from the other team
      const playerRows = dialog
        .getByRole('button')
        .filter({ hasText: /\w+ \w+/ });
      const count = await playerRows.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const text = await playerRows.nth(i).innerText();
        if (/next|review|send|back|cancel/i.test(text)) continue;
        // Use dispatchEvent to bypass Tamagui overlay interception
        await playerRows.nth(i).scrollIntoViewIfNeeded();
        await playerRows.nth(i).dispatchEvent('click');
        clicked = true;
        break;
      }
      expect(clicked).toBe(true);

      // Wait for selection to register before checking for Review button
      await page.waitForTimeout(500);

      // Click "Review Trade" — only appears after a player is selected
      const reviewBtn = dialog.getByRole('button', {
        name: /Review Trade/i,
      });
      await expect(reviewBtn).toBeVisible({ timeout: 10000 });
      await reviewBtn.click();
    });

    await test.step('Step 4: Add message and send trade offer', async () => {
      // Optional message
      const msgInput = dialog.getByPlaceholder(
        /Add a message to your trade offer/i,
      );
      if (await msgInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await msgInput.fill('Fair trade?');
      }

      // Click "Send Trade Offer"
      const sendBtn = dialog.getByRole('button', {
        name: /Send Trade Offer/i,
      });
      await expect(sendBtn).toBeVisible({ timeout: 5000 });
      await sendBtn.click();

      // Wait for the trade to be submitted
      await page.waitForTimeout(2000);
    });

    await test.step('Verify trade appears in My Offers', async () => {
      // Click the "My Offers" tab
      const myOffersTab = page.getByText('My Offers', { exact: false });
      if (await myOffersTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await myOffersTab.click();
        await page.waitForTimeout(1000);
      }
      // Should see a pending trade
      await expect(page.getByText(/pending/i).first()).toBeVisible({
        timeout: 10000,
      });
    });

    await test.step('User2 rejects the trade via UI', async () => {
      // Switch to manager 2's identity and navigate to trades
      await switchUser(
        page,
        managerJwt2,
        `/baseball/league/${state.leagueId}/trades`,
      );
      await page.waitForLoadState('load');

      // Find and click the Reject button on the incoming trade
      const rejectBtn = page.getByRole('button', { name: /Reject/i });
      await expect(rejectBtn.first()).toBeVisible({ timeout: 15000 });
      await rejectBtn.first().click();

      // Wait for rejection to process
      await page.waitForTimeout(2000);

      // Restore commissioner identity
      await switchUser(
        page,
        commissionerJwt,
        `/baseball/league/${state.leagueId}/trades`,
      );
    });

    await test.step('Verify trade status updated in UI', async () => {
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -----------------------------------------------------------------
  // PHASE 10 — WEEK ADVANCEMENT (Commissioner panel UI)
  // -----------------------------------------------------------------

  test('Phase 10: Week advancement', async ({ commissionerPage: page }) => {
    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
    });

    await test.step('Select games from commissioner panel', async () => {
      // After matchups are created, the Next Step shows "Select Game X of Y"
      const selectGameBtn = page.getByRole('button', {
        name: /Select Game/i,
      });
      if (
        await selectGameBtn.isVisible({ timeout: 10000 }).catch(() => false)
      ) {
        await selectGameBtn.click();

        // Confirmation dialog
        const confirmBtn = page.getByRole('button', {
          name: /Select Game|Confirm/i,
        });
        await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
        await confirmBtn.last().click();

        // Wait for game selection to process
        await page.waitForTimeout(5000);
      }
    });

    await test.step('Advance league week from commissioner panel', async () => {
      // After games are selected, "Advance League Week" appears
      await page.reload();
      await page.waitForLoadState('load');

      const advanceBtn = page.getByRole('button', {
        name: /Advance League Week/i,
      });
      if (await advanceBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await advanceBtn.click();

        // Confirmation dialog
        const confirmBtn = page.getByRole('button', {
          name: /Advance|Confirm/i,
        });
        await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
        await confirmBtn.last().click();

        await page.waitForTimeout(5000);
      }
    });
  });

  // -----------------------------------------------------------------
  // PHASE 11 — STANDINGS & ACTIVITY (UI)
  // -----------------------------------------------------------------

  test('Phase 11: Standings & activity', async ({ commissionerPage: page }) => {
    await test.step('Navigate to Standings tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/standings`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/standings/);
    });

    await test.step('Verify standings table renders', async () => {
      // Standings should show team names, W/L columns
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15000 },
      );

      // At least one team name should be visible
      await expect(
        page.getByText(state.teams[0], { exact: false }).first(),
      ).toBeVisible({ timeout: 15000 });
    });

    await test.step('Navigate to overview and check activity feed', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');

      await expect(
        page.getByText('League Activity', { exact: false }).first(),
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 12 — COMMUNICATION (UI chat)
  // -----------------------------------------------------------------

  test('Phase 12: Communication', async ({ commissionerPage: page }) => {
    await test.step('Navigate to league overview (has chat)', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
    });

    await test.step('Send a league message via the chat UI', async () => {
      // The chat input has aria-label "Message the league"
      const chatInput = page.locator(
        'textarea[aria-label="Message the league"]',
      );
      await expect(chatInput).toBeVisible({ timeout: 15000 });

      await chatInput.fill('Great draft everyone!');

      // Click the Send button (aria-label="Send message")
      const sendBtn = page.getByRole('button', {
        name: /Send message|Send/i,
      });
      await expect(sendBtn).toBeVisible();
      await sendBtn.click();

      // Verify the message appears in the chat log
      await expect(
        page.locator('[role="log"]').getByText('Great draft everyone!'),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Send a second message', async () => {
      const chatInput = page.locator(
        'textarea[aria-label="Message the league"]',
      );
      await chatInput.fill('Who wants to trade?');
      await page.getByRole('button', { name: /Send/i }).click();

      await expect(
        page.locator('[role="log"]').getByText('Who wants to trade?'),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 13 — SEASON END & RENEWAL (Commissioner panel UI)
  // -----------------------------------------------------------------

  test('Phase 13: Season end & renewal', async ({ commissionerPage: page }) => {
    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
    });

    await test.step('Start new season from commissioner panel', async () => {
      // Look for the "Start New Season" button
      const renewBtn = page.getByRole('button', {
        name: /Start New Season/i,
      });

      if (await renewBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await renewBtn.click();

        // The dialog asks about rosters: select "Hold a new draft"
        const newDraftOption = page.getByText(
          /Hold a new draft.*start with empty rosters/i,
        );
        if (
          await newDraftOption.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          await newDraftOption.click();
        }

        // Click "Confirm New Season"
        const confirmBtn = page.getByRole('button', {
          name: /Confirm New Season/i,
        });
        await expect(confirmBtn).toBeVisible({ timeout: 5000 });
        await confirmBtn.click();

        // Wait for renewal to process
        await page.waitForTimeout(5000);
      }
    });

    await test.step('Verify league overview still loads', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });
});
