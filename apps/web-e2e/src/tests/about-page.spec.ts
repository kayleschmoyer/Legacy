/**
 * About Page UI Tests
 *
 * The About page renders entirely from synchronous data (env vars / build
 * constants) — no GraphQL calls.  Tests are fast and reliable.
 */

import { expect, test } from '@playwright/test';

test.describe('About Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('renders the About Legacy Sports heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /about legacy sports/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows descriptive subtitle text', async ({ page }) => {
    await expect(
      page.getByText(/fantasy sports management platform/i),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows Build Information section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /build information/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('displays Version label', async ({ page }) => {
    await expect(page.getByText('Version:')).toBeVisible({ timeout: 30000 });
  });

  test('displays Build Date label', async ({ page }) => {
    await expect(page.getByText('Build Date:')).toBeVisible({ timeout: 30000 });
  });

  test('shows Application Info section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /application info/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('displays Environment label', async ({ page }) => {
    await expect(page.getByText('Environment:')).toBeVisible({
      timeout: 30000,
    });
  });

  test('displays GraphQL API label', async ({ page }) => {
    await expect(page.getByText('GraphQL API:')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows a View on GitHub button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /view on github/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows copyright footer text', async ({ page }) => {
    await expect(page.getByText(/© \d{4} legacy sports/i)).toBeVisible({
      timeout: 30000,
    });
  });

  test('About nav link is active (aria-current="page") when on /about', async ({
    page,
  }) => {
    const aboutNav = page.locator('a[href="/about"][aria-current="page"]');
    await expect(aboutNav).toBeVisible({ timeout: 30000 });
  });
});
