import type { PublicDb } from '@legacy-sports/db-client';
import { createNoGameDataSlotMarker } from './no-game-data-slots';

function buildDb(
  slotRows: Array<{ matchupPlayerId: number; gameNum: number }>,
) {
  const insertValues = jest.fn().mockResolvedValue(undefined);
  const select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(slotRows),
      }),
    }),
  });
  const db = {
    select,
    insert: jest.fn().mockReturnValue({ values: insertValues }),
  } as unknown as PublicDb;
  return { db, select, insertValues };
}

const slot = (matchupPlayerId: number, gameNum: number) => ({
  gameNum,
  matchupPlayerId,
  gameIdentifier: null,
  gamePosition: null,
  statsLoadingStatus: 'completed',
  noGameDataFound: true,
});

describe('createNoGameDataSlotMarker (LS-10780)', () => {
  it('marks the current game for a player in a fresh matchup', async () => {
    const { db, insertValues } = buildDb([]);
    const mark = createNoGameDataSlotMarker(db, 1, 1, 7);

    await expect(mark(100)).resolves.toEqual([1]);
    expect(insertValues).toHaveBeenCalledWith([slot(100, 1)]);
  });

  it('backfills every game the matchup already played (heals a stuck matchup)', async () => {
    // Teammate 200 has games 1-3; player 100 has none — league 14253's shape,
    // where the week re-queued game 1 forever.
    const { db, insertValues } = buildDb([
      { matchupPlayerId: 200, gameNum: 1 },
      { matchupPlayerId: 200, gameNum: 2 },
      { matchupPlayerId: 200, gameNum: 3 },
    ]);
    const mark = createNoGameDataSlotMarker(db, 1, 1, 7);

    await expect(mark(100)).resolves.toEqual([1, 2, 3]);
    expect(insertValues).toHaveBeenCalledWith([
      slot(100, 1),
      slot(100, 2),
      slot(100, 3),
    ]);
  });

  it('only fills slots the player is missing and never past gamesPerMatchup', async () => {
    const { db, insertValues } = buildDb([
      { matchupPlayerId: 100, gameNum: 1 },
      { matchupPlayerId: 200, gameNum: 9 },
    ]);
    const mark = createNoGameDataSlotMarker(db, 1, 2, 3);

    await expect(mark(100)).resolves.toEqual([2, 3]);
    expect(insertValues).toHaveBeenCalledWith([slot(100, 2), slot(100, 3)]);
  });

  it('inserts nothing when the player already has every slot', async () => {
    const { db, insertValues } = buildDb([
      { matchupPlayerId: 100, gameNum: 1 },
      { matchupPlayerId: 100, gameNum: 2 },
    ]);
    const mark = createNoGameDataSlotMarker(db, 1, 2, 7);

    await expect(mark(100)).resolves.toEqual([]);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('loads the matchup slot rows once for several players', async () => {
    const { db, select } = buildDb([]);
    const mark = createNoGameDataSlotMarker(db, 1, 1, 7);

    await mark(100);
    await mark(101);

    expect(select).toHaveBeenCalledTimes(1);
  });
});
