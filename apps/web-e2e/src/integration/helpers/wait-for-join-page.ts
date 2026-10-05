import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { awsRequestContext } from './graphql';
import { gqlFetch, gqlFetchEnvelope } from './gql-fetch';

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
 * Wait for the universal `/join/:code` screen (LS-10422) to preview the
 * league the invite code points at.
 *
 * After `switchUser` navigates to the join page, the `resolveInviteCode`
 * query fires immediately (network-only, once per mount). The cookie /
 * localStorage swap can race it, and a cold Lambda can transiently answer
 * null for a valid code, so the screen may settle on one of:
 *
 *   - `join-preview-league` — success, the league preview card
 *   - `join-sign-in` — the query came back UNAUTHENTICATED (auth race)
 *   - `join-not-found` — the query answered null (cold start)
 *   - "Couldn't check this code" — any other query error
 *
 * The query does not re-run on its own, so every failure outcome (and a 15 s
 * timeout) reloads the page to retry. `join-already-in` means the manager is
 * already a member — a test-setup bug no reload fixes — and fails fast. The
 * first attempt plus up to `maxRetries` reload retries are performed (i.e.
 * `maxRetries + 1` total attempts).
 */
export async function waitForJoinPreview(
  page: Page,
  maxRetries = 2,
): Promise<void> {
  const previewLocator = page.getByTestId('join-preview-league');
  const outcomes = [
    ['preview', previewLocator],
    ['sign-in', page.getByTestId('join-sign-in')],
    ['not-found', page.getByTestId('join-not-found')],
    ['already-in', page.getByTestId('join-already-in')],
    ['error', page.getByText(/couldn.t check this code/i).first()],
  ] as const;

  // Re-throws non-TimeoutError failures (page closed, navigation errors) so
  // genuine failures are not silently swallowed and retried as a timeout.
  const onlyTimeout = (err: unknown): 'timeout' => {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return 'timeout';
    }
    throw err;
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // The last racer is a defensive wall-clock timeout that guarantees an
    // outcome at 15 s even if a locator wait stalls past its own timeout.
    const outcome = await Promise.race([
      ...outcomes.map(([name, locator]) =>
        locator
          .waitFor({ state: 'visible', timeout: 15_000 })
          .then(() => name)
          .catch(onlyTimeout),
      ),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 15_000),
      ),
    ]);

    if (outcome === 'preview') {
      await expect(previewLocator).toBeVisible();
      return;
    }

    if (outcome === 'already-in') {
      throw new Error(
        `Join page reports the user is already in this league. URL: ${page.url()}`,
      );
    }

    if (attempt < maxRetries) {
      await page.reload();
      await page.waitForLoadState('load');
      continue;
    }

    throw new Error(
      `Join page preview failed after ${attempt + 1} attempt(s). ` +
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

/**
 * Build the diagnostic message thrown when `joinLeagueByCode` returns success
 * (no `errors[]`) but `data.joinLeagueByCode.leagueId` is null/missing.
 *
 * Surfaces enough payload context to triage the next occurrence without a
 * Playwright trace:
 *
 * - `branch`: which sub-field collapsed (data / joinLeagueByCode / leagueId) —
 *   distinguishes a resolver-level null from an API Gateway truncation from a
 *   schema non-null violation that GraphQL itself rewrote to a null parent.
 * - `httpStatus`: catches a 2xx body without leagueId (impossible by schema)
 *   vs. a 502/504 that somehow still produced a JSON body.
 * - `errors`: count + concatenated messages so a buried partial-error shape
 *   (e.g. a non-null violation that wasn't recognised above the `length` check
 *   because the array was shaped unexpectedly) is still visible inline.
 * - `body`: truncated raw payload — last-resort context for serialization or
 *   shape bugs that don't fit any of the categories above.
 *
 * Pure and exported for contract testing (the live joinLeagueAsManager path
 * cannot reach this branch when the resolver behaves correctly).
 */
export function formatNoLeagueIdError(args: {
  inviteCode: string;
  teamName: string;
  json: JoinLeagueByCodeResponse;
  requestContext: string;
  httpStatus: number;
}): string {
  const { inviteCode, teamName, json, requestContext, httpStatus } = args;
  const nullBranch =
    json.data == null
      ? 'data=null'
      : json.data.joinLeagueByCode === undefined
        ? 'joinLeagueByCode=missing'
        : json.data.joinLeagueByCode === null
          ? 'joinLeagueByCode=null'
          : 'leagueId=null';
  const bodyPreview = JSON.stringify(json).slice(0, 2000);
  const errorsSummary = json.errors?.length
    ? ` errors=${json.errors.length}:[${json.errors
        .map((e) => e.message)
        .join('|')}]`
    : ' errors=none';
  return (
    `joinLeagueByCode("${inviteCode}", "${teamName}") returned no ` +
    `leagueId${requestContext} ` +
    `[branch=${nullBranch} httpStatus=${httpStatus}${errorsSummary}] ` +
    `body=${bodyPreview}`
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
 *   2. `page.goto('/join/<code>')` — the universal join route (LS-10422)
 *   3. `waitForJoinPreview(page)` — wait for the league preview card
 *   4. Fill the "Team name" field and assert the Join button is enabled
 *   5. Listen for the `JoinLeagueByCode` GraphQL response, then click Join
 *   6. Surface any `errors[]` (with AWS request id) or return the new leagueId
 *      after the URL has changed to `/baseball/league/<id>`
 *
 * The post-click race is the failure mode this helper exists to fix. Earlier
 * iterations only asserted on the URL change with a 15s timeout — when the
 * mutation Lambda was cold or returned `errors[]`, the test would time out
 * with "URL stuck on /join/XXXXXXXX" and no clue why. This helper:
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

  const joinUrl = `/join/${inviteCode}`;
  await page.goto(joinUrl);
  await page.waitForLoadState('load');

  await waitForJoinPreview(page);

  const teamNameInput = page.getByLabel('Team name');
  await expect(teamNameInput).toBeVisible({ timeout: 5_000 });
  await teamNameInput.fill(teamName);

  const joinBtn = page.getByTestId('join-submit');
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
  // Event-driven wakeup: each matching response resolves the pending wait so
  // the consumer loop iterates immediately instead of polling on a timer.
  let notifyNextResponse: (() => void) | null = null;
  const responseListener = (res: Response): void => {
    if (operationMatcher.test(res.url())) {
      observedResponses.push(res);
      const r = notifyNextResponse;
      notifyNextResponse = null;
      r?.();
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
        // Wait for the next matching response (or a 1s safety wakeup so we
        // never sleep past the overall deadline). The listener resolves
        // `notifyNextResponse` as soon as a response arrives.
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const lenBefore = observedResponses.length;
        await new Promise<void>((resolve) => {
          notifyNextResponse = resolve;
          // Close the gap between the inner drain loop and this assignment —
          // a response that landed in that window already grew the queue.
          if (observedResponses.length > lenBefore) {
            resolve();
            return;
          }
          setTimeout(resolve, Math.min(remaining, 1_000));
        });
        notifyNextResponse = null;
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
    // LS-4541: hand off to the pure formatter so the diagnostic contract is
    // exercised by contract tests. Earlier iterations collapsed this branch
    // to a single "returned no leagueId" line, leaving no signal about which
    // sub-field was null, whether errors[] was empty, or what the HTTP
    // status was — which made the failure indistinguishable from a resolver
    // bug, API Gateway truncation, or a stale-response race.
    throw new Error(
      formatNoLeagueIdError({
        inviteCode,
        teamName,
        json,
        requestContext,
        httpStatus: response.status(),
      }),
    );
  }

  // Mutation succeeded; React Router will navigate to /baseball/league/<id>.
  // The navigation is synchronous so this assertion is effectively a tick wait.
  await expect(page).toHaveURL(
    new RegExp(`/baseball/league/${leagueId}(?:[/?#]|$)`),
    { timeout: urlRedirectTimeoutMs },
  );

  // Write→read visibility tax (antipattern #3, LS-4350): joinLeagueByCode
  // returning success does not guarantee the read path (used by every other
  // page/user that queries this league — e.g. the commissioner's overview
  // page checking team rosters) has caught up yet. Poll userTeamId with this
  // manager's own JWT until the membership is visible before handing control
  // back to the caller, so every downstream phase can trust the invariant
  // instead of re-discovering the race independently. Callback returns null
  // on error so expect.poll retries on assertion failure rather than
  // throwing (antipattern #1).
  await expect
    .poll(
      async () => {
        const data = await gqlFetch<{ userTeamId: number | null }>(
          jwt,
          `query GetUserTeamIdAfterJoin($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
          { leagueId },
        ).catch(() => null);
        return data?.userTeamId ?? null;
      },
      {
        timeout: 30_000,
        message:
          `joinLeagueByCode("${inviteCode}", "${teamName}") succeeded but ` +
          `userTeamId was not visible on the read path within 30s for ` +
          `league ${leagueId}`,
      },
    )
    .not.toBeNull();

  return leagueId;
}
