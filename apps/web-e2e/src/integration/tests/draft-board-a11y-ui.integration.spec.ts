/**
 * Draft Board Keyboard Shortcuts & Accessibility — UI Integration Test (LS-594)
 *
 * Validates ARIA semantics and keyboard navigation on the live draft board
 * against the real backend (no GraphQL mocking).
 *
 * Keyboard behaviors exercised:
 *   • Position filter — radiogroup with Arrow / Home / End navigation
 *   • View mode — radiogroup toggle, aria-checked state
 *
 * Accessibility assertions:
 *   • Landmarks: main ("Player draft board"), complementary sidebars
 *   • Timer role
 *   • Live regions (polite + assertive)
 *   • Position filter and view mode as radiogroup / radio pattern
 *   • Search textbox (aria-label)
 *   • Watchlist buttons: aria-pressed toggle
 *
 * Pre-requisites (shared with live-draft-ui.integration.spec.ts):
 *   - CLI auth: `./ls-cli.ps1 auth login`
 *   - At least 3 non-admin users in the database
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/draft-board-a11y-ui.integration.spec.ts
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import {
  dismissPickAnnouncementOverlay,
  waitThroughTransientLoadingScreen,
} from '../helpers/draft-board-overlay';
import { pauseDraft, resumeDraft } from '../helpers/pause-draft';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { test } from '../fixtures/ui';

interface A11yState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
}

let state: A11yState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the draft board and wait for the live draft UI to fully appear.
 * Returns when `role=main aria-label="Player draft board"` is visible.
 */
async function openDraftBoard(
  page: Page,
  leagueId: number,
  timeout = 45_000,
): Promise<void> {
  await page.goto(`/baseball/league/${leagueId}/draft`);
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByRole('main', { name: /player draft board/i }),
  ).toBeVisible({ timeout });
}

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Draft Board Keyboard Shortcuts & Accessibility (Live Backend) @integration', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = { leagueId: 0, inviteCode: '', leagueName: '' };
  });

  // Resume the draft after the suite so any post-suite cleanup (or manual
  // inspection) sees the league in a normal state. Best-effort: if the league
  // was never created (Phase 1 failed) or the draft was never paused, swallow.
  test.afterAll(async ({ apiCommissioner }) => {
    if (!state.leagueId) return;
    try {
      await resumeDraft(apiCommissioner, state.leagueId);
    } catch {
      // League cleanup will reap the paused draft anyway.
    }
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `A11y E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 2: Managers join the league', async ({
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    const managers = [
      { page: managerPage1, jwt: managerJwt1, teamName: 'Keyboard Kings' },
      { page: managerPage2, jwt: managerJwt2, teamName: 'Aria Aces' },
      { page: managerPage3, jwt: managerJwt3, teamName: 'Focus Squad' },
    ];

    for (const { page, jwt, teamName } of managers) {
      await joinLeagueAsManager(page, {
        jwt,
        inviteCode: state.inviteCode,
        teamName,
      });
    }
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — START THE LIVE DRAFT
  // -----------------------------------------------------------------------

  test('Phase 3: Start the live draft', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    test.setTimeout(120_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30_000 },
      );
    });

    await test.step('Click Start Draft and confirm', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      const confirmBtn = page.getByTestId('confirm-draft-button');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for draft to become active', async () => {
      // Wait on the CURRENT page before reloading. initializeDraft uses
      // awaitRefetchQueries: true with refetchQueries: ['GetLeagueById'], so
      // Apollo cache updates as soon as the mutation + refetch complete — the
      // LeagueHero chip re-renders to "Drafting · Live" or "Draft Queued"
      // without any navigation. Checking here avoids the cold-start race where
      // the Lambda takes >3 s and the DB still shows 'not-started' after an
      // immediate reload (LS-4370).
      //
      // LeagueHero chip text by draftStatus
      // (apps/web/src/pages/baseball/league-detail-v2/LeagueHero.tsx):
      //   in-progress -> "Drafting · Live"  (live draft)
      //   queued      -> "Draft Queued"     (automated draft)
      //   completed   -> "Season Active"
      await expect(
        page.getByText(/Drafting|Draft Queued|Season Active/i).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Pause the draft so subsequent phases see a stable board', async () => {
      // The AI auto-pick used by integration runs would otherwise complete the
      // draft in seconds, racing Phase 5-8 to an empty DraftCompleteView. Pause
      // immediately after start; resume in afterAll. Auto-picks halt while
      // paused but the live draft board UI renders normally, so a11y +
      // keyboard-nav assertions are deterministic.
      await pauseDraft(apiCommissioner, state.leagueId);
      // Reload for a clean browser state before subsequent phases.
      await page.reload();
      await page.waitForLoadState('load');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — ARIA LANDMARKS
  // -----------------------------------------------------------------------

  test('Phase 4: Draft board exposes correct ARIA landmarks', async ({
    commissionerPage: page,
  }) => {
    await openDraftBoard(page, state.leagueId);

    await test.step('main landmark is labeled "Player draft board"', async () => {
      const main = page.getByRole('main', { name: /player draft board/i });
      await expect(main).toBeVisible();
    });

    await test.step('complementary sidebar is accessible', async () => {
      const asides = page.getByRole('complementary');
      // At minimum the left sidebar (My team and draft controls)
      await expect(asides.first()).toBeVisible();
    });

    await test.step('timer role is present', async () => {
      // CircularTimer renders with role="timer"
      const timer = page.getByRole('timer');
      await expect(timer.first()).toBeVisible({ timeout: 10_000 });
    });

    await test.step('polite live region is present', async () => {
      const liveRegion = page.locator('[aria-live="polite"]');
      await expect(liveRegion.first()).toBeAttached();
    });

    await test.step('assertive live region is present', async () => {
      const urgentRegion = page.locator('[aria-live="assertive"]');
      await expect(urgentRegion.first()).toBeAttached();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — POSITION FILTER KEYBOARD NAVIGATION
  // -----------------------------------------------------------------------

  test('Phase 5: Position filter radiogroup keyboard navigation', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/draft`);
    await page.waitForLoadState('domcontentloaded');

    // Draft is paused (Phase 3) so the live board renders deterministically.
    await expect(
      page.getByRole('main', { name: /player draft board/i }),
    ).toBeVisible({ timeout: 45_000 });

    const group = page.getByRole('radiogroup', { name: /filter by position/i });
    await expect(group).toBeVisible({ timeout: 15_000 });

    const allBtn = group.getByRole('radio', { name: 'ALL' });
    const cBtn = group.getByRole('radio', { name: 'C' });
    const pBtn = group.getByRole('radio', { name: 'P' });

    await test.step('ALL is initially active (aria-checked=true)', async () => {
      await expect(allBtn).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('ArrowRight moves selection from ALL → C', async () => {
      // Scroll into view then click to establish keyboard focus
      await allBtn.scrollIntoViewIfNeeded();
      await allBtn.click({ force: true });
      // Ensure focus is established before pressing arrow
      await allBtn.focus();
      await page.keyboard.press('ArrowRight');
      await expect(cBtn).toHaveAttribute('aria-checked', 'true', {
        timeout: 5_000,
      });
      await expect(allBtn).toHaveAttribute('aria-checked', 'false');
    });

    await test.step('End key jumps to the last position (P)', async () => {
      await page.keyboard.press('End');
      await expect(pBtn).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('Home key returns to the first position (ALL)', async () => {
      await page.keyboard.press('Home');
      await expect(allBtn).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('ArrowLeft wraps from ALL → P (ring navigation)', async () => {
      await page.keyboard.press('ArrowLeft');
      await expect(pBtn).toHaveAttribute('aria-checked', 'true');
      await expect(allBtn).toHaveAttribute('aria-checked', 'false');
    });

    await test.step('ArrowDown behaves the same as ArrowRight', async () => {
      // P is currently active; ArrowDown should have no next change
      // Move to ALL first for a predictable start
      await page.keyboard.press('Home');
      await expect(allBtn).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(cBtn).toHaveAttribute('aria-checked', 'true');
    });

    // Leave position filter in ALL for subsequent phases
    await page.keyboard.press('Home');
    await expect(allBtn).toHaveAttribute('aria-checked', 'true');
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — VIEW MODE RADIOGROUP
  // -----------------------------------------------------------------------

  test('Phase 6: View mode radiogroup accessibility', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/draft`);
    await page.waitForLoadState('domcontentloaded');

    // Draft is paused (Phase 3) so the live board renders deterministically.
    // Each test creates a fresh browser context so the Apollo cache is cold;
    // wait through the transient "Loading draft board..." screen while
    // GetLiveDraftLeagueDraft is in-flight before asserting the board.
    await waitThroughTransientLoadingScreen(page);
    await expect(
      page.getByRole('main', { name: /player draft board/i }),
    ).toBeVisible({ timeout: 45_000 });

    const viewGroup = page.getByRole('tablist', { name: /view mode/i });
    await expect(viewGroup).toBeVisible({ timeout: 15_000 });

    // Dismiss any pick-announcement overlay that may be covering the controls.
    // The overlay is position:fixed (z-index 9999) and receives coordinate-based
    // clicks even when force:true is used, preventing the view-mode buttons from
    // getting the click event.
    const announceOverlay = page.locator('.d-announce-overlay');

    /** Helper: dismiss overlay if visible, then do a direct JS click on target. */
    const clickWithOverlayDismiss = async (
      btn: ReturnType<typeof viewGroup.getByRole>,
    ) => {
      await dismissPickAnnouncementOverlay(page);
      await btn.scrollIntoViewIfNeeded();
      // Use dispatchEvent to avoid coordinate-based click landing on overlay
      await btn.dispatchEvent('click');
    };

    await dismissPickAnnouncementOverlay(page);

    // View tabs: Cards (grid), Data Table, Draft Board, My Depth Chart
    const gridBtn = viewGroup.getByRole('tab', { name: 'Cards' });
    const tableBtn = viewGroup.getByRole('tab', { name: 'Data Table' });
    const boardBtn = viewGroup.getByRole('tab', { name: 'Draft Board' });

    await test.step('Cards is the initial active view (aria-selected=true)', async () => {
      await expect(gridBtn).toHaveAttribute('aria-selected', 'true');
      await expect(tableBtn).toHaveAttribute('aria-selected', 'false');
      await expect(boardBtn).toHaveAttribute('aria-selected', 'false');
    });

    await test.step('Clicking Data Table switches aria-selected state', async () => {
      await clickWithOverlayDismiss(tableBtn);
      await expect(tableBtn).toHaveAttribute('aria-selected', 'true', {
        timeout: 5_000,
      });
      await expect(gridBtn).toHaveAttribute('aria-selected', 'false');
    });

    await test.step('Clicking Draft Board switches aria-selected state', async () => {
      await clickWithOverlayDismiss(boardBtn);
      await expect(boardBtn).toHaveAttribute('aria-selected', 'true', {
        timeout: 5_000,
      });
      await expect(tableBtn).toHaveAttribute('aria-selected', 'false');
    });

    await test.step('Clicking Cards restores the original active state', async () => {
      await clickWithOverlayDismiss(gridBtn);
      await expect(gridBtn).toHaveAttribute('aria-selected', 'true', {
        timeout: 5_000,
      });
      await expect(boardBtn).toHaveAttribute('aria-selected', 'false');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — SEARCH INPUT ACCESSIBILITY
  // -----------------------------------------------------------------------

  test('Phase 7: Search textbox is accessible and filters players', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/draft`);
    await page.waitForLoadState('domcontentloaded');

    // Draft is paused (Phase 3) so the live board renders deterministically.
    // See Phase 6 comment for why the transient "Loading draft board..." screen
    // is still possible on a cold Apollo cache.
    await waitThroughTransientLoadingScreen(page);
    await expect(
      page.getByRole('main', { name: /player draft board/i }),
    ).toBeVisible({ timeout: 45_000 });

    const searchInput = page.getByRole('textbox', { name: /search players/i });
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // Dismiss any pick-announcement overlay that may cover the search input
    await dismissPickAnnouncementOverlay(page);

    await test.step('Search input is focusable and accepts text', async () => {
      // Dismiss any overlay that may have reappeared since the earlier check
      // (live draft picks can trigger new announcement overlays at any time).
      await dismissPickAnnouncementOverlay(page);
      await searchInput.scrollIntoViewIfNeeded();
      // Use a real click to verify the z-index fix actually prevents
      // interception from higher elements (this PR's core assertion).
      await searchInput.click();
      await expect(searchInput).toBeFocused();
      await searchInput.fill('Smith');
      await expect(searchInput).toHaveValue('Smith');
    });

    await test.step('Clearing the search input restores the empty state', async () => {
      // Use keyboard triple-select-all + Delete so UI receives the change event
      await searchInput.selectText();
      await page.keyboard.press('Delete');
      await expect(searchInput).toHaveValue('');
    });

    await test.step('Search input has an accessible label (aria-label)', async () => {
      // Already confirmed by getByRole('textbox', { name: ... }) succeeding above,
      // but explicitly validate the attribute for completeness.
      await expect(searchInput).toHaveAttribute('aria-label', 'Search players');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 8 — WATCHLIST ARIA-PRESSED TOGGLE
  // -----------------------------------------------------------------------

  test('Phase 8: Watchlist toggle buttons expose aria-pressed', async ({
    commissionerPage: page,
  }) => {
    await page.goto(`/baseball/league/${state.leagueId}/draft`);
    await page.waitForLoadState('domcontentloaded');

    // Draft is paused (Phase 3) so the live board renders deterministically.
    // See Phase 6 comment for why the transient "Loading draft board..." screen
    // is still possible on a cold Apollo cache.
    await waitThroughTransientLoadingScreen(page);
    await expect(
      page.getByRole('main', { name: /player draft board/i }),
    ).toBeVisible({ timeout: 45_000 });

    await test.step('Wait for player cards to load', async () => {
      // Player cards are rendered in the center panel once the draft is live
      // and available players are fetched.
      const watchlistBtn = page
        .getByRole('button', {
          name: /add .* to watchlist|remove .* from watchlist/i,
        })
        .first();
      await expect(watchlistBtn).toBeVisible({ timeout: 30_000 });
    });

    const firstBtn = page
      .getByRole('button', { name: /add .* to watchlist/i })
      .first();

    await test.step('Initial aria-pressed is false', async () => {
      await expect(firstBtn).toHaveAttribute('aria-pressed', 'false');
    });

    await test.step('Clicking toggles aria-pressed to true', async () => {
      await firstBtn.click();
      // After clicking "add", the button label changes to "remove"
      const removeBtn = page
        .getByRole('button', { name: /remove .* from watchlist/i })
        .first();
      await expect(removeBtn).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('Clicking again toggles aria-pressed back to false', async () => {
      const removeBtn = page
        .getByRole('button', { name: /remove .* from watchlist/i })
        .first();
      await removeBtn.click();
      const addBtn = page
        .getByRole('button', { name: /add .* to watchlist/i })
        .first();
      await expect(addBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
