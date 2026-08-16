/**
 * Resolver tests for the app-download allowlist admin surface (LS-9456).
 *
 * The admin gate is exercised through the real `requireAdmin`, not a mock:
 * the AC is that a non-admin is rejected *at the resolver*, independently of
 * the page, and mocking the helper would prove only that it was called.
 * Only the service layer (which talks to `app_internal`) is stubbed.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockListAllowlist = jest.fn();
const mockAddAllowlistEntry = jest.fn();
const mockSetAllowlistRevoked = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(() => ({})),
  listAllowlist: (...args: unknown[]) => mockListAllowlist(...args),
  addAllowlistEntry: (...args: unknown[]) => mockAddAllowlistEntry(...args),
  setAllowlistRevoked: (...args: unknown[]) => mockSetAllowlistRevoked(...args),
  PublicSchema: {
    users: { id: 'users.id', accessLevel: 'users.access_level' },
  },
}));

import {
  resolveAddAppDownloadAllowlistEntry,
  resolveAppDownloadAllowlist,
  resolveSetAppDownloadAllowlistRevoked,
} from './app-downloads';
import { type Context } from './builder';

const ROW = {
  id: 1,
  email: 'tester@example.com',
  note: 'beta group',
  addedByEmail: 'admin@example.com',
  createdAt: '2026-08-16T00:00:00.000Z',
  revokedAt: null,
  hasAccount: false,
  lastDownloadAt: null,
};

/**
 * A context whose drizzle chain answers requireAdmin's access-level lookup
 * with `accessLevel`, and whose `user` claim is set independently — so a
 * stale-token case (JWT says admin, database disagrees) is expressible.
 */
function makeContext(options: {
  user?: { id: number; isAdmin?: boolean } | null;
  accessLevel?: string | null;
}): Context {
  const rows = options.accessLevel
    ? [{ accessLevel: options.accessLevel }]
    : [];
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(rows),
        })),
      })),
    })),
  };
  return {
    user: options.user ?? null,
    db,
  } as unknown as Context;
}

const adminContext = makeContext({
  user: { id: 42, isAdmin: true },
  accessLevel: 'admin',
});
const nonAdminContext = makeContext({
  user: { id: 7, isAdmin: false },
  accessLevel: null,
});
const anonymousContext = makeContext({ user: null });

describe('app download allowlist resolvers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListAllowlist.mockResolvedValue([ROW]);
    mockAddAllowlistEntry.mockResolvedValue(99);
    mockSetAllowlistRevoked.mockResolvedValue(true);
  });

  describe('authorization', () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      [
        'appDownloadAllowlist',
        () => resolveAppDownloadAllowlist(nonAdminContext),
      ],
      [
        'addAppDownloadAllowlistEntry',
        () =>
          resolveAddAppDownloadAllowlistEntry(nonAdminContext, {
            email: 'tester@example.com',
          }),
      ],
      [
        'setAppDownloadAllowlistRevoked',
        () =>
          resolveSetAppDownloadAllowlistRevoked(nonAdminContext, {
            id: 1,
            revoked: true,
          }),
      ],
    ];

    it.each(cases)('rejects a non-admin caller of %s', async (_name, call) => {
      await expect(call()).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
      });
    });

    it.each(cases)(
      'touches no data when %s is refused',
      async (_name, call) => {
        await expect(call()).rejects.toBeDefined();

        expect(mockAddAllowlistEntry).not.toHaveBeenCalled();
        expect(mockSetAllowlistRevoked).not.toHaveBeenCalled();
        expect(mockListAllowlist).not.toHaveBeenCalled();
      },
    );

    it('rejects an unauthenticated caller', async () => {
      await expect(
        resolveAppDownloadAllowlist(anonymousContext),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('rejects a caller whose token claims admin but whose account does not', async () => {
      // Access revoked after the JWT was minted: requireAdmin re-checks the
      // database, which is the whole reason it exists.
      const staleToken = makeContext({
        user: { id: 42, isAdmin: true },
        accessLevel: null,
      });

      await expect(
        resolveAppDownloadAllowlist(staleToken),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });
  });

  describe('appDownloadAllowlist', () => {
    it('returns every row for an admin', async () => {
      const result = await resolveAppDownloadAllowlist(adminContext);

      expect(result).toEqual([ROW]);
    });
  });

  describe('addAppDownloadAllowlistEntry', () => {
    it('accepts an address with no user account behind it', async () => {
      // The defining case for this feature: a tester is invited before they
      // have ever signed in, so nothing here may consult the users table.
      const result = await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'never-signed-up@example.com',
        note: 'friend of the team',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeNull();
      expect(mockAddAllowlistEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'never-signed-up@example.com',
          note: 'friend of the team',
        }),
      );
    });

    it('attributes the row to the admin who added it', async () => {
      await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'tester@example.com',
      });

      expect(mockAddAllowlistEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ addedByUserId: 42 }),
      );
    });

    it('trims surrounding whitespace before storing', async () => {
      await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: '  tester@example.com  ',
      });

      expect(mockAddAllowlistEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ email: 'tester@example.com' }),
      );
    });

    it('stores an empty note as null rather than an empty string', async () => {
      await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'tester@example.com',
        note: '   ',
      });

      expect(mockAddAllowlistEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ note: null }),
      );
    });

    it('preserves the casing the admin typed', async () => {
      // Case-insensitive matching is the database's job, on lower(email),
      // which is also how the unique index is defined. Lowercasing here as
      // well would give two places for that rule to drift.
      await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'Tester@Example.com',
      });

      expect(mockAddAllowlistEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ email: 'Tester@Example.com' }),
      );
    });

    it('reports a duplicate instead of throwing or writing a second row', async () => {
      mockAddAllowlistEntry.mockResolvedValue(null);

      const result = await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'tester@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already on the allowlist');
      expect(result.entries).toEqual([ROW]);
    });

    it('rejects a malformed address without reaching the database', async () => {
      const result = await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'not-an-email',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not look like an email address');
      expect(mockAddAllowlistEntry).not.toHaveBeenCalled();
    });

    it('returns the refreshed list so the page updates without a reload', async () => {
      const result = await resolveAddAppDownloadAllowlistEntry(adminContext, {
        email: 'tester@example.com',
      });

      expect(result.entries).toEqual([ROW]);
      expect(mockListAllowlist).toHaveBeenCalledTimes(1);
    });
  });

  describe('setAppDownloadAllowlistRevoked', () => {
    it('revokes an active row', async () => {
      const result = await resolveSetAppDownloadAllowlistRevoked(adminContext, {
        id: 1,
        revoked: true,
      });

      expect(result.success).toBe(true);
      expect(mockSetAllowlistRevoked).toHaveBeenCalledWith(
        expect.anything(),
        1,
        true,
      );
    });

    it('re-instates a revoked row through the same mutation', async () => {
      const result = await resolveSetAppDownloadAllowlistRevoked(adminContext, {
        id: 1,
        revoked: false,
      });

      expect(result.success).toBe(true);
      expect(mockSetAllowlistRevoked).toHaveBeenCalledWith(
        expect.anything(),
        1,
        false,
      );
    });

    it('reports a missing row rather than a silent success', async () => {
      mockSetAllowlistRevoked.mockResolvedValue(false);

      const result = await resolveSetAppDownloadAllowlistRevoked(adminContext, {
        id: 404,
        revoked: true,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('no longer exists');
    });
  });
});
