/**
 * Unit tests for the MFA accessors on the internal db client (LS-7830):
 *   - getUserMfa: reads enrollment flag + TOTP secret, null when user absent,
 *     selects only the MFA columns.
 *   - setUserMfa: writes both fields (+ updatedAt), returns the updated row,
 *     clears the secret when passed null, throws when the user does not exist.
 *
 * Also covers createUser's isTestUser assignment (LS-9222): new users are
 * flagged based on the @test.legacysports.dev email-domain convention.
 */
import {
  createUser,
  getUserMfa,
  type InternalDb,
  isTestUserEmail,
  setUserMfa,
} from './InternalDbClient';
import * as Schema from '../../drizzle/internal/schema';

interface Capture {
  selectColumns?: Record<string, unknown>;
  updateValues?: Record<string, unknown>;
  insertValues?: Record<string, unknown>;
}

function makeInsertDb(rows: unknown[], capture: Capture): InternalDb {
  return {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        capture.insertValues = values;
        return {
          returning: () => Promise.resolve(rows),
        };
      },
    }),
  } as unknown as InternalDb;
}

function makeSelectDb(rows: unknown[], capture: Capture): InternalDb {
  return {
    select: (columns: Record<string, unknown>) => {
      capture.selectColumns = columns;
      return {
        from: () => ({
          where: () => Promise.resolve(rows),
        }),
      };
    },
  } as unknown as InternalDb;
}

function makeUpdateDb(rows: unknown[], capture: Capture): InternalDb {
  return {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        capture.updateValues = values;
        return {
          where: () => ({
            returning: () => Promise.resolve(rows),
          }),
        };
      },
    }),
  } as unknown as InternalDb;
}

describe('getUserMfa', () => {
  it('returns the user MFA state when the user exists', async () => {
    const capture: Capture = {};
    const db = makeSelectDb(
      [{ mfaEnabled: true, totpSecret: 'SECRET123' }],
      capture,
    );

    const result = await getUserMfa(db, 42);

    expect(result).toEqual({ mfaEnabled: true, totpSecret: 'SECRET123' });
  });

  it('returns null when no user matches', async () => {
    const capture: Capture = {};
    const db = makeSelectDb([], capture);

    const result = await getUserMfa(db, 999);

    expect(result).toBeNull();
  });

  it('selects only the mfa_enabled and totp_secret columns', async () => {
    const capture: Capture = {};
    const db = makeSelectDb([{ mfaEnabled: false, totpSecret: null }], capture);

    await getUserMfa(db, 1);

    expect(capture.selectColumns).toEqual({
      mfaEnabled: Schema.usersInAppInternal.mfaEnabled,
      totpSecret: Schema.usersInAppInternal.totpSecret,
    });
  });
});

describe('setUserMfa', () => {
  it('writes mfaEnabled, totpSecret and updatedAt, and returns the updated row', async () => {
    const capture: Capture = {};
    const updatedRow = { id: 7, mfaEnabled: true, totpSecret: 'NEWSECRET' };
    const db = makeUpdateDb([updatedRow], capture);

    const result = await setUserMfa(db, 7, {
      mfaEnabled: true,
      totpSecret: 'NEWSECRET',
    });

    expect(result).toBe(updatedRow);
    expect(capture.updateValues?.mfaEnabled).toBe(true);
    expect(capture.updateValues?.totpSecret).toBe('NEWSECRET');
    expect(capture.updateValues?.updatedAt).toBeInstanceOf(Date);
  });

  it('clears the secret when totpSecret is null', async () => {
    const capture: Capture = {};
    const db = makeUpdateDb(
      [{ id: 7, mfaEnabled: false, totpSecret: null }],
      capture,
    );

    await setUserMfa(db, 7, { mfaEnabled: false, totpSecret: null });

    expect(capture.updateValues?.mfaEnabled).toBe(false);
    expect(capture.updateValues?.totpSecret).toBeNull();
  });

  it('throws when the user does not exist (no row returned)', async () => {
    const capture: Capture = {};
    const db = makeUpdateDb([], capture);

    await expect(
      setUserMfa(db, 12345, { mfaEnabled: true, totpSecret: 'x' }),
    ).rejects.toThrow('Found non unique or inexistent value');
  });
});

describe('isTestUserEmail', () => {
  it.each([
    'seed@test.legacysports.dev',
    'SEED@TEST.LEGACYSPORTS.DEV',
    'e2e.bot+1@test.legacysports.dev',
  ])('returns true for test-domain email %s', (email) => {
    expect(isTestUserEmail(email)).toBe(true);
  });

  it.each([
    'real.user@example.com',
    'someone@nottest.legacysports.dev',
    'someone@test.legacysports.dev.evil.com',
  ])('returns false for non-test-domain email %s', (email) => {
    expect(isTestUserEmail(email)).toBe(false);
  });
});

describe('createUser', () => {
  it('sets isTestUser true when the email is on the test domain', async () => {
    const capture: Capture = {};
    const insertedRow = { id: 1, canonicalEmail: 'seed@test.legacysports.dev' };
    const db = makeInsertDb([insertedRow], capture);

    const result = await createUser(db, 'seed@test.legacysports.dev');

    expect(result).toBe(insertedRow);
    expect(capture.insertValues?.isTestUser).toBe(true);
  });

  it('sets isTestUser false for a regular email', async () => {
    const capture: Capture = {};
    const insertedRow = { id: 2, canonicalEmail: 'real.user@example.com' };
    const db = makeInsertDb([insertedRow], capture);

    await createUser(db, 'real.user@example.com', 'hashed-password');

    expect(capture.insertValues?.isTestUser).toBe(false);
    expect(capture.insertValues?.passwordHash).toBe('hashed-password');
  });
});
