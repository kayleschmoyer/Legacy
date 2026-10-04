/**
 * Unit tests for getNextMockDraftSlotAt (LS-10455).
 *
 * The free-tier mock-draft usage query surfaces when the next free slot opens
 * so the UI can show a reset time instead of a bare "0 Drafts Left". The slot
 * opens when enough counted drafts age out of the 7-day window for
 * `remaining` to rise by one.
 */

import type { PublicDb } from '@legacy-sports/db-client';
import { getNextMockDraftSlotAt, MOCK_DRAFT_WINDOW_MS } from './helpers';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function makeDb(rows: { createdAt: Date }[]) {
  const offset = jest.fn(() => ({
    limit: jest.fn(() => Promise.resolve(rows)),
  }));
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({ offset })),
        })),
      })),
    })),
  };
  return { db: db as unknown as PublicDb, select: db.select, offset };
}

describe('getNextMockDraftSlotAt (LS-10455)', () => {
  const createdAt = new Date('2026-10-02T15:30:00.000Z');

  it('returns null without querying when nothing is counted', async () => {
    const { db, select } = makeDb([]);
    await expect(getNextMockDraftSlotAt(db, 7, 0, 2)).resolves.toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('uses the oldest counted draft below the cap', async () => {
    const { db, offset } = makeDb([{ createdAt }]);
    const result = await getNextMockDraftSlotAt(db, 7, 1, 2);
    expect(offset).toHaveBeenCalledWith(0);
    expect(result?.getTime()).toBe(createdAt.getTime() + MOCK_DRAFT_WINDOW_MS);
  });

  it('uses the oldest counted draft exactly at the cap', async () => {
    const { db, offset } = makeDb([{ createdAt }]);
    await getNextMockDraftSlotAt(db, 7, 2, 2);
    expect(offset).toHaveBeenCalledWith(0);
  });

  it('skips drafts that must age out before a slot frees when over the cap', async () => {
    // used=4, limit=2: the two oldest aging out only gets back to the cap; the
    // third-oldest (offset 2) is the one that frees a slot.
    const { db, offset } = makeDb([{ createdAt }]);
    await getNextMockDraftSlotAt(db, 7, 4, 2);
    expect(offset).toHaveBeenCalledWith(2);
  });

  it('returns null when the row aged out between count and lookup', async () => {
    const { db } = makeDb([]);
    await expect(getNextMockDraftSlotAt(db, 7, 1, 2)).resolves.toBeNull();
  });
});
