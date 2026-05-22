/**
 * Unit tests for `claimUnassignedTeamForUser` (LS-2497).
 *
 * The helper is the atomic team-claim primitive shared by `joinLeagueByCode`,
 * `joinLeague`, and `joinPublicLeague`. Before LS-2497 the three mutations
 * each ran an unlocked `SELECT … LEFT JOIN league_members … WHERE
 * lm.user_id IS NULL LIMIT 1` followed by a separate `UPDATE teams` and
 * `INSERT INTO league_members`, allowing two concurrent joiners to read the
 * same team as unassigned and both claim it. The helper now wraps the whole
 * find-and-claim flow in a `db.transaction(...)` and locks the candidate
 * team row with `SELECT ... FOR UPDATE OF t SKIP LOCKED`, plus a defensive
 * re-verification against `league_members` inside the transaction.
 *
 * These tests mock the transaction handle to exercise the three branches:
 *   1. Successful claim — locked row, no existing membership → update + insert.
 *   2. Full league — no unlocked candidate row → return { fullLeague: true }.
 *   3. Race detected — locked row but membership already exists (a concurrent
 *      transaction committed first) → return { fullLeague: true }, no writes.
 */

import { claimUnassignedTeamForUser } from './mutations';

type ExecuteResult = { rows: Array<{ id: number }> };

interface MockTx {
  execute: jest.Mock<Promise<ExecuteResult>, [unknown]>;
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
}

function makeTx(opts: {
  candidateId: number | null;
  existingMembership: boolean;
}): MockTx {
  const tx: MockTx = {
    execute: jest.fn().mockResolvedValue({
      rows: opts.candidateId === null ? [] : [{ id: opts.candidateId }],
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockResolvedValue(opts.existingMembership ? [{ userId: 99 }] : []),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    }),
  };
  return tx;
}

function makeDb(tx: MockTx) {
  return {
    transaction: jest.fn((cb: (tx: MockTx) => Promise<unknown>) => cb(tx)),
  } as unknown as Parameters<typeof claimUnassignedTeamForUser>[0];
}

describe('claimUnassignedTeamForUser (LS-2497)', () => {
  const params = {
    leagueId: 100,
    userId: 7,
    teamName: 'Sluggers',
    permissionLevel: 'general_manager' as const,
  };

  it('locks the candidate team row, updates its name, and inserts the membership', async () => {
    const tx = makeTx({ candidateId: 42, existingMembership: false });
    const db = makeDb(tx);

    const result = await claimUnassignedTeamForUser(db, params);

    expect(result).toEqual({ teamId: 42 });

    // The lock query must include FOR UPDATE OF t SKIP LOCKED — that's the
    // atomicity guarantee. We don't introspect the parameter binding here
    // because drizzle's sql tagged template returns an opaque object; we
    // assert via the raw query string captured by the execute mock instead.
    const sqlArg = tx.execute.mock.calls[0][0] as { queryChunks?: unknown[] };
    const stringified = JSON.stringify(sqlArg);
    expect(stringified).toMatch(/FOR UPDATE OF t SKIP LOCKED/);
    expect(stringified).toMatch(/lm\.user_id IS NULL/);

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('returns { fullLeague: true } when no unlocked candidate row is available', async () => {
    const tx = makeTx({ candidateId: null, existingMembership: false });
    const db = makeDb(tx);

    const result = await claimUnassignedTeamForUser(db, params);

    expect(result).toEqual({ fullLeague: true });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('returns { fullLeague: true } without writing when re-verification finds an existing membership', async () => {
    // Simulates the race where a concurrent transaction committed an INSERT
    // into league_members for the same team after our LEFT JOIN snapshot was
    // taken but before the row lock was acquired. The defensive re-check
    // against league_members inside the transaction catches it.
    const tx = makeTx({ candidateId: 42, existingMembership: true });
    const db = makeDb(tx);

    const result = await claimUnassignedTeamForUser(db, params);

    expect(result).toEqual({ fullLeague: true });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
