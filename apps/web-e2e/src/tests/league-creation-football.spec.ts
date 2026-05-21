/**
 * League Creation — Football Flow E2E Tests (LS-4635)
 *
 * Covers the Create League page's football sport tab:
 *  - Happy path: clicking the Football tab surfaces the "coming soon" Beta
 *    banner with a working Dismiss control, and the Baseball tab remains
 *    selectable.
 *  - Premium-blocked path: with the Football tab interacted with, the existing
 *    premium gates (FAAB, salary cap, historical era) still fire for a free
 *    user. Premium gating is sport-agnostic on the Create League page today,
 *    so parity for the football flow is preserved by construction.
 *
 * Complements:
 *  - league-creation.spec.ts (basic baseball happy path)
 *  - league-creation-advanced.spec.ts (advanced settings + baseline FAAB gate)
 */

import { createCustomAuthTest, expect, test } from '../fixtures/auth-enhanced';

const freeUserTest = createCustomAuthTest('freeuser@test.com', 'none');

async function expandSection(
  page: import('@playwright/test').Page,
  sectionId: string,
) {
  const toggle = page.getByTestId(`section-toggle-${sectionId}`);
  await expect(toggle).toBeVisible();
  const expanded = await toggle.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

test.describe('League Creation — Football Flow @regression', () => {
  // ─── Happy path ──────────────────────────────────────────────────────────

  test('shows Football and Baseball sport tabs with Beta marker on Football', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    const baseballTab = page.getByTestId('sport-tab-baseball');
    const footballTab = page.getByTestId('sport-tab-football');

    await expect(baseballTab).toBeVisible();
    await expect(footballTab).toBeVisible();
    // Baseball is the default selection.
    await expect(baseballTab).toHaveAttribute('aria-selected', 'true');
    // Football is announced as Beta via its aria-label.
    await expect(footballTab).toHaveAttribute('aria-label', /Beta/i);
  });

  test('clicking the Football tab surfaces a dismissable coming-soon banner', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('sport-tab-football').click();

    // The banner is an aria-live status region so screen readers announce it.
    const banner = page.getByRole('status').filter({
      hasText: /Football leagues are coming soon/i,
    });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/create a Baseball league/i);

    // The Dismiss control inside the banner hides it again.
    await banner.getByRole('button', { name: /dismiss/i }).click();
    await expect(banner).not.toBeVisible();
  });

  test('returns to the Baseball form after dismissing the Football banner', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('sport-tab-football').click();
    await page
      .getByRole('status')
      .filter({ hasText: /Football leagues are coming soon/i })
      .getByRole('button', { name: /dismiss/i })
      .click();

    // Baseball is still the active sport (Football is a coming-soon placeholder
    // and does not change selection) and the baseball form is still rendered.
    await expect(page.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible();
  });

  // ─── Premium-blocked path (free user) ────────────────────────────────────

  freeUserTest(
    'free user: Football tab + FAAB still triggers the premium gate',
    async ({ page }) => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Touch the Football tab first — premium gating must remain in effect
      // regardless of which sport the user has interacted with.
      await page.getByTestId('sport-tab-football').click();
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: /Football leagues are coming soon/i }),
      ).toBeVisible();

      await expandSection(page, 'waiver-budget');

      const faabButton = page.getByRole('button', { name: /FAAB/i }).first();
      await expect(faabButton).toBeVisible({ timeout: 10000 });
      await faabButton.click();

      await expect(page.getByTestId('premium-feature-gate')).toBeVisible({
        timeout: 10000,
      });
    },
  );

  freeUserTest(
    'free user: Football tab + Salary Cap still triggers the premium gate',
    async ({ page }) => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('sport-tab-football').click();

      await expandSection(page, 'waiver-budget');

      // The salary cap row sits inside a PremiumGate overlay for free users —
      // the gate itself is visible without further interaction.
      await expect(
        page.getByTestId('premium-feature-gate').filter({
          hasText: /Salary Cap/i,
        }),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  freeUserTest(
    'free user: Football tab + non-free era opens the era upgrade modal',
    async ({ page }) => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('sport-tab-football').click();

      await expandSection(page, 'era-history');

      // Dead Ball is a premium era — clicking it should open the era upgrade
      // modal rather than selecting the era.
      await page.getByText(/Dead Ball/i).click();

      // Upgrade modal headline names the gated feature.
      await expect(
        page.getByText(/Historical Era Selection/i).first(),
      ).toBeVisible({ timeout: 10000 });
    },
  );
});
