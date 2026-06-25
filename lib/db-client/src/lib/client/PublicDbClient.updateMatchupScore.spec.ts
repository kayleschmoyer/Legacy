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

function makeUpdateChain(returning: any[]): any {
  const chain: any = {
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
  return { select: sel.select, update: upd.update };
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
