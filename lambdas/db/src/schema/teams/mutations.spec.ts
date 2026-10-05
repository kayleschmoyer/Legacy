/**
 * Resolver-level tests for the `renameTeam` mutation's server-side name
 * sanitization (LS-6039 — meta-tag XSS vector: team.name was interpolated
 * into the <title>/<meta> tags via PageMeta with no validation against
 * angle brackets or control characters).
 *
 * Mirrors the isolated-resolver-capture pattern used by
 * matchups/recap-entitlement.resolver.spec.ts — mocks `../builder` to
 * capture each mutation's `resolve` fn directly, rather than building the
 * full aggregate GraphQL schema (`../schema`), which pulls in every domain
 * (including unrelated, currently-broken football stat expressions) just to
 * exercise one resolver.
 */

type Resolver = (...args: unknown[]) => Promise<unknown>;

const LOGGER = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/** Capture the teams-domain mutation resolvers (incl. `renameTeam`). */
async function captureTeamMutationResolvers(): Promise<
  Record<string, Resolver>
> {
  jest.resetModules();
  const captured: Record<string, { resolve?: Resolver }> = {};

  // `t.arg.<type>(cfg)` stub used while building the `args` object literal —
  // its return value is never inspected, only `t.field(opts)` matters.
  const argStub = new Proxy({}, { get: () => (cfg: unknown) => cfg });
  const tStub = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'arg') return argStub;
        return (cfg: unknown) => cfg; // t.field(opts) => opts
      },
    },
  );

  jest.doMock('../builder', () => ({
    builder: {
      mutationField: (name: string, fn: (t: unknown) => unknown) => {
        captured[name] = fn(tStub) as { resolve?: Resolver };
      },
    },
  }));

  jest.doMock('@legacy-sports/logging', () => ({ LOGGER }));

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      PublicSchema: {
        teams: {
          id: 'id',
          leagueId: 'leagueId',
          name: 'name',
          divisionId: 'divisionId',
          waiverOrder: 'waiverOrder',
          faabBudget: 'faabBudget',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
          logoUrl: 'logoUrl',
          primaryColor: 'primaryColor',
          secondaryColor: 'secondaryColor',
          isLocked: 'isLocked',
          avatarUrl: 'avatarUrl',
          bannerUrl: 'bannerUrl',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        leagueMessages: { id: 'id', leagueId: 'leagueId' },
      },
    }),
  );

  jest.doMock('../leagues/types', () => ({
    Team: {},
    TeamMember: {},
    LeagueMember: {},
  }));

  await import('./mutations');
  const resolvers: Record<string, Resolver> = {};
  for (const [name, opts] of Object.entries(captured)) {
    if (opts.resolve) resolvers[name] = opts.resolve;
  }
  return resolvers;
}

interface MockDb {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  returning: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
}

interface MockContext {
  user: { id: number; username: string };
  db: MockDb;
}

describe('renameTeam mutation — server-side name sanitization (LS-6039)', () => {
  let mockDb: MockDb;
  let mockContext: MockContext;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
    };

    mockContext = {
      user: { id: 1, username: 'gm-user' },
      db: mockDb,
    };
  });

  async function resolve(newName: string) {
    const resolvers = await captureTeamMutationResolvers();
    const renameTeam = resolvers.renameTeam;
    if (!renameTeam) {
      throw new Error('renameTeam resolver was not captured');
    }
    return renameTeam(
      {},
      { teamId: 1, leagueId: 1, newName },
      mockContext,
      undefined,
    );
  }

  it('throws UNAUTHENTICATED when user is null', async () => {
    const resolvers = await captureTeamMutationResolvers();
    const renameTeam = resolvers.renameTeam;
    if (!renameTeam) {
      throw new Error('renameTeam resolver was not captured');
    }

    await expect(
      renameTeam(
        {},
        { teamId: 1, leagueId: 1, newName: 'Anything' },
        { user: null, db: mockDb },
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects a name containing HTML/script tags (BTD-016 repro)', async () => {
    await expect(resolve('</title><script>alert(1)</script>')).rejects.toThrow(
      'Team name cannot contain HTML tags',
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects a name containing an img tag with an event handler', async () => {
    await expect(resolve('<img src=x onerror=alert(1)>')).rejects.toThrow(
      'Team name cannot contain HTML tags',
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('strips control characters, zero-width characters, and bidi overrides before validating length', async () => {
    // Only invisible/control characters — sanitizes to an empty string.
    await expect(resolve('​​​')).rejects.toThrow('Team name cannot be empty');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects a sanitized name over 40 characters', async () => {
    await expect(resolve('A'.repeat(41))).rejects.toThrow(
      'Team name cannot exceed 40 characters',
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('allows a normal team name and persists the sanitized value unchanged', async () => {
    mockDb.limit
      .mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'general_manager' },
      ])
      .mockResolvedValueOnce([{ name: 'Old Name' }]);
    mockDb.returning.mockResolvedValueOnce([
      {
        id: 1,
        name: "Bobby's Dynasty Team",
        leagueId: 1,
        divisionId: null,
        waiverOrder: 0,
        faabBudget: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        logoUrl: null,
        primaryColor: null,
        secondaryColor: null,
        isLocked: false,
        avatarUrl: null,
        bannerUrl: null,
      },
    ]);

    const result = await resolve("Bobby's Dynasty Team");

    expect(result).toMatchObject({ name: "Bobby's Dynasty Team" });
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bobby's Dynasty Team" }),
    );
  });
});

/**
 * Resolver-level authorization tests for `updateTeamBranding` (LS-9735).
 *
 * `updateTeamBranding` predates the shared `authorized()` /
 * `verifyTeamEditAccess()` wrapper used by the other roster mutations in this
 * file — it re-implements its own GM/commissioner ownership check inline.
 * That check exists in the code already, but had no test proving a
 * non-owner's mutation attempt is actually rejected server-side regardless
 * of what the client sends (the client-side `isOwner` gate in
 * `apps/app/.../football/team/[teamId].tsx` is UI-only and trivially
 * bypassable by calling the GraphQL mutation directly).
 *
 * Also verifies the "owner" nuance documented for this codebase: a team's
 * `general_manager` counts as its owner (see `isTeamGeneralManager` /
 * `isCommissionerOrOwner` in `../authorization`), and a league
 * `commissioner` may edit any team's branding, but an `assistant_manager` —
 * even of the target team itself — is deliberately NOT granted branding
 * access (unlike roster/lineup edits, which opt assistant managers in via
 * `allowAssistantManager`).
 */
describe('updateTeamBranding mutation — server-side ownership check (LS-9735)', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
    };
  });

  async function resolveBranding(
    user: { id: number; username: string } | null,
    overrides: Partial<{
      teamId: number;
      leagueId: number;
      logoUrl: string;
      primaryColor: string;
      secondaryColor: string;
      avatarUrl: string;
      bannerUrl: string;
    }> = {},
  ) {
    const resolvers = await captureTeamMutationResolvers();
    const updateTeamBranding = resolvers.updateTeamBranding;
    if (!updateTeamBranding) {
      throw new Error('updateTeamBranding resolver was not captured');
    }
    return updateTeamBranding(
      {},
      { teamId: 1, leagueId: 1, ...overrides },
      { user, db: mockDb },
      undefined,
    );
  }

  it('throws UNAUTHENTICATED when there is no authenticated user', async () => {
    await expect(
      resolveBranding(null, { logoUrl: 'https://example.com/logo.png' }),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects a caller who is not a member of the league', async () => {
    mockDb.limit.mockResolvedValueOnce([]); // no leagueMembers row

    await expect(
      resolveBranding(
        { id: 999, username: 'outsider' },
        { logoUrl: 'https://example.com/logo.png' },
      ),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects a general_manager of a DIFFERENT team in the same league (not the target team's owner)", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { teamId: 2, permissionLevel: 'general_manager' }, // owns team 2, not team 1
    ]);

    await expect(
      resolveBranding(
        { id: 42, username: 'other-gm' },
        { logoUrl: 'https://example.com/logo.png' },
      ),
    ).rejects.toMatchObject({
      message: 'Only the team General Manager can update team branding',
      extensions: { code: 'FORBIDDEN' },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('rejects an assistant_manager of the target team itself (no assistant-manager fallback for branding)', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { teamId: 1, permissionLevel: 'assistant_manager' },
    ]);

    await expect(
      resolveBranding(
        { id: 7, username: 'assistant' },
        { logoUrl: 'https://example.com/logo.png' },
      ),
    ).rejects.toMatchObject({
      message: 'Only the team General Manager can update team branding',
      extensions: { code: 'FORBIDDEN' },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("allows the target team's general_manager (owner) to update branding", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { teamId: 1, permissionLevel: 'general_manager' },
    ]);
    mockDb.returning.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Team One',
        leagueId: 1,
        divisionId: null,
        waiverOrder: 0,
        faabBudget: 0,
        isLocked: false,
        logoUrl: 'https://example.com/logo.png',
        primaryColor: null,
        secondaryColor: null,
        avatarUrl: null,
        bannerUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await resolveBranding(
      { id: 1, username: 'owner-gm' },
      { logoUrl: 'https://example.com/logo.png' },
    );

    expect(result).toMatchObject({ logoUrl: 'https://example.com/logo.png' });
  });

  it('allows a commissioner to update branding for a team they do not personally own', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { teamId: 2, permissionLevel: 'commissioner' }, // commissioner's own team is team 2
    ]);
    mockDb.returning.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Team One',
        leagueId: 1,
        divisionId: null,
        waiverOrder: 0,
        faabBudget: 0,
        isLocked: false,
        logoUrl: 'https://example.com/logo.png',
        primaryColor: null,
        secondaryColor: null,
        avatarUrl: null,
        bannerUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await resolveBranding(
      { id: 5, username: 'commish' },
      { logoUrl: 'https://example.com/logo.png' },
    );

    expect(result).toMatchObject({ logoUrl: 'https://example.com/logo.png' });
  });

  it('rejects an SSRF-blocked avatarUrl even for the team owner (ownership check does not bypass URL validation)', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { teamId: 1, permissionLevel: 'general_manager' },
    ]);

    await expect(
      resolveBranding(
        { id: 1, username: 'owner-gm' },
        { avatarUrl: 'https://169.254.169.254/steal-creds' },
      ),
    ).rejects.toThrow('avatarUrl must be a public URL');
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

export {};
