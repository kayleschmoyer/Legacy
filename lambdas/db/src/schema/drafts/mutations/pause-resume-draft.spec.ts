/**
 * Unit tests for pauseDraft + resumeDraft resolvers (LS-8098)
 *
 * Focus: the wrong-status guards must throw a client-facing BAD_USER_INPUT
 * error (so the GraphQL handler excludes them from Rollbar) rather than a raw
 * `new Error(...)` that surfaces as an unexpected server fault.
 *
 * Test list:
 *   1. resumeDraft UNAUTHENTICATED guard — ctx.user = null
 *   2. resumeDraft FORBIDDEN guard — caller is not a commissioner
 *   3. resumeDraft BAD_USER_INPUT guard — draftStatus !== 'paused' (the reported bug)
 *   4. pauseDraft BAD_USER_INPUT guard — draftStatus !== 'in-progress'
 *   5. resumeDraft BAD_USER_INPUT guard — league not found
 *   6. pauseDraft BAD_USER_INPUT guard — league not found
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Resolver = (...args: unknown[]) => Promise<unknown>;

const writeAuditLog = jest.fn().mockResolvedValue(undefined);

// Load the module with its builder + db-client dependencies mocked and return
// the captured GraphQL resolver functions keyed by mutation name.
function capturePauseResumeResolvers(): Record<string, Resolver> {
  jest.resetModules();
  writeAuditLog.mockClear();
  const captured: Record<string, Resolver> = {};

  jest.doMock('../../builder', () => ({
    builder: {
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: Resolver }) => {
            captured[name] = opts.resolve;
          },
          arg: { int: () => ({}) },
        });
      }),
    },
  }));

  jest.doMock('../../commissioner-tools', () => ({ writeAuditLog }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      leagueMembers: {
        leagueId: 'leagueId',
        userId: 'userId',
        permissionLevel: 'permissionLevel',
      },
      leagues: { id: 'id' },
      drafts: { leagueId: 'leagueId', id: 'id', createdAt: 'createdAt' },
    },
  }));

  jest.doMock('../types', () => ({ Draft: {} }));

  require('./pause-resume-draft');

  if (!captured.pauseDraft || !captured.resumeDraft) {
    throw new Error('pauseDraft/resumeDraft resolvers were not captured');
  }
  return captured;
}

/**
 * Build a context.db whose chained select().from().where().limit() calls resolve
 * the provided rows in order. Each entry is the array returned by one `.limit(1)`.
 */
function makeDb(limitResults: unknown[][]): { db: unknown } {
  const limit = jest.fn();
  for (const rows of limitResults) {
    limit.mockResolvedValueOnce(rows);
  }
  const db = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit,
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
  return { db };
}

describe('resumeDraft resolver', () => {
  it('throws UNAUTHENTICATED when ctx.user is null', async () => {
    const { resumeDraft } = capturePauseResumeResolvers();
    const ctx = { user: null, db: {} };
    await expect(
      resumeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('throws FORBIDDEN when the caller is not a commissioner', async () => {
    const { resumeDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([[{ permissionLevel: 'member' }]]); // membership lookup
    const ctx = { user: { id: 99 }, db };
    await expect(
      resumeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('throws BAD_USER_INPUT (not a raw server error) when the draft is not paused', async () => {
    const { resumeDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [{ id: 1, draftStatus: 'not-started' }], // league lookup
    ]);
    const ctx = { user: { id: 99 }, db };
    await expect(
      resumeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: "Cannot resume draft: current status is 'not-started'",
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('throws BAD_USER_INPUT (not a raw server error) when the league does not exist', async () => {
    const { resumeDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [], // league lookup — empty = not found
    ]);
    const ctx = { user: { id: 99 }, db };
    await expect(
      resumeDraft({}, { leagueId: 999 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'League not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('writes a resume_draft row to commissioner_audit_log on success', async () => {
    const { resumeDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [{ id: 1, draftStatus: 'paused' }], // league lookup
      [{ id: 5, leagueId: 1, pickTimeLimitSeconds: 120 }], // draft lookup
    ]);
    const ctx = { user: { id: 99 }, db };
    await resumeDraft({}, { leagueId: 1 }, ctx, undefined);

    expect(writeAuditLog).toHaveBeenCalledWith(db, {
      leagueId: 1,
      userId: 99,
      action: 'resume_draft',
      targetType: 'draft',
      targetId: 5,
      details: { previousStatus: 'paused' },
    });
  });
});

describe('pauseDraft resolver', () => {
  it('throws BAD_USER_INPUT (not a raw server error) when the draft is not in-progress', async () => {
    const { pauseDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [{ id: 1, draftStatus: 'not-started' }], // league lookup
    ]);
    const ctx = { user: { id: 99 }, db };
    await expect(
      pauseDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: "Cannot pause draft: current status is 'not-started'",
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('throws BAD_USER_INPUT (not a raw server error) when the league does not exist', async () => {
    const { pauseDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [], // league lookup — empty = not found
    ]);
    const ctx = { user: { id: 99 }, db };
    await expect(
      pauseDraft({}, { leagueId: 999 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'League not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('writes a pause_draft row to commissioner_audit_log on success', async () => {
    const { pauseDraft } = capturePauseResumeResolvers();
    const { db } = makeDb([
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [{ id: 1, draftStatus: 'in-progress' }], // league lookup
      [{ id: 5, leagueId: 1 }], // draft lookup
    ]);
    const ctx = { user: { id: 99 }, db };
    await pauseDraft({}, { leagueId: 1 }, ctx, undefined);

    expect(writeAuditLog).toHaveBeenCalledWith(db, {
      leagueId: 1,
      userId: 99,
      action: 'pause_draft',
      targetType: 'draft',
      targetId: 5,
      details: { previousStatus: 'in-progress' },
    });
  });
});

export {};
