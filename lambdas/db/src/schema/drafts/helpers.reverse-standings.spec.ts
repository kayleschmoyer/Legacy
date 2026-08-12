/**
 * Unit tests for resolveReverseStandingsSeedOrder (LS-8929) — the round-1
 * team-order resolver for a keeper league's "Reverse Standings" draft.
 */

import { calculateStandings } from '@legacy-sports/db-client';
import { resolveReverseStandingsSeedOrder } from './helpers';

jest.mock('@legacy-sports/db-client', () => ({
  ...jest.requireActual('@legacy-sports/db-client'),
  calculateStandings: jest.fn(),
}));

const mockCalculateStandings = calculateStandings as jest.Mock;

/** Fake db whose select().from().where().orderBy() resolves `previousTeams`. */
function makeDb(previousTeams: { id: number }[]) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(previousTeams),
        }),
      }),
    }),
  } as unknown as Parameters<typeof resolveReverseStandingsSeedOrder>[0];
}

describe('resolveReverseStandingsSeedOrder', () => {
  beforeEach(() => {
    mockCalculateStandings.mockReset();
  });

  it('returns null when there is no previous league (inaugural keeper season)', async () => {
    const db = makeDb([]);
    const result = await resolveReverseStandingsSeedOrder(db, {
      previousLeagueId: null,
      teams: [{ id: 10 }, { id: 11 }],
    });
    expect(result).toBeNull();
    expect(mockCalculateStandings).not.toHaveBeenCalled();
  });

  it('returns null when the previous league has no teams', async () => {
    const db = makeDb([]);
    const result = await resolveReverseStandingsSeedOrder(db, {
      previousLeagueId: 5,
      teams: [{ id: 10 }, { id: 11 }],
    });
    expect(result).toBeNull();
  });

  it('returns null when the team counts differ between seasons', async () => {
    const db = makeDb([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = await resolveReverseStandingsSeedOrder(db, {
      previousLeagueId: 5,
      teams: [{ id: 10 }, { id: 11 }],
    });
    expect(result).toBeNull();
  });

  it('returns null when standings are empty (no completed matchups)', async () => {
    const db = makeDb([{ id: 1 }, { id: 2 }]);
    mockCalculateStandings.mockResolvedValue([]);
    const result = await resolveReverseStandingsSeedOrder(db, {
      previousLeagueId: 5,
      teams: [{ id: 10 }, { id: 11 }],
    });
    expect(result).toBeNull();
  });

  it('orders current teams worst-finisher-first using the positional old->new mapping', async () => {
    // Previous season's teams (old ids 1,2,3), sorted ascending -> zipped
    // positionally with this season's teams (new ids 10,11,12).
    const db = makeDb([{ id: 1 }, { id: 2 }, { id: 3 }]);
    // Old team 1 finished 1st (best), old team 2 finished 3rd (worst), old
    // team 3 finished 2nd.
    mockCalculateStandings.mockResolvedValue([
      { teamId: 1, rank: 1 },
      { teamId: 2, rank: 3 },
      { teamId: 3, rank: 2 },
    ]);

    const result = await resolveReverseStandingsSeedOrder(db, {
      previousLeagueId: 5,
      teams: [{ id: 10 }, { id: 11 }, { id: 12 }],
    });

    // old 1 -> new 10, old 2 -> new 11, old 3 -> new 12 (id-ascending zip).
    // Worst-first (rank desc): old 2 (rank 3) -> new 11, old 3 (rank 2) ->
    // new 12, old 1 (rank 1) -> new 10.
    expect(result).toEqual([{ id: 11 }, { id: 12 }, { id: 10 }]);
  });

  it('appends teams with no resolvable previous-season standing last, in id order', async () => {
    const db = makeDb([{ id: 1 }, { id: 2 }, { id: 3 }]);
    // Only 2 of the 3 previous teams have standings rows.
    mockCalculateStandings.mockResolvedValue([
      { teamId: 1, rank: 2 },
      { teamId: 2, rank: 1 },
    ]);

    const result = await resolveReverseStandingsSeedOrder(db, {
      previousLeagueId: 5,
      teams: [{ id: 10 }, { id: 11 }, { id: 12 }],
    });

    // old 1 -> new 10 (rank 2), old 2 -> new 11 (rank 1, worst), old 3 ->
    // new 12 (no standing -> appended last).
    expect(result).toEqual([{ id: 10 }, { id: 11 }, { id: 12 }]);
  });
});
