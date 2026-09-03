/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- test mocks */

import { updateMatchupScore } from './PublicDbClient';

// Drizzle queries are thenables: select().from().where().then(callback).
// This helper makes a chainable mock that passes results to the .then() callback.
function makeSelectChain(rows: any[]): any {
  const chain: any = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    then: jest
      .fn()
      .mockImplementation((cb: (items: any[]) => any) =>
        Promise.resolve(cb(rows)),
      ),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
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
  // `updateChain` is exposed so tests can assert on the .set() payload; it is
  // not part of the Drizzle surface updateMatchupScore uses.
  return { select: sel.select, update: upd.update, updateChain: upd };
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

    expect(db.update).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(result).toBe(updated);
  });

  it('issues an UPDATE and returns the result when both scores are set', async () => {
    const updated = { ...matchupRow, team1Score: '10', team2Score: '8' };
    const db = makeDb(matchupRow, [updated]);

    const result = await updateMatchupScore(db, 1, 10, 8);

    expect(db.update).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
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
