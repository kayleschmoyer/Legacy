// Lambda-mode behaviour of runWithClient (LS-10304). `isLambda` is read once at
// module load, so this lives in its own file and imports Helpers after setting the env.
import type * as HelpersModule from './Helpers';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  invalidateSecretCache: jest.fn(),
}));

const mockClose = jest.fn();
const mockExecute = jest.fn();

jest.mock('./abstract/PgDbConnection', () => ({
  PgDbConnection: jest.fn().mockImplementation(() => {
    let initialized = false;
    return {
      get isInitialized() {
        return initialized;
      },
      initialize: jest.fn().mockImplementation(() => {
        initialized = true;
        return Promise.resolve();
      }),
      close: mockClose,
      db: { execute: mockExecute },
    };
  }),
}));

jest.mock('../../drizzle/public/schema', () => ({}));
jest.mock('../../drizzle/internal/schema', () => ({}));

// Load after the env var is set: import hoisting would otherwise run first.
let getPublicDbConnection: typeof HelpersModule.getPublicDbConnection;
let runWithClient: typeof HelpersModule.runWithClient;

beforeAll(async () => {
  process.env.LAMBDA_TASK_ROOT = '/var/task';
  const helpers = await import('./Helpers');
  getPublicDbConnection = helpers.getPublicDbConnection;
  runWithClient = helpers.runWithClient;
});

afterAll(() => {
  delete process.env.LAMBDA_TASK_ROOT;
});

const SCHEMA = {};
const OPTIONS = { type: 'pg-remote' as const };

describe('runWithClient in Lambda (cached connection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    mockClose.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not end the shared pool when the pool merely timed out', async () => {
    mockExecute
      .mockRejectedValueOnce(
        new Error('timeout exceeded when trying to connect'),
      )
      .mockResolvedValue([]);
    const before = getPublicDbConnection(OPTIONS);

    await expect(
      runWithClient(OPTIONS, SCHEMA, () => Promise.resolve('ok')),
    ).resolves.toBe('ok');

    // Ending a saturated pool fails every other in-flight query on it.
    expect(mockClose).not.toHaveBeenCalled();
    expect(getPublicDbConnection(OPTIONS)).toBe(before);
  });

  it('still evicts and ends the pool on a severed socket', async () => {
    mockExecute
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValue([]);

    await expect(
      runWithClient(OPTIONS, SCHEMA, () => Promise.resolve('ok')),
    ).resolves.toBe('ok');

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
