import type { DbOptions } from '@legacy-sports/utils/node';
import { LeagueService } from './LeagueService';

interface MockTx {
  execute: jest.Mock;
  select: jest.Mock;
  from: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
}

interface MockDb {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  insert: jest.Mock;
  transaction: jest.Mock;
}

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

describe('LeagueService.createLeague — atomicity (LS-6068)', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: LeagueService;
  let mockTx: MockTx;
  let mockDb: MockDb;

  const baseInput = {
    name: 'Test League',
    ownerId: 1,
    ownerUsername: 'owner',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeagueService(options);

    // Chainable tx double: every builder method returns `mockTx` so call
    // chains like `.insert(...).values(...).returning(...)` resolve, unless
    // a test overrides a specific step to reject (simulating a failure
    // partway through the transaction).
    mockTx = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ existingCount: 0 }]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 1 }]),
    };

    // The read-only invite-code check runs on `db` *outside* the
    // transaction — give it its own chain so we can assert nothing else
    // touches `db` directly (only `tx` should ever perform writes).
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      transaction: jest.fn((cb: (tx: MockTx) => Promise<unknown>) =>
        cb(mockTx),
      ),
    };

    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler(mockDb as never),
    );
  });

  it('runs every write (league, teams, commissioner membership, positions, draft, scoring profile) inside a single db.transaction()', async () => {
    mockTx.returning
      .mockResolvedValueOnce([{ id: 100 }]) // league insert
      .mockResolvedValueOnce([{ id: 200 }]) // team insert(s)
      .mockResolvedValueOnce([{ id: 300 }]); // scoring profile insert

    await service.createLeague(baseInput);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    // Every insert in the service (league, teams, leagueMembers/commissioner
    // role, leaguePosition, drafts, leagueScoringProfiles) must go through
    // `tx`, never the outer `db` — otherwise a later failure inside the
    // transaction couldn't roll those writes back.
    expect(mockTx.insert).toHaveBeenCalledTimes(6);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('propagates a failure during commissioner-role assignment instead of swallowing it, and performs no writes outside the transaction', async () => {
    mockTx.returning
      .mockResolvedValueOnce([{ id: 100 }]) // league insert succeeds
      .mockResolvedValueOnce([{ id: 200 }]); // team insert succeeds

    // Step 3 (owner/commissioner leagueMembers insert) is a bare
    // `tx.insert(...).values(...)` with no `.returning()` — reject at
    // `values()` to simulate that insert failing partway through.
    let insertCallCount = 0;
    mockTx.insert.mockImplementation(() => {
      insertCallCount += 1;
      if (insertCallCount === 3) {
        return {
          values: jest
            .fn()
            .mockRejectedValue(
              new Error('commissioner role assignment failed'),
            ),
        };
      }
      return mockTx;
    });

    await expect(service.createLeague(baseInput)).rejects.toThrow(
      'commissioner role assignment failed',
    );

    // The failure must surface as a rejected `db.transaction()` call (which
    // is how Postgres/Drizzle triggers a full rollback of the league, teams,
    // and any other work performed on `tx`) rather than being caught and
    // turned into a partial success.
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    // Steps after the failing insert (roster positions, draft, scoring
    // profile) must never run — proving the failure aborts the whole unit
    // of work instead of continuing to build a half-created league.
    expect(insertCallCount).toBe(3);
    // Nothing was ever written outside the (now rolled-back) transaction.
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('propagates a league-limit failure (thrown before any insert) with no writes at all', async () => {
    mockTx.where.mockResolvedValueOnce([{ existingCount: 5 }]);

    await expect(
      service.createLeague({ ...baseInput, leagueLimit: 5 }),
    ).rejects.toThrow('LEAGUE_LIMIT_EXCEEDED');

    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe('LeagueService.createLeague — idempotent resubmission (LS-6063)', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: LeagueService;
  let mockTx: MockTx & { limit: jest.Mock };
  let mockDb: MockDb;

  const baseInput = {
    name: 'Test League',
    ownerId: 1,
    ownerUsername: 'owner',
    leagueLimit: 3,
    idempotencyKey: 'client-generated-key-abc',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeagueService(options);

    mockTx = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 1 }]),
      limit: jest.fn(),
    };

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      transaction: jest.fn((cb: (tx: MockTx) => Promise<unknown>) =>
        cb(mockTx),
      ),
    };

    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler(mockDb as never),
    );
  });

  it('returns the already-created league instead of inserting a duplicate when a resubmission matches an existing idempotency key', async () => {
    // Query order for a resubmission: (1) existingLeague lookup — `.where().limit(1)`,
    // (2) existingTeams lookup — `.where()` awaited directly, (3) existingOwnerMember
    // lookup — `.where().limit(1)`.
    mockTx.where
      .mockImplementationOnce(() => ({
        limit: jest.fn().mockResolvedValue([{ id: 100, name: 'Test League' }]),
      }))
      .mockImplementationOnce(() =>
        Promise.resolve([{ id: 200, leagueId: 100, name: 'Team 1' }]),
      )
      .mockImplementationOnce(() => ({
        limit: jest
          .fn()
          .mockResolvedValue([
            { leagueId: 100, userId: 1, teamId: 200, permissionLevel: 'owner' },
          ]),
      }));

    const result = await service.createLeague(baseInput);

    expect(result.league).toEqual(
      expect.objectContaining({ id: 100, name: 'Test League' }),
    );
    expect(result.teams).toEqual([
      expect.objectContaining({ id: 200, leagueId: 100 }),
    ]);
    expect(result.leagueMembers).toEqual([
      expect.objectContaining({ leagueId: 100, userId: 1, teamId: 200 }),
    ]);
    // No new league/team/membership rows were inserted — the resubmission
    // reused the result of the original attempt instead of creating a
    // duplicate league.
    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('falls through to the normal create flow when the idempotency key has no matching league', async () => {
    mockTx.where
      .mockImplementationOnce(() => ({
        limit: jest.fn().mockResolvedValue([]),
      })) // no existing league for this key
      .mockResolvedValueOnce([{ existingCount: 0 }]); // league-limit count check

    mockTx.returning
      .mockResolvedValueOnce([{ id: 101 }]) // league insert
      .mockResolvedValueOnce([{ id: 201 }]) // team insert(s)
      .mockResolvedValueOnce([{ id: 301 }]); // scoring profile insert

    await service.createLeague(baseInput);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.insert).toHaveBeenCalledTimes(6);
  });
});
