import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { awsRequestContext } from './graphql';
import { gqlFetchEnvelope } from './gql-fetch';

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
  const result = await gqlFetchEnvelope<{
    validateInviteCode: { leagueId: number } | null;
  }>(
    jwt,
    `query ValidateInviteCodePreflight($code: String!) {
      validateInviteCode(code: $code) { leagueId }
    }`,
    { code: inviteCode },
  );

  if (result.errors?.length) {
    const first = result.errors[0];
    const pathStr = first.path?.length ? ` (path=${first.path.join('.')})` : '';
    throw new Error(
      `validateInviteCode("${inviteCode}") returned GraphQL error: ` +
        `${first.message}${pathStr}${result.requestContext}`,
    );
  }

  return result.data?.validateInviteCode ?? null;
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
      // Use the `onlyTimeout` predicate so a page-closed or navigation error
      // during the grace period rethrows instead of being silently treated
      // as "not visible" (LS-4461).
      const selfResolved = await spotsLocator
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch((err: unknown) => {
          onlyTimeout(err);
          return false;
        });
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

interface JoinLeagueByCodeResponse {
  data?: { joinLeagueByCode?: { leagueId: number } | null };
  errors?: Array<{
    message: string;
    path?: ReadonlyArray<string | number>;
    extensions?: { code?: string };
  }>;
}

/**
 * `extensions.code` set by the server's `AuthenticationError` helper when the
 * JWT cookie is missing, expired, or fails CSRF double-submit validation.
 * Apollo's `errorLink` (apps/web/src/lib/apollo-client.ts) recognises this
 * code, calls `silentlyRefreshJwt()`, and re-runs the operation — so a single
 * UNAUTHENTICATED response is a transient race, not a definitive failure.
 */
const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';

function isUnauthenticatedResponse(json: JoinLeagueByCodeResponse): boolean {
  return (
    json.errors?.some((e) => e.extensions?.code === UNAUTHENTICATED_CODE) ??
    false
  );
}

export interface JoinLeagueAsManagerOptions {
  /** Manager JWT — used to warm the validateInviteCode Lambda for this user. */
  jwt: string;
  /** League invite code (8 uppercase alphanumeric characters). */
  inviteCode: string;
  /** Team name to register on the join form. */
  teamName: string;
  /**
   * Window allowed for the JoinLeagueByCode mutation response to arrive after
   * the Join button click. Covers Lambda cold-start on the mutation resolver,
   * which the validateInviteCode preflight does NOT warm (mutation and query
   * resolvers are distinct Lambda functions). Default 30s.
   */
  joinResponseTimeoutMs?: number;
  /**
   * Window allowed for the SPA URL to reflect the new league after the mutation
   * has reported success. The navigation is synchronous (React Router push) so
   * this should be near-instant; the small budget is just to absorb a render
   * tick. Default 10s.
   */
  urlRedirectTimeoutMs?: number;
}

/**
 * Drive a manager through the full join-league UI flow and return the joined
 * leagueId.
 *
 * Consolidates the 6-step orchestration that previously lived inline in every
 * integration spec (LS-4270, LS-4298, LS-4360, LS-4364, LS-4385, LS-4447):
 *
 *   1. `validateInviteCodePreflight(jwt, code)` — warm the query Lambda
 *   2. `page.goto('/baseball/league/join/<code>')`
 *   3. `waitForJoinPageValidation(page)` — wait for "X spot(s) available"
 *   4. Fill the team-name field and assert the Join button is enabled
 *   5. Listen for the `JoinLeagueByCode` GraphQL response, then click Join
 *   6. Surface any `errors[]` (with AWS request id) or return the new leagueId
 *      after the URL has changed to `/baseball/league/<id>`
 *
 * The post-click race is the failure mode this helper exists to fix. Earlier
 * iterations only asserted on the URL change with a 15s timeout — when the
 * mutation Lambda was cold or returned `errors[]`, the test would time out
 * with "URL stuck on /league/join/XXXXXXXX" and no clue why. This helper:
 *
 * - Captures the mutation response (30s window — long enough for a cold start)
 * - Re-throws `errors[]` with message/path/`requestId`/`trace` (LS-4444 pattern)
 * - Asserts URL change only after a successful mutation response, with a small
 *   post-response budget (the React Router navigation is synchronous)
 *
 * All future races discovered on any step of the join flow should be fixed in
 * this helper, never inline in spec files.
 */
export async function joinLeagueAsManager(
  page: Page,
  {
    jwt,
    inviteCode,
    teamName,
    joinResponseTimeoutMs = 30_000,
    urlRedirectTimeoutMs = 10_000,
  }: JoinLeagueAsManagerOptions,
): Promise<number> {
  await validateInviteCodePreflight(jwt, inviteCode);

  const joinUrl = `/baseball/league/join/${inviteCode}`;
  await page.goto(joinUrl);
  await page.waitForLoadState('load');

  await waitForJoinPageValidation(page);

  const teamNameInput = page.getByTestId('team-name');
  await expect(teamNameInput).toBeVisible({ timeout: 5_000 });
  await teamNameInput.fill(teamName);

  const joinBtn = page.getByRole('button', { name: /Join League/i });
  await expect(joinBtn).toBeEnabled({ timeout: 5_000 });

  // Capture every JoinLeagueByCode response — including any Apollo silent
  // retries — so the helper can ignore transient UNAUTHENTICATED responses
  // and return the FINAL outcome. Apollo's `errorLink` calls
  // `silentlyRefreshJwt()` and re-runs the operation on UNAUTHENTICATED, so
  // the first response is not necessarily definitive (LS-4448). The listener
  // must be attached BEFORE the click; `page.waitForResponse` only catches
  // responses that arrive after its call, which races a very fast retry.
  // Apollo posts every GraphQL operation to `/graphql?ref=<OperationName>`
  // (see apps/web/src/lib/apollo-client.ts), so the operation name is in
  // the URL.
  const operationMatcher = /\/graphql\?(?:.*&)?ref=JoinLeagueByCode(?:&|$)/;
  const observedResponses: Response[] = [];
  const responseListener = (res: Response): void => {
    if (operationMatcher.test(res.url())) {
      observedResponses.push(res);
    }
  };
  page.on('response', responseListener);

  const chosen = await (async (): Promise<{
    response: Response;
    json: JoinLeagueByCodeResponse;
  }> => {
    try {
      await joinBtn.click();

      const deadline = Date.now() + joinResponseTimeoutMs;
      let processed = 0;
      let lastUnauth: {
        response: Response;
        json: JoinLeagueByCodeResponse;
      } | null = null;

      while (Date.now() < deadline) {
        while (processed < observedResponses.length) {
          const res = observedResponses[processed];
          processed++;
          let parsed: JoinLeagueByCodeResponse;
          try {
            parsed = (await res.json()) as JoinLeagueByCodeResponse;
          } catch (err) {
            throw new Error(
              `joinLeagueByCode("${inviteCode}", "${teamName}") returned ` +
                `non-JSON response (HTTP ${res.status()})` +
                `${awsRequestContext(res.headers())}: ` +
                `${err instanceof Error ? err.message : String(err)}`,
            );
          }
          if (isUnauthenticatedResponse(parsed)) {
            // Apollo will silently refresh the JWT and retry — keep waiting.
            lastUnauth = { response: res, json: parsed };
            continue;
          }
          return { response: res, json: parsed };
        }
        await page.waitForTimeout(100);
      }

      // Budget exhausted. If we saw at least one UNAUTHENTICATED response,
      // Apollo's silent refresh never produced a successful retry — surface
      // that last auth error for diagnostics. Otherwise, no response arrived
      // at all (probably a network-level failure or a Lambda timeout).
      if (lastUnauth) {
        return lastUnauth;
      }
      throw new Error(
        `joinLeagueByCode("${inviteCode}", "${teamName}") observed no ` +
          `response matching ref=JoinLeagueByCode within ` +
          `${joinResponseTimeoutMs}ms`,
      );
    } finally {
      page.off('response', responseListener);
    }
  })();

  const { response, json } = chosen;
  const requestContext = awsRequestContext(response.headers());

  if (json.errors?.length) {
    const first = json.errors[0];
    const pathStr = first.path?.length ? ` (path=${first.path.join('.')})` : '';
    throw new Error(
      `joinLeagueByCode("${inviteCode}", "${teamName}") returned GraphQL ` +
        `error: ${first.message}${pathStr}${requestContext}`,
    );
  }

  const leagueId = json.data?.joinLeagueByCode?.leagueId;
  if (leagueId == null) {
    throw new Error(
      `joinLeagueByCode("${inviteCode}", "${teamName}") returned no ` +
        `leagueId${requestContext}`,
    );
  }

  // Mutation succeeded; React Router will navigate to /baseball/league/<id>.
  // The navigation is synchronous so this assertion is effectively a tick wait.
  await expect(page).toHaveURL(
    new RegExp(`/baseball/league/${leagueId}(?:[/?#]|$)`),
    { timeout: urlRedirectTimeoutMs },
  );

  return leagueId;
}
