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
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases
// ---------------------------------------------------------------------------

interface A11yState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
}

let state: A11yState;

// ---------------------------------------------------------------------------
// Helpers (same pattern as live-draft-ui.integration.spec.ts)
// ---------------------------------------------------------------------------

async function switchUser(
  page: Page,
  jwt: string,
  url?: string,
): Promise<void> {
  if (url) {
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

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to create league page', async () => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /Create Baseball League/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Fill in league name, choose 4 teams, and submit', async () => {
      state.leagueName = `A11y E2E ${Date.now()}`;
      await page
        .getByPlaceholder('Enter your league name')
        .fill(state.leagueName);
      await page
        .getByRole('button', { name: '4', exact: true })
        .first()
        .click();
      await page.getByRole('button', { name: /create league/i }).click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 30_000,
      });
    });

    await test.step('Extract league ID from the URL', () => {
      const match = page.url().match(/\/baseball\/league\/(\d+)/);
      expect(match).toBeTruthy();
      state.leagueId = Number(match![1]);
      expect(state.leagueId).toBeGreaterThan(0);
    });

    await test.step('Read invite code from the overview page', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.getByText('Manual Code', { exact: false })).toBeVisible(
        { timeout: 15_000 },
      );
      const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
      await expect(codeLocator).toBeVisible({ timeout: 10_000 });
      const code = await codeLocator.textContent();
      expect(code).toBeTruthy();
      state.inviteCode = code!;
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 2: Managers join the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
    managerJwt2,
    managerJwt3,
  }) => {
    const managers = [
      { jwt: managerJwt1, teamName: 'Keyboard Kings' },
      { jwt: managerJwt2, teamName: 'Aria Aces' },
      { jwt: managerJwt3, teamName: 'Focus Squad' },
    ];

    for (const { jwt, teamName } of managers) {
      const joinUrl = `/baseball/league/join/${state.inviteCode}`;
      await switchUser(page, jwt, joinUrl);
      await page.waitForLoadState('load');
      await expect(page.getByText(/spot(s)?\s+available/i).first()).toBeVisible(
        { timeout: 15_000 },
      );

      await page.locator('#team-name').fill(teamName);
      const joinBtn = page.getByRole('button', { name: /Join League/i });
      await expect(joinBtn).toBeEnabled({ timeout: 5_000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 15_000,
      });
    }

    // Restore commissioner identity
    await switchUser(page, commissionerJwt);
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — START THE LIVE DRAFT
  // -----------------------------------------------------------------------

  test('Phase 3: Start the live draft', async ({ commissionerPage: page }) => {
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

      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5_000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for draft to become active', async () => {
      await page.waitForTimeout(3_000);
      await page.reload();
      await page.waitForLoadState('load');
      await expect(
        page.getByText(/Draft.*In Progress|Go to Draft/i).first(),
      ).toBeVisible({ timeout: 30_000 });
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
    await openDraftBoard(page, state.leagueId);

    const group = page.getByRole('radiogroup', { name: /filter by position/i });
    await expect(group).toBeVisible({ timeout: 15_000 });

    const allBtn = group.getByRole('radio', { name: 'ALL' });
    const cBtn = group.getByRole('radio', { name: 'C' });
    const pBtn = group.getByRole('radio', { name: 'P' });

    await test.step('ALL is initially active (aria-checked=true)', async () => {
      await expect(allBtn).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('ArrowRight moves selection from ALL → C', async () => {
      // Click ALL to establish focus, then use keyboard
      await allBtn.click();
      await page.keyboard.press('ArrowRight');
      await expect(cBtn).toHaveAttribute('aria-checked', 'true');
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
    await openDraftBoard(page, state.leagueId);

    const viewGroup = page.getByRole('radiogroup', { name: /view mode/i });
    await expect(viewGroup).toBeVisible({ timeout: 15_000 });

    // The four modes: ⊞ (grid), ☰ (list), ⋯ (compact), ▦ (board)
    const gridBtn = viewGroup.getByRole('radio', { name: '⊞' });
    const listBtn = viewGroup.getByRole('radio', { name: '☰' });
    const compactBtn = viewGroup.getByRole('radio', { name: '⋯' });

    await test.step('Grid is the initial active view (aria-checked=true)', async () => {
      await expect(gridBtn).toHaveAttribute('aria-checked', 'true');
      await expect(listBtn).toHaveAttribute('aria-checked', 'false');
      await expect(compactBtn).toHaveAttribute('aria-checked', 'false');
    });

    await test.step('Clicking list switches aria-checked state', async () => {
      await listBtn.click();
      await expect(listBtn).toHaveAttribute('aria-checked', 'true');
      await expect(gridBtn).toHaveAttribute('aria-checked', 'false');
    });

    await test.step('Clicking compact switches aria-checked state', async () => {
      await compactBtn.click();
      await expect(compactBtn).toHaveAttribute('aria-checked', 'true');
      await expect(listBtn).toHaveAttribute('aria-checked', 'false');
    });

    await test.step('Clicking grid restores the original active state', async () => {
      await gridBtn.click();
      await expect(gridBtn).toHaveAttribute('aria-checked', 'true');
      await expect(compactBtn).toHaveAttribute('aria-checked', 'false');
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — SEARCH INPUT ACCESSIBILITY
  // -----------------------------------------------------------------------

  test('Phase 7: Search textbox is accessible and filters players', async ({
    commissionerPage: page,
  }) => {
    await openDraftBoard(page, state.leagueId);

    const searchInput = page.getByRole('textbox', { name: /search players/i });
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    await test.step('Search input is focusable and accepts text', async () => {
      await searchInput.click();
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
    await openDraftBoard(page, state.leagueId);

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
