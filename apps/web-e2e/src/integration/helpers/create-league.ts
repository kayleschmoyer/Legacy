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
        (r) => {
          if (!r.url().includes('graphql') || r.request().method() !== 'POST') {
            return false;
          }
          try {
            const postData = r.request().postData();
            return postData?.includes('createLeagueAndTeams') ?? false;
          } catch {
            return false;
          }
        },
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
      let body: {
        errors?: Array<{ message: string; extensions?: { code?: string } }>;
      } | null = null;
      try {
        body = (await response.json()) as {
          errors?: Array<{ message: string; extensions?: { code?: string } }>;
        };
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          throw err;
        }
      }
      if (body?.errors?.length) {
        // Auth errors (UNAUTHENTICATED) are transient — Apollo's error link will
        // silently refresh the JWT and retry the mutation.  Only suppress when
        // ALL errors are auth-related; if any non-auth error is present, throw
        // immediately with a descriptive message rather than waiting 45 s.
        const allAuthErrors = body.errors.every(
          (e) =>
            e.extensions?.code === 'UNAUTHENTICATED' ||
            /authentication required|unauthenticated|unauthorized/i.test(
              e.message,
            ),
        );
        if (!allAuthErrors) {
          const messages = body.errors.map((e) => e.message).join('; ');
          throw new Error(
            `League creation failed with GraphQL error: ${messages}`,
          );
        }
        // All errors are auth-related — fall through to the URL redirect wait
        // (45 s) so Apollo can retry after refreshing the JWT.
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
  await expect(page.getByText('Invite Code', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
  await expect(codeLocator).toBeVisible({ timeout: 10_000 });
  const inviteCode = (await codeLocator.textContent()) ?? '';
  expect(inviteCode).toBeTruthy();

  return { leagueId, inviteCode };
}
