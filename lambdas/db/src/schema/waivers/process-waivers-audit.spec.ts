/**
 * processWaiverClaims — commissioner audit log (LS-10736).
 *
 * A commissioner's manual "Process Waivers Now" must leave an audit row; the
 * scheduled all-leagues EventBridge run is not a commissioner action and must
 * not.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Resolver = (_p: unknown, args: unknown, ctx: unknown) => Promise<unknown>;

const RESULT = { processed: 3, succeeded: 2, failed: 1 };

function captureResolver() {
  jest.resetModules();
  const resolvers: Record<string, Resolver> = {};
  const writeAuditLog = jest.fn().mockResolvedValue(undefined);

  // Universally callable/chainable no-op (see update-draft-settings.spec.ts):
  // requiring mutations.ts loads unrelated schema modules that call arbitrary
  // builder methods at module-top-level.
  function autoStub(): unknown {
    return new Proxy(() => autoStub(), { get: () => autoStub() });
  }

  jest.doMock('../builder', () => ({
    builder: new Proxy(
      {
        mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
          fn({
            field: (opts: { resolve: Resolver }) => {
              resolvers[name] = opts.resolve;
            },
            arg: autoStub(),
          });
        }),
      },
      {
        get: (target, prop) =>
          prop in target ? target[prop as keyof typeof target] : autoStub(),
      },
    ),
  }));
  jest.doMock('../audit-log', () => ({ writeAuditLog }));
  jest.doMock('../matchups/scheduled-mutations', () => ({
    assertAuthorized: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('../../services/waiver-processor', () => ({
    WaiverClaimProcessor: jest.fn().mockImplementation(() => ({
      process: jest.fn().mockResolvedValue(RESULT),
    })),
  }));
  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));

  require('./mutations');

  const resolve = resolvers['processWaiverClaims'];
  if (!resolve) throw new Error('processWaiverClaims resolver not captured');
  return { resolve, writeAuditLog };
}

describe('processWaiverClaims — commissioner audit log (LS-10736)', () => {
  it('writes a process_waivers audit row for a commissioner-triggered run', async () => {
    const { resolve, writeAuditLog } = captureResolver();
    const db = {};

    const result = await resolve(
      null,
      { leagueId: 10 },
      { user: { id: 7 }, db, isSystemRequest: false },
    );

    expect(result).toEqual(RESULT);
    expect(writeAuditLog).toHaveBeenCalledWith(db, {
      leagueId: 10,
      userId: 7,
      action: 'process_waivers',
      targetType: 'league',
      targetId: 10,
      details: RESULT,
    });
  });

  it('does not audit the scheduled system run', async () => {
    const { resolve, writeAuditLog } = captureResolver();

    await resolve(null, {}, { user: null, db: {}, isSystemRequest: true });

    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

export {};
