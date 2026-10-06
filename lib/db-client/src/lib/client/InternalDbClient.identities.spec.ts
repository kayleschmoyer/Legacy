/**
 * Unit tests for the user_identities link/unlink rules on the internal db
 * client.
 *
 * linkIdentity (LS-7215): a link that loses a concurrent race at insert time
 * maps the unique violation onto the same friendly outcome as the pre-checks.
 *
 * unlinkIdentity (LS-7823, AC5):
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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type InternalDb,
  linkIdentity,
  unlinkIdentity,
} from './InternalDbClient';

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
    // setCanonicalEmail writes the canonicalEmail + source together.
    expect(capture.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalEmail: 'g@example.com',
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
    // setCanonicalEmailSource clears the source without touching the canonicalEmail.
    const sourceUpdate = capture.updates.find((u) => !('canonicalEmail' in u));
    expect(sourceUpdate).toMatchObject({ canonicalEmailSource: null });
  });
});

/** A fake db whose pre-check selects find nothing and whose insert fails with
 * `insertError` (or succeeds with `inserted`). */
function makeLinkDb(
  insertError: Error | undefined,
  inserted?: unknown,
  selectRows: unknown[] = [],
  onInsert: () => void = () => undefined,
): InternalDb {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          then: (onFulfilled: (rows: unknown[]) => unknown) =>
            Promise.resolve(selectRows).then(onFulfilled),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => {
          onInsert();
          return insertError
            ? Promise.reject(insertError)
            : Promise.resolve([inserted]);
        },
      }),
    }),
  } as unknown as InternalDb;
}

/** A Postgres unique violation, wrapped the way drizzle-orm surfaces it. */
function uniqueViolation(constraint: string): Error {
  const cause = Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint,
  });
  return Object.assign(new Error('Failed query'), { cause });
}

describe('linkIdentity', () => {
  const input = {
    userId: 2,
    provider: 'discord' as const,
    providerAccountId: 'acct',
  };

  it('links when the pre-checks pass and the insert succeeds', async () => {
    const row = identity({ id: 9, userId: 2 });
    const result = await linkIdentity(makeLinkDb(undefined, row), input);

    expect(result).toEqual({ ok: true, identity: row });
  });

  it('maps a racing provider-account unique violation to PROVIDER_ACCOUNT_TAKEN', async () => {
    const db = makeLinkDb(
      uniqueViolation('user_identities_provider_account_uk'),
    );

    const result = await linkIdentity(db, input);

    expect(result).toEqual({ ok: false, reason: 'PROVIDER_ACCOUNT_TAKEN' });
  });

  it('maps a racing user-provider unique violation to ALREADY_LINKED', async () => {
    const db = makeLinkDb(uniqueViolation('user_identities_user_provider_uk'));

    const result = await linkIdentity(db, input);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_LINKED' });
  });

  it('maps an unwrapped driver unique violation too', async () => {
    const bare = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'user_identities_provider_account_uk',
    });

    const result = await linkIdentity(makeLinkDb(bare), input);

    expect(result).toEqual({ ok: false, reason: 'PROVIDER_ACCOUNT_TAKEN' });
  });

  it('rethrows unrelated insert errors', async () => {
    const other = uniqueViolation('some_other_uk');

    await expect(linkIdentity(makeLinkDb(other), input)).rejects.toBe(other);
  });

  it('returns PROVIDER_ACCOUNT_TAKEN without inserting while the other user still holds the link', async () => {
    // Unlink-vs-link ordering: user B links before user A's unlink commits, so
    // the pre-check still sees A's row. B gets the friendly conflict and no
    // insert is attempted; retrying after A's delete commits succeeds.
    const insert = jest.fn();
    const db = makeLinkDb(
      undefined,
      undefined,
      [identity({ id: 5, userId: 1 })],
      insert,
    );

    const result = await linkIdentity(db, input);

    expect(result).toEqual({ ok: false, reason: 'PROVIDER_ACCOUNT_TAKEN' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('is idempotent when the same user re-links the account they already own', async () => {
    const row = identity({ id: 5, userId: 2 });
    const insert = jest.fn();

    const result = await linkIdentity(
      makeLinkDb(undefined, undefined, [row], insert),
      input,
    );

    expect(result).toEqual({ ok: true, identity: row });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('user_identities constraint names', () => {
  // linkIdentity matches racing unique violations by constraint name. If the
  // migration renames a constraint the mapping silently degrades to a raw 500,
  // so pin the names in both places (LS-7215).
  const names = [
    'user_identities_provider_account_uk',
    'user_identities_user_provider_uk',
  ];

  it.each(names)(
    '%s exists in the migration and in the link mapping',
    (name) => {
      const migration = readFileSync(
        join(
          __dirname,
          '../../../migrations/20260607_120000_add_user_identities_table.ts',
        ),
        'utf8',
      );
      const client = readFileSync(
        join(__dirname, 'InternalDbClient.ts'),
        'utf8',
      );

      expect(migration).toContain(`CONSTRAINT ${name} UNIQUE`);
      expect(client).toContain(`'${name}'`);
    },
  );
});
