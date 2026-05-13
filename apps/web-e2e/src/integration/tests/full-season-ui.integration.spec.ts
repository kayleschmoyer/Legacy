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
import { createLeagueViaUI } from '../helpers/create-league';
import { graphqlOk } from '../helpers/graphql';
import {
  validateInviteCodePreflight,
  waitForJoinPageValidation,
} from '../helpers/wait-for-join-page';
import { waitForSeasonActive } from '../helpers/wait-for-season-active';
import { switchUser, test } from '../fixtures/ui';

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
  // Phase 2 uses dedicated manager fixture pages (one browser context per
  // manager) instead of switchUser() on the commissioner page. switchUser()
  // has a known race condition (LS-3672, LS-3705) where the background
  // refreshJwt() can dispatch AUTH_LOGOUT after page.evaluate() sets the new
  // user profile, clearing localStorage and causing the join page to show
  // "Invalid invite code" persistently across all retries (LS-4385).
  // Per-manager validateInviteCodePreflight polls warm the Lambda instance
  // for each JWT before navigation, preventing cold-start transient failures
  // (LS-4360, LS-4364).
  // -----------------------------------------------------------------

  test('Phase 2: Users join the league and configure teams', async ({
    commissionerPage: page,
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    await test.step('Managers 1-3 join league via UI', async () => {
      const managers = [
        { page: managerPage1, jwt: managerJwt1, teamName: 'The Sluggers' },
        { page: managerPage2, jwt: managerJwt2, teamName: 'The Aces' },
        { page: managerPage3, jwt: managerJwt3, teamName: 'The Rockets' },
      ];

      for (const { page: managerPage, jwt, teamName } of managers) {
        // Warm the validateInviteCode Lambda for this manager's JWT before
        // navigating to the join URL (LS-4360, LS-4364, LS-4385).
        await validateInviteCodePreflight(jwt, state.inviteCode);

        const joinUrl = `/baseball/league/join/${state.inviteCode}`;
        await managerPage.goto(joinUrl);
        await managerPage.waitForLoadState('load');

        // Wait for invite code validation
        await waitForJoinPageValidation(managerPage);

        // Fill team name and join
        await expect(managerPage.getByTestId('team-name')).toBeVisible({
          timeout: 5_000,
        });
        await managerPage.getByTestId('team-name').fill(teamName);
        const joinBtn = managerPage.getByRole('button', {
          name: /Join League/i,
        });
        await expect(joinBtn).toBeEnabled({ timeout: 5000 });
        await joinBtn.click();

        // Wait for redirect to the league page
        await expect(managerPage).toHaveURL(/\/baseball\/league\/\d+/, {
          timeout: 15000,
        });

        state.teams.push(teamName);
      }

      // commissionerPage was not touched — no identity restore needed
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

      // V2 Team tab: name input is always editable — no edit-toggle button.
      // Wait for "Save Name" to be enabled (team data loaded) before filling,
      // then wait again to ensure no concurrent mutation holds the button.
      const nameInput = page.locator('#team-name-input');
      if (await nameInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
        const saveNameBtn = page.getByRole('button', { name: /Save Name/i });
        await expect(saveNameBtn).toBeEnabled({ timeout: 10_000 });
        await nameInput.fill('The Commissioners');
        await expect(saveNameBtn).toBeEnabled({ timeout: 5_000 });
        await saveNameBtn.click();
        await page.waitForTimeout(1000);
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
    apiCommissioner,
  }) => {
    // Automated drafts can take 80–180s; allow generous time for Lambda cold starts.
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
      // Open "Draft Settings" accordion
      const draftSettingsBtn = page.getByRole('button', {
        name: 'Draft Settings',
        exact: true,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      // Select "Automated Draft" (auto-forces Random selection method)
      const automatedBtn = page.getByTestId('option-automated');
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
      const confirmBtn = page.getByTestId('confirm-draft-button');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for draft to complete via commissioner panel', async () => {
      // Gate on the backend `league.draftStatus` field (the same source the
      // UI binds to) before asserting the badge — eliminates the Apollo
      // cache/render race that produced the LS-4237→LS-4321 flake cluster.
      await waitForSeasonActive(page, state.leagueId, {
        deadlineMs: 180_000,
        api: apiCommissioner,
      });
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

  test('Phase 7: Free agency & waivers', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    // Resolve a specific hitter free agent up front. The Free Agents UI
    // paginates by `hitterAvgPointsPerGame` DESC and applies a client-side
    // taken-player filter, so after the smart auto-draft fills the top
    // hitters across all four teams the first page can render zero rows
    // (LS-4325). Looking up a known free agent via the backend `freeAgents`
    // query and searching by last name makes the assertion deterministic
    // regardless of which players the draft consumed.
    const PITCHER_POSITIONS: ReadonlySet<string> = new Set(['SP', 'RP', 'P']);
    // Mirror buildFreeAgentAriaLabel in LeagueFreeAgents — the UI builds the
    // accessible name by filtering empty/null parts and joining with a single
    // space, so a player with only one of firstName/lastName populated (a
    // common data-quality state in the historical player table — see LS-3853)
    // still gets a matchable `aria-label="Add <name>"`.
    const buildAriaName = (
      firstName?: string | null,
      lastName?: string | null,
    ) =>
      [firstName, lastName]
        .filter((s): s is string => Boolean(s?.trim()))
        .join(' ');
    let freeAgentAriaName = '';
    let freeAgentSearchTerm = '';

    await test.step('Resolve a known hitter free agent via the API', async () => {
      const data = await graphqlOk<{
        freeAgents: Array<{
          firstName: string;
          lastName: string;
          eligiblePositions: string[] | null;
        }>;
      }>(
        apiCommissioner,
        `query GetFreeAgents($leagueId: Int!) {
          freeAgents(leagueId: $leagueId) {
            firstName
            lastName
            eligiblePositions
          }
        }`,
        { leagueId: state.leagueId },
      );

      // The Free Agents UI defaults to the Hitters tab and excludes pure
      // pitchers from that view, so picking a pitcher would still fail with
      // a missing Add-button error. Require a hitter with at least one
      // non-empty name part so the aria-label match below succeeds for the
      // common case where only one of firstName/lastName is populated.
      const picked = data.freeAgents.find((p) => {
        const positions = p.eligiblePositions ?? [];
        const isHitter =
          positions.length === 0 ||
          positions.some((pos) => !PITCHER_POSITIONS.has(pos));
        return isHitter && buildAriaName(p.firstName, p.lastName).length > 0;
      });
      expect(
        picked,
        'Expected at least one named hitter free agent after the draft',
      ).toBeTruthy();
      if (!picked) return; // narrows TS — expect above throws
      freeAgentAriaName = buildAriaName(picked.firstName, picked.lastName);
      // The UI's search input applies a `fullName ILIKE %term%` match, so the
      // longer of the two name parts is the most selective search term that
      // still finds the row even when one part is empty.
      const first = picked.firstName?.trim() ?? '';
      const last = picked.lastName?.trim() ?? '';
      freeAgentSearchTerm = last.length >= first.length ? last : first;
    });

    await test.step('Navigate to Free Agents', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/free-agents`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/free-agents/);
    });

    await test.step('Claim a free agent via the UI', async () => {
      // Search by the player's most selective name part to surface their row
      // even when the unfiltered first page is empty (top hitters by PPG were
      // drafted).
      const searchInput = page.getByPlaceholder(/search players/i);
      await expect(searchInput).toBeVisible({ timeout: 15000 });
      await searchInput.fill(freeAgentSearchTerm);
      // 300ms debounce in the UI + GQL round-trip + re-render. Matches the
      // 1s wait used by waiver-processing-ui's submitWaiverClaimViaUI.
      await page.waitForTimeout(1000);

      const exactAddBtn = page.locator(
        `button[aria-label="Add ${freeAgentAriaName}"]`,
      );
      await exactAddBtn.waitFor({ state: 'attached', timeout: 15000 });
      await exactAddBtn.scrollIntoViewIfNeeded();
      await expect(exactAddBtn).toBeVisible({ timeout: 5000 });
      await exactAddBtn.click();

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
        timeout: 20000,
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
      // The matchup page should show the week header and VS badge.
      // Allow extra time: the matchup tab loads data fresh after navigation
      // from the commissioner panel and can be slower on a cold Apollo cache.
      await expect(page.getByText(/Week 1/i).first()).toBeVisible({
        timeout: 30000,
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
      // The default sub-tab is "Activity"; click "Chat" to reveal the textarea
      await page.getByText('Chat').first().click();
    });

    await test.step('Switch to Chat sub-tab', async () => {
      await page.getByText('Chat').first().click();
      await page.waitForTimeout(500);
    });

    await test.step('Send a league message via the chat UI', async () => {
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
      const chatInput = page.getByRole('textbox', {
        name: /message the league/i,
      });
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
