/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- test mocks use any for chained DB interactions */
import {
  getScoringChangeLogByLeague,
  isScoringStale,
} from './scoring-staleness';

/**
 * LS-9665 AC5 — `scoringIsStale` resolves correctly for: never-scored,
 * scored-then-settings-changed, and scored-with-no-change-since.
 */
describe('isScoringStale', () => {
  const scoredAt = new Date('2026-08-01T12:00:00.000Z');
  const before = new Date('2026-07-01T12:00:00.000Z');
  const after = new Date('2026-08-02T12:00:00.000Z');

  describe('never scored', () => {
    it('is null when the matchup has no persisted score', () => {
      expect(
        isScoringStale({
          scoredAt: null,
          lastScoringChangeAt: after,
          hasPersistedScore: false,
        }),
      ).toBeNull();
    });

    it('is null even when the league has never changed its scoring', () => {
      expect(
        isScoringStale({
          scoredAt: null,
          lastScoringChangeAt: null,
          hasPersistedScore: false,
        }),
      ).toBeNull();
    });
  });

  describe('scored then settings changed', () => {
    it('is true when the scoring profile changed after the score was computed', () => {
      expect(
        isScoringStale({
          scoredAt,
          lastScoringChangeAt: after,
          hasPersistedScore: true,
        }),
      ).toBe(true);
    });
  });

  describe('scored with no change since', () => {
    it('is false when the scoring profile changed before the score was computed', () => {
      expect(
        isScoringStale({
          scoredAt,
          lastScoringChangeAt: before,
          hasPersistedScore: true,
        }),
      ).toBe(false);
    });

    it('is false when the league has never changed its scoring', () => {
      expect(
        isScoringStale({
          scoredAt,
          lastScoringChangeAt: null,
          hasPersistedScore: true,
        }),
      ).toBe(false);
    });

    it('is false when a change lands on exactly the same instant as the score', () => {
      // Only a change strictly newer than the score invalidates it — a change
      // written in the same transaction-visible instant did not precede it.
      expect(
        isScoringStale({
          scoredAt,
          lastScoringChangeAt: new Date(scoredAt.getTime()),
          hasPersistedScore: true,
        }),
      ).toBe(false);
    });
  });

  describe('scored before provenance existed', () => {
    // The pre-LS-9665 population: a persisted score with no scored_at, because
    // the column did not exist when it was written. Deliberately NOT backfilled
    // from updated_at (AC7) — LS-9668's one-time rescore stamps these exactly.
    it('is true when a score exists but was never stamped', () => {
      expect(
        isScoringStale({
          scoredAt: null,
          lastScoringChangeAt: null,
          hasPersistedScore: true,
        }),
      ).toBe(true);
    });

    it('is true when only one of the two team scores is persisted', () => {
      expect(
        isScoringStale({
          scoredAt: null,
          lastScoringChangeAt: before,
          hasPersistedScore: true,
        }),
      ).toBe(true);
    });
  });

  describe('input shapes', () => {
    it('accepts ISO strings as well as Dates', () => {
      expect(
        isScoringStale({
          scoredAt: scoredAt.toISOString(),
          lastScoringChangeAt: after.toISOString(),
          hasPersistedScore: true,
        }),
      ).toBe(true);
    });

    it('treats an unparseable scored_at as unstamped rather than fresh', () => {
      expect(
        isScoringStale({
          scoredAt: 'not-a-date',
          lastScoringChangeAt: null,
          hasPersistedScore: true,
        }),
      ).toBe(true);
    });

    it('treats an unparseable change timestamp as no change', () => {
      expect(
        isScoringStale({
          scoredAt,
          lastScoringChangeAt: 'not-a-date',
          hasPersistedScore: true,
        }),
      ).toBe(false);
    });

    it('treats undefined the same as null', () => {
      expect(
        isScoringStale({
          scoredAt: undefined,
          lastScoringChangeAt: undefined,
          hasPersistedScore: true,
        }),
      ).toBe(true);
    });
  });
});

/**
 * LS-9667 — `getScoringChangeLogByLeague` backs the stale-scoring
 * indicator's "what changed and when" interaction.
 */
describe('getScoringChangeLogByLeague', () => {
  function createMockDb(rows: any[]): any {
    const chain: any = {
      select: jest.fn(),
      from: jest.fn(),
      innerJoin: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(() => Promise.resolve(rows)),
    };
    chain.select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  }

  it('returns an empty array for a league with no changes', async () => {
    const db = createMockDb([]);
    const result = await getScoringChangeLogByLeague(db, [7]);
    expect(result.get(7)).toEqual([]);
  });

  it('returns an empty map for an empty league list without querying', async () => {
    const db = createMockDb([]);
    const result = await getScoringChangeLogByLeague(db, []);
    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('maps rows to display-ready entries, grouped by league', async () => {
    const db = createMockDb([
      {
        leagueId: 7,
        statDisplayName: 'Home Run',
        previousMultiplier: '2.500',
        newMultiplier: '4.000',
        changedAt: new Date('2026-08-02T00:00:00.000Z'),
        changedByUsername: 'commish_alice',
      },
      {
        leagueId: 7,
        statDisplayName: 'Strikeout',
        previousMultiplier: null,
        newMultiplier: '1.000',
        changedAt: new Date('2026-08-01T00:00:00.000Z'),
        changedByUsername: null,
      },
    ]);

    const result = await getScoringChangeLogByLeague(db, [7]);

    expect(result.get(7)).toEqual([
      {
        statDisplayName: 'Home Run',
        previousMultiplier: 2.5,
        newMultiplier: 4,
        changedAt: new Date('2026-08-02T00:00:00.000Z'),
        changedByUsername: 'commish_alice',
      },
      {
        statDisplayName: 'Strikeout',
        previousMultiplier: null,
        newMultiplier: 1,
        changedAt: new Date('2026-08-01T00:00:00.000Z'),
        changedByUsername: null,
      },
    ]);
  });

  it('skips a row with an unparseable changedAt rather than throwing', async () => {
    const db = createMockDb([
      {
        leagueId: 7,
        statDisplayName: 'Home Run',
        previousMultiplier: '2.500',
        newMultiplier: '4.000',
        changedAt: 'not-a-date',
        changedByUsername: null,
      },
    ]);

    const result = await getScoringChangeLogByLeague(db, [7]);
    expect(result.get(7)).toEqual([]);
  });
});
