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
 * "Invalid invite code" can also appear transiently: the component renders
 * that message on the initial render (before the lazy query fires) and when
 * the backend returns null for a valid code (slow Lambda cold start).  When
 * detected, the helper waits a 5 s grace period for the query to self-resolve
 * before deciding to reload — avoiding premature reloads caused by catching
 * the initial-render flash before the async query completes (LS-4364).
 *
 * This helper waits for the success text and, if any error message appears
 * or the 15 s poll times out, reloads the page to retry validation. The
 * first attempt plus up to `maxRetries` reload retries are performed (i.e.
 * `maxRetries + 1` total attempts).
 */
export async function waitForJoinPageValidation(
  page: Page,
  maxRetries = 2,
): Promise<void> {
  const spotsLocator = page.getByText(/spot(s)?\s+available/i).first();
  const errorLocator = page.getByText(/unable to verify code/i).first();
  // "Invalid invite code" appears transiently on initial render (before the
  // validateInviteCode query fires) or when the backend returns null for a
  // valid code. Detect it quickly so we can apply the grace period rather
  // than waiting the full 15 s timeout before reacting.
  const invalidLocator = page.getByText(/invalid invite code/i).first();

  // Re-throws non-TimeoutError failures (page closed, navigation errors) so
  // genuine failures are not silently swallowed and retried as a timeout.
  const onlyTimeout = (err: unknown): 'timeout' => {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return 'timeout';
    }
    throw err;
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Catch only Playwright TimeoutErrors on each waitFor. Any other error
    // (page/context closed, navigation failure) is re-thrown immediately so it
    // isn't silently swallowed and retried. Without the catch, a TimeoutError
    // from waitFor can win the Promise.race against waitForTimeout (both fire
    // at ~15 s), causing the rejection to bypass the retry loop entirely.
    const outcome = await Promise.race([
      spotsLocator
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'success' as const)
        .catch(onlyTimeout),
      errorLocator
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'error' as const)
        .catch(onlyTimeout),
      invalidLocator
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'invalid' as const)
        .catch(onlyTimeout),
      page.waitForTimeout(15_000).then(() => 'timeout' as const),
    ]);

    if (outcome === 'success') {
      await expect(spotsLocator).toBeVisible();
      return;
    }

    if (outcome === 'invalid') {
      // "Invalid invite code" appears on the initial render (before the lazy
      // validateInviteCode query fires) and again when the backend transiently
      // returns null (Lambda cold start).  The Promise.race above resolves as
      // soon as the text is *visible* — which can happen within milliseconds
      // of the page load — so we may be firing a reload before the query has
      // had a chance to complete (LS-4364).
      //
      // Give the query a 5 s grace period to self-resolve.  If the backend
      // returns a valid code, the "spot(s) available" text will appear within
      // that window and we can return immediately without an unnecessary
      // reload.  If it is still invalid after 5 s, fall through to the
      // reload/retry path — the backend is genuinely returning null.
      const selfResolved = await spotsLocator
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (selfResolved) {
        await expect(spotsLocator).toBeVisible();
        return;
      }
      // Still invalid after grace period — fall through to reload/retry below.
    }

    // Retry on explicit errors ("Unable to verify code"), persistent
    // "Invalid invite code" (backend still returning null after grace period),
    // and timeouts (slow Lambda cold start or transient auth race).
    if (attempt < maxRetries) {
      await page.reload();
      await page.waitForLoadState('load');
      continue;
    }

    throw new Error(
      `Join page validation failed after ${attempt + 1} attempt(s). ` +
        `Outcome: ${outcome}. URL: ${page.url()}`,
    );
  }
}
