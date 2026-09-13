/**
 * Unit tests for assertLeagueMemberOrSystem (LS-4305).
 *
 * The function guards autoProcessDraftPicks so that only:
 *   - System requests (EventBridge) — any scope
 *   - Admin users — any scope
 *   - Authenticated league members — their league only
 * can trigger the auto-pick nudge.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mocked at module level so the builder import does not pull in DB/env deps.
jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  PublicSchema: {
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
    },
  },
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

// Captures every builder.mutationField(name, fn) registration so LS-9253's
// test below can invoke the real autoProcessDraftPicks resolve function
// (rather than leaving mutationField a pure no-op, as it was before) without
// standing up the full Pothos builder.
const capturedResolvers: Record<
  string,
  (...args: unknown[]) => Promise<unknown>
> = {};

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => ({})),
    objectType: jest.fn(),
    mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
      fn({
        field: (opts: {
          resolve: (...args: unknown[]) => Promise<unknown>;
        }) => {
          capturedResolvers[name] = opts.resolve;
        },
        arg: { int: () => ({}) },
      });
    }),
  },
}));

// Mock the drafts sub-modules that scheduled-mutations imports at the top level.
jest.mock('./helpers', () => ({}));
jest.mock('./candidate-pool', () => ({}));
jest.mock('./auto-pick-scorer', () => ({}));
jest.mock('./draft-pick-effects', () => ({}));
jest.mock('../graphql-errors', () => ({
  AuthenticationError: (message = 'Authentication required') => {
    const err = new Error(message);
    (err as unknown as { extensions: { code: string } }).extensions = {
      code: 'UNAUTHENTICATED',
    };
    return err;
  },
  ForbiddenError: (message: string) => {
    const err = new Error(message);
    (err as unknown as { extensions: { code: string } }).extensions = {
      code: 'FORBIDDEN',
    };
    return err;
  },
}));

import {
  assertLeagueMemberOrSystem,
  isBenignAutoPickRace,
  isDraftNotYetInitialized,
  isLockWaitTimeout,
  runAutoPickLockedTransaction,
} from './scheduled-mutations';
import type { CandidatePool } from './candidate-pool';
import { withTransientRetry } from '../leagues/delete-resilience';
import type { Context } from '../builder';

// Minimal db mock — the real drizzle query builder is replaced with a jest.fn()
// that returns a fluent chain ending in an array (simulating a real DB result).
function makeMockDb(rows: unknown[] = []) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  return chain as unknown as Context['db'];
}

function makeContext(
  overrides: Partial<Context> & { db?: ReturnType<typeof makeMockDb> },
): Context {
  return {
    isSystemRequest: false,
    user: null,
    authSource: null,
    loaders: {} as Context['loaders'],
    notificationService: null,
    db: makeMockDb(),
    ...overrides,
  };
}

describe('assertLeagueMemberOrSystem', () => {
  describe('system / admin bypass', () => {
    it('allows a system request without a leagueId', async () => {
      const ctx = makeContext({ isSystemRequest: true });
      await expect(
        assertLeagueMemberOrSystem(ctx, null),
      ).resolves.toBeUndefined();
    });

    it('allows an admin user without a leagueId', async () => {
      const ctx = makeContext({
        user: { id: 1, isAdmin: true },
        authSource: 'bearer',
      });
      await expect(
        assertLeagueMemberOrSystem(ctx, null),
      ).resolves.toBeUndefined();
    });

    it('allows an admin user for any league without a membership row', async () => {
      const ctx = makeContext({
        user: { id: 1, isAdmin: true },
        authSource: 'bearer',
        db: makeMockDb([]), // no membership row — admin bypasses the check
      });
      await expect(
        assertLeagueMemberOrSystem(ctx, 42),
      ).resolves.toBeUndefined();
    });
  });

  describe('unauthenticated requests', () => {
    it('throws UNAUTHENTICATED when there is no user', async () => {
      const ctx = makeContext({ user: null, isSystemRequest: false });
      await expect(assertLeagueMemberOrSystem(ctx, 42)).rejects.toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });
    });
  });

  describe('authenticated non-member', () => {
    it('throws FORBIDDEN when the user has no membership row for the league', async () => {
      const ctx = makeContext({
        user: { id: 99, isAdmin: false },
        authSource: 'bearer',
        db: makeMockDb([]), // empty result → not a member
      });
      await expect(assertLeagueMemberOrSystem(ctx, 42)).rejects.toMatchObject({
        message: 'You are not a member of this league',
        extensions: { code: 'FORBIDDEN' },
      });
    });

    it('throws FORBIDDEN when leagueId is null and the user is not an admin', async () => {
      const ctx = makeContext({
        user: { id: 5, isAdmin: false },
        authSource: 'bearer',
      });
      await expect(assertLeagueMemberOrSystem(ctx, null)).rejects.toMatchObject(
        { extensions: { code: 'FORBIDDEN' } },
      );
    });
  });

  describe('authenticated league member', () => {
    it('resolves when the user has a membership row for the league (commissioner)', async () => {
      const ctx = makeContext({
        user: { id: 7, isAdmin: false },
        authSource: 'bearer',
        db: makeMockDb([{ leagueId: 42 }]), // one row → is a member
      });
      await expect(
        assertLeagueMemberOrSystem(ctx, 42),
      ).resolves.toBeUndefined();
    });

    it('resolves when the user has a membership row for the league (general manager)', async () => {
      const ctx = makeContext({
        user: { id: 8, isAdmin: false },
        authSource: 'bearer',
        db: makeMockDb([{ leagueId: 42 }]),
      });
      await expect(
        assertLeagueMemberOrSystem(ctx, 42),
      ).resolves.toBeUndefined();
    });

    it('resolves when authSource is cookie (browser session via CSRF-validated cookie)', async () => {
      const ctx = makeContext({
        user: { id: 9, isAdmin: false },
        authSource: 'cookie',
        db: makeMockDb([{ leagueId: 99 }]),
      });
      await expect(
        assertLeagueMemberOrSystem(ctx, 99),
      ).resolves.toBeUndefined();
    });
  });

  describe('EventBridge timing race regression (LS-4369)', () => {
    it('allows a system request with a leagueId (EventBridge nudge with scope)', async () => {
      const ctx = makeContext({ isSystemRequest: true });
      await expect(
        assertLeagueMemberOrSystem(ctx, 42),
      ).resolves.toBeUndefined();
    });

    it('throws FORBIDDEN (not UNAUTHENTICATED) for a bearer-authed non-member — fast-fail path', async () => {
      // nudgeRejected in the test checks for gqlErrors OR UNAUTHENTICATED in
      // result.errors.  FORBIDDEN must surface as a top-level gqlError so the
      // fast-fail fires immediately rather than letting the draft stall for 100+
      // misses before bailing with a generic "stuck" error.
      const ctx = makeContext({
        user: { id: 77, isAdmin: false },
        authSource: 'bearer',
        db: makeMockDb([]), // no membership row
      });
      const err = await assertLeagueMemberOrSystem(ctx, 42).catch((e) => e);
      expect(err).toMatchObject({ extensions: { code: 'FORBIDDEN' } });
      expect(err.message).toBe('You are not a member of this league');
    });

    it('throws UNAUTHENTICATED (not FORBIDDEN) when user is null — nudge fast-fail triggers', async () => {
      const ctx = makeContext({ user: null, isSystemRequest: false });
      const err = await assertLeagueMemberOrSystem(ctx, 42).catch((e) => e);
      expect(err).toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });
  });
});

describe('isLockWaitTimeout (LS-8398)', () => {
  /** A Postgres error carrying a SQLSTATE `code`, as postgres.js throws. */
  function pgError(message: string, code: string): Error {
    return Object.assign(new Error(message), { code });
  }

  it('recognizes a 57014 statement-timeout error from the drafts row lock', () => {
    const err = pgError(
      'canceling statement due to statement timeout',
      '57014',
    );
    expect(isLockWaitTimeout(err)).toBe(true);
  });

  it('recognizes 57014 when Drizzle wraps the driver error in `.cause`', () => {
    const driverError = pgError(
      'canceling statement due to statement timeout',
      '57014',
    );
    const wrapped = Object.assign(
      new Error(
        'Failed query: SELECT id, league_id, current_pick, current_pick_deadline FROM drafts WHERE id = $1 FOR NO KEY UPDATE\nparams: 7020',
      ),
      { cause: driverError },
    );
    expect(isLockWaitTimeout(wrapped)).toBe(true);
  });

  it('does not treat a deadlock (40P01) as a lock-wait timeout', () => {
    const err = pgError('deadlock detected', '40P01');
    expect(isLockWaitTimeout(err)).toBe(false);
  });

  it('does not treat a generic error with no SQLSTATE as a lock-wait timeout', () => {
    expect(
      isLockWaitTimeout(new Error('Team 5 roster is full in draft 100')),
    ).toBe(false);
  });
});

describe('runAutoPickLockedTransaction deadlock retry (LS-9690)', () => {
  /** A Postgres error carrying a SQLSTATE `code`, as postgres.js throws. */
  function pgError(message: string, code: string): Error {
    return Object.assign(new Error(message), { code });
  }

  it('retries once and succeeds when the drafts row lock transaction hits a deadlock (40P01)', async () => {
    let attempts = 0;
    const successResult = { isDraftComplete: false } as never;
    const db = {
      transaction: jest.fn(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject<never>(pgError('deadlock detected', '40P01'));
        }
        return Promise.resolve(successResult);
      }),
    };

    const result = await withTransientRetry(() =>
      runAutoPickLockedTransaction({
        db: db as never,
        draftId: 11479,
        draftLeagueId: 11817,
        pickTimeLimitSeconds: 30,
        candidatePool: {} as CandidatePool,
        predicted: null,
      }),
    );

    expect(attempts).toBe(2);
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(result).toBe(successResult);
  });

  it('does not swallow a genuine (non-transient) error from the locked transaction', async () => {
    const db = {
      transaction: jest.fn(() =>
        Promise.reject<never>(
          new Error('Team 5 roster is full in draft 11479'),
        ),
      ),
    };

    await expect(
      withTransientRetry(() =>
        runAutoPickLockedTransaction({
          db: db as never,
          draftId: 11479,
          draftLeagueId: 11817,
          pickTimeLimitSeconds: 30,
          candidatePool: {} as CandidatePool,
          predicted: null,
        }),
      ),
    ).rejects.toThrow('Team 5 roster is full in draft 11479');
    // Non-transient errors are not retried — a single attempt only.
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('isBenignAutoPickRace (LS-9691)', () => {
  /** A Postgres error carrying a SQLSTATE `code`, as postgres.js throws. */
  function pgError(message: string, code: string): Error {
    return Object.assign(new Error(message), { code });
  }

  it('treats a 57014 lock-wait timeout as a benign race', () => {
    const err = pgError(
      'canceling statement due to statement timeout',
      '57014',
    );
    expect(isBenignAutoPickRace(err)).toBe(true);
  });

  it('treats a 40P01 deadlock (the draft_picks insert failure from LS-9691) as a benign race', () => {
    const err = pgError('deadlock detected', '40P01');
    expect(isBenignAutoPickRace(err)).toBe(true);
  });

  it('treats a 40P01 deadlock as benign when Drizzle wraps the driver error in `.cause`', () => {
    const driverError = pgError('deadlock detected', '40P01');
    const wrapped = Object.assign(
      new Error(
        'Failed query: insert into "draft_picks" ("id", "draft_id", "team_id", "player_id", "round", "pick_number", "overall_pick", "picked_at", "bid_amount", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5, $6, $7, default, default, default) returning "id"\nparams: 11479,49045,6523,4,1,13,2026-08-23T17:11:11.633Z',
      ),
      { cause: driverError },
    );
    expect(isBenignAutoPickRace(wrapped)).toBe(true);
  });

  it('treats 40001 (serialization failure) and 55P03 (lock not available) as benign races', () => {
    expect(isBenignAutoPickRace(pgError('serialize', '40001'))).toBe(true);
    expect(isBenignAutoPickRace(pgError('lock unavailable', '55P03'))).toBe(
      true,
    );
  });

  it('does not treat a non-transient error (e.g. roster full) as a benign race', () => {
    expect(
      isBenignAutoPickRace(new Error('Team 5 roster is full in draft 100')),
    ).toBe(false);
  });

  it('does not treat an unrelated Postgres SQLSTATE (e.g. FK violation) as a benign race', () => {
    expect(isBenignAutoPickRace(pgError('fk violation', '23503'))).toBe(false);
  });
});

describe('isDraftNotYetInitialized (LS-4853)', () => {
  it('treats "No teams configured for this draft" as expected — draft_teams not populated yet', () => {
    expect(
      isDraftNotYetInitialized(new Error('No teams configured for this draft')),
    ).toBe(true);
  });

  it('does not treat an unrelated error as draft-not-yet-initialized', () => {
    expect(
      isDraftNotYetInitialized(new Error('Team 5 roster is full in draft 100')),
    ).toBe(false);
  });

  it('does not treat a non-Error value as draft-not-yet-initialized', () => {
    expect(isDraftNotYetInitialized('No teams configured for this draft')).toBe(
      false,
    );
  });
});

describe('autoProcessDraftPicks expired-drafts query (LS-9253)', () => {
  /** Recursively flattens a Drizzle `SQL` template's queryChunks into a
   *  plain string, so the literal SQL text can be asserted on without a
   *  real Postgres connection — `sql` is drizzle-orm's real (unmocked)
   *  template tag, so this only needs to walk what it actually built. */
  function flattenSqlChunks(node: unknown): string {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    // drizzle-orm's StringChunk wraps literal template segments as
    // { value: string[] } rather than a bare string.
    const stringChunkValue = (node as { value?: unknown }).value;
    if (Array.isArray(stringChunkValue)) {
      return stringChunkValue.map(flattenSqlChunks).join(' ');
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) {
      return chunks.map(flattenSqlChunks).join(' ');
    }
    return '';
  }

  it('scans for expired drafts with auto_pick_disabled = FALSE — the guard a Control All Teams draft (autoPickDisabled=true at creation) is excluded by', async () => {
    const resolve = capturedResolvers.autoProcessDraftPicks;
    expect(resolve).toBeDefined();

    let capturedQuery: unknown;
    const db = {
      execute: jest.fn((query: unknown) => {
        capturedQuery = query;
        return Promise.resolve({ rows: [] });
      }),
    };
    const ctx = makeContext({ isSystemRequest: true, db: db as never });

    const result = await resolve({}, {}, ctx, undefined);

    // Early-return path (no expired drafts found) — proves the query ran
    // and nothing downstream (candidate pool, auto-pick scorer, pick
    // commit) needed to be exercised for this assertion.
    expect(result).toMatchObject({ draftsProcessed: 0, picksAutoMade: 0 });
    expect(db.execute).toHaveBeenCalledTimes(1);

    const sqlText = flattenSqlChunks(capturedQuery);
    expect(sqlText).toContain('auto_pick_disabled = FALSE');
    // The scan reads drafts.status directly since LS-10074 — the
    // `INNER JOIN leagues ... l.draft_status` it replaced is gone, so a
    // league-less draft-first mock draft is picked up by the same sweep.
    expect(sqlText).toContain("d.status = 'in-progress'");
    expect(sqlText).not.toContain('INNER JOIN leagues');
  });
});
