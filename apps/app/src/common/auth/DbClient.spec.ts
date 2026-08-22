/**
 * Tests for the errorLink decision logic in DbClient.ts — specifically the
 * ENTITLEMENTS_STALE bounded retry (LS-9067). Mirrors the test style used in
 * apps/web/src/lib/apollo-client.spec.ts.
 */

import {
  CombinedGraphQLErrors,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import type { ApolloLink } from '@apollo/client/link';
import {
  GetCurrentWeekForLeague,
  GetMatchupById,
} from '@legacy-sports/graphql';

import { createStaleMatchupGuardLink, errorLink } from './DbClient';

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
      // A successful refresh (rather than a hard failure) isolates exactly
      // one refresh call per entry into the branch — a hard failure now
      // recurses into further budgeted attempts (see the hard-refresh-failure
      // tests below), which would make this delay-per-entry assertion
      // ambiguous. `forward` must still error on its first (outer) call —
      // ErrorLink's own request() wrapper subscribes to the outer `forward`
      // before this handler ever runs, and a `next` there reads
      // `operation.client.queryManager`, which the test's minimal fake
      // operation doesn't provide. Only the second (inner, retried) call is
      // this test's own concern.
      mockSilentlyRefreshJwt.mockResolvedValue('fresh-jwt');
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((cb: () => void) => {
          cb();
          return 0 as unknown as NodeJS.Timeout;
        });

      const op = makeOperation({ entitlementsStaleAttempt: attempt });
      const staleError = makeStaleError();
      let forwardCalls = 0;
      const forward = () => {
        forwardCalls += 1;
        if (forwardCalls === 1) {
          return new Observable<never>((observer) =>
            observer.error(staleError),
          );
        }
        return new Observable<ApolloLink.Result>((observer) => {
          observer.next({ data: { ok: true } });
          observer.complete();
        });
      };

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

  it('hard-refresh-failure-retries-within-budget: a null refresh result retries instead of failing immediately, and succeeds on a later attempt', async () => {
    // silentlyRefreshJwt resolves null on the first call (e.g. a transient
    // network blip hitting /refresh-jwt), then succeeds on the second. A
    // momentary network hiccup isn't evidence the user's entitlements are
    // stuck, so this must consume a retry slot within the same bounded
    // budget rather than failing safe immediately.
    mockSilentlyRefreshJwt
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('fresh-jwt');
    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      });

    const op = makeOperation({});
    const staleError = makeStaleError();
    // The outer (first) forward call must error to enter this handler at
    // all — see the backoff-schedule test above for why. Only the second
    // (inner, retried-after-successful-refresh) call represents this test's
    // actual replay.
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

    expect(mockSilentlyRefreshJwt).toHaveBeenCalledTimes(2);
    expect(value).toEqual({ data: { ok: true } });
    expect(mockEmitSessionExpired).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });

  it('hard-refresh-failure-exhausts-budget-then-terminal-fallback: repeated refresh failures still fail safe once the 3-attempt budget is spent', async () => {
    mockSilentlyRefreshJwt.mockResolvedValue(null);
    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      });

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

    // All 3 budgeted attempts were spent retrying the refresh call itself
    // before failing safe — `forward` is never consulted since the refresh
    // never produced a token to replay with.
    expect(mockSilentlyRefreshJwt).toHaveBeenCalledTimes(3);
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);

    setTimeoutSpy.mockRestore();
  });
});

// LS-6359: after a mobile network switch (e.g. WiFi -> cellular), a forced
// refetch can land on a CDN/Apollo-router-cached response that's older than
// what's already in the client cache. Matchup.updatedAt is a
// server-authoritative freshness marker; createStaleMatchupGuardLink must
// drop a GetMatchupById response whose updatedAt is older than what's
// already cached, instead of letting the write roll a displayed score
// backwards.
describe('createStaleMatchupGuardLink (LS-6359)', () => {
  function makeMatchupData(overrides: {
    team1Score: number;
    updatedAt: string;
  }) {
    return {
      __typename: 'Matchup',
      id: '1',
      weekNumber: 4,
      leagueId: 10,
      team1Id: 100,
      team2Id: 200,
      team1Score: overrides.team1Score,
      team2Score: 30.1,
      status: 'in_progress',
      statsLoadingStatus: 'completed',
      gamesPerMatchup: 1,
      pitcherStartsPerMatchup: null,
      selectedGamesCount: 1,
      startTime: null,
      endTime: null,
      updatedAt: overrides.updatedAt,
      team1: { __typename: 'Team', id: '100', name: 'Team One' },
      team2: { __typename: 'Team', id: '200', name: 'Team Two' },
      // The Matchup fragment now selects winProbability (LS-6323) — omitting
      // it here makes cache.readQuery throw a missing-field error inside
      // dropStaleMatchupResult, silently passing the stale response through.
      winProbability: null,
    };
  }

  function seedCache(
    cache: InMemoryCache,
    overrides: { team1Score: number; updatedAt: string },
  ) {
    cache.writeQuery({
      query: GetMatchupById,
      variables: { id: 1 },
      data: { getMatchupById: makeMatchupData(overrides) },
    });
  }

  function runLink(
    cache: InMemoryCache,
    overrides: { team1Score: number; updatedAt: string },
  ) {
    const link = createStaleMatchupGuardLink(cache);
    const operation = {
      operationName: 'GetMatchupById',
      query: GetMatchupById,
      variables: { id: 1 },
      extensions: {},
      getContext: () => ({}),
      setContext: jest.fn(),
    };
    const forward = () =>
      new Observable<ApolloLink.Result>((observer) => {
        observer.next({ data: { getMatchupById: makeMatchupData(overrides) } });
        observer.complete();
      });

    return new Promise<ApolloLink.Result>((resolve) => {
      const result = link.request(operation as never, forward as never);
      result?.subscribe({ next: (v) => resolve(v) });
    });
  }

  it('drops an older refetch response and keeps the cached score', async () => {
    const cache = new InMemoryCache();
    seedCache(cache, {
      team1Score: 45.2,
      updatedAt: '2026-08-22T20:00:00.000Z',
    });

    // Simulates a CDN-cached refetch response older than what's cached.
    const result = await runLink(cache, {
      team1Score: 38.5,
      updatedAt: '2026-08-22T19:00:00.000Z',
    });

    const data = result.data as {
      getMatchupById: { team1Score: number; updatedAt: string };
    };
    expect(data.getMatchupById.team1Score).toBe(45.2);
    expect(data.getMatchupById.updatedAt).toBe('2026-08-22T20:00:00.000Z');
  });

  it('passes through a newer refetch response', async () => {
    const cache = new InMemoryCache();
    seedCache(cache, {
      team1Score: 45.2,
      updatedAt: '2026-08-22T20:00:00.000Z',
    });

    const result = await runLink(cache, {
      team1Score: 52.0,
      updatedAt: '2026-08-22T21:00:00.000Z',
    });

    const data = result.data as {
      getMatchupById: { team1Score: number; updatedAt: string };
    };
    expect(data.getMatchupById.team1Score).toBe(52.0);
  });

  it('passes through the response for other operations untouched', async () => {
    const cache = new InMemoryCache();
    const link = createStaleMatchupGuardLink(cache);
    const operation = {
      operationName: 'GetCurrentWeekForLeague',
      query: GetCurrentWeekForLeague,
      variables: { leagueId: 1 },
      extensions: {},
      getContext: () => ({}),
      setContext: jest.fn(),
    };
    const forward = () =>
      new Observable<ApolloLink.Result>((observer) => {
        observer.next({ data: { getCurrentWeekForLeague: 3 } });
        observer.complete();
      });

    const value = await new Promise<unknown>((resolve) => {
      const result = link.request(operation as never, forward as never);
      result?.subscribe({ next: (v) => resolve(v) });
    });

    expect(value).toEqual({ data: { getCurrentWeekForLeague: 3 } });
  });
});
