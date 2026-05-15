import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { awsRequestContext } from './graphql';

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
  ).replace(/\/?$/, '/') + 'graphql';

interface ValidateInviteCodeResponse {
  data?: { validateInviteCode: { leagueId: number } | null };
  errors?: Array<{
    message: string;
    path?: ReadonlyArray<string | number>;
  }>;
}

/**
 * Run `validateInviteCode` once and decide what to do next:
 *   - returns `{ leagueId }` when the backend reports a valid league
 *   - returns `null` when `data.validateInviteCode` is null and there are no
 *     `errors[]` (the "Lambda still warming up" case — caller should keep
 *     polling)
 *   - throws when the response contains an `errors[]` payload — surfaces the
 *     first error's message and path plus the AWS request ID, so the failure
 *     can be correlated with CloudWatch logs instead of collapsing to a
 *     generic "Received: null" in the test report (LS-4444).
 */
async function callValidateInviteCode(
  jwt: string,
  inviteCode: string,
): Promise<{ leagueId: number } | null> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query ValidateInviteCodePreflight($code: String!) {
        validateInviteCode(code: $code) { leagueId }
      }`,
      variables: { code: inviteCode },
    }),
  });

  // Capture trace headers before parsing so we can still report them if the
  // response body is malformed.
  const requestContext = awsRequestContext(res.headers);

  let json: ValidateInviteCodeResponse;
  try {
    json = (await res.json()) as ValidateInviteCodeResponse;
  } catch (err) {
    throw new Error(
      `validateInviteCode("${inviteCode}") returned non-JSON response ` +
        `(HTTP ${res.status})${requestContext}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (json.errors?.length) {
    const first = json.errors[0];
    const pathStr = first.path?.length ? ` (path=${first.path.join('.')})` : '';
    throw new Error(
      `validateInviteCode("${inviteCode}") returned GraphQL error: ` +
        `${first.message}${pathStr}${requestContext}`,
    );
  }

  return json.data?.validateInviteCode ?? null;
}

/**
 * Poll `validateInviteCode` with the given JWT until the backend returns a
 * non-null leagueId. Warms the Lambda instance for this JWT before the
 * browser navigates to the join URL, preventing transient "Invalid invite
 * code" failures caused by Lambda cold starts (LS-4360, LS-4364, LS-4385).
 *
 * Call once per manager JWT before `page.goto(joinUrl)`. Under concurrent
 * load Lambda may route each manager's request to a different cold instance,
 * so the preflight must be run per-manager — a single commissioner-JWT
 * warmup is not sufficient.
 *
 * GraphQL `errors[]` responses (AuthenticationError, resolver throws, etc.)
 * fail fast with the actual error message + AWS request ID; only the
 * `{ data: { validateInviteCode: null } }` "still warming" shape is treated
 * as a retryable transient (LS-4444 — earlier versions of this helper
 * collapsed every failure shape into `null`, masking the actual cause).
 */
export async function validateInviteCodePreflight(
  jwt: string,
  inviteCode: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  const intervals = [500, 1_000, 2_000];
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    const result = await callValidateInviteCode(jwt, inviteCode);
    if (result?.leagueId != null) {
      return;
    }
    // result === null with no errors[] — Lambda may still be warming up.
    const interval = intervals[Math.min(attempt - 1, intervals.length - 1)];
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `validateInviteCode("${inviteCode}") returned null without errors[] ` +
      `after ${attempt} attempt(s) over 30s — backend is reachable but ` +
      `repeatedly returned { data: { validateInviteCode: null } }`,
  );
}

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
