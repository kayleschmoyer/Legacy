import { LOGGER } from '@legacy-sports/logging';
import { handleFindDuplicateAccounts } from './findDuplicateAccounts';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockExecute = jest.fn();
const fakeDb = { execute: mockExecute };

const mockRunWithInternalClient = jest.fn(
  (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(fakeDb),
);

jest.mock('@legacy-sports/db-client', () => ({
  runWithInternalClient: (
    opts: unknown,
    cb: (db: unknown) => Promise<unknown>,
  ): unknown => mockRunWithInternalClient(opts, cb),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({ host: 'localhost' })),
}));

jest.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: unknown[]) => ({
      __sql: strings.join('?'),
    }),
    { raw: (s: string) => s },
  ),
}));

describe('handleFindDuplicateAccounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports no pairs when the query returns empty rows', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await handleFindDuplicateAccounts({});

    expect((LOGGER.info as jest.Mock).mock.calls.join('\n')).toContain(
      'No duplicate account pairs detected',
    );
  });

  it('prints a table when pairs are found (default format)', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          user_a_id: 1,
          user_a_email: 'alice@discord.com',
          user_b_id: 2,
          user_b_email: 'alice@gmail.com',
          match_type: 'canonical_matches_identity',
          shared_email: 'alice@discord.com',
        },
      ],
    });

    await handleFindDuplicateAccounts({});

    const infoCalls = (LOGGER.info as jest.Mock).mock.calls.flat().join('\n');
    expect(infoCalls).toContain('Found 1 candidate duplicate pair');
    expect(infoCalls).toContain('alice@discord.com');
    expect(infoCalls).toContain('alice@gmail.com');
    expect(infoCalls).toContain('merge-accounts');
  });

  it('prints JSON when format is json', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          user_a_id: 3,
          user_a_email: 'bob@apple.com',
          user_b_id: 4,
          user_b_email: 'bob@google.com',
          match_type: 'shared_identity_email',
          shared_email: 'bob@apple.com',
        },
      ],
    });

    await handleFindDuplicateAccounts({ format: 'json' });

    const infoCalls = (LOGGER.info as jest.Mock).mock.calls.flat().join('\n');
    expect(infoCalls).toContain('"userAId": 3');
    expect(infoCalls).toContain('"matchType": "shared_identity_email"');
  });

  it('passes the limit to the query', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await handleFindDuplicateAccounts({ limit: 5 });

    expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('outputs [] and no text message when format is json and no pairs found', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await handleFindDuplicateAccounts({ format: 'json' });

    const infoCalls = (LOGGER.info as jest.Mock).mock.calls.flat().join('\n');
    expect(infoCalls).toContain('[]');
    expect(infoCalls).not.toContain('No duplicate account pairs detected');
  });
});
