import { InvalidArgumentError } from 'commander';
import { handleUnblockLeague, parseLeagueId } from './unblockLeague';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCreateAllMatchupsForLeague = jest.fn<
  Promise<{ matchupCount: number; currentMatchupId: number | null }>,
  [unknown, number]
>();
const mockRunWithPublicClient = jest.fn(
  async (_opts: unknown, cb: (db: unknown) => Promise<void>): Promise<void> => {
    await cb({});
  },
);

jest.mock('@legacy-sports/db-client', () => ({
  createAllMatchupsForLeague: (db: unknown, leagueId: number) =>
    mockCreateAllMatchupsForLeague(db, leagueId),
  runWithPublicClient: (opts: unknown, cb: (db: unknown) => Promise<void>) =>
    mockRunWithPublicClient(opts, cb),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

describe('parseLeagueId', () => {
  it('parses a positive integer', () => {
    expect(parseLeagueId('93')).toBe(93);
  });

  it('rejects a non-numeric value', () => {
    expect(() => parseLeagueId('abc')).toThrow(InvalidArgumentError);
  });

  it('rejects zero', () => {
    expect(() => parseLeagueId('0')).toThrow(/positive integer/);
  });

  it('rejects a negative value', () => {
    expect(() => parseLeagueId('-5')).toThrow(/positive integer/);
  });

  it('rejects a fractional value', () => {
    expect(() => parseLeagueId('1.5')).toThrow(/positive integer/);
  });
});

describe('handleUnblockLeague', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls createAllMatchupsForLeague with the provided league id', async () => {
    mockCreateAllMatchupsForLeague.mockResolvedValue({
      matchupCount: 4,
      currentMatchupId: 12,
    });

    await handleUnblockLeague({ id: 93 });

    expect(mockRunWithPublicClient).toHaveBeenCalledTimes(1);
    expect(mockCreateAllMatchupsForLeague).toHaveBeenCalledTimes(1);
    expect(mockCreateAllMatchupsForLeague).toHaveBeenCalledWith(
      expect.anything(),
      93,
    );
  });

  it('propagates errors from createAllMatchupsForLeague', async () => {
    mockCreateAllMatchupsForLeague.mockRejectedValue(new Error('boom'));

    await expect(handleUnblockLeague({ id: 7 })).rejects.toThrow('boom');
  });
});
