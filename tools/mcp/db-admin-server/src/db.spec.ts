/**
 * Role-password self-heal (LS-10416): a role pool whose login fails with
 * 28P01 is resynced from its Secrets Manager value over the master connection,
 * then reopened — no human, no tunnel.
 */

import type * as DbModuleNs from './db.js';

interface FakeSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  end: jest.Mock;
  begin: jest.Mock;
}

/** Live Postgres role passwords, mutated by the fake ALTER ROLE. */
const livePasswords = new Map<string, string>();
const secrets = new Map<string, string>();
const opened: { username: string; pool: FakeSql }[] = [];
const alterRoleCalls: { role: unknown; password: unknown }[] = [];
let alterRoleError: Error | null = null;
let probeError: Error | null = null;

function invalidPassword(username: string): Error {
  return Object.assign(
    new Error(`password authentication failed for user "${username}"`),
    { code: '28P01' },
  );
}

function fakePostgres(options: { username: string; password: string }) {
  const { username, password } = options;
  const pool = jest.fn(() => {
    if (probeError) return Promise.reject(probeError);
    return livePasswords.get(username) === password
      ? Promise.resolve([{ '?column?': 1 }])
      : Promise.reject(invalidPassword(username));
  }) as unknown as FakeSql;
  pool.end = jest.fn(() => Promise.resolve());
  pool.begin = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const call: { role: unknown; password: unknown } = {
      role: undefined,
      password: undefined,
    };
    const tx = Object.assign(
      jest.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
        [call.role, call.password] = values;
        return Promise.resolve([]);
      }),
      {
        unsafe: jest.fn(() => {
          if (alterRoleError) return Promise.reject(alterRoleError);
          livePasswords.set(String(call.role), String(call.password));
          return Promise.resolve([]);
        }),
      },
    );
    const result = await fn(tx);
    alterRoleCalls.push(call);
    return result;
  });
  opened.push({ username, pool });
  return pool;
}

jest.mock('postgres', () => ({
  __esModule: true,
  default: jest.fn((options: { username: string; password: string }) =>
    fakePostgres(options),
  ),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  GetSecretValueCommand: jest.fn((input: { SecretId: string }) => input),
  SecretsManagerClient: jest.fn(() => ({
    send: jest.fn((input: { SecretId: string }) =>
      Promise.resolve({ SecretString: secrets.get(input.SecretId) }),
    ),
  })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

type DbModule = typeof DbModuleNs;

function loadDb(): DbModule {
  let mod: DbModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<DbModule>('./db');
  });
  if (!mod) throw new Error('db module failed to load');
  return mod;
}

function setSecret(name: string, username: string, password: string): void {
  secrets.set(name, JSON.stringify({ username, password }));
}

beforeEach(() => {
  livePasswords.clear();
  secrets.clear();
  opened.length = 0;
  alterRoleCalls.length = 0;
  alterRoleError = null;
  probeError = null;
  process.env['DB_HOST'] = 'db.internal:5432';
  process.env['DB_SECRET_NAME'] = 'master-secret';
  process.env['MCP_READONLY_SECRET_NAME'] = 'readonly-secret';
  process.env['MCP_WRITE_SECRET_NAME'] = 'write-secret';
  setSecret('master-secret', 'postgres', 'master-pw');
  setSecret('readonly-secret', 'mcp_readonly', 'ro-secret-pw');
  setSecret('write-secret', 'mcp_write', 'rw-secret-pw');
  livePasswords.set('postgres', 'master-pw');
});

describe.each([
  ['mcp_readonly', 'getReadonlySql', 'ro-secret-pw'],
  ['mcp_write', 'getWriteSql', 'rw-secret-pw'],
] as const)('%s pool', (role, getter, secretPassword) => {
  it('opens without touching the master connection when the password matches', async () => {
    livePasswords.set(role, secretPassword);
    const db = loadDb();

    await db[getter]();

    expect(alterRoleCalls).toEqual([]);
    expect(opened.map((o) => o.username)).toEqual([role]);
  });

  it('resyncs the role password from the secret on 28P01 and reopens', async () => {
    livePasswords.set(role, 'CHANGE_ME_IN_PRODUCTION');
    const db = loadDb();

    const sql = await db[getter]();

    expect(alterRoleCalls).toEqual([{ role, password: secretPassword }]);
    expect(livePasswords.get(role)).toBe(secretPassword);
    // stale pool, master pool, healed pool
    expect(opened.map((o) => o.username)).toEqual([role, 'postgres', role]);
    expect(opened[0].pool.end).toHaveBeenCalled();
    expect(sql).toBe(opened[2].pool);
  });

  it('caches the healed pool across calls', async () => {
    livePasswords.set(role, 'stale');
    const db = loadDb();

    const first = await db[getter]();
    const second = await db[getter]();

    expect(second).toBe(first);
    expect(alterRoleCalls).toHaveLength(1);
  });

  it('surfaces the manual fallback and does not cache when the resync fails', async () => {
    livePasswords.set(role, 'stale');
    alterRoleError = new Error('permission denied to alter role');
    const db = loadDb();

    await expect(db[getter]()).rejects.toThrow(
      /automatic resync failed: permission denied to alter role.*db:resync-role -- --role/,
    );

    alterRoleError = null;
    await expect(db[getter]()).resolves.toBeDefined();
    expect(livePasswords.get(role)).toBe(secretPassword);
  });
});

it('leaves non-auth probe failures for the tool query to classify', async () => {
  probeError = Object.assign(new Error('write CONNECT_TIMEOUT'), {
    code: 'CONNECT_TIMEOUT',
  });
  const db = loadDb();

  const sql = await db.getReadonlySql();

  expect(sql).toBe(opened[0].pool);
  expect(alterRoleCalls).toEqual([]);
});

it('refuses a role secret whose username does not match the role', async () => {
  setSecret('write-secret', 'mcp_readonly', 'whatever');
  const db = loadDb();

  await expect(db.getWriteSql()).rejects.toThrow(
    /is for role "mcp_readonly", not "mcp_write"/,
  );
  expect(alterRoleCalls).toEqual([]);
});

describe('isInvalidPasswordError', () => {
  it('matches SQLSTATE 28P01 only', () => {
    const db = loadDb();
    expect(db.isInvalidPasswordError(invalidPassword('x'))).toBe(true);
    expect(db.isInvalidPasswordError({ code: '57014' })).toBe(false);
    expect(db.isInvalidPasswordError(null)).toBe(false);
  });
});
