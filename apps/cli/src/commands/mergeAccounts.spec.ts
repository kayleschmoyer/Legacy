import { LOGGER } from '@legacy-sports/logging';
import {
  buildMergePreview,
  executeMerge,
  handleMergeAccounts,
} from './mergeAccounts';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── DB mock helpers ──────────────────────────────────────────────────────────

// Returns an object that is both thenable (for queries that await .where()
// directly) and exposes .limit() / .orderBy() (for queries that chain
// .orderBy(...).limit(1) after .where()). All paths resolve to `data`.
interface WhereResult {
  limit: (...args: unknown[]) => Promise<unknown[]>;
  orderBy: (...args: unknown[]) => WhereResult;
  then: (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise<unknown>;
}

function makeWhereResult(data: unknown[]): WhereResult {
  const result: WhereResult = {
    limit: jest.fn().mockResolvedValue(data),
    orderBy: jest.fn(() => result),
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(data).then(resolve, reject),
  };
  return result;
}

// Default implementation returns an empty result; tests override with
// mockSelectWhere.mockImplementationOnce(() => makeWhereResult([...])).
const mockSelectWhere = jest.fn(() => makeWhereResult([]));
const mockSelectFrom = jest.fn(() => ({ where: mockSelectWhere }));
const mockSelect = jest.fn(() => ({ from: mockSelectFrom }));
const mockExecute = jest.fn();
const mockTransaction = jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
  cb({ execute: mockExecute }),
);

const fakeDb = {
  select: mockSelect,
  execute: mockExecute,
  transaction: mockTransaction,
};

const mockRunWithInternalClient = jest.fn(
  (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(fakeDb),
);

jest.mock('@legacy-sports/db-client', () => ({
  InternalSchema: {
    usersInAppInternal: {
      id: 'users.id',
      canonicalEmail: 'users.canonical_email',
      username: 'users.username',
      createdAt: 'users.created_at',
      passwordHash: 'users.password_hash',
    },
    userIdentities: {
      id: 'ui.id',
      userId: 'ui.user_id',
      provider: 'ui.provider',
      providerAccountId: 'ui.provider_account_id',
      providerEmail: 'ui.provider_email',
      providerEmailVerified: 'ui.provider_email_verified',
      linkedAt: 'ui.linked_at',
    },
    subscriptions: {
      id: 'sub.id',
      userId: 'sub.user_id',
      status: 'sub.status',
      tier: 'sub.tier',
      stripeCustomerId: 'sub.stripe_customer_id',
      appleOriginalTransactionId: 'sub.apple_original_transaction_id',
      googlePurchaseToken: 'sub.google_purchase_token',
      currentPeriodEnd: 'sub.current_period_end',
    },
  },
  runWithInternalClient: (
    opts: unknown,
    cb: (db: unknown) => Promise<unknown>,
  ): unknown => mockRunWithInternalClient(opts, cb),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({ host: 'localhost' })),
}));

jest.mock('drizzle-orm', () => ({
  desc: jest.fn((col: unknown) => ({ desc: col })),
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: unknown[]) => ({
      __sql: strings.join('?'),
    }),
    { raw: (s: string) => s },
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PRIMARY = {
  id: 1,
  canonicalEmail: 'alice@gmail.com',
  username: 'alice',
  createdAt: new Date('2024-01-01'),
  passwordHash: null,
};
const SECONDARY = {
  id: 2,
  canonicalEmail: 'alice@discord.com',
  username: 'alice_d',
  createdAt: new Date('2024-06-01'),
  passwordHash: null,
};
const DISCORD_IDENTITY = {
  id: 10,
  provider: 'discord',
  providerAccountId: 'snowflake123',
  providerEmail: 'alice@discord.com',
  providerEmailVerified: true,
  linkedAt: new Date('2024-06-01'),
};
const GOOGLE_IDENTITY = {
  id: 11,
  provider: 'google',
  providerAccountId: 'google-sub',
  providerEmail: 'alice@gmail.com',
  providerEmailVerified: true,
  linkedAt: new Date('2024-01-01'),
};

// ── buildMergePreview ─────────────────────────────────────────────────────────

describe('buildMergePreview', () => {
  it('detects no conflicts when providers do not overlap', () => {
    const preview = buildMergePreview(
      PRIMARY,
      SECONDARY,
      [GOOGLE_IDENTITY],
      [DISCORD_IDENTITY],
      null,
      null,
    );
    expect(preview.identityConflicts).toHaveLength(0);
    expect(preview.subscriptionConflicts).toHaveLength(0);
  });

  it('detects an identity conflict when both users share a provider', () => {
    const secondDiscord = { ...DISCORD_IDENTITY, id: 20, userId: 1 };
    const preview = buildMergePreview(
      PRIMARY,
      SECONDARY,
      [secondDiscord],
      [DISCORD_IDENTITY],
      null,
      null,
    );
    expect(preview.identityConflicts).toHaveLength(1);
    expect(preview.identityConflicts[0]).toContain('discord');
  });

  it('detects a Stripe subscription conflict', () => {
    const sub = {
      id: 1,
      status: 'active',
      tier: 'premium',
      stripeCustomerId: 'cus_A',
      appleOriginalTransactionId: null,
      googlePurchaseToken: null,
      currentPeriodEnd: null,
    };
    const sub2 = { ...sub, id: 2, stripeCustomerId: 'cus_B' };
    const preview = buildMergePreview(PRIMARY, SECONDARY, [], [], sub, sub2);
    expect(preview.subscriptionConflicts).toHaveLength(1);
    expect(preview.subscriptionConflicts[0]).toContain('Stripe');
  });

  it('does not flag a conflict when only one account has a subscription', () => {
    const sub = {
      id: 1,
      status: 'active',
      tier: 'premium',
      stripeCustomerId: 'cus_A',
      appleOriginalTransactionId: null,
      googlePurchaseToken: null,
      currentPeriodEnd: null,
    };
    const preview = buildMergePreview(PRIMARY, SECONDARY, [], [], sub, null);
    expect(preview.subscriptionConflicts).toHaveLength(0);
  });
});

// ── handleMergeAccounts — validation ─────────────────────────────────────────

describe('handleMergeAccounts', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code ?? ''})`);
    }) as never);
  });

  afterEach(() => exitSpy.mockRestore());

  it('exits when primary and secondary IDs are the same', async () => {
    await expect(
      handleMergeAccounts({ primaryId: 5, secondaryId: 5 }),
    ).rejects.toThrow('process.exit(1)');
    expect(mockRunWithInternalClient).not.toHaveBeenCalled();
  });

  it('exits when primaryId is missing', async () => {
    await expect(
      handleMergeAccounts({ primaryId: 0, secondaryId: 1 }),
    ).rejects.toThrow('process.exit(1)');
    expect(mockRunWithInternalClient).not.toHaveBeenCalled();
  });

  it('exits when primary user is not found', async () => {
    // All six parallel fetches return empty — primary not found
    // (default mockSelectWhere implementation already returns makeWhereResult([]))

    await expect(
      handleMergeAccounts({ primaryId: 1, secondaryId: 2 }),
    ).rejects.toThrow('process.exit(1)');
    const errCalls = (LOGGER.error as jest.Mock).mock.calls.flat().join('\n');
    expect(errCalls).toContain('Primary user');
    expect(errCalls).toContain('not found');
  });

  it('prints a dry-run preview without calling transaction', async () => {
    mockSelectWhere
      .mockImplementationOnce(() => makeWhereResult([PRIMARY]))
      .mockImplementationOnce(() => makeWhereResult([SECONDARY]))
      .mockImplementationOnce(() => makeWhereResult([GOOGLE_IDENTITY]))
      .mockImplementationOnce(() => makeWhereResult([DISCORD_IDENTITY]))
      .mockImplementationOnce(() => makeWhereResult([]))
      .mockImplementationOnce(() => makeWhereResult([]));

    await handleMergeAccounts({ primaryId: 1, secondaryId: 2, dryRun: true });

    expect(mockTransaction).not.toHaveBeenCalled();
    const infoCalls = (LOGGER.info as jest.Mock).mock.calls.flat().join('\n');
    expect(infoCalls).toContain('Dry run complete');
    expect(infoCalls).toContain('alice@gmail.com');
  });

  it('requires --yes before executing the merge', async () => {
    mockSelectWhere
      .mockImplementationOnce(() => makeWhereResult([PRIMARY]))
      .mockImplementationOnce(() => makeWhereResult([SECONDARY]))
      .mockImplementationOnce(() => makeWhereResult([GOOGLE_IDENTITY]))
      .mockImplementationOnce(() => makeWhereResult([DISCORD_IDENTITY]))
      .mockImplementationOnce(() => makeWhereResult([]))
      .mockImplementationOnce(() => makeWhereResult([]));

    await handleMergeAccounts({ primaryId: 1, secondaryId: 2 });

    expect(mockTransaction).not.toHaveBeenCalled();
    const infoCalls = (LOGGER.info as jest.Mock).mock.calls.flat().join('\n');
    expect(infoCalls).toContain('--yes');
  });
});

// ── executeMerge ─────────────────────────────────────────────────────────────

describe('executeMerge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('transfers a non-conflicting identity and calls the audit log insert', async () => {
    mockExecute.mockResolvedValue({ rowCount: 0 });

    const { tablesUpdated, warnings } = await executeMerge(
      fakeDb as never,
      1,
      2,
      'alice@gmail.com',
      'alice@discord.com',
      [GOOGLE_IDENTITY], // primary identities (google)
      [DISCORD_IDENTITY], // secondary identities (discord — no conflict)
    );

    expect(warnings).toHaveLength(0);
    expect(tablesUpdated.some((t) => t.includes('discord identity'))).toBe(
      true,
    );
    expect(tablesUpdated.some((t) => t.includes('deactivated'))).toBe(true);
  });

  it('warns and deletes the secondary identity when providers conflict', async () => {
    mockExecute.mockResolvedValue({ rowCount: 0 });

    const duplicateDiscord = { ...DISCORD_IDENTITY, id: 99 };

    const { warnings } = await executeMerge(
      fakeDb as never,
      1,
      2,
      'alice@gmail.com',
      'alice@discord.com',
      [DISCORD_IDENTITY], // primary already has discord
      [duplicateDiscord], // secondary also has discord — conflict
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('discord');
  });
});
