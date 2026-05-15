/**
 * Contract tests for the wait-for-join-page integration helpers.
 *
 * Pure unit tests — these stub `globalThis.fetch` and never touch the live
 * backend. They guard the diagnostic contract introduced by LS-4444:
 *   - `validateInviteCodePreflight` must surface the actual GraphQL error
 *     (message + path + AWS request ID) when the backend returns `errors[]`,
 *     rather than collapsing every failure shape into `null` and reporting
 *     "Received: null" via expect.poll (see LS-4444 for the diagnostic
 *     blindfold this fixes).
 *
 * Located under `integration/tests/` so the existing Playwright integration
 * runner picks them up alongside live-backend specs; they execute in well
 * under a second because no network call is made.
 */
import { expect, test } from '@playwright/test';
import { awsRequestContext } from '../helpers/graphql';
import { validateInviteCodePreflight } from '../helpers/wait-for-join-page';

type FetchFn = typeof globalThis.fetch;

/** Build a stub fetch that always returns the given Response. */
function stubFetchWith(body: unknown, init: ResponseInit): FetchFn {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), init),
    )) as unknown as FetchFn;
}

test.describe('awsRequestContext (LS-4444)', () => {
  test('formats both request and trace IDs when present', () => {
    const headers = new Headers({
      'x-amzn-RequestId': 'req-abc-123',
      'x-amzn-trace-id': 'Root=1-deadbeef',
    });
    expect(awsRequestContext(headers)).toBe(
      ' [requestId=req-abc-123 trace=Root=1-deadbeef]',
    );
  });

  test('returns empty string when no AWS headers are present', () => {
    expect(
      awsRequestContext(new Headers({ 'content-type': 'application/json' })),
    ).toBe('');
  });

  test('header lookup is case-insensitive', () => {
    const headers = new Headers({ 'X-AMZN-REQUESTID': 'req-XYZ' });
    expect(awsRequestContext(headers)).toBe(' [requestId=req-XYZ]');
  });

  test('accepts a plain header record (Playwright APIResponse shape)', () => {
    expect(awsRequestContext({ 'x-amzn-RequestId': 'req-rec-1' })).toBe(
      ' [requestId=req-rec-1]',
    );
  });
});

test.describe('validateInviteCodePreflight error surfacing (LS-4444)', () => {
  const originalFetch = globalThis.fetch;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('throws a descriptive error when the response contains errors[], including message, path, and AWS request ID', async () => {
    globalThis.fetch = stubFetchWith(
      {
        data: null,
        errors: [
          {
            message: 'Authentication required',
            path: ['validateInviteCode'],
          },
        ],
      },
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-amzn-RequestId': 'req-abc-123',
          'x-amzn-trace-id': 'Root=1-deadbeef',
        },
      },
    );

    let thrown: unknown = null;
    try {
      await validateInviteCodePreflight('fake-jwt', 'TESTCODE');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    const msg = (thrown as Error).message;
    // Authentic error content surfaces — not "Received: null".
    expect(msg).toContain('Authentication required');
    expect(msg).toContain('path=validateInviteCode');
    expect(msg).toContain('requestId=req-abc-123');
    expect(msg).toContain('trace=Root=1-deadbeef');
    expect(msg).toContain('TESTCODE');
    // Critical regression guard: previously every failure shape collapsed
    // to `expect.poll().not.toBeNull()` reporting "Received: null".
    expect(msg).not.toMatch(/Received:\s+null/);
  });

  test('error message still names the GraphQL error when AWS trace headers are absent', async () => {
    globalThis.fetch = stubFetchWith(
      {
        data: null,
        errors: [{ message: 'Internal server error' }],
      },
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );

    let thrown: unknown = null;
    try {
      await validateInviteCodePreflight('fake-jwt', 'NOHDR');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    const msg = (thrown as Error).message;
    expect(msg).toContain('Internal server error');
    expect(msg).not.toMatch(/Received:\s+null/);
    // No header brackets when nothing to report.
    expect(msg).not.toContain('requestId=');
  });

  test('returns normally on a successful response', async () => {
    globalThis.fetch = stubFetchWith(
      { data: { validateInviteCode: { leagueId: 42 } } },
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );

    await expect(
      validateInviteCodePreflight('fake-jwt', 'OKCODE'),
    ).resolves.toBeUndefined();
  });
});
