/**
 * Unit tests for `deleteLeaguesAtomically` (LS-8099).
 *
 * `deleteAllLeagues` previously ran a single
 * `DELETE FROM leagues WHERE id IN (...)`. Each league delete CASCADEs to ~18
 * child tables and the IN-list order is arbitrary, so two concurrent
 * deleteAllLeagues transactions over overlapping league sets could acquire the
 * per-league row locks in different orders and deadlock (Postgres 40P01,
 * Rollbar item 153). The helper now deletes the leagues one at a time in
 * ascending-id order inside a single `db.transaction(...)`, so every concurrent
 * transaction acquires each league's lock set in the same global order and no
 * deadlock cycle can form.
 *
 * These tests mock the transaction handle to assert:
 *   1. The deletes are wrapped in exactly one transaction and issued in
 *      ascending id order regardless of input order.
 *   2. No transaction is opened when there are no leagues to delete.
 */

import { deleteLeaguesAtomically } from './mutations';

interface MockTx {
  delete: jest.Mock;
}

/**
 * drizzle's `eq(column, value)` returns an `SQL` whose `queryChunks` includes
 * the bound value as a `Param` (`{ value }`). We read it straight off the chunk
 * rather than `JSON.stringify`-ing the clause, because the column chunk holds a
 * circular reference back to its table.
 */
function idFromWhereClause(clause: unknown): number {
  const chunks = (clause as { queryChunks?: unknown[] })?.queryChunks ?? [];
  for (const chunk of chunks) {
    if (
      chunk &&
      typeof chunk === 'object' &&
      'value' in chunk &&
      typeof (chunk as { value: unknown }).value === 'number'
    ) {
      return (chunk as { value: number }).value;
    }
  }
  throw new Error('no numeric league id found in delete where clause');
}

function makeTx(deletedIds: number[]): MockTx {
  return {
    delete: jest.fn().mockReturnValue({
      where: jest.fn((clause: unknown) => {
        deletedIds.push(idFromWhereClause(clause));
        return Promise.resolve(undefined);
      }),
    }),
  };
}

function makeDb(tx: MockTx, transaction: jest.Mock) {
  return {
    transaction,
  } as unknown as Parameters<typeof deleteLeaguesAtomically>[0];
}

describe('deleteLeaguesAtomically (LS-8099)', () => {
  it('deletes leagues one at a time in ascending id order inside a single transaction', async () => {
    const deletedIds: number[] = [];
    const tx = makeTx(deletedIds);
    // Mirror the original Rollbar params (5953, 5975, 5969, 5970) — intentionally
    // unsorted to prove the helper imposes a deterministic lock order.
    const input = [5953, 5975, 5969, 5970];
    const transaction = jest.fn((cb: (tx: MockTx) => Promise<unknown>) =>
      cb(tx),
    );

    await deleteLeaguesAtomically(makeDb(tx, transaction), input);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(input.length);
    expect(deletedIds).toEqual([5953, 5969, 5970, 5975]);
    // The caller's array must not be mutated as a side effect.
    expect(input).toEqual([5953, 5975, 5969, 5970]);
  });

  it('is a no-op and opens no transaction when there are no leagues to delete', async () => {
    const deletedIds: number[] = [];
    const tx = makeTx(deletedIds);
    const transaction = jest.fn((cb: (tx: MockTx) => Promise<unknown>) =>
      cb(tx),
    );

    await deleteLeaguesAtomically(makeDb(tx, transaction), []);

    expect(transaction).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(deletedIds).toEqual([]);
  });
});
