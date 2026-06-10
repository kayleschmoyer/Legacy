/**
 * Unit tests for the user_identities unlink rules on the internal db client
 * (LS-7823, AC5):
 *   - reachability guard: refuse to remove the last identity unless a local
 *     password remains;
 *   - canonical re-derivation: when the unlinked identity was the canonical
 *     source, re-derive from the remaining identities (oldest verified wins),
 *     else clear the source.
 *
 * The drizzle query builder is faked: getUserIdentities reads via
 * select().from().where().orderBy(), getUserById via select().from().where()
 * (thenable), deletes via delete().where().returning(), and the canonical
 * writes via update().set().where()[.returning()].
 */
import { type InternalDb, unlinkIdentity } from './InternalDbClient';

interface Capture {
  updates: Record<string, unknown>[];
  deleted: boolean;
}

function makeDb(
  identities: unknown[],
  user: unknown,
  capture: Capture,
): InternalDb {
  const whereObj = {
    // getUserIdentities terminal
    orderBy: () => Promise.resolve(identities),
    // getUserById terminal (.then(TakeUniqueOrNull))
    then: (onFulfilled: (rows: unknown[]) => unknown) =>
      Promise.resolve(user ? [user] : []).then(onFulfilled),
  };

  return {
    select: () => ({ from: () => ({ where: () => whereObj }) }),
    delete: () => ({
      where: () => {
        capture.deleted = true;
        // deleteIdentity uses TakeUniqueOrNull → resolve a single deleted row.
        return { returning: () => Promise.resolve([{ deleted: true }]) };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        capture.updates.push(values);
        return {
          where: () =>
            Object.assign(Promise.resolve([user]), {
              returning: () => Promise.resolve([user]),
            }),
        };
      },
    }),
  } as unknown as InternalDb;
}

function identity(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    userId: 1,
    provider: 'discord',
    providerAccountId: 'acct',
    providerEmail: 'a@example.com',
    providerEmailVerified: true,
    linkedAt: new Date(),
    ...overrides,
  };
}

describe('unlinkIdentity', () => {
  it('returns NOT_LINKED when the user has no identity for that provider', async () => {
    const capture: Capture = { updates: [], deleted: false };
    const db = makeDb(
      [identity({ id: 1, provider: 'google' })],
      { id: 1, passwordHash: null, canonicalEmailSource: null },
      capture,
    );

    const result = await unlinkIdentity(db, 1, 'discord');

    expect(result).toEqual({ ok: false, reason: 'NOT_LINKED' });
    expect(capture.deleted).toBe(false);
  });

  it('refuses to remove the last identity when no local password remains', async () => {
    const capture: Capture = { updates: [], deleted: false };
    const db = makeDb(
      [identity({ id: 1, provider: 'discord' })],
      { id: 1, passwordHash: null, canonicalEmailSource: null },
      capture,
    );

    const result = await unlinkIdentity(db, 1, 'discord');

    expect(result).toEqual({ ok: false, reason: 'LAST_IDENTITY' });
    expect(capture.deleted).toBe(false);
  });

  it('allows removing the last identity when a local password remains', async () => {
    const capture: Capture = { updates: [], deleted: false };
    const db = makeDb(
      [identity({ id: 1, provider: 'discord' })],
      { id: 1, passwordHash: 'hash', canonicalEmailSource: null },
      capture,
    );

    const result = await unlinkIdentity(db, 1, 'discord');

    expect(result).toEqual({ ok: true, rederived: false });
    expect(capture.deleted).toBe(true);
  });

  it('re-derives canonical from the oldest remaining verified identity', async () => {
    const capture: Capture = { updates: [], deleted: false };
    const db = makeDb(
      [
        identity({
          id: 1,
          provider: 'discord',
          providerEmail: 'd@example.com',
          providerEmailVerified: true,
        }),
        identity({
          id: 2,
          provider: 'google',
          providerEmail: 'g@example.com',
          providerEmailVerified: true,
        }),
      ],
      { id: 1, passwordHash: null, canonicalEmailSource: 'discord' },
      capture,
    );

    const result = await unlinkIdentity(db, 1, 'discord');

    expect(result).toEqual({ ok: true, rederived: true });
    // setCanonicalEmail writes the email + source together.
    expect(capture.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'g@example.com',
          canonicalEmailSource: 'google',
        }),
      ]),
    );
  });

  it('clears the source when no remaining identity has a verified email', async () => {
    const capture: Capture = { updates: [], deleted: false };
    const db = makeDb(
      [
        identity({ id: 1, provider: 'discord', providerEmailVerified: true }),
        identity({
          id: 2,
          provider: 'local',
          providerEmail: 'l@example.com',
          providerEmailVerified: false,
        }),
      ],
      { id: 1, passwordHash: 'hash', canonicalEmailSource: 'discord' },
      capture,
    );

    const result = await unlinkIdentity(db, 1, 'discord');

    expect(result).toEqual({ ok: true, rederived: false });
    // setCanonicalEmailSource clears the source without touching the email.
    const sourceUpdate = capture.updates.find((u) => !('email' in u));
    expect(sourceUpdate).toMatchObject({ canonicalEmailSource: null });
  });
});
