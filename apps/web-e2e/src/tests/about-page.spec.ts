/**
 * About Page UI Tests
 *
 * The About page renders entirely from synchronous data (env vars / build
 * constants) — no GraphQL calls.  Tests are fast and reliable.
 */

import { expect, test } from '../fixtures/auth-enhanced';

test.describe('About Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('renders the About Legacy Sports heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /about legacy sports/i }),
    ).toBeVisible();
  });

  test('shows descriptive subtitle text', async ({ page }) => {
    await expect(
      page.getByText(/fantasy sports management platform/i),
    ).toBeVisible();
  });

  test('shows Build Information section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /build information/i }),
    ).toBeVisible();
  });

  test('displays Version label', async ({ page }) => {
    await expect(page.getByText('Version:')).toBeVisible();
  });

  test('displays Build Date label', async ({ page }) => {
    await expect(page.getByText('Build Date:')).toBeVisible();
  });

  test('shows Application Info section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /application info/i }),
    ).toBeVisible();
  });

  test('displays Environment label', async ({ page }) => {
    await expect(page.getByText('Environment:')).toBeVisible();
  });

  test('displays GraphQL API label', async ({ page }) => {
    await expect(page.getByText('GraphQL API:')).toBeVisible();
  });

  test('shows a View on GitHub button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /view on github/i }),
    ).toBeVisible();
  });

  test('shows copyright footer text', async ({ page }) => {
    await expect(page.getByText(/© \d{4} legacy sports/i)).toBeVisible();
  });

  test('navigating to /about shows the about page', async ({ page }) => {
    await expect(page).toHaveURL(/\/about/);
  });
});
