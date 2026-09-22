/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- test mocks */

import { updateMatchupScore } from './PublicDbClient';

// Drizzle queries are thenables: select().from().where().then(callback).
// This helper makes a chainable mock that passes results to the .then() callback.
function makeSelectChain(rows: any[]): any {
  const chain: any = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    for: jest.fn(),
    then: jest
      .fn()
      .mockImplementation((cb: (items: any[]) => any) =>
        Promise.resolve(cb(rows)),
      ),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  return chain;
}

// Shape of the chainable update test double. Typed so callers (and the
// `updateChain` handle exposed by `makeDb`) get a concrete surface instead of
// `any` when asserting on the recorded `.set()` payload.
interface UpdateChain {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  returning: jest.Mock;
}

function makeUpdateChain(returning: any[]): UpdateChain {
  const chain: UpdateChain = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    returning: jest.fn().mockResolvedValue(returning),
  };
  chain.update.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function makeDb(existingRow: any, returning: any[] = []): any {
  const sel = makeSelectChain(existingRow !== undefined ? [existingRow] : []);
  const upd = makeUpdateChain(returning);
  // The row-lock + write both happen inside a transaction (LS-6391); `tx`
  // shares the same select/update mocks as `db` so existing assertions on
  // `db.select`/`db.update`/`updateChain` keep working regardless of which
  // handle the code under test calls through.
  const tx = { select: sel.select, update: upd.update };
  // `updateChain` is exposed so tests can assert on the .set() payload; it is
  // not part of the Drizzle surface updateMatchupScore uses.
  return {
    select: sel.select,
    update: upd.update,
    updateChain: upd,
    transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

const matchupRow = {
  id: 1,
  team1Id: 10,
  team2Id: 20,
  team1Score: null,
  team2Score: null,
  gamesPerMatchup: 5,
  status: 'in_progress',
  leagueId: 1,
  weekNumber: 1,
  startTime: null,
  endTime: null,
  scoreVersion: 0,
};

describe('updateMatchupScore', () => {
  it('returns the existing row without updating when both scores are null', async () => {
    const db = makeDb(matchupRow);

    const result = await updateMatchupScore(db, 1, null, null);

    expect(result).toBe(matchupRow);
    expect(db.select).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns the existing row without updating when scores are undefined', async () => {
    const db = makeDb(matchupRow);

    const result = await updateMatchupScore(db, 1, undefined, undefined);

    expect(result).toBe(matchupRow);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws with matchupId when both scores are null and matchup does not exist', async () => {
    const db = makeDb(undefined);

    await expect(updateMatchupScore(db, 42, null, null)).rejects.toThrow(
      'Matchup 42 not found',
    );
  });

  it('issues an UPDATE and returns the result when team1Score is set', async () => {
    const updated = { ...matchupRow, team1Score: '15' };
    const db = makeDb(matchupRow, [updated]);

    const result = await updateMatchupScore(db, 1, 15, null);

    expect(db.transaction).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
    // The row-lock select (LS-6391) now runs inside the same transaction as
    // the write, so `select` is called even though no caller-visible read
    // happens.
    expect(db.select).toHaveBeenCalled();
    expect(result).toBe(updated);
  });

  it('issues an UPDATE and returns the result when both scores are set', async () => {
    const updated = { ...matchupRow, team1Score: '10', team2Score: '8' };
    const db = makeDb(matchupRow, [updated]);

    const result = await updateMatchupScore(db, 1, 10, 8);

    expect(db.transaction).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
    expect(db.select).toHaveBeenCalled();
    expect(result).toBe(updated);
  });

  it('throws with matchupId when UPDATE returns no rows', async () => {
    const db = makeDb(matchupRow, []);

    await expect(updateMatchupScore(db, 7, 5, 3)).rejects.toThrow(
      'Matchup 7 not found',
    );
  });
});

/**
 * LS-9665 — scoring provenance.
 *
 * updateMatchupScore is the single write site for matchups.team1_score /
 * team2_score on every *scoring* path (baseball stats-lambda, football
 * stats-lambda, game-selection, commissioner recalculate), so stamping here
 * covers both sports without each engine having to remember to.
 */
describe('updateMatchupScore — scored_at stamping', () => {
  // The payload handed to Drizzle's .set(); typed here so the assertions below
  // read real properties rather than `any`.
  const setPayload = (db: {
    updateChain: UpdateChain;
  }): Record<string, unknown> =>
    db.updateChain.set.mock.calls[0][0] as Record<string, unknown>;

  it('stamps scoredAt when team1Score is written', async () => {
    const db = makeDb(matchupRow, [matchupRow]);

    await updateMatchupScore(db, 1, 15, null);

    expect(setPayload(db).scoredAt).toBeInstanceOf(Date);
  });

  it('stamps scoredAt when both scores are written', async () => {
    const db = makeDb(matchupRow, [matchupRow]);

    await updateMatchupScore(db, 1, 10, 8);

    const payload = setPayload(db);
    expect(payload).toMatchObject({ team1Score: '10', team2Score: '8' });
    expect(payload.scoredAt).toBeInstanceOf(Date);
  });

  it('stamps a score of zero — 0 is a computed score, not a missing one', async () => {
    const db = makeDb(matchupRow, [matchupRow]);

    await updateMatchupScore(db, 1, 0, 0);

    const payload = setPayload(db);
    expect(payload).toMatchObject({ team1Score: '0', team2Score: '0' });
    expect(payload.scoredAt).toBeInstanceOf(Date);
  });

  it('does not stamp when nothing is scored', async () => {
    const db = makeDb(matchupRow);

    await updateMatchupScore(db, 1, null, null);

    // No UPDATE at all — a no-op call must not move the provenance timestamp
    // forward and make an old score look freshly computed.
    expect(db.update).not.toHaveBeenCalled();
  });

  it('stamps close to now', async () => {
    const db = makeDb(matchupRow, [matchupRow]);
    const before = Date.now();

    await updateMatchupScore(db, 1, 5, 3);

    const stamped = setPayload(db).scoredAt as Date;
    expect(stamped.getTime()).toBeGreaterThanOrEqual(before);
    expect(stamped.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

/**
 * LS-6391 — row lock + optimistic-concurrency counter.
 *
 * A score write now takes a row lock (`SELECT ... FOR UPDATE`) on the
 * matchup before writing, inside a transaction, and bumps `scoreVersion` in
 * the same write — so every scoring-path writer keeps the counter that
 * `updateMatchupScore`'s admin/system GraphQL mutation uses for its
 * `expectedScoreVersion` optimistic-concurrency check meaningful.
 */
describe('updateMatchupScore — row lock + scoreVersion (LS-6391)', () => {
  const setPayload = (db: {
    updateChain: UpdateChain;
  }): Record<string, unknown> =>
    db.updateChain.set.mock.calls[0][0] as Record<string, unknown>;

  it('takes the row lock and writes inside the same transaction', async () => {
    const db = makeDb(matchupRow, [matchupRow]);

    await updateMatchupScore(db, 1, 15, null);

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('bumps scoreVersion by one on a score write', async () => {
    const db = makeDb({ ...matchupRow, scoreVersion: 4 }, [matchupRow]);

    await updateMatchupScore(db, 1, 15, null);

    expect(setPayload(db).scoreVersion).toBe(5);
  });

  it('throws when the locked row is not found', async () => {
    const db = makeDb(undefined, [matchupRow]);

    await expect(updateMatchupScore(db, 99, 15, null)).rejects.toThrow(
      'Matchup 99 not found',
    );
  });
});
