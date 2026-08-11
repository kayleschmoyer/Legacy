/**
 * Unit tests for resolveDraftTeamsOrder (LS-8742).
 *
 * initializeDraft and autoStartScheduledDrafts previously always deleted and
 * reshuffled draft_teams at draft start, silently discarding any
 * commissioner-approved draft slot trade (LS-8676) seeded before the draft
 * began. This helper decides whether to preserve an existing seeded order or
 * fall back to a fresh shuffle.
 */

import type { PublicDb } from '@legacy-sports/db-client';
import { resolveDraftTeamsOrder } from './helpers';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function makeDb(existingRows: { teamId: number }[]) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => Promise.resolve(existingRows)),
        })),
      })),
    })),
  };
}

function asPublicDb(db: ReturnType<typeof makeDb>): PublicDb {
  return db as unknown as PublicDb;
}

describe('resolveDraftTeamsOrder (LS-8742)', () => {
  it('shuffles and requires insert when no drafts row exists yet (draftId null)', async () => {
    const db = makeDb([]);
    const result = await resolveDraftTeamsOrder(asPublicDb(db), null, [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    expect(result.needsInsert).toBe(true);
    expect([...result.orderedTeamIds].sort()).toEqual([1, 2, 3]);
    // No draftId ⇒ no draft_teams rows can exist yet ⇒ skip the lookup query.
    expect(db.select).not.toHaveBeenCalled();
  });

  it('shuffles and requires insert when no draft_teams rows exist yet', async () => {
    const db = makeDb([]);
    const result = await resolveDraftTeamsOrder(asPublicDb(db), 5, [
      { id: 10 },
      { id: 20 },
    ]);

    expect(result.needsInsert).toBe(true);
    expect([...result.orderedTeamIds].sort()).toEqual([10, 20]);
  });

  it('preserves the existing seeded order from an approved slot trade and skips insert', async () => {
    const db = makeDb([{ teamId: 20 }, { teamId: 10 }]);
    const result = await resolveDraftTeamsOrder(asPublicDb(db), 5, [
      { id: 10 },
      { id: 20 },
    ]);

    expect(result.needsInsert).toBe(false);
    expect(result.orderedTeamIds).toEqual([20, 10]);
  });

  it('reshuffles when the seeded team set no longer matches the league (team added since seeding)', async () => {
    const db = makeDb([{ teamId: 10 }, { teamId: 20 }]);
    const result = await resolveDraftTeamsOrder(asPublicDb(db), 5, [
      { id: 10 },
      { id: 20 },
      { id: 30 },
    ]);

    expect(result.needsInsert).toBe(true);
    expect([...result.orderedTeamIds].sort()).toEqual([10, 20, 30]);
  });

  it('reshuffles when the seeded team set no longer matches the league (team removed since seeding)', async () => {
    const db = makeDb([{ teamId: 10 }, { teamId: 20 }, { teamId: 30 }]);
    const result = await resolveDraftTeamsOrder(asPublicDb(db), 5, [
      { id: 10 },
      { id: 20 },
    ]);

    expect(result.needsInsert).toBe(true);
    expect([...result.orderedTeamIds].sort()).toEqual([10, 20]);
  });
});

export {};
