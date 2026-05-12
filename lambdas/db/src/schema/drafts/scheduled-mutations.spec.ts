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

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => ({})),
    objectType: jest.fn(),
    mutationField: jest.fn(),
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

import { assertLeagueMemberOrSystem } from './scheduled-mutations';
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
  } as unknown as Context;
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
