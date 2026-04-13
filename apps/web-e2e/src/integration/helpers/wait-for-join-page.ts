import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Wait for the join-league page to finish invite code validation.
 *
 * After `switchUser` navigates to the join page, the `validateInviteCode`
 * GraphQL query fires immediately. Due to a race condition between the
 * cookie/localStorage swap and the query execution, the validation can
 * fail transiently — the page shows "Unable to verify code" instead of
 * the expected "X spot(s) available" text.
 *
 * This helper waits for the success text and, if the error message appears
 * instead, reloads the page to retry validation. The first attempt plus up
 * to `maxRetries` reload retries are performed (i.e. `maxRetries + 1`
 * total attempts).
 */
export async function waitForJoinPageValidation(
  page: Page,
  maxRetries = 2,
): Promise<void> {
  const spotsLocator = page.getByText(/spot(s)?\s+available/i).first();
  const errorLocator = page.getByText(/unable to verify code/i).first();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const outcome = await Promise.race([
      spotsLocator
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'success' as const),
      errorLocator
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'error' as const),
      page.waitForTimeout(15_000).then(() => 'timeout' as const),
    ]);

    if (outcome === 'success') {
      await expect(spotsLocator).toBeVisible();
      return;
    }

    const hasError = outcome === 'error';
    if (hasError && attempt < maxRetries) {
      await page.reload();
      await page.waitForLoadState('load');
      continue;
    }

    throw new Error(
      `Join page validation failed after ${attempt + 1} attempt(s). ` +
        `Error visible: ${hasError}. URL: ${page.url()}`,
    );
  }
}
