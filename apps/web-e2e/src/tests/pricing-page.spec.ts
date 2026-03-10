/**
 * E2E tests for the Pricing page (/pricing).
 *
 * Covers:
 * - Page load: heading, billing toggle, plan cards
 * - Default state: annual toggle active, premium price shown
 * - Billing toggle: switching monthly / annual updates price display
 * - Free plan card: $0, "Get Started Free" button visible
 * - Premium plan card: "Upgrade to Premium" button, "Most Popular" badge
 * - Feature comparison table: "Compare plans" heading, key rows present
 * - FAQ section: heading visible
 * - No GraphQL calls needed (pricing page is fully static)
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth-enhanced';

test.describe('Pricing page — page load @critical', () => {
  test('renders page heading and billing toggle', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // Hero heading
    await expect(
      page.getByRole('heading', { name: /the plan that fits/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Billing cycle toggle
    await expect(page.getByText(/monthly/i).first()).toBeVisible();
    await expect(page.getByText(/annual/i).first()).toBeVisible();
  });

  test('shows Free and Premium plan cards', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // Free plan
    await expect(page.getByText('FREE')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('$0')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /get started free/i }),
    ).toBeVisible();

    // Premium plan
    await expect(page.getByText('PREMIUM')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /upgrade to premium/i }),
    ).toBeVisible();
  });

  test('shows "Most Popular" badge on premium plan', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/most popular/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Pricing page — billing toggle @smoke', () => {
  test('switches between monthly and annual pricing', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // The page defaults to annual. Click "Monthly" toggle.
    const monthlyToggle = page.getByText(/^monthly$/i).first();
    await monthlyToggle.click();

    // After switching to monthly the price display changes
    // Monthly price: $9.99; Annual monthly equivalent: $6.99
    await expect(page.getByText('9.99')).toBeVisible({ timeout: 5_000 });

    // Switch back to annual
    const annualToggle = page.getByText(/^annual$/i).first();
    await annualToggle.click();

    await expect(page.getByText('6.99')).toBeVisible({ timeout: 5_000 });
  });

  test('"Save 30%" discount badge is visible on annual toggle option', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/save 30%/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Pricing page — feature comparison @smoke', () => {
  test('displays "Compare plans" section heading', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/compare plans/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('comparison table has Free and Premium column headers', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/^free$/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^premium$/i).first()).toBeVisible();
  });

  test('comparison table rows include leagues and mock drafts', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // Key comparison rows from COMPARISON_ROWS constant
    await expect(page.getByText(/leagues/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/mock drafts/i)).toBeVisible();
    await expect(page.getByText(/unlimited/i).first()).toBeVisible();
  });
});

test.describe('Pricing page — FAQ section @regression', () => {
  test('FAQ section heading is visible', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/frequently asked|faq/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('FAQ items exist and are expandable', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // First FAQ question from FAQ_ITEMS constant
    const firstQuestion = page.getByText(
      /can i try premium before committing/i,
    );
    await expect(firstQuestion).toBeVisible({ timeout: 10_000 });
    await firstQuestion.click();

    // After clicking, the answer should appear
    await expect(page.getByText(/14-day free trial/i)).toBeVisible({
      timeout: 3_000,
    });
  });
});
