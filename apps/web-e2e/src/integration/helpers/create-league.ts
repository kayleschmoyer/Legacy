import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface CreateLeagueResult {
  leagueId: number;
  inviteCode: string;
}

/**
 * Create a league via the browser UI with built-in retry and extended timeout.
 *
 * Navigates to `/baseball/league/create`, fills the form, submits, waits for
 * the redirect to `/baseball/league/{id}`, then extracts the invite code from
 * the overview page.
 *
 * If the redirect does not happen within 45 s (commonly caused by Lambda cold
 * starts or API Gateway throttling), the page is reloaded and the form is
 * re-submitted up to `maxAttempts` times.
 */
export async function createLeagueViaUI(
  page: Page,
  options: {
    leagueName: string;
    teamCount?: number;
    maxAttempts?: number;
  },
): Promise<CreateLeagueResult> {
  const { leagueName, teamCount = 4, maxAttempts = 3 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Enter your league name').fill(leagueName);
    await page
      .getByRole('button', { name: String(teamCount), exact: true })
      .first()
      .click();

    // Click submit and wait for the GraphQL mutation response in parallel so
    // we can detect network failures vs. slow redirects.
    const responsePromise = page
      .waitForResponse(
        (r) => r.url().includes('graphql') && r.request().method() === 'POST',
        { timeout: 45_000 },
      )
      .catch(() => null);

    await page.getByRole('button', { name: /create league/i }).click();

    const response = await responsePromise;

    // If the mutation response failed at the network level, retry or fail
    if (!response) {
      if (attempt < maxAttempts) {
        await page.waitForTimeout(2_000 * attempt);
        continue;
      }
    }

    // Fail immediately on HTTP-level errors — waiting for a redirect is futile
    if (response && !response.ok()) {
      if (attempt < maxAttempts) {
        await page.waitForTimeout(2_000 * attempt);
        continue;
      }
      const statusText = await response
        .text()
        .catch(() => '(unable to read body)');
      throw new Error(
        `League creation failed with HTTP ${response.status()}: ${statusText}`,
      );
    }

    // Check for GraphQL-level errors in the response body (e.g. free-tier
    // league limit).  Fail immediately with a descriptive message instead of
    // waiting 45 s for a redirect that will never come.
    if (response) {
      let body: { errors?: Array<{ message: string }> } | null = null;
      try {
        body = (await response.json()) as {
          errors?: Array<{ message: string }>;
        };
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          throw err;
        }
      }
      if (body?.errors?.length) {
        const messages = body.errors.map((e) => e.message).join('; ');
        throw new Error(
          `League creation failed with GraphQL error: ${messages}`,
        );
      }
    }

    // Wait for the client-side redirect
    try {
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 45_000,
      });
      break; // Success
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to create league after ${maxAttempts} attempts. ` +
            `Page URL: ${page.url()}`,
        );
      }
      await page.waitForTimeout(2_000 * attempt);
    }
  }

  // Extract league ID
  const match = page.url().match(/\/baseball\/league\/(\d+)/);
  expect(match).toBeTruthy();
  const leagueId = Number(match?.[1]);
  expect(leagueId).toBeGreaterThan(0);

  // Navigate to overview and extract invite code
  await page.goto(`/baseball/league/${leagueId}/overview`);
  await page.waitForLoadState('load');
  await expect(page.getByText('Manual Code', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
  await expect(codeLocator).toBeVisible({ timeout: 10_000 });
  const inviteCode = (await codeLocator.textContent()) ?? '';
  expect(inviteCode).toBeTruthy();

  return { leagueId, inviteCode };
}
