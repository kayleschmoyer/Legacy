import {
  deleteLeagueById,
  handleDeleteLeague,
  parseLeagueId,
} from './deleteLeague';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockWhere = jest.fn<Promise<void>, [unknown]>();
const mockDelete = jest.fn(() => ({ where: mockWhere }));

// Stand-in for the public DB client passed to the runWithPublicClient callback.
const fakeClient = { delete: mockDelete };

// runWithPublicClient(options, callback) — invoke the callback with the fake
// client so the delete path runs, mirroring the real helper's contract. The
// helper owns connection lifecycle (open/close), so the command no longer
// manages it directly.
const mockRunWithPublicClient = jest.fn(
  (_opts: unknown, cb: (client: unknown) => Promise<unknown>) => cb(fakeClient),
);

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (
    opts: unknown,
    cb: (client: unknown) => Promise<unknown>,
  ): unknown => mockRunWithPublicClient(opts, cb),
  PublicSchema: { leagues: { id: 'leagues.id' } },
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({ host: 'localhost' })),
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
}));

describe('parseLeagueId', () => {
  it('returns the id for a positive integer', () => {
    expect(parseLeagueId(16)).toBe(16);
    expect(parseLeagueId(1)).toBe(1);
  });

  it('returns null for missing, zero, negative, or non-integer ids', () => {
    expect(parseLeagueId(undefined)).toBeNull();
    expect(parseLeagueId(0)).toBeNull();
    expect(parseLeagueId(-5)).toBeNull();
    expect(parseLeagueId(1.5)).toBeNull();
    expect(parseLeagueId(NaN)).toBeNull();
  });

  it('returns null for unsafe integers outside the safe range', () => {
    expect(parseLeagueId(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(parseLeagueId(Infinity)).toBeNull();
  });
});

describe('handleDeleteLeague', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockResolvedValue(undefined);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code ?? ''})`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('exits without touching the database when id is missing', async () => {
    await expect(handleDeleteLeague({})).rejects.toThrow('process.exit(1)');
    expect(mockRunWithPublicClient).not.toHaveBeenCalled();
  });

  it('exits without touching the database when id is invalid', async () => {
    await expect(handleDeleteLeague({ id: -1, yes: true })).rejects.toThrow(
      'process.exit(1)',
    );
    expect(mockRunWithPublicClient).not.toHaveBeenCalled();
  });

  it('does not delete without the --yes confirmation flag', async () => {
    await handleDeleteLeague({ id: 16 });
    expect(mockRunWithPublicClient).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('deletes the league via CASCADE on the happy path', async () => {
    await handleDeleteLeague({ id: 16, yes: true });

    expect(mockRunWithPublicClient).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('deleteLeagueById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockResolvedValue(undefined);
  });

  it('runs the delete through runWithPublicClient', async () => {
    await deleteLeagueById(16);

    expect(mockRunWithPublicClient).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledWith({ col: 'leagues.id', val: 16 });
  });

  it('propagates errors from the delete', async () => {
    mockWhere.mockRejectedValue(new Error('boom'));

    await expect(deleteLeagueById(16)).rejects.toThrow('boom');
  });
});
