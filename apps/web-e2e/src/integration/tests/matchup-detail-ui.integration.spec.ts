/**
 * Matchup Detail Page — UI Integration Test (LS-595)
 *
 * Validates the MatchupDetailPage components against the live backend.
 * No GraphQL mocking — all browser interactions and assertions use real API
 * responses and a real browser session with valid JWTs.
 *
 * Components covered:
 *   - MatchupScoreboard (team names, scores, status badge, week badge)
 *   - MatchupWinProbabilityPanel (WIN PROBABILITY label, percentages, bar)
 *   - GamesRemaining (progress panel — shown once gamesPerMatchup is set)
 *   - MatchupNavigationControls (week stepper, matchup cards, You badge)
 *   - MatchupRosterComparison (BATTERS / PITCHERS side-by-side lineups)
 *
 * Flow:
 *   1. Commissioner creates a 4-team league
 *   2. Three managers join via invite code
 *   3. Commissioner switches draft mode to Automated and starts the draft
 *   4. Wait for "Season Active" — matchups are now live
 *   5. API call resolves the Week 1 matchup IDs for the new league
 *   6. Navigate to /baseball/league/:id/matchups/:matchupId
 *   7. Assert each component renders correctly
 *   8. Test week navigation controls (prev/next stepper, matchup cards)
 *   9. Test manager-role view of the same page
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/matchup-detail-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { waitForSeasonActive } from '../helpers/wait-for-season-active';
import { reloadUntilVisible } from '../helpers/reload-until-visible';
import { test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface MatchupDetailState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** ID of the commissioner's week-1 matchup. */
  matchupId: number;
}

let state: MatchupDetailState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Matchup Detail Page UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      matchupId: 0,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Matchup Detail E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN LEAGUE
  // -----------------------------------------------------------------------

  // Phase 2 uses dedicated manager fixture pages instead of switchUser() to
  // avoid the AUTH_LOGOUT race (LS-3672, LS-3705, LS-4385). The full join
  // orchestration lives in joinLeagueAsManager (LS-4447).
  test('Phase 2: Three managers join the league', async ({
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    const managers = [
      { page: managerPage1, jwt: managerJwt1, teamName: 'The Sluggers' },
      { page: managerPage2, jwt: managerJwt2, teamName: 'The Aces' },
      { page: managerPage3, jwt: managerJwt3, teamName: 'The Rockets' },
    ];

    for (const { page, jwt, teamName } of managers) {
      // Full join orchestration lives in joinLeagueAsManager (LS-4447).
      await joinLeagueAsManager(page, {
        jwt,
        inviteCode: state.inviteCode,
        teamName,
      });
    }
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT → SEASON ACTIVE
  // -----------------------------------------------------------------------

  test('Phase 3: Automated random draft runs to completion', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    // Automated drafts can take 120–360s; allow generous time for Lambda cold starts
    test.setTimeout(480_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30_000 },
      );
    });

    await test.step('Switch draft mode to Automated', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10_000 });
      await draftSettingsBtn.click();

      const automatedBtn = page.getByRole('button', {
        name: /Automated Draft/i,
      });
      await expect(automatedBtn).toBeVisible({ timeout: 5_000 });
      await automatedBtn.click();

      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
      await saveBtn.click();
      // Mutation completes when Save returns to its enabled state.
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    });

    await test.step('Start the draft', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      // Confirmation dialog
      const confirmBtn = page.getByTestId('confirm-next-step');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for Season Active status', async () => {
      await waitForSeasonActive(page, state.leagueId, {
        deadlineMs: 360_000,
        api: apiCommissioner,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — RESOLVE MATCHUP ID & NAVIGATE TO DETAIL PAGE
  // -----------------------------------------------------------------------

  test('Phase 4: Fetch Week 1 matchup ID and navigate to detail page', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Query API for week-1 matchups', async () => {
      const data = await gqlFetch<{
        getMatchupsForLeague: Array<{ id: number; weekNumber: number }>;
      }>(
        commissionerJwt,
        `query GetMatchupsForLeague($leagueId: Int!) {
            getMatchupsForLeague(leagueId: $leagueId) {
              id
              weekNumber
            }
          }`,
        { leagueId: state.leagueId },
      );

      const week1 = data.getMatchupsForLeague.filter((m) => m.weekNumber === 1);
      expect(week1.length).toBeGreaterThan(0);
      state.matchupId = Number(week1[0].id);
      expect(state.matchupId).toBeGreaterThan(0);
    });

    await test.step('Navigate to the matchup detail page', async () => {
      await page.goto(
        `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
      );
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('"Matchup Details" heading is visible', async () => {
      await expect(
        page.getByRole('heading', { name: /Matchup Details/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('"Back to League" navigation button is present', async () => {
      await expect(
        page.getByRole('button', { name: /Back to League/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — SCOREBOARD
  // -----------------------------------------------------------------------

  test('Phase 5: Scoreboard renders correctly', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('VS badge is visible', async () => {
      await expect(page.getByText('VS').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Week number badge is shown', async () => {
      await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Both team score values are rendered', async () => {
      // Scores are formatted as "0.00", "12.34", etc.
      const scoreLocators = page.locator('text=/^\\d+\\.\\d{2}$/');
      await expect(scoreLocators.first()).toBeVisible({ timeout: 15_000 });
      const count = await scoreLocators.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    await test.step('Matchup status chip is visible', async () => {
      // Status is one of: Scheduled, Active, Completed, LIVE (in-progress)
      await expect(
        page.getByText(/^(Scheduled|Active|Completed|LIVE)$/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — WIN PROBABILITY PANEL
  // -----------------------------------------------------------------------

  test('Phase 6: Win probability panel renders', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('WIN PROBABILITY label is visible', async () => {
      await expect(page.getByText('WIN PROBABILITY').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Probability percentages are shown', async () => {
      // Find all percentage text on the page — at least the two win-probability values
      const pctLocator = page.locator('text=/^\\d+%$/');
      await expect(pctLocator.first()).toBeVisible({ timeout: 10_000 });
      const count = await pctLocator.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    await test.step('Probability percentages sum to 100', async () => {
      const texts = await page.locator('text=/^\\d+%$/').allTextContents();
      // Find the win-probability pair: two percentages that sum to 100
      const nums = texts.map((t) => parseInt(t.replace('%', ''), 10));
      const hasPairSumTo100 = nums.some((n, i) =>
        nums.some((m, j) => i !== j && n + m === 100),
      );
      expect(hasPairSumTo100).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — GAMES REMAINING
  // -----------------------------------------------------------------------

  test('Phase 7: Games remaining panel renders when gamesPerMatchup is set', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    // Check whether the league's week-1 matchup has gamesPerMatchup set.
    // If games have not been selected yet the panel does not render —
    // in that case we skip this phase gracefully.
    const data = await gqlFetch<{
      getMatchupsForLeague: Array<{
        id: number;
        gamesPerMatchup: number | null;
      }>;
    }>(
      commissionerJwt,
      `query GetMatchupsForLeague($leagueId: Int!) {
          getMatchupsForLeague(leagueId: $leagueId) {
            id
            gamesPerMatchup
          }
        }`,
      { leagueId: state.leagueId },
    );

    const matchupData = data.getMatchupsForLeague.find(
      (m) => m.id === state.matchupId,
    );

    if (!matchupData?.gamesPerMatchup) {
      // Games not yet selected — skip gracefully without failing.
      // This is expected immediately after a fresh automated draft.
      return;
    }

    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('Games Progress heading is visible', async () => {
      await expect(
        page.getByText('Games Progress', { exact: false }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Progress indicator renders (dots or text)', async () => {
      // GamesRemaining shows either dot icons or a compact "N games left" /
      // "Complete" text.  Either variant satisfies this assertion.
      const indicator = page.getByText(/games? left|Complete/i).first();
      await expect(indicator).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 8 — WEEK NAVIGATION CONTROLS
  // -----------------------------------------------------------------------

  test('Phase 8: Week navigation controls function correctly', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('Week stepper shows "Week 1"', async () => {
      await expect(page.getByText('Week 1').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Previous-week button is inert at Week 1', async () => {
      // The StepperButton is a Tamagui-styled div with aria-label.
      // The "disabled" variant sets opacity:0.3 but not the HTML disabled
      // attribute.  We verify inertness by clicking and confirming the
      // displayed week does not change.
      const weekTextBefore = await page
        .getByText(/^Week \d+$/)
        .first()
        .textContent();

      const prevBtn = page.locator('[aria-label="Previous week"]');
      await expect(prevBtn).toBeVisible({ timeout: 10_000 });
      await prevBtn.click();
      // The week-text-after check below is the deterministic signal that
      // the click either updated or no-op'd the week display; if the click
      // had any UI effect it would render before textContent resolves
      // (LS-4457).
      const weekTextAfter = await page
        .getByText(/^Week \d+$/)
        .first()
        .textContent();
      expect(weekTextAfter).toBe(weekTextBefore);
    });

    await test.step('Next-week button and Previous-week button are visible', async () => {
      await expect(page.locator('[aria-label="Previous week"]')).toBeVisible();
      await expect(page.locator('[aria-label="Next week"]')).toBeVisible();
    });

    await test.step('Matchup cards for the current week are shown', async () => {
      // A 4-team league has 2 matchups per week.  At minimum 1 card is shown.
      // The navigation card renders matchup info (team names) as clickable rows.
      await expect(page.locator('body')).not.toContainText('No matchups found');
      // The "YOU" badge appears for the commissioner's own matchup —
      // it may take a moment for the sidebar matchup list to populate.
      // NOTE: the badge renders all-caps "YOU" — exact: true is case-sensitive.
      const youBadge = page.getByText('YOU', { exact: true }).first();
      // The sidebar matchup list can be slow to populate; reload up to 3
      // times to refresh stale Apollo cache, then assert strictly. The
      // helper internally has no fixed-duration sleeps in the iteration
      // body — the cooldown is its only timed wait (LS-4457 compatible).
      await reloadUntilVisible(page, youBadge, {
        attempts: 3,
        pollTimeoutMs: 5_000,
        cooldownMs: 2_000,
        finalTimeoutMs: 15_000,
      });
    });

    await test.step('"Current" week badge is displayed for Week 1', async () => {
      // The week that matches the league's current week shows a green "Current" badge.
      await expect(page.getByText('Current').first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 9 — ROSTER COMPARISON
  // -----------------------------------------------------------------------

  test('Phase 9: Roster comparison panel shows BATTERS and PITCHERS', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('BATTERS section header is present', async () => {
      await expect(page.getByText('BATTERS').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('PITCHERS section header is present', async () => {
      await expect(page.getByText('PITCHERS').first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('"Actual" column header confirms lineup is populated', async () => {
      await expect(
        page.getByText('Actual', { exact: true }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 10 — MANAGER ROLE VIEW
  // -----------------------------------------------------------------------

  test('Phase 10: Manager can view the matchup detail page', async ({
    managerPage1: page,
  }) => {
    // Use a dedicated manager browser context rather than switchUser on
    // commissionerPage. switchUser has a race condition (LS-3672, LS-3705):
    // background JWT refresh can dispatch AUTH_LOGOUT and clear localStorage
    // after page.evaluate() sets the manager profile.
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );

    await test.step('Page loads without error for manager', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('VS badge is visible for manager', async () => {
      await expect(page.getByText('VS').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('"Matchup Details" heading is visible for manager', async () => {
      await expect(
        page.getByRole('heading', { name: /Matchup Details/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
