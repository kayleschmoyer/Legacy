/**
 * Unit tests for the MFA accessors on the internal db client (LS-7830):
 *   - getUserMfa: reads enrollment flag + TOTP secret, null when user absent,
 *     selects only the MFA columns.
 *   - setUserMfa: writes both fields (+ updatedAt), returns the updated row,
 *     clears the secret when passed null, throws when the user does not exist.
 */
import { getUserMfa, type InternalDb, setUserMfa } from './InternalDbClient';
import * as Schema from '../../drizzle/internal/schema';

interface Capture {
  selectColumns?: Record<string, unknown>;
  updateValues?: Record<string, unknown>;
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
