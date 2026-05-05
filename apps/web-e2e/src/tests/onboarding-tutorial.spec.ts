/**
 * Onboarding Tutorial E2E Tests (LS-686)
 *
 * Covers: tutorial launch, step progression, skip/close actions, progress
 * indicators, and final "Get Started" button.
 *
 * The OnboardingTutorial component has no GraphQL dependencies — it is a
 * pure UI walkthrough rendered on /help when the "Launch Tutorial" button
 * is clicked.
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';

const HELP_URL = '/help';

// Helper: click the "Launch Tutorial" button and wait for the dialog to open
async function openTutorial(page: import('@playwright/test').Page) {
  await page.goto(HELP_URL);
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: /launch tutorial/i }).click();
  // Wait for the dialog to appear
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
}

// ── Tests: Tutorial launch ────────────────────────────────────────────────────

test.describe('Onboarding Tutorial — launch @regression', () => {
  test('"Launch Tutorial" button is visible on the Help page', async ({
    page,
  }) => {
    await page.goto(HELP_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /launch tutorial/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('clicking "Launch Tutorial" opens the tutorial dialog', async ({
    page,
  }) => {
    await openTutorial(page);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  });

  test('first step title is "Welcome to Legacy Sports"', async ({ page }) => {
    await openTutorial(page);

    await expect(page.getByText('Welcome to Legacy Sports')).toBeVisible({
      timeout: 10000,
    });
  });

  test('step counter shows "Step 1 of 6" on first step', async ({ page }) => {
    await openTutorial(page);

    await expect(page.getByText(/step 1 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

// ── Tests: Navigation ─────────────────────────────────────────────────────────

test.describe('Onboarding Tutorial — navigation @regression', () => {
  test('"Next →" button is visible on the first step', async ({ page }) => {
    await openTutorial(page);

    await expect(page.getByRole('button', { name: /next/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('"← Back" button is not visible on the first step', async ({ page }) => {
    await openTutorial(page);

    await expect(page.getByRole('button', { name: /← back/i })).not.toBeVisible(
      { timeout: 5000 },
    );
  });

  test('clicking "Next →" advances to step 2', async ({ page }) => {
    await openTutorial(page);

    await page.getByRole('button', { name: /next/i }).click();

    await expect(page.getByText(/step 2 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('"← Back" button appears after advancing to step 2', async ({
    page,
  }) => {
    await openTutorial(page);
    await page.getByRole('button', { name: /next/i }).click();

    await expect(page.getByRole('button', { name: /← back/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('clicking "← Back" returns to the previous step', async ({ page }) => {
    await openTutorial(page);
    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.getByText(/step 2 of 6/i)).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /← back/i }).click();

    await expect(page.getByText(/step 1 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('can navigate all the way to the last step', async ({ page }) => {
    await openTutorial(page);

    // Click "Next →" 5 times to reach step 6
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /next/i }).click();
    }

    await expect(page.getByText(/step 6 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('last step shows "🚀 Get Started" button', async ({ page }) => {
    await openTutorial(page);

    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /next/i }).click();
    }

    await expect(
      page.getByRole('button', { name: /get started/i }),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ── Tests: Skip / Close ───────────────────────────────────────────────────────

test.describe('Onboarding Tutorial — skip and close @regression', () => {
  test('"Skip tutorial" close button (✕) is visible', async ({ page }) => {
    await openTutorial(page);

    await expect(
      page.getByRole('button', { name: /skip tutorial/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking the close button dismisses the tutorial', async ({ page }) => {
    await openTutorial(page);

    await page.getByRole('button', { name: /skip tutorial/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
  });

  test('"Skip" footer button is visible on steps other than the last', async ({
    page,
  }) => {
    await openTutorial(page);

    await expect(page.getByRole('button', { name: /^skip$/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('clicking footer "Skip" dismisses the tutorial', async ({ page }) => {
    await openTutorial(page);

    await page.getByRole('button', { name: /^skip$/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
  });

  test('clicking "🚀 Get Started" on last step closes the tutorial', async ({
    page,
  }) => {
    await openTutorial(page);

    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /next/i }).click();
    }

    await page.getByRole('button', { name: /get started/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
  });
});

// ── Tests: Navigation links on final step ────────────────────────────────────

test.describe('Onboarding Tutorial — final step navigation links @regression', () => {
  // Helper: open tutorial and advance to the final "Get Started" step
  async function openTutorialAtLastStep(page: import('@playwright/test').Page) {
    await openTutorial(page);
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /next/i }).click();
    }
    await expect(page.getByText(/step 6 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  }

  test('"Create League →" link closes the tutorial overlay', async ({
    page,
  }) => {
    await openTutorialAtLastStep(page);

    await page.getByRole('link', { name: /create league/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('"Create League →" link navigates to /baseball/league/create', async ({
    page,
  }) => {
    await openTutorialAtLastStep(page);

    await page.getByRole('link', { name: /create league/i }).click();

    await expect(page).toHaveURL(/\/baseball\/league\/create/, {
      timeout: 10000,
    });
  });

  test('"View Leagues →" link closes the tutorial overlay', async ({
    page,
  }) => {
    await openTutorialAtLastStep(page);

    await page.getByRole('link', { name: /view leagues/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 10000,
    });
  });
});

// ── Tests: "New to Legacy Sports?" section ────────────────────────────────────

test.describe('Help Page — tutorial launcher section @regression', () => {
  test('shows "New to Legacy Sports?" heading', async ({ page }) => {
    await page.goto(HELP_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('New to Legacy Sports?')).toBeVisible({
      timeout: 15000,
    });
  });
});
