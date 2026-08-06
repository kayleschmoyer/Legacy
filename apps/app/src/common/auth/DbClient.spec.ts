/**
 * Tests for the errorLink decision logic in DbClient.ts — specifically the
 * ENTITLEMENTS_STALE bounded retry (LS-9067). Mirrors the test style used in
 * apps/web/src/lib/apollo-client.spec.ts.
 */

import { CombinedGraphQLErrors, Observable } from '@apollo/client';
import type { ApolloLink } from '@apollo/client/link';

import { errorLink } from './DbClient';

const mockSilentlyRefreshJwt = jest.fn<Promise<string | null>, []>();
jest.mock('./jwtRefresh', () => ({
  INTERNAL_JWT_KEY: 'INTERNAL_JWT',
  silentlyRefreshJwt: (): Promise<string | null> => mockSilentlyRefreshJwt(),
}));

const mockEmitSessionExpired = jest.fn();
jest.mock('./sessionEvents', () => ({
  emitSessionExpired: (): void => {
    mockEmitSessionExpired();
  },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Avoid pulling in the real shared-components entry, which resolves to
// native platform components (GoogleSignin, etc.) that Jest cannot transform.
jest.mock('@legacy-sports/shared-components', () => ({
  SecureStorageProvider: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('errorLink ENTITLEMENTS_STALE bounded retry', () => {
  it('stale-once-then-succeeds: retries immediately (0ms, attempt 0) and forwards the clean replay', async () => {
    mockSilentlyRefreshJwt.mockResolvedValue('fresh-jwt');

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
    expect(mockSilentlyRefreshJwt).toHaveBeenCalledTimes(1);
    expect(value).toEqual({ data: { ok: true } });
    expect(mockEmitSessionExpired).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0],
    [1, 800],
    [2, 2000],
  ])(
    'uses the [0, 800, 2000]ms backoff schedule: attempt index %i waits %dms before refreshing',
    async (attempt, expectedDelay) => {
      mockSilentlyRefreshJwt.mockResolvedValue(null);
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((cb: () => void) => {
          cb();
          return 0 as unknown as NodeJS.Timeout;
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
      expect(mockSilentlyRefreshJwt).toHaveBeenCalledTimes(1);

      setTimeoutSpy.mockRestore();
    },
  );

  it('stale-through-full-budget-then-terminal-fallback: fails safe once the 3-attempt budget is exhausted', async () => {
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

    expect(mockSilentlyRefreshJwt).not.toHaveBeenCalled();
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('hard-refresh-failure-short-circuits: a null refresh result fails safe immediately without consuming remaining budget', async () => {
    // silentlyRefreshJwt resolves null (the /refresh-jwt call itself failed —
    // e.g. a network/5xx error, distinct from a still-stale replay).
    mockSilentlyRefreshJwt.mockResolvedValue(null);

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
    expect(mockSilentlyRefreshJwt).toHaveBeenCalledTimes(1);
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);
  });
});
