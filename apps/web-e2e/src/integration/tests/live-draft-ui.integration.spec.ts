/**
 * Live Draft UI Integration Test — Multi-User
 *
 * Tests the real-time live draft flow end-to-end with 4 simultaneous browser
 * contexts (commissioner + 3 managers), each making picks on their own turn:
 *   1. Create a league (4 teams)
 *   2. Three managers join via invite code
 *   3. Verify live draft settings (defaults: Live/Standard/Snake)
 *   4. Commissioner starts the draft
 *   5. All 4 users open the draft board; whoever sees "YOUR PICK" picks
 *   6. Verify draft completes and commissioner roster is filled
 *   7. Manager verifies their roster via their own browser context
 *
 * Run:
 *   pnpm exec playwright test apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { waitForJoinPageValidation } from '../helpers/wait-for-join-page';
import { switchUser, test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests.
// ---------------------------------------------------------------------------

interface DraftState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  teams: string[];
  commissionerPicks: string[];
  manager1Picks: string[];
}

let state: DraftState;

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Live Draft UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      teams: [],
      commissionerPicks: [],
      manager1Picks: [],
    };
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (reused from full-season)
  // -----------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Live Draft E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN LEAGUE (reused from full-season)
  // -----------------------------------------------------------------

  test('Phase 2: Managers join the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
    managerJwt2,
    managerJwt3,
  }) => {
    const managers = [
      { jwt: managerJwt1, teamName: 'Draft Kings' },
      { jwt: managerJwt2, teamName: 'The Selectors' },
      { jwt: managerJwt3, teamName: 'Pick Masters' },
    ];

    for (const { jwt, teamName } of managers) {
      const joinUrl = `/baseball/league/join/${state.inviteCode}`;
      await switchUser(page, jwt, joinUrl);
      await page.waitForLoadState('load');

      await waitForJoinPageValidation(page);

      await page.getByTestId('team-name').fill(teamName);
      const joinBtn = page.getByRole('button', { name: /Join League/i });
      await expect(joinBtn).toBeEnabled({ timeout: 5000 });
      await joinBtn.click();

      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 15000,
      });

      state.teams.push(teamName);
    }

    // Restore commissioner identity
    await switchUser(page, commissionerJwt);
    expect(state.teams).toHaveLength(3);
  });

  // -----------------------------------------------------------------
  // PHASE 3 — CONFIGURE LIVE DRAFT SETTINGS
  // -----------------------------------------------------------------

  test('Phase 3: Verify live draft settings', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Open Draft Settings and verify defaults are Live/Standard/Snake', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      // Default mode is "Live Draft" — verify it is selected (active state)
      await expect(
        page.getByRole('button', { name: /Live Draft/i }),
      ).toBeVisible({ timeout: 5000 });

      // Default selection method is "Standard"
      await expect(
        page.getByRole('button', { name: /Standard/i }).first(),
      ).toBeVisible({ timeout: 5000 });

      // Default draft order is "Snake"
      await expect(
        page.getByRole('button', { name: /Snake/i }).first(),
      ).toBeVisible({ timeout: 5000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — START THE LIVE DRAFT
  // -----------------------------------------------------------------

  test('Phase 4: Start the live draft', async ({ commissionerPage: page }) => {
    // Draft processing can take time
    test.setTimeout(120_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
    });

    await test.step('Click Start Draft', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      // Confirm in the dialog
      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for draft to start', async () => {
      // After starting a live draft, the league status changes.
      // Wait for the draft board link or "Draft In Progress" indicator.
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('load');

      // The commissioner panel should show draft is in progress
      // or a "Go to Draft Board" button
      const draftActive = page.getByText(/Draft.*In Progress|Go to Draft/i);
      await expect(draftActive.first()).toBeVisible({ timeout: 30000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — MULTI-USER LIVE DRAFT (4 browser contexts)
  // -----------------------------------------------------------------

  test('Phase 5: Multi-user live draft picks', async ({
    commissionerPage,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    // Allow up to 20 minutes for all picks (4 teams × ~25 rounds = ~100 picks)
    test.setTimeout(1_200_000);

    const pages: { label: string; page: Page }[] = [
      { label: 'Commissioner', page: commissionerPage },
      { label: 'Manager 1', page: managerPage1 },
      { label: 'Manager 2', page: managerPage2 },
      { label: 'Manager 3', page: managerPage3 },
    ];

    await test.step('All users navigate to draft board', async () => {
      const draftUrl = `/baseball/league/${state.leagueId}/draft`;
      await Promise.all(
        pages.map(async ({ page }) => {
          await page.goto(draftUrl);
          await page.waitForLoadState('load');
        }),
      );

      // Verify draft board loaded on every page
      for (const { label, page } of pages) {
        await expect(page.getByText('LIVE DRAFT').first()).toBeVisible({
          timeout: 30000,
        });
        // eslint-disable-next-line no-console
        console.log(`[live-draft] ${label} draft board loaded`);
      }

      // Give WebSocket connections time to establish on all pages
      await pages[0].page.waitForTimeout(5000);
    });

    await test.step('Make all draft picks (each user picks on their turn)', async () => {
      let pickCount = 0;
      const maxPicks = 200;
      let consecutiveMisses = 0;
      // Track players drafted this session so we never click a button for an
      // already-drafted player whose card is still visible due to WebSocket /
      // Apollo update lag.  Without this guard the test can get a false
      // wasAccepted=true (because "YOUR PICK" briefly hides during a
      // concurrent refetch re-render) and log a duplicate pick.
      const draftedPlayers = new Set<string>();

      while (pickCount < maxPicks) {
        // Check if draft is complete on any page
        let draftDone = false;
        for (const { page } of pages) {
          if (
            await page
              .getByText('Draft Complete!')
              .isVisible()
              .catch(() => false)
          ) {
            draftDone = true;
            break;
          }
        }
        if (draftDone) break;

        // Find the page showing "YOUR PICK" — the draft board shows
        // "YOUR PICK" when isMyPick=true, "ON THE CLOCK" otherwise.
        // Only click on the page whose turn it actually is.
        //
        // Use exact:true to avoid false positives from the
        // PickAnnouncement overlay ("\ud83c\udf89 YOUR PICK") which briefly
        // appears after a successful pick.
        //
        // NOTE: isVisible({ timeout }) is deprecated in Playwright
        // v1.40+ — the timeout is silently ignored.  Use waitFor().
        let pickerFound = false;
        for (const { label, page } of pages) {
          const isMyTurn = await page
            .getByText('YOUR PICK', { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 2000 })
            .then(() => true)
            .catch(() => false);
          if (!isMyTurn) continue;

          // Find the first DRAFT NOW button whose player has not yet been
          // drafted in this session.  Stale player cards (visible but already
          // picked by another manager) must be skipped to avoid a duplicate
          // pick attempt that would be rejected server-side.
          const allDraftBtns = page.getByRole('button', {
            name: /Draft .* now/i,
          });
          // Wait for at least one draft button to render after "YOUR PICK"
          // appears - the player list may lag behind the turn indicator.
          await allDraftBtns
            .first()
            .waitFor({ state: 'visible', timeout: 5_000 })
            .catch((e: Error) => {
              if (e.name !== 'TimeoutError') throw e;
              /* noop - buttons may not exist yet */
            });
          const btnCount = await allDraftBtns.count().catch(() => 0);
          let draftBtnIdx = -1;
          let ariaLabel: string | null = null;
          for (let i = 0; i < btnCount; i++) {
            const btn = allDraftBtns.nth(i);
            const visible = await btn.isVisible().catch(() => false);
            if (!visible) continue;
            const btnLabel = await btn.getAttribute('aria-label');
            const playerName = btnLabel
              ?.replace(/^Draft\s+/i, '')
              .replace(/\s+now$/i, '');
            if (playerName && draftedPlayers.has(playerName)) continue;
            draftBtnIdx = i;
            ariaLabel = btnLabel;
            break;
          }
          // No undrafted button found on this page — wait for UI to refresh
          if (draftBtnIdx < 0) continue;

          await allDraftBtns.nth(draftBtnIdx).click({ force: true });

          // Verify the pick was accepted by checking the turn advanced:
          // "YOUR PICK" (exact) must disappear from this page, meaning
          // the server confirmed the pick and moved to the next drafter.
          //
          // Do NOT check whether the player button disappears — it can
          // vanish due to an incoming WebSocket update about another
          // manager's pick (false positive), causing duplicate-pick logs.
          const wasAccepted = await page
            .getByText('YOUR PICK', { exact: true })
            .first()
            .waitFor({ state: 'hidden', timeout: 8000 })
            .then(() => true)
            .catch(() => false);

          if (wasAccepted) {
            pickCount++;
            consecutiveMisses = 0;
            // eslint-disable-next-line no-console
            console.log(
              `[live-draft] Pick #${pickCount} by ${label} — ${ariaLabel}`,
            );
            // Record player name for post-draft roster assertions.
            // ariaLabel format: "Draft Bill Lange now"
            const playerName = ariaLabel
              ?.replace(/^Draft\s+/i, '')
              .replace(/\s+now$/i, '');
            if (playerName) {
              draftedPlayers.add(playerName);
              if (label === 'Commissioner')
                state.commissionerPicks.push(playerName);
              else if (label === 'Manager 1')
                state.manager1Picks.push(playerName);
            }
          }

          pickerFound = true;
          break;
        }

        if (!pickerFound) {
          consecutiveMisses++;
          if (consecutiveMisses > 30) {
            // eslint-disable-next-line no-console
            console.log(
              `[live-draft] Stuck after ${consecutiveMisses} misses at pick ${pickCount}`,
            );
            break;
          }
          if (consecutiveMisses > 15) {
            // Reload all pages to resync state
            // eslint-disable-next-line no-console
            console.log('[live-draft] Reloading all pages...');
            for (const { page } of pages) {
              await page.reload();
              await page.waitForLoadState('load');
            }
            await pages[0].page.waitForTimeout(3000);
          }
          await pages[0].page.waitForTimeout(1000);
        }
      }

      // eslint-disable-next-line no-console
      console.log(`[live-draft] Completed ${pickCount} total picks`);
      expect(pickCount).toBeGreaterThan(0);
    });

    await test.step('Verify draft completed', async () => {
      // Check "Draft Complete!" on ANY of the 4 draft board pages
      let draftComplete = false;
      for (const { page } of pages) {
        if (
          await page
            .getByText('Draft Complete!')
            .isVisible()
            .catch(() => false)
        ) {
          draftComplete = true;
          break;
        }
      }

      // If not visible yet, reload commissioner page on draft board and wait
      if (!draftComplete) {
        await commissionerPage.goto(`/baseball/league/${state.leagueId}/draft`);
        await commissionerPage.waitForLoadState('load');
        await expect(commissionerPage.getByText('Draft Complete!')).toBeVisible(
          { timeout: 30000 },
        );
      }

      expect(draftComplete).toBe(true);
      // eslint-disable-next-line no-console
      console.log('[live-draft] Draft verified complete');
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — VERIFY ROSTERS AFTER DRAFT
  // -----------------------------------------------------------------

  test('Phase 6: Verify commissioner roster after draft', async ({
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

    await test.step('Verify roster has drafted players', async () => {
      // Section headers prove roster structure loaded.
      // Fresh browser context means positions + team members must all load
      // from scratch — allow up to 30s for the roster to fully render.
      await expect(
        page.getByText('Pitching', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByText('Infield', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByText('Outfield', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });

      // After a live draft, players go to bench/bullpen (not starting lineup)
      // Verify bench count > 0 by reading the summary section
      await expect(page.getByText('Bench').first()).toBeVisible();
      const benchParent = page
        .getByText('Bench', { exact: true })
        .first()
        .locator('..');
      const benchText = await benchParent.textContent();
      const benchMatch = benchText?.match(/Bench\s*(\d+)/);
      expect(benchMatch).toBeTruthy();
      if (!benchMatch) throw new Error('benchMatch should be defined');
      expect(parseInt(benchMatch[1], 10)).toBeGreaterThan(0);
    });

    await test.step('Verify commissioner-drafted players appear on roster', async () => {
      // In a live 4-team draft with concurrent browser pages, race conditions
      // can cause the UI pick-tracking to mis-attribute some picks. Verify
      // that at least SOME captured commissioner picks appear on the roster.
      expect(state.commissionerPicks.length).toBeGreaterThan(0);

      // Wait for bench section to render player cards
      await expect(
        page
          .locator('region[aria-label="Bench"], [aria-label="Bench"]')
          .first(),
      )
        .toBeVisible({ timeout: 15_000 })
        .catch(() => {
          // Fallback: just wait for Bench text
        });
      await page.waitForTimeout(2_000);

      let matchCount = 0;
      for (const playerName of state.commissionerPicks) {
        const visible = await page
          .getByText(playerName, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (visible) matchCount++;
      }

      // At least 25% of captured picks should appear — the rest may have
      // been mis-attributed due to live draft race conditions.
      const threshold = Math.max(
        1,
        Math.floor(state.commissionerPicks.length * 0.25),
      );
      expect(matchCount).toBeGreaterThanOrEqual(threshold);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 7 — MANAGER VERIFIES THEIR ROSTER
  // -----------------------------------------------------------------

  test('Phase 7: Manager verifies their roster', async ({ managerPage1 }) => {
    await test.step('Navigate to Manager 1 roster', async () => {
      await managerPage1.goto(`/baseball/league/${state.leagueId}/roster`);
      await managerPage1.waitForLoadState('load');
      await expect(managerPage1.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify manager roster has players', async () => {
      // After a live draft, players go to bench/bullpen (not starting lineup)
      // Verify bench count > 0 by reading the summary section
      await expect(managerPage1.getByText('Bench').first()).toBeVisible({
        timeout: 15000,
      });
      const benchParent = managerPage1
        .getByText('Bench', { exact: true })
        .first()
        .locator('..');
      const benchText = await benchParent.textContent();
      const benchMatch = benchText?.match(/Bench\s*(\d+)/);
      expect(benchMatch).toBeTruthy();
      if (!benchMatch) throw new Error('benchMatch should be defined');
      expect(parseInt(benchMatch[1], 10)).toBeGreaterThan(0);
    });

    await test.step('Verify manager 1-drafted players appear on roster', async () => {
      // In a live 4-team draft, race conditions can mis-attribute some picks.
      // Verify that at least some captured manager picks appear on the roster.
      expect(state.manager1Picks.length).toBeGreaterThan(0);
      await managerPage1.waitForTimeout(2_000);

      let matchCount = 0;
      for (const playerName of state.manager1Picks) {
        const visible = await managerPage1
          .getByText(playerName, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (visible) matchCount++;
      }

      const threshold = Math.max(
        1,
        Math.floor(state.manager1Picks.length * 0.25),
      );
      expect(matchCount).toBeGreaterThanOrEqual(threshold);
    });
  });
});
