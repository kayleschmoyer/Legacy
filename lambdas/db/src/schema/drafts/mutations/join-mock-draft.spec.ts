/**
 * Unit tests for joinMockDraft resolver (LS-9181)
 *
 * Test list:
 *   1. UNAUTHENTICATED guard — ctx.user = null → UNAUTHENTICATED
 *   2. BAD_USER_INPUT — invite code doesn't resolve to any league
 *   3. BAD_USER_INPUT — invite code resolves to a real (non-mock) league
 *   4. BAD_USER_INPUT — league draftStatus is not 'not-started'
 *   5. BAD_USER_INPUT — caller is already a member
 *   6. BAD_USER_INPUT — claimUnassignedTeamForUser reports a full league
 *   7. Success — claims a team, no capCheck passed, returns the team
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const claimUnassignedTeamForUser = jest.fn<
  Promise<{ teamId: number } | { fullLeague: true }>,
  [unknown, Record<string, unknown>]
>();

async function captureJoinMockDraftResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  claimUnassignedTeamForUser.mockReset();
  let capturedFn: ((...args: unknown[]) => Promise<unknown>) | undefined;

  jest.doMock('../../builder', () => ({
    builder: {
      mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: {
            resolve: (...args: unknown[]) => Promise<unknown>;
          }) => {
            capturedFn = opts.resolve;
          },
          arg: {
            string: () => ({}),
          },
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/logging', () => ({
    LOGGER: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      leagues: {
        id: 'id',
        isMockDraft: 'isMockDraft',
        draftStatus: 'draftStatus',
        inviteCode: 'inviteCode',
      },
      leagueMembers: { leagueId: 'leagueId', userId: 'userId' },
      teams: {
        id: 'id',
        name: 'name',
        leagueId: 'leagueId',
        divisionId: 'divisionId',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        waiverOrder: 'waiverOrder',
        faabBudget: 'faabBudget',
        logoUrl: 'logoUrl',
        primaryColor: 'primaryColor',
        secondaryColor: 'secondaryColor',
        isLocked: 'isLocked',
        avatarUrl: 'avatarUrl',
        bannerUrl: 'bannerUrl',
      },
      leagueMessages: { leagueId: 'leagueId' },
    },
  }));

  jest.doMock('drizzle-orm', () => ({
    and: jest.fn((...args: unknown[]) => ({ and: args })),
    eq: jest.fn((...args: unknown[]) => ({ eq: args })),
  }));

  jest.doMock('graphql', () => ({
    GraphQLError: class GraphQLError extends Error {
      extensions: { code: string } = { code: 'INTERNAL_SERVER_ERROR' };
    },
  }));

  // Errors constructed via graphql-errors must be `instanceof` the same
  // (mocked) GraphQLError class join-mock-draft.ts checks against in its
  // catch block, or they'd get double-wrapped into a generic Error.
  jest.doMock('../../graphql-errors', () => {
    const {
      GraphQLError: MockedGraphQLError,
    }: { GraphQLError: new (msg: string) => Error } =
      jest.requireMock('graphql');
    return {
      AuthenticationError: jest.fn((msg: string) => {
        const err = new MockedGraphQLError(msg) as Error & {
          extensions: { code: string };
        };
        err.extensions = { code: 'UNAUTHENTICATED' };
        return err;
      }),
      UserInputError: jest.fn((msg: string) => {
        const err = new MockedGraphQLError(msg) as Error & {
          extensions: { code: string };
        };
        err.extensions = { code: 'BAD_USER_INPUT' };
        return err;
      }),
    };
  });

  jest.doMock('../../leagues/mutations', () => ({
    claimUnassignedTeamForUser,
  }));

  jest.doMock('../../leagues/types', () => ({
    Team: 'Team',
  }));

  await import('./join-mock-draft');
  if (!capturedFn) throw new Error('joinMockDraft resolver was not captured');
  return capturedFn;
}

function selectReturning<T>(rows: T[]) {
  return {
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

function makeDb(opts: {
  leagueRows: unknown[];
  membershipRows?: unknown[];
  teamRows?: unknown[];
}) {
  const {
    leagueRows,
    membershipRows = [],
    teamRows = [{ id: 55, leagueId: 1 }],
  } = opts;
  let call = 0;
  return {
    select: jest.fn(() => {
      call += 1;
      if (call === 1) return selectReturning(leagueRows);
      if (call === 2) return selectReturning(membershipRows);
      return selectReturning(teamRows);
    }),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue([{ id: 999, timestamp: null }]),
      })),
    })),
  };
}

const ARGS = { inviteCode: 'abc12xyz', teamName: 'My New Team' };

describe('joinMockDraft UNAUTHENTICATED guard', () => {
  it('throws UNAUTHENTICATED when ctx.user is null', async () => {
    const resolve = await captureJoinMockDraftResolver();
    await expect(
      resolve({}, ARGS, { user: null, db: {} }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

describe('joinMockDraft input validation', () => {
  it('throws BAD_USER_INPUT when the invite code matches no league', async () => {
    const resolve = await captureJoinMockDraftResolver();
    const db = makeDb({ leagueRows: [] });
    await expect(
      resolve({}, ARGS, { user: { id: 1 }, db }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(claimUnassignedTeamForUser).not.toHaveBeenCalled();
  });

  it('throws BAD_USER_INPUT when the invite code resolves to a real (non-mock) league', async () => {
    const resolve = await captureJoinMockDraftResolver();
    const db = makeDb({
      leagueRows: [{ id: 1, isMockDraft: false, draftStatus: 'not-started' }],
    });
    await expect(
      resolve({}, ARGS, { user: { id: 1 }, db }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(claimUnassignedTeamForUser).not.toHaveBeenCalled();
  });

  it('throws BAD_USER_INPUT when the mock draft has already started', async () => {
    const resolve = await captureJoinMockDraftResolver();
    const db = makeDb({
      leagueRows: [{ id: 1, isMockDraft: true, draftStatus: 'in-progress' }],
    });
    await expect(
      resolve({}, ARGS, { user: { id: 1 }, db }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(claimUnassignedTeamForUser).not.toHaveBeenCalled();
  });

  it('throws BAD_USER_INPUT when the caller has already joined', async () => {
    const resolve = await captureJoinMockDraftResolver();
    const db = makeDb({
      leagueRows: [{ id: 1, isMockDraft: true, draftStatus: 'not-started' }],
      membershipRows: [{ userId: 1 }],
    });
    await expect(
      resolve({}, ARGS, { user: { id: 1 }, db }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(claimUnassignedTeamForUser).not.toHaveBeenCalled();
  });

  it('throws BAD_USER_INPUT when claimUnassignedTeamForUser reports a full league', async () => {
    const resolve = await captureJoinMockDraftResolver();
    claimUnassignedTeamForUser.mockResolvedValue({ fullLeague: true });
    const db = makeDb({
      leagueRows: [{ id: 1, isMockDraft: true, draftStatus: 'not-started' }],
    });
    await expect(
      resolve({}, ARGS, { user: { id: 1 }, db }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});

describe('joinMockDraft success', () => {
  it('claims an open team without a capCheck and returns it', async () => {
    const resolve = await captureJoinMockDraftResolver();
    claimUnassignedTeamForUser.mockResolvedValue({ teamId: 55 });
    const db = makeDb({
      leagueRows: [{ id: 1, isMockDraft: true, draftStatus: 'not-started' }],
      teamRows: [{ id: 55, leagueId: 1, name: 'My New Team' }],
    });

    const result = await resolve(
      {},
      ARGS,
      { user: { id: 1, username: 'tester' }, db },
      undefined,
    );

    expect(claimUnassignedTeamForUser).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        leagueId: 1,
        userId: 1,
        teamName: 'My New Team',
        permissionLevel: 'general_manager',
      }),
    );
    // No capCheck should be threaded through — joining is free for the joiner.
    expect(claimUnassignedTeamForUser.mock.calls[0][1]).not.toHaveProperty(
      'capCheck',
    );
    expect(result).toMatchObject({ id: 55, leagueId: 1 });
  });

  it('does not throw when the league chat notification fails (best-effort)', async () => {
    const resolve = await captureJoinMockDraftResolver();
    claimUnassignedTeamForUser.mockResolvedValue({ teamId: 55 });
    const db = makeDb({
      leagueRows: [{ id: 1, isMockDraft: true, draftStatus: 'not-started' }],
      teamRows: [{ id: 55, leagueId: 1, name: 'My New Team' }],
    });

    const notifyLeagueChatMessage = jest
      .fn()
      .mockRejectedValue(new Error('ws down'));

    const result = await resolve(
      {},
      ARGS,
      {
        user: { id: 1, username: 'tester' },
        db,
        notificationService: { notifyLeagueChatMessage },
      },
      undefined,
    );

    expect(result).toMatchObject({ id: 55, leagueId: 1 });
  });
});

export {};
