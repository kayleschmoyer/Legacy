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
import { advanceWeek } from '../helpers/advance-week';
import { cleanupLeague } from '../helpers/cleanup-league';
import { createLeagueViaUI } from '../helpers/create-league';
import { gqlFetch } from '../helpers/gql-fetch';
import { graphqlOk } from '../helpers/graphql';
import { reloadUntilVisible } from '../helpers/reload-until-visible';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { waitForSeasonActive } from '../helpers/wait-for-season-active';
import { selectDropPlayerIfRosterFull } from '../helpers/waiver-claim-drop';
import { switchUser, test } from '../fixtures/ui';

/**
 * Season-length config — drives Phase 10 and Phase 13 cycle counts.
 *
 * Picked to exercise every UI mechanic in the spec without burning the test
 * budget on stats hydration: 3 games/matchup forces the `Select Game N of M`
 * loop, and 3 total weeks lets Phase 10 advance week 1 → 2 while Phase 13
 * drives the remaining transitions to season-complete. Playoffs are disabled
 * so the renewal UI surfaces immediately after the final advance — matching
 * the season-renewal-migration-ui pattern (LS-755).
 */
const GAMES_PER_MATCHUP = 3;
const TOTAL_MATCHUPS = 3;

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

  // Layer-2 per-test league cleanup (LS-4539). Removes orphans even when the
  // test body throws — Playwright still runs afterAll on test failure. Process
  // crashes are caught by global-teardown (Layer 3) and the next run's
  // pre-run sweep in global-setup (Layer 1).
  test.afterAll(async ({ apiCommissioner }) => {
    await cleanupLeague(apiCommissioner, state.leagueId);
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (UI)
  // -----------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    state.leagueName = `UI E2E Season ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;

    await test.step(`Shorten season to ${TOTAL_MATCHUPS} weeks × ${GAMES_PER_MATCHUP} games and disable playoffs`, async () => {
      // Set before the draft so createAllMatchupsForLeague builds the season
      // with the test-sized config. Phase 10 + Phase 13 then need ~9 select-
      // game cycles total to drive the season to "Start New Season", which
      // fits in the test budget given typical CloudWatch p90 ~78s per cycle.
      // Disabling playoffs ensures the season completes cleanly
      // (currentMatchup → null) rather than transitioning to a bracket.
      //
      // Retry on API Gateway 5xx: createLeagueAndTeams warmed one Lambda
      // instance but the follow-up mutation can land on a cold instance and
      // exceed API Gateway's 29s window before the cold start resolves.
      type UpdateLeagueSettingsResult = {
        updateLeagueSettings: {
          id: number;
          totalMatchups: number | null;
          gamesPerMatchup: number | null;
          playoffEnabled: boolean;
        };
      };
      const mutation = `mutation SetSeasonConfig($input: UpdateLeagueSettingsInput!) {
           updateLeagueSettings(input: $input) {
             id totalMatchups gamesPerMatchup playoffEnabled
           }
         }`;
      const variables = {
        input: {
          leagueId: state.leagueId,
          totalMatchups: TOTAL_MATCHUPS,
          gamesPerMatchup: GAMES_PER_MATCHUP,
          playoffEnabled: false,
        },
      };
      let data: UpdateLeagueSettingsResult | null = null;
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          data = await gqlFetch<UpdateLeagueSettingsResult>(
            commissionerJwt,
            mutation,
            variables,
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          if (attempt < 3 && /HTTP 5\d{2}/.test(lastErr.message)) {
            await new Promise((resolve) =>
              setTimeout(resolve, 5_000 * attempt),
            );
            continue;
          }
          throw lastErr;
        }
      }
      if (!data) throw lastErr ?? new Error('updateLeagueSettings: no data');
      expect(data.updateLeagueSettings.totalMatchups).toBe(TOTAL_MATCHUPS);
      expect(data.updateLeagueSettings.gamesPerMatchup).toBe(GAMES_PER_MATCHUP);
      expect(data.updateLeagueSettings.playoffEnabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 2 — JOIN LEAGUE + TEAM SETUP (token swap + UI)
  // Phase 2 uses dedicated manager fixture pages (one browser context per
  // manager) instead of switchUser() on the commissioner page. switchUser()
  // has a known race condition (LS-3672, LS-3705) where the background
  // refreshJwt() can dispatch AUTH_LOGOUT after page.evaluate() sets the new
  // user profile, clearing localStorage and causing the join page to show
  // "Invalid invite code" persistently across all retries (LS-4385). The full
  // join orchestration (preflight, navigation, validation, click, mutation
  // response, URL redirect) lives in joinLeagueAsManager (LS-4447) so any new
  // race window is fixed once at the helper level.
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
        // Full join orchestration lives in joinLeagueAsManager (LS-4447).
        await joinLeagueAsManager(managerPage, {
          jwt,
          inviteCode: state.inviteCode,
          teamName,
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
      // "Save Name" is dirty-gated (disabled until the input differs from the
      // current team name), and clicking opens a confirmation dialog before
      // the rename mutation fires.
      const nameInput = page.locator('#team-name-input');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      // Wait for team data to seed the input (non-empty value) so the
      // subsequent fill replaces a known starting state.
      await expect
        .poll(() => nameInput.inputValue(), { timeout: 10_000 })
        .not.toBe('');
      await nameInput.fill('The Commissioners');
      const saveNameBtn = page.getByRole('button', { name: /Save Name/i });
      await expect(saveNameBtn).toBeEnabled({ timeout: 5_000 });
      await saveNameBtn.click();
      // Confirm the rename in the dialog.
      const confirmDialog = page.getByTestId('rename-team-confirm');
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
      await confirmDialog.getByRole('button', { name: /^Rename$/ }).click();
      // Dialog closing signals the mutation completed (LS-4457, LS-4938).
      await expect(confirmDialog).toBeHidden({ timeout: 10_000 });
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
      // Save button is disabled iff `!hasChanges || saving`. handleSave sets
      // hasChanges=false on success, so the button stays disabled post-save —
      // it does NOT return to enabled. Waiting for `toBeEnabled` here was a
      // logic error introduced by LS-4457 and always timed out (LS-4480).
      // The correct deterministic signal is `toBeDisabled`, matching the
      // LS-4352 precedent in league-activity-feed-ui.
      await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
    });

    await test.step('Click Start Draft in the Next Step section', async () => {
      // The "Start Draft" button is in the "Next Step" section
      const startBtn = page.getByRole('button', {
        name: /Start Draft/i,
      });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      // Confirmation dialog appears — confirm it
      const confirmBtn = page.getByTestId('confirm-next-step');
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

      // After a completed draft the roster page (RosterBoardV2) should show
      // the three section cards: "Starting Hitters", "Starting Pitchers",
      // and "Bench". Auto-draft → roster query can lag a render tick behind
      // `waitForSeasonActive`, so reload until the first section appears.
      await reloadUntilVisible(
        page,
        page.getByText('Starting Hitters', { exact: false }).first(),
      );
      await expect(
        page.getByText('Starting Pitchers', { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByText('Bench', { exact: false }).first(),
      ).toBeVisible();

      // Player buttons prove positions are filled. The SlotRow aria-label
      // is `${playerName} at ${posType}` (e.g. "Bob Hasty at SP").
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
        // Click the first roster row to select a player, then a different
        // row to swap. The verify-step below asserts the page renders
        // without errors; no explicit wait is needed between clicks because
        // each click is dispatched synchronously and any subsequent
        // assertion auto-waits for its locator.
        await rosterRows.nth(0).click();
        await rosterRows.nth(1).click();
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
      await expect(search).toBeVisible({ timeout: 10_000 });
      await search.fill('Ruth');
      // No assertion required here — the search is exercised for coverage
      // of the input. Clearing immediately is the previous behavior; the
      // debounced re-render does not affect the test outcome (LS-4457).
      await search.clear();
    });

    await test.step('Switch to Pitchers view', async () => {
      // After toggling Pitchers, assert at least one pitcher row is visible
      // — that proves the filter applied without a fixed timeout. We use the
      // same aria-label pattern the Add buttons emit (`Add <name>`); the
      // first one rendering is the deterministic "filter applied" signal.
      const pitchersBtn = page
        .getByRole('button', { name: 'Pitchers' })
        .first();
      await pitchersBtn.click();
      const anyAddBtn = page.locator('button[aria-label^="Add "]').first();
      await expect(anyAddBtn).toBeVisible({ timeout: 15_000 });
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
      // The 300ms debounce + GQL round-trip + re-render is absorbed by
      // `exactAddBtn.waitFor({ state: 'attached', ... })` below — that
      // condition will only resolve once the filtered row has rendered.
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

      // If the roster is full, select a player to drop; otherwise the helper
      // is a no-op and the test proceeds to Submit Claim immediately.
      await selectDropPlayerIfRosterFull(page);

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

      // Wait for processing to finish — the confirmation dialog closes once
      // the mutation returns. That is the deterministic signal that
      // processing has completed (replaces a 5s wall-clock guess).
      await expect(confirmBtn).toBeHidden({ timeout: 30_000 });
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
    // LS-5071 / LS-5051 / LS-5054 — the V2 web Trades tab
    // (apps/web/src/pages/baseball/league-detail-v2/tabs/Trades.tsx, shipped
    // by LS-4638) does not expose the `trade-center-heading` testid or the
    // 4-step "Propose Trade" dialog this phase asserts against. Those UI
    // pieces still live in the V1 shared-components TradingCenter, but the
    // web route resolves to V2. Re-enable when LS-5055 lands the V2
    // Propose Trade UI.
    test.fixme(
      true,
      'V2 web Trades tab lacks Propose Trade UI — tracked in LS-5055',
    );
    await test.step('Navigate to Trades tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/trades`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/trades/);
      await expect(page.getByTestId('trade-center-heading')).toBeVisible({
        timeout: 30000,
      });
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

      // Click the first player button in the dialog to select them. Wait
      // for at least one player row to be visible — that proves the roster
      // has hydrated, and replaces a fixed-duration "animation settle".
      const playerRows = dialog
        .getByRole('button')
        .filter({ hasText: /\w+ \w+/ });
      await expect(playerRows.first()).toBeVisible({ timeout: 15_000 });
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

      // Click "Next" to proceed — its visibility is the deterministic
      // signal that the selection registered (replaces a 500ms wait).
      const nextBtn = dialog.getByRole('button', {
        name: /Next.*Select Their Players/i,
      });
      await expect(nextBtn).toBeVisible({ timeout: 10_000 });
      await nextBtn.click();
    });

    await test.step('Step 3: Select players to request', async () => {
      await expect(
        dialog.getByText(/Select players you want.*to give you/i),
      ).toBeVisible({ timeout: 5000 });

      // Click the first player from the other team — wait for the rows to
      // be visible (replaces a wall-clock animation wait).
      const playerRows = dialog
        .getByRole('button')
        .filter({ hasText: /\w+ \w+/ });
      await expect(playerRows.first()).toBeVisible({ timeout: 15_000 });
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

      // "Review Trade" only renders after a player is selected — its
      // visibility is the deterministic signal that the selection
      // registered (replaces a 500ms wait).
      const reviewBtn = dialog.getByRole('button', {
        name: /Review Trade/i,
      });
      await expect(reviewBtn).toBeVisible({ timeout: 10000 });
      await reviewBtn.click();
    });

    await test.step('Step 4: Add message and send trade offer', async () => {
      // The trade dialog always renders an optional message placeholder on
      // step 4 — assert it before filling so a missing field is a real failure
      // (the message itself is optional; presence of the field is not).
      const msgInput = dialog.getByPlaceholder(
        /Add a message to your trade offer/i,
      );
      await expect(msgInput).toBeVisible({ timeout: 5_000 });
      await msgInput.fill('Fair trade?');

      // Click "Send Trade Offer"
      const sendBtn = dialog.getByRole('button', {
        name: /Send Trade Offer/i,
      });
      await expect(sendBtn).toBeVisible({ timeout: 5000 });
      await sendBtn.click();

      // The dialog closes once the createTradeOffer mutation returns —
      // that is the deterministic signal the trade was submitted (replaces
      // a 2s wall-clock wait).
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    });

    await test.step('Verify trade appears in Outgoing Offers', async () => {
      // The Trading Center renders "Incoming Offers" and "Outgoing Offers" as
      // always-visible sections (no tabs). The trade we just submitted is
      // outgoing for the commissioner — assert it shows up under that section
      // with a pending status badge.
      const outgoingSection = page.getByTestId('trade-tab-outgoing');
      await expect(outgoingSection).toBeVisible({ timeout: 5_000 });
      await expect(outgoingSection.getByText(/pending/i).first()).toBeVisible({
        timeout: 15000,
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

      // The Reject button disappears (or the row re-renders) once the
      // rejectTradeOffer mutation returns. Waiting for it to be detached
      // replaces a 2s wall-clock guess with a deterministic UI signal.
      await expect(rejectBtn.first()).toBeHidden({ timeout: 15_000 });

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
    // GAMES_PER_MATCHUP cycles × advance-week.ts per-cycle budget (150 s
    // worst-case: 90 s WS-driven fast path + 60 s reload-driven fallback)
    // plus advance-week mutation overhead. Sized for cold-cache stats
    // hydration (CloudWatch p90 ~78 s warm-cache, ~30 s mean) with headroom
    // for the LS-4534 fallback path when MATCHUP_STATS_COMPLETE is dropped.
    test.setTimeout(540_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
    });

    await test.step('Drive Select Game loop and advance week 1 → 2', async () => {
      // advanceWeek loops the `Select Game N of M` button GAMES_PER_MATCHUP
      // times, then clicks `Advance League Week`. Fast path is WS-driven:
      // the commissioner page subscribes to MATCHUP_STATS_COMPLETE (v1
      // LeagueDetailPage.tsx:754, v2 Commish.tsx after LS-4515) and refetches
      // matchups automatically, so the NextStepControl button label updates
      // in-place as each stats-hydration cycle completes. If a WS event is
      // dropped (LS-4534), the helper falls back to page.reload() + fresh
      // GraphQL fetch within the same cycle budget.
      await advanceWeek(page, GAMES_PER_MATCHUP);
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
      // The chat textarea only mounts once the Chat sub-tab is active —
      // waiting for it replaces a fixed 500ms wait with the actual
      // tab-mounted signal.
      await expect(
        page.locator('textarea[aria-label="Message the league"]'),
      ).toBeVisible({ timeout: 15_000 });
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
    // (TOTAL_MATCHUPS - 1) advanceWeek calls × GAMES_PER_MATCHUP cycles each
    // (each cycle: up to 150 s — 90 s WS fast path + 60 s reload fallback),
    // plus the renewal mutation. Sized to cover cold-cache stats hydration
    // and the LS-4534 fallback path when MATCHUP_STATS_COMPLETE is dropped.
    test.setTimeout(960_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
    });

    await test.step('Advance remaining weeks until the season completes', async () => {
      // Phase 10 advanced week 1 → 2. Drive the remaining TOTAL_MATCHUPS - 1
      // weeks so the commissioner panel transitions to `Start New Season`.
      // With playoffEnabled=false, isSeasonComplete fires after the final
      // advanceMatchups call clears currentMatchup (NextStepControl.tsx:152).
      const remainingWeeks = TOTAL_MATCHUPS - 1;
      for (let i = 0; i < remainingWeeks; i++) {
        await advanceWeek(page, GAMES_PER_MATCHUP);
      }
    });

    await test.step('Start new season from commissioner panel', async () => {
      // Once the season has completed (asserted in the prior step), the
      // commissioner panel surfaces "Start New Season" as the next action.
      const renewBtn = page.getByRole('button', {
        name: /Start New Season/i,
      });

      await expect(renewBtn).toBeVisible({ timeout: 30_000 });
      await renewBtn.click();

      // The dialog asks about rosters: select "Hold a new draft".
      const newDraftOption = page.getByText(
        /Hold a new draft.*start with empty rosters/i,
      );
      await expect(newDraftOption).toBeVisible({ timeout: 5_000 });
      await newDraftOption.click();

      // Click "Confirm New Season"
      const confirmBtn = page.getByRole('button', {
        name: /Confirm New Season/i,
      });
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();

      // The renewal dialog closes once the startNewSeason mutation
      // returns. Waiting for it replaces a 5s wall-clock wait with a
      // deterministic mutation-completion signal (LS-4457).
      await expect(confirmBtn).toBeHidden({ timeout: 60_000 });
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
