/**
 * Onboarding Tutorial E2E Tests (LS-686)
 *
 * Covers: tutorial launch, step progression, skip/close actions, progress
 * indicators, and final "Get Started" button.
 *
 * The OnboardingTutorial component has no GraphQL dependencies — it is a
 * pure UI walkthrough rendered on /help when the "Launch Tutorial" button
 * is clicked.
 *
 * LS-2098 adds coverage for the *complete* new-user flow — the tests above
 * only ever exercise the tutorial UI in isolation via the manual "Launch
 * Tutorial" button on /help. The tests at the bottom of this file
 * (`New user onboarding flow with auth redirect`) instead drive it through
 * the real trigger path: first login → redirect to "/" → the tutorial
 * auto-opens on HomePage for a user with no leagues who hasn't completed it
 * (see `HomePage.tsx`'s `ls_onboarding_complete_<uid>` localStorage gate) →
 * completing it dismisses the dialog and leaves the user on the home page.
 * A companion test asserts the tutorial does NOT re-open for a user whose
 * completion flag is already set.
 */

import { type Page } from '@playwright/test';
import { expect } from '../fixtures/auth-enhanced';
import { test, unauthTest } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { E2EJwtUtil } from '../utils/jwt';

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

// ── Tests: Progress dots (LS-6906) ────────────────────────────────────────────

test.describe('Onboarding Tutorial — progress dots @regression', () => {
  test('clicking a progress dot jumps to that step', async ({ page }) => {
    await openTutorial(page);

    await page.getByRole('button', { name: 'Go to step 4' }).click();
    await expect(page.getByText(/step 4 of 6/i)).toBeVisible({
      timeout: 10000,
    });

    // Dots also jump backwards.
    await page.getByRole('button', { name: 'Go to step 2' }).click();
    await expect(page.getByText(/step 2 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('progress dots are keyboard operable and mark the current step', async ({
    page,
  }) => {
    await openTutorial(page);

    const dot3 = page.getByRole('button', { name: 'Go to step 3' });
    await dot3.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/step 3 of 6/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(dot3).toHaveAttribute('aria-current', 'step');

    const dot5 = page.getByRole('button', { name: 'Go to step 5' });
    await dot5.focus();
    await page.keyboard.press('Space');
    await expect(page.getByText(/step 5 of 6/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

// ── Tests: Skip / Close ───────────────────────────────────────────────────────

test.describe('Onboarding Tutorial — skip and close @regression', () => {
  test('"Skip tutorial" close button (✕) is visible', async ({ page }) => {
    await openTutorial(page);

    await expect(page.getByLabel('Skip tutorial')).toBeVisible({
      timeout: 10000,
    });
  });

  test('clicking the close button dismisses the tutorial', async ({ page }) => {
    await openTutorial(page);

    await page.getByLabel('Skip tutorial').click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
  });

  test('"Skip tutorial" footer button is visible on steps other than the last', async ({
    page,
  }) => {
    await openTutorial(page);

    await expect(page.getByTestId('onboarding-skip-footer')).toHaveText(
      'Skip tutorial',
      { timeout: 10000 },
    );
  });

  test('clicking footer "Skip tutorial" dismisses the tutorial', async ({
    page,
  }) => {
    await openTutorial(page);

    await page.getByTestId('onboarding-skip-footer').click();

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

    await page
      .locator('[role="dialog"]')
      .getByRole('link', { name: /create league/i })
      .click();

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('"Create League →" link navigates to /baseball/league/create', async ({
    page,
  }) => {
    await openTutorialAtLastStep(page);

    await page
      .locator('[role="dialog"]')
      .getByRole('link', { name: /create league/i })
      .click();

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

// ── Tests: New user onboarding flow with auth redirect (LS-2098) ────────────

// Minimal GSI mock — same shape as login-completion.spec.ts's
// GSI_MOCK_WITH_HOOKS, duplicated locally (not exported there) so this file
// stays independently readable. Only the button-click code-flow path is
// exercised; One Tap is not relevant to onboarding-trigger coverage.
const GSI_MOCK = [
  'window.google = { accounts: {',
  '  id: { initialize: function() {}, renderButton: function() {}, prompt: function() {}, cancel: function() {} },',
  '  oauth2: {',
  '    initCodeClient: function(config) {',
  '      return {',
  '        requestCode: function() {',
  '          if (config.callback) config.callback({ code: "fake-auth-code" });',
  '        },',
  '      };',
  '    },',
  '  },',
  '}};',
].join('\n');

/** Mocks the Google login round trip so `unauthTest` can drive a real login. */
async function mockGoogleLogin(page: Page, userId: number): Promise<void> {
  await page.route('**/accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: GSI_MOCK,
    }),
  );

  const jwt = E2EJwtUtil.generateJwt({
    id: userId,
    email: 'onboarding@test.com',
  });
  await page.route('http://localhost:5001/google', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jwt,
        csrfToken: 'e2e-csrf-token',
        user: {
          id: userId,
          email: 'onboarding@test.com',
          username: 'onboardinguser',
          accessLevel: 'none',
        },
      }),
    }),
  );
}

/** Clicks through every tutorial step to the final "Get Started" button. */
async function completeTutorial(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: /next/i }).click();
  }
  await page.getByRole('button', { name: /get started/i }).click();
}

unauthTest.describe(
  'New user onboarding flow with auth redirect @regression',
  () => {
    unauthTest(
      'first login redirects to home and auto-triggers onboarding; completing it dismisses the tutorial and routes to league creation (LS-2098, LS-6908)',
      async ({ page }) => {
        await mockGoogleLogin(page, 501);

        await page.goto('/');
        await page.waitForLoadState('load');

        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await loginButton.click();

        // Auth redirect: logging in from "/" lands the user on the home
        // dashboard ("/"), the getUserLeagueSummaries baseline returns no
        // leagues, and no `ls_onboarding_complete_501` flag exists yet — the
        // tutorial auto-triggers per HomePage.tsx's onboarding effect.
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Welcome to Legacy Sports')).toBeVisible();

        await completeTutorial(page);

        // "Get Started" dismisses the tutorial and, because this user has no
        // leagues, routes straight to league creation (LS-6908).
        await expect(page.getByRole('dialog')).not.toBeVisible({
          timeout: 10000,
        });
        await expect(page).toHaveURL(/\/baseball\/league\/create/, {
          timeout: 10000,
        });

        // Completion status persisted so the tutorial does not reopen.
        const completed = await page.evaluate(() =>
          window.localStorage.getItem('ls_onboarding_complete_501'),
        );
        expect(completed).toBe('true');
      },
    );

    unauthTest(
      'new user with zero leagues who skips the tutorial lands on the Home empty state with the Create League CTA (LS-6917)',
      async ({ page }) => {
        await mockGoogleLogin(page, 504);

        await page.goto('/');
        await page.waitForLoadState('load');

        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await loginButton.click();

        await expect(page).toHaveURL('/');
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

        // An explicit skip (✕) closes the tutorial and leaves the user on Home.
        await page.getByLabel('Skip tutorial').click();
        await expect(page.getByRole('dialog')).not.toBeVisible({
          timeout: 10000,
        });
        await expect(page).toHaveURL('/');

        // Getting-started view for a user with no leagues: welcome copy plus
        // the Create League CTA (a renamed label or dropped CTA fails here).
        await expect(
          page.getByRole('heading', { name: 'Start your dynasty.' }),
        ).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Welcome, onboardinguser')).toBeVisible();
        await expect(page.getByTestId('home-empty-create')).toBeVisible();
        await expect(
          page.getByTestId('home-empty-create').getByText('Create League'),
        ).toBeVisible();
        await expect(page.getByTestId('home-empty-join')).toBeVisible();
      },
    );

    unauthTest(
      'returning user who already completed onboarding does not see the tutorial after login (LS-2098)',
      async ({ page }) => {
        await mockGoogleLogin(page, 502);
        // Seed the completion flag before the app boots, simulating a user
        // who finished onboarding in a previous session.
        await page.addInitScript(() => {
          window.localStorage.setItem(
            'ls_onboarding_complete_502',
            JSON.stringify(true),
          );
        });

        await page.goto('/');
        await page.waitForLoadState('load');

        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await loginButton.click();

        await expect(page).toHaveURL('/');
        await expect(
          page.getByRole('navigation', { name: 'Primary' }),
        ).toBeVisible({ timeout: 10000 });

        // Tutorial must stay hidden — the completion flag was already set.
        await expect(page.getByRole('dialog')).not.toBeVisible({
          timeout: 5000,
        });
      },
    );

    unauthTest(
      'user whose server flag says onboarding is complete does not see the tutorial, even with no local flag (LS-10382)',
      async ({ page }) => {
        await mockGoogleLogin(page, 505);
        await createGraphQLRouter(page, {
          getuserpreferences: (route) =>
            fulfillJson(route, {
              data: {
                getUserPreferences: {
                  __typename: 'UserPreference',
                  id: 1,
                  userId: 505,
                  statsFormat: 'standard',
                  audioEnabled: true,
                  onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              },
            }),
        });

        await page.goto('/');
        await page.waitForLoadState('load');

        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await loginButton.click();

        await expect(page).toHaveURL('/');
        await expect(
          page.getByRole('heading', { name: 'Start your dynasty.' }),
        ).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('dialog')).not.toBeVisible({
          timeout: 5000,
        });
      },
    );

    unauthTest(
      'pressing Escape hides the auto-triggered tutorial without marking onboarding complete (LS-6909)',
      async ({ page }) => {
        await mockGoogleLogin(page, 503);

        await page.goto('/');
        await page.waitForLoadState('load');

        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await loginButton.click();

        await expect(page).toHaveURL('/');
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: /next/i }).click();
        await page.keyboard.press('Escape');

        await expect(page.getByRole('dialog')).not.toBeVisible({
          timeout: 10000,
        });

        // Escape is not a confirmed skip: no completion flag, and the step
        // the user reached is kept so the tutorial resumes on the next visit.
        const stored = await page.evaluate(() => ({
          completed: window.localStorage.getItem('ls_onboarding_complete_503'),
          step: window.localStorage.getItem('ls_onboarding_step_503'),
        }));
        expect(stored).toEqual({ completed: null, step: '1' });
      },
    );
  },
);
