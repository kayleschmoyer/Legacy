/**
 * Tests for the syncUserProfileFromJwt behavior and errorLink decision logic
 * in apollo-client.ts.
 *
 * The decodeJwtPayload, syncUserProfileFromJwt, and errorLink exports are
 * tested directly here.
 */

// Mock modules that apollo-client.ts imports as side effects
//
// Apollo Client's createHttpLink requires a global `fetch` at module init time.
// jest.mock is hoisted above imports by Babel, so this factory runs before
// apollo-client.ts is evaluated — providing a stub `createHttpLink` that
// doesn't require global fetch.
import { CombinedGraphQLErrors, Observable, ServerError } from '@apollo/client';
import { captureError } from '@legacy-sports/rollbar/web';
import {
  decodeJwtPayload,
  errorLink,
  syncUserProfileFromJwt,
} from './apollo-client';
import { __resetJwtRefreshStateForTests } from './jwt-refresh';

// Capture the uri factory that apollo-client.ts passes to createHttpLink at
// module init time. Stored here so it survives clearMocks: true (jest.preset.js
// wipes jest.fn().mock.calls before every test, but plain variables persist).
// Must be `var` (not `let`): jest.mock factories are hoisted above `let`
// declarations by babel-jest, so a `let` would be in the TDZ when the factory runs.
// eslint-disable-next-line no-var
var capturedHttpLinkUri:
  | ((op: { operationName: string }) => string)
  | undefined;

jest.mock('@apollo/client', () => {
  const actual =
    jest.requireActual<typeof import('@apollo/client')>('@apollo/client');
  return {
    ...actual,
    createHttpLink: jest.fn(
      (options: { uri: (op: { operationName: string }) => string }) => {
        capturedHttpLinkUri = options.uri;
        return { request: jest.fn() };
      },
    ),
  };
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('@legacy-sports/rollbar/web', () => ({
  captureError: jest.fn(),
}));
jest.mock('./csrf', () => ({
  CSRF_HEADER: 'x-csrf-token',
  getCsrfToken: jest.fn(() => null),
  storeCsrfToken: jest.fn(),
}));
jest.mock('../config/environment', () => ({
  env: {
    graphqlUrl: 'http://localhost:5000/graphql',
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-google-client-id',
    isDev: true,
  },
  getEnvironmentConfig: () => ({
    graphqlUrl: 'http://localhost:5000/graphql',
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-google-client-id',
    isDev: true,
  }),
}));

/** Build a minimal fake JWT with the given payload claims. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('fakesig');
  return `${header}.${body}.${sig}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const token = fakeJwt({
      id: 42,
      email: 'test@example.com',
      accessLevel: 'admin',
    });
    const payload = decodeJwtPayload(token);
    expect(payload).toEqual(
      expect.objectContaining({
        id: 42,
        email: 'test@example.com',
        accessLevel: 'admin',
      }),
    );
  });

  it('returns null for an invalid JWT', () => {
    expect(decodeJwtPayload('not.a.valid-jwt')).toBeNull();
    expect(decodeJwtPayload('onlyonepart')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});

describe('syncUserProfileFromJwt', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates localStorage with decoded user profile', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt({
      id: 7,
      email: 'admin@test.com',
      username: 'AdminUser',
      accessLevel: 'admin',
      exp,
    });

    syncUserProfileFromJwt(token);

    const stored = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['id']).toBe(7);
    expect(stored['email']).toBe('admin@test.com');
    expect(stored['username']).toBe('AdminUser');
    expect(stored['accessLevel']).toBe('admin');

    expect(localStorage.getItem('ls_token_expiry')).toBe(String(exp));
  });

  it('dispatches auth:token-refreshed window event with user and exp', () => {
    const handler = jest.fn();
    window.addEventListener('auth:token-refreshed', handler);

    const exp = Math.floor(Date.now() / 1000) + 7200;
    const token = fakeJwt({
      id: 99,
      email: 'promoted@test.com',
      username: 'PromotedUser',
      accessLevel: 'admin',
      exp,
    });

    syncUserProfileFromJwt(token);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.user).toEqual(
      expect.objectContaining({
        id: 99,
        accessLevel: 'admin',
        username: 'PromotedUser',
      }),
    );
    expect(event.detail.exp).toBe(exp);

    window.removeEventListener('auth:token-refreshed', handler);
  });

  it('defaults accessLevel to none when claim is missing', () => {
    const token = fakeJwt({ id: 1, email: 'basic@test.com' });

    syncUserProfileFromJwt(token);

    const stored = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['accessLevel']).toBe('none');
  });

  it('does nothing for an invalid JWT', () => {
    const handler = jest.fn();
    window.addEventListener('auth:token-refreshed', handler);

    syncUserProfileFromJwt('invalid-token');

    expect(handler).not.toHaveBeenCalled();
    expect(localStorage.getItem('ls_user_profile')).toBeNull();

    window.removeEventListener('auth:token-refreshed', handler);
  });
});

// ─── Helpers for errorLink tests ──────────────────────────────────────────────

/**
 * Build a minimal fake Apollo operation with `getContext()` returning the
 * provided values. This matches what `createOperation` produces internally,
 * without requiring a full ApolloClient instance.
 */
function makeOperation(contextValues: Record<string, unknown> = {}) {
  return {
    query: { kind: 'Document', definitions: [] } as never,
    operationName: 'TestOp',
    variables: {} as Record<string, unknown>,
    extensions: {} as Record<string, unknown>,
    getContext: () => contextValues,
    setContext: jest.fn(),
  };
}

/**
 * Invoke the errorLink handler directly with a terminal link that errors with
 * `terminalError`. Returns a Promise that resolves after the error propagates
 * through the link chain.
 */
function runWithError(
  terminalError: unknown,
  contextValues: Record<string, unknown> = {},
): Promise<void> {
  const op = makeOperation(contextValues);

  // `forward` is the next link in the chain — it immediately errors.
  const forward = () =>
    new Observable<never>((observer) => {
      observer.error(terminalError);
    });

  return new Promise<void>((resolve) => {
    // `errorLink.request` is the handler registered in the ErrorLink constructor.
    // We call it directly with our mock operation and forward function.
    const result = errorLink.request(op as never, forward as never);
    if (result) {
      result.subscribe({
        next: () => {
          /* ignore */
        },
        error: () => resolve(),
        complete: () => resolve(),
      });
    } else {
      // Handler returned undefined (non-auth, non-suppressGlobalError path) — already done.
      resolve();
    }
  });
}

// ─── httpLink lazy URL resolution ────────────────────────────────────────────

describe('httpLink lazy URL resolution', () => {
  it('reads env.graphqlUrl at each request, not at module load time', () => {
    // capturedHttpLinkUri was set when apollo-client.ts first called
    // createHttpLink at module init (before clearMocks had a chance to wipe it).
    if (!capturedHttpLinkUri) throw new Error('httpLink uri was not captured');

    const envModule = jest.requireMock<{ env: { graphqlUrl: string } }>(
      '../config/environment',
    );
    const saved = envModule.env.graphqlUrl;
    envModule.env.graphqlUrl = 'https://runtime.example.com/graphql';

    try {
      const url = capturedHttpLinkUri({ operationName: 'MyQuery' });
      expect(url).toBe('https://runtime.example.com/graphql?ref=MyQuery');
    } finally {
      envModule.env.graphqlUrl = saved;
    }
  });
});

// ─── errorLink decision logic ─────────────────────────────────────────────────

describe('errorLink', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetJwtRefreshStateForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does NOT call silentlyRefreshJwt for a non-auth GraphQL error with suppressGlobalError: true', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    // A regular GraphQL error (no UNAUTHENTICATED extension)
    const nonAuthError = new CombinedGraphQLErrors(
      { errors: [{ message: 'Something went wrong' }] },
      [{ message: 'Something went wrong' }],
    );

    await runWithError(nonAuthError, { suppressGlobalError: true });

    // silentlyRefreshJwt calls fetch('/refresh-jwt') — it must NOT be called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT call silentlyRefreshJwt for a non-auth GraphQL error without suppressGlobalError', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const nonAuthError = new CombinedGraphQLErrors(
      { errors: [{ message: 'Something went wrong' }] },
      [{ message: 'Something went wrong' }],
    );

    // Suppress window dispatch so the test doesn't fail on missing DOM handlers
    jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    await runWithError(nonAuthError, {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls silentlyRefreshJwt for an UNAUTHENTICATED GraphQL error', async () => {
    // Mock fetch to simulate a failed refresh so the link doesn't retry
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock;

    const unauthError = new CombinedGraphQLErrors(
      {
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      },
      [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
    );

    await runWithError(unauthError, {});

    // silentlyRefreshJwt must have called fetch for the refresh endpoint
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/refresh-jwt'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ─── ENTITLEMENTS_STALE bounded retry (LS-9067) ─────────────────────────────

  function makeStaleError(): CombinedGraphQLErrors {
    return new CombinedGraphQLErrors(
      {
        errors: [
          { message: 'stale', extensions: { code: 'ENTITLEMENTS_STALE' } },
        ],
      },
      [{ message: 'stale', extensions: { code: 'ENTITLEMENTS_STALE' } }],
    );
  }

  function collectSessionExpiredCount(
    dispatchSpy: jest.SpyInstance<boolean, [Event]>,
  ): number {
    return dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'auth:session-expired',
      ).length;
  }

  it('stale-once-then-succeeds: retries immediately (0ms, attempt 0) and forwards the clean replay', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ jwt: fakeJwt({ id: 1, email: 'a@b.com' }) }),
    });
    global.fetch = fetchMock;
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    const op = makeOperation({});
    const staleError = makeStaleError();
    let forwardCalls = 0;
    const forward = () => {
      forwardCalls += 1;
      if (forwardCalls === 1) {
        return new Observable<never>((observer) => observer.error(staleError));
      }
      return new Observable<ApolloLink.Result>((observer) => {
        observer.next({ data: { ok: true } });
        observer.complete();
      });
    };

    const value = await new Promise<unknown>((resolve) => {
      const result = errorLink.request(op as never, forward as never);
      result?.subscribe({
        next: (v) => resolve(v),
        error: (e) => resolve(e),
        complete: () => {
          /* ignore */
        },
      });
    });

    expect(op.setContext).toHaveBeenCalledWith({
      entitlementsStaleAttempt: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(value).toEqual({ data: { ok: true } });
    expect(collectSessionExpiredCount(dispatchSpy)).toBe(0);

    dispatchSpy.mockRestore();
  });

  it.each([
    [0, 0],
    [1, 800],
    [2, 2000],
  ])(
    'uses the [0, 800, 2000]ms backoff schedule: attempt index %i waits %dms before refreshing',
    async (attempt, expectedDelay) => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false });
      global.fetch = fetchMock;
      jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((cb: () => void) => {
          cb();
          return 0;
        });

      const op = makeOperation({ entitlementsStaleAttempt: attempt });
      const staleError = makeStaleError();
      const forward = () =>
        new Observable<never>((observer) => observer.error(staleError));

      await new Promise<void>((resolve) => {
        const result = errorLink.request(op as never, forward as never);
        result?.subscribe({
          next: () => {
            /* ignore */
          },
          error: () => resolve(),
          complete: () => resolve(),
        });
      });

      if (expectedDelay > 0) {
        expect(setTimeoutSpy).toHaveBeenCalledWith(
          expect.any(Function),
          expectedDelay,
        );
      } else {
        expect(setTimeoutSpy).not.toHaveBeenCalled();
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);

      setTimeoutSpy.mockRestore();
    },
  );

  it('stale-through-full-budget-then-terminal-fallback: fails safe once the 3-attempt budget is exhausted', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    // Attempt count already at the max (3 attempts consumed) → the 4th entry
    // into this branch must fail safe WITHOUT attempting another refresh.
    const op = makeOperation({ entitlementsStaleAttempt: 3 });
    const staleError = makeStaleError();
    const forward = () =>
      new Observable<never>((observer) => observer.error(staleError));

    await new Promise<void>((resolve) => {
      const result = errorLink.request(op as never, forward as never);
      result?.subscribe({
        next: () => {
          /* ignore */
        },
        error: () => resolve(),
        complete: () => resolve(),
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(collectSessionExpiredCount(dispatchSpy)).toBe(1);

    dispatchSpy.mockRestore();
  });

  it('hard-refresh-failure-short-circuits: a null refresh result fails safe immediately without consuming remaining budget', async () => {
    // silentlyRefreshJwt resolves null (the /refresh-jwt call itself failed —
    // e.g. a network/5xx error, distinct from a still-stale replay).
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    global.fetch = fetchMock;
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    // Early attempt (0 of 3) — even though budget remains, a hard refresh
    // failure must exit immediately rather than schedule further retries.
    const op = makeOperation({});
    const staleError = makeStaleError();
    const forward = () =>
      new Observable<never>((observer) => observer.error(staleError));

    await new Promise<void>((resolve) => {
      const result = errorLink.request(op as never, forward as never);
      result?.subscribe({
        next: () => {
          /* ignore */
        },
        error: () => resolve(),
        complete: () => resolve(),
      });
    });

    // Only the one (failed) refresh attempt was made — no retry loop against
    // a broken refresh endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(collectSessionExpiredCount(dispatchSpy)).toBe(1);

    dispatchSpy.mockRestore();
  });

  it('calls silentlyRefreshJwt for a 401 ServerError', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock;

    const serverError401 = new ServerError('Unauthorized', {
      response: { status: 401 } as Response,
      bodyText: 'Unauthorized',
    });

    await runWithError(serverError401, {});

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/refresh-jwt'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('dispatches auth:session-expired when refresh endpoint returns 401', async () => {
    // Simulate /refresh-jwt responding with 401 (server definitively rejects session)
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = fetchMock;

    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    const unauthError = new CombinedGraphQLErrors(
      {
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      },
      [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
    );

    await runWithError(unauthError, {});

    const sessionExpiredEvents = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'auth:session-expired',
      );
    expect(sessionExpiredEvents).toHaveLength(1);

    dispatchSpy.mockRestore();
  });

  it('dispatches auth:session-expired when refresh endpoint returns 403', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    global.fetch = fetchMock;

    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    const unauthError = new CombinedGraphQLErrors(
      {
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      },
      [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
    );

    await runWithError(unauthError, {});

    const sessionExpiredEvents = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'auth:session-expired',
      );
    expect(sessionExpiredEvents).toHaveLength(1);

    dispatchSpy.mockRestore();
  });

  it('does NOT dispatch auth:session-expired when refresh endpoint returns 500', async () => {
    // Server errors (5xx) are transient — do not force logout
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock;

    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    const unauthError = new CombinedGraphQLErrors(
      {
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      },
      [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
    );

    await runWithError(unauthError, {});

    const sessionExpiredEvents = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'auth:session-expired',
      );
    expect(sessionExpiredEvents).toHaveLength(0);

    dispatchSpy.mockRestore();
  });

  it.each([502, 503, 504])(
    'does NOT call captureError for upstream-unreachable status %i',
    async (statusCode) => {
      jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

      const serverError = new ServerError('Bad Gateway', {
        response: { status: statusCode } as Response,
        bodyText: 'Bad Gateway',
      });

      await runWithError(serverError, {});

      expect(captureError).not.toHaveBeenCalled();
    },
  );

  it('DOES call captureError for non-upstream server errors (e.g. 500)', async () => {
    jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    const serverError500 = new ServerError('Internal Server Error', {
      response: { status: 500 } as Response,
      bodyText: 'Internal Server Error',
    });

    await runWithError(serverError500, {});

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'apollo:TestOp' }),
    );
  });

  it.each([
    'BAD_USER_INPUT',
    'FORBIDDEN',
    'PREMIUM_REQUIRED',
    'GAME_UNAVAILABLE',
  ])(
    'does NOT call captureError for expected GraphQL error code %s',
    async (code) => {
      jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

      const expectedError = new CombinedGraphQLErrors(
        { errors: [{ message: 'Expected error', extensions: { code } }] },
        [{ message: 'Expected error', extensions: { code } }],
      );

      await runWithError(expectedError, {});

      expect(captureError).not.toHaveBeenCalled();
    },
  );

  it('DOES call captureError for unexpected GraphQL error codes', async () => {
    jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    const unexpectedError = new CombinedGraphQLErrors(
      {
        errors: [
          {
            message: 'Internal error',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      },
      [
        {
          message: 'Internal error',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ],
    );

    await runWithError(unexpectedError, {});

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'apollo:TestOp' }),
    );
  });

  it('dispatches a generic access-denied message for FORBIDDEN instead of the raw server message (ARV-004)', async () => {
    const dispatchSpy = jest
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => true);

    const forbiddenError = new CombinedGraphQLErrors(
      {
        errors: [
          {
            message: 'Admin access required',
            extensions: { code: 'FORBIDDEN' },
          },
        ],
      },
      [
        {
          message: 'Admin access required',
          extensions: { code: 'FORBIDDEN' },
        },
      ],
    );

    await runWithError(forbiddenError, {});

    const apolloErrors = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'apollo:error',
      );
    expect(apolloErrors).toHaveLength(1);
    expect(apolloErrors[0].detail.message).toBe(
      "You don't have access to this resource.",
    );
    expect(apolloErrors[0].detail.message).not.toContain(
      'Admin access required',
    );
    expect(captureError).not.toHaveBeenCalled();

    dispatchSpy.mockRestore();
  });

  it('dispatches a friendly message for INTERNAL_SERVER_ERROR instead of the raw "Internal server error" (LS-4850)', async () => {
    const dispatchSpy = jest
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => true);

    const internalError = new CombinedGraphQLErrors(
      {
        errors: [
          {
            message: 'Internal server error',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      },
      [
        {
          message: 'Internal server error',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ],
    );

    await runWithError(internalError, {});

    const apolloErrors = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'apollo:error',
      );
    expect(apolloErrors).toHaveLength(1);
    expect(apolloErrors[0].detail.message).toBe(
      'Something went wrong on our end — please try again in a moment.',
    );
    // Still captured to Rollbar — visibility into the failing operation
    // remains the only way to fix the underlying server-side bug.
    expect(captureError).toHaveBeenCalledTimes(1);

    dispatchSpy.mockRestore();
  });

  it('prefers PREMIUM_REQUIRED message over the INTERNAL_SERVER_ERROR fallback when both are present', async () => {
    const dispatchSpy = jest
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => true);

    const mixedErrors = new CombinedGraphQLErrors(
      {
        errors: [
          {
            message: 'Internal server error',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
          {
            message: 'Upgrade to premium to unlock this feature.',
            extensions: { code: 'PREMIUM_REQUIRED' },
          },
        ],
      },
      [
        {
          message: 'Internal server error',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
        {
          message: 'Upgrade to premium to unlock this feature.',
          extensions: { code: 'PREMIUM_REQUIRED' },
        },
      ],
    );

    await runWithError(mixedErrors, {});

    const apolloErrors = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'apollo:error',
      );
    expect(apolloErrors).toHaveLength(1);
    expect(apolloErrors[0].detail.message).toBe(
      'Upgrade to premium to unlock this feature.',
    );

    dispatchSpy.mockRestore();
  });
});
