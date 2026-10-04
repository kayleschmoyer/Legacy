import type { GraphQLError } from 'graphql';

import {
  assertRosterNotOverLimit,
  computeRosterLimitStatus,
  getRosterLimitStatus,
} from './roster-service';

/** Minimal drizzle chain: select().from().where() resolves to a count row. */
function mockDbWithRosterSize(total: number) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([{ total }]),
  };
  return chain as unknown as Parameters<typeof getRosterLimitStatus>[0];
}

describe('computeRosterLimitStatus (LS-10477)', () => {
  it.each([
    [25, 26, false, 0],
    [26, 26, false, 0],
    [27, 26, true, 1],
    [28, 26, true, 2],
  ])(
    'roster %i / limit %i → isOverLimit=%s, playersToRelease=%i',
    (rosterSize, maxRosterSize, isOverLimit, playersToRelease) => {
      expect(computeRosterLimitStatus(rosterSize, maxRosterSize)).toEqual({
        rosterSize,
        maxRosterSize,
        isOverLimit,
        playersToRelease,
      });
    },
  );
});

describe('getRosterLimitStatus (LS-10477)', () => {
  it('counts the roster and compares it to the limit', async () => {
    const status = await getRosterLimitStatus(
      mockDbWithRosterSize(28),
      1,
      10,
      26,
    );
    expect(status).toMatchObject({ isOverLimit: true, playersToRelease: 2 });
  });
});

describe('assertRosterNotOverLimit (LS-10477)', () => {
  const base = { teamId: 1, leagueId: 10, maxRosterSize: 26 };

  it('allows any move for a team at the limit (capacity checks stay with callers)', async () => {
    await expect(
      assertRosterNotOverLimit(mockDbWithRosterSize(26), {
        ...base,
        netChange: 2,
      }),
    ).resolves.toBeUndefined();
  });

  it('blocks an add for a team over the limit with ROSTER_OVER_LIMIT', async () => {
    const err = await assertRosterNotOverLimit(mockDbWithRosterSize(28), {
      ...base,
      netChange: 1,
    }).catch((e: GraphQLError) => e);
    expect(err).toMatchObject({
      extensions: {
        code: 'ROSTER_OVER_LIMIT',
        teamId: 1,
        rosterSize: 28,
        maxRosterSize: 26,
        playersToRelease: 2,
      },
    });
    expect((err as GraphQLError).message).toContain('Release 2 players');
  });

  it('blocks a net-zero move (add/drop or even trade) that keeps the team over', async () => {
    await expect(
      assertRosterNotOverLimit(mockDbWithRosterSize(27), {
        ...base,
        netChange: 0,
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ROSTER_OVER_LIMIT' } });
  });

  it('blocks a trade that reduces the roster but still leaves the team over', async () => {
    await expect(
      assertRosterNotOverLimit(mockDbWithRosterSize(28), {
        ...base,
        netChange: -1,
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ROSTER_OVER_LIMIT' } });
  });

  it('allows a trade that brings an over-limit team back to the limit', async () => {
    await expect(
      assertRosterNotOverLimit(mockDbWithRosterSize(28), {
        ...base,
        netChange: -2,
      }),
    ).resolves.toBeUndefined();
  });

  it('names the other team when the locked team is not the caller', async () => {
    await expect(
      assertRosterNotOverLimit(mockDbWithRosterSize(27), {
        ...base,
        isOwnTeam: false,
        teamName: 'Team Alpha',
      }),
    ).rejects.toThrow(/Team Alpha has 27 players.*must release 1 player/);
  });
});
