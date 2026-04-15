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
import {
  ApolloLink,
  CombinedGraphQLErrors,
  Observable,
  ServerError,
} from '@apollo/client';
import {
  decodeJwtPayload,
  errorLink,
  syncUserProfileFromJwt,
} from './apollo-client';

jest.mock('@apollo/client', () => {
  const actual =
    jest.requireActual<typeof import('@apollo/client')>('@apollo/client');
  return {
    ...actual,
    createHttpLink: jest.fn(() => ({
      request: jest.fn(),
    })),
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

  it('defaults accessLevel to user when claim is missing', () => {
    const token = fakeJwt({ id: 1, email: 'basic@test.com' });

    syncUserProfileFromJwt(token);

    const stored = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['accessLevel']).toBe('user');
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
    const result = (errorLink as ApolloLink).request(
      op as never,
      forward as never,
    );
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

// ─── errorLink decision logic ─────────────────────────────────────────────────

describe('errorLink', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
