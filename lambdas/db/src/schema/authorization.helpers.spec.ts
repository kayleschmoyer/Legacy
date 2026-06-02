/**
 * Unit tests for authorization helper functions in authorization.ts (LS-747).
 *
 * Covers all helpers NOT already tested in authorization.premium.spec.ts:
 *   - requireAuth
 *   - getLeagueMembership
 *   - isCommissionerOrOwner
 *   - isTeamGeneralManager
 *   - getTeamMemberInfo
 *   - verifyLeagueMembership
 *   - verifyCommissionerAccess
 *   - verifyTeamEditAccess
 *   - checkPlayersNotLocked
 *   - authorized() — auth-only, memberOf, commissionerOf, teamMembers configs
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  InternalSchema: {
    usersInAppInternal: {
      id: 'app_internal.users.id',
      subscriptionTier: 'app_internal.users.subscription_tier',
    },
  },
  PublicDb: {},
  PublicSchema: {
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
      teamId: 'league_members.team_id',
      permissionLevel: 'league_members.permission_level',
    },
    leagues: {
      id: 'leagues.id',
      currentMatchup: 'leagues.current_matchup',
    },
    teamMembers: {
      id: 'team_members.id',
      teamId: 'team_members.team_id',
      leagueId: 'team_members.league_id',
      playerId: 'team_members.player_id',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchup_player_games.matchup_player_id',
    },
    matchupPlayers: {
      id: 'matchup_players.id',
      matchupId: 'matchup_players.matchup_id',
      playerId: 'matchup_players.player_id',
      teamId: 'matchup_players.team_id',
    },
    matchups: {
      id: 'matchups.id',
      weekNumber: 'matchups.week_number',
      leagueId: 'matchups.league_id',
      team1Id: 'matchups.team1_id',
      team2Id: 'matchups.team2_id',
    },
  },
}));

import {
  authorized,
  checkPlayersNotLocked,
  getLeagueMembership,
  getTeamMemberInfo,
  isCommissionerOrOwner,
  isTeamGeneralManager,
  type LeagueMembership,
  requireAuth,
  requireNotImpersonating,
  verifyCommissionerAccess,
  verifyLeagueMembership,
  verifyTeamEditAccess,
} from './authorization';
import type { Context } from './builder';

// ── Helpers ────────────────────────────────────────────────────────────────────

const USER = {
  id: 1,
  email: 'test@test.com',
  username: 'tester',
  isAdmin: false,
};

/** Build a Context stub with the given user and db. */
function makeContext(user: typeof USER | null, db: unknown = {}): Context {
  return { user, db } as Context;
}

/**
 * Build a DB mock whose chains call the provided `limitResult` on `.limit()`
 * and fall through on `.select/from/where/innerJoin`.
 */
function makeDb(limitResult: unknown[] = []) {
  const limit = jest.fn().mockResolvedValue(limitResult);
  const innerJoin = jest.fn().mockReturnThis();
  const where = jest.fn(() => ({ limit, innerJoin }));
  const from = jest.fn(() => ({ where, limit }));
  const select = jest.fn(() => ({ from }));
  return { select, from, where, limit, innerJoin };
}

// ── requireAuth ────────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('throws UNAUTHENTICATED when context.user is null', () => {
    expect(() => requireAuth(makeContext(null))).toThrow(
      expect.objectContaining({ extensions: { code: 'UNAUTHENTICATED' } }),
    );
  });

  it('returns the user when context.user is present', () => {
    const result = requireAuth(makeContext(USER));
    expect(result).toEqual(USER);
  });
});

// ── requireNotImpersonating ───────────────────────────────────────────────────

describe('requireNotImpersonating', () => {
  it('does not throw when user is not impersonating', () => {
    expect(() => requireNotImpersonating(makeContext(USER))).not.toThrow();
  });

  it('does not throw when user is null (handled by requireAuth separately)', () => {
    expect(() => requireNotImpersonating(makeContext(null))).not.toThrow();
  });

  it('throws FORBIDDEN when user has impersonatedBy set', () => {
    const impersonatedUser = {
      ...USER,
      impersonatedBy: { id: 99, username: 'admin' },
    };
    expect(() =>
      requireNotImpersonating(makeContext(impersonatedUser)),
    ).toThrow(
      expect.objectContaining({
        extensions: { code: 'FORBIDDEN' },
        message: 'This action is not allowed while impersonating a user.',
      }),
    );
  });
});

// ── isCommissionerOrOwner ──────────────────────────────────────────────────────

describe('isCommissionerOrOwner', () => {
  const base: LeagueMembership = {
    leagueId: 1,
    userId: 1,
    teamId: 10,
    permissionLevel: 'general_manager',
  };

  it('returns true for general_manager', () => {
    expect(
      isCommissionerOrOwner({ ...base, permissionLevel: 'general_manager' }),
    ).toBe(true);
  });

  it('returns true for commissioner', () => {
    expect(
      isCommissionerOrOwner({ ...base, permissionLevel: 'commissioner' }),
    ).toBe(true);
  });

  it('returns false for assistant_manager', () => {
    expect(
      isCommissionerOrOwner({ ...base, permissionLevel: 'assistant_manager' }),
    ).toBe(false);
  });
});

// ── isTeamGeneralManager ───────────────────────────────────────────────────────

describe('isTeamGeneralManager', () => {
  const base: LeagueMembership = {
    leagueId: 1,
    userId: 1,
    teamId: 10,
    permissionLevel: 'general_manager',
  };

  it('returns true when teamId matches and permissionLevel is general_manager', () => {
    expect(isTeamGeneralManager(base, 10)).toBe(true);
  });

  it('returns false when teamId does not match', () => {
    expect(isTeamGeneralManager(base, 99)).toBe(false);
  });

  it('returns false when permissionLevel is not general_manager', () => {
    expect(
      isTeamGeneralManager({ ...base, permissionLevel: 'commissioner' }, 10),
    ).toBe(false);
  });
});

// ── getLeagueMembership ────────────────────────────────────────────────────────

describe('getLeagueMembership', () => {
  it('returns null when no membership row found', async () => {
    const db = makeDb([]);
    const result = await getLeagueMembership(db as never, 1, 1);
    expect(result).toBeNull();
  });

  it('returns a membership object when a row is found', async () => {
    const db = makeDb([{ permissionLevel: 'general_manager', teamId: 5 }]);
    const result = await getLeagueMembership(db as never, 1, 1);
    expect(result).toEqual({
      leagueId: 1,
      userId: 1,
      teamId: 5,
      permissionLevel: 'general_manager',
    });
  });
});

// ── getTeamMemberInfo ──────────────────────────────────────────────────────────

describe('getTeamMemberInfo', () => {
  it('returns team member details when all IDs are found', async () => {
    const rows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    // getTeamMemberInfo uses inArray (no .limit), terminal is .where().
    const where = jest.fn().mockResolvedValue(rows);
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    const db = { select, from, where };

    const result = await getTeamMemberInfo(db as never, [1]);
    expect(result).toEqual(rows);
  });

  it('throws when fewer members are returned than requested', async () => {
    const where = jest.fn().mockResolvedValue([]);
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    const db = { select, from, where };

    await expect(getTeamMemberInfo(db as never, [1, 2])).rejects.toThrow(
      'One or more team members not found',
    );
  });
});

// ── verifyLeagueMembership ─────────────────────────────────────────────────────

describe('verifyLeagueMembership', () => {
  it('throws FORBIDDEN when user is not a member', async () => {
    const db = makeDb([]); // no membership rows
    await expect(
      verifyLeagueMembership(db as never, 1, 1),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('returns the membership when the user is a member', async () => {
    const db = makeDb([{ permissionLevel: 'commissioner', teamId: 3 }]);
    const result = await verifyLeagueMembership(db as never, 1, 1);
    expect(result.permissionLevel).toBe('commissioner');
  });
});

// ── verifyCommissionerAccess ───────────────────────────────────────────────────

describe('verifyCommissionerAccess', () => {
  it('throws FORBIDDEN when user is not a member', async () => {
    const db = makeDb([]);
    await expect(
      verifyCommissionerAccess(db as never, 1, 1),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('returns membership for an assistant_manager (member but not commissioner/GM)', async () => {
    const db = makeDb([{ permissionLevel: 'assistant_manager', teamId: 5 }]);
    const result = await verifyCommissionerAccess(db as never, 1, 5);
    expect(result.permissionLevel).toBe('assistant_manager');
  });

  it('returns membership for a commissioner', async () => {
    const db = makeDb([{ permissionLevel: 'commissioner', teamId: null }]);
    const result = await verifyCommissionerAccess(db as never, 1, 1);
    expect(result.permissionLevel).toBe('commissioner');
  });

  it('returns membership for a general_manager', async () => {
    const db = makeDb([{ permissionLevel: 'general_manager', teamId: 5 }]);
    const result = await verifyCommissionerAccess(db as never, 1, 5);
    expect(result.permissionLevel).toBe('general_manager');
  });
});

// ── verifyTeamEditAccess ───────────────────────────────────────────────────────

describe('verifyTeamEditAccess', () => {
  function makeDbForTeamEdit(memberRows: unknown[], membershipRows: unknown[]) {
    // getTeamMemberInfo: select().from().where() — terminal is where()
    let callCount = 0;
    const where = jest.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(memberRows);
      return { limit: jest.fn().mockResolvedValue(membershipRows) };
    });
    const limit = jest.fn().mockResolvedValue(membershipRows);
    const from = jest.fn(() => ({ where, limit }));
    const select = jest.fn(() => ({ from }));
    return { select, from, where, limit };
  }

  it('allows access for a commissioner (any team)', async () => {
    const members = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    const membership = [{ permissionLevel: 'commissioner', teamId: null }];
    const db = makeDbForTeamEdit(members, membership);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1]),
    ).resolves.toBeUndefined();
  });

  it('allows access when the user owns the team', async () => {
    const members = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    const membership = [{ permissionLevel: 'general_manager', teamId: 10 }];
    const db = makeDbForTeamEdit(members, membership);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1]),
    ).resolves.toBeUndefined();
  });

  it('throws FORBIDDEN when the user has a non-elevated role and does not own the team', async () => {
    const members = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    // assistant_manager and below do not pass isCommissionerOrOwner; use a
    // hypothetical non-elevated role to exercise the FORBIDDEN branch.
    const membership = [
      {
        permissionLevel: 'viewer',
        teamId: 99,
      } as unknown as LeagueMembership,
    ];
    const db = makeDbForTeamEdit(members, membership);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1]),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });
});

// ── checkPlayersNotLocked ──────────────────────────────────────────────────────

describe('checkPlayersNotLocked', () => {
  it('resolves immediately when teamMemberIds is empty', async () => {
    // getTeamMemberInfo would normally fail if called with 0 IDs, but the
    // function checks members.length === 0 early.
    const where = jest.fn().mockResolvedValue([]);
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    const db = { select, from, where };

    await expect(
      checkPlayersNotLocked(db as never, []),
    ).resolves.toBeUndefined();
  });

  it('resolves when league has no active matchup and no currentWeek', async () => {
    const memberRows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        // getTeamMemberInfo
        const where = jest.fn().mockResolvedValue(memberRows);
        const from = jest.fn(() => ({ where }));
        return { from };
      }
      // league query — no currentWeek, no current matchup
      const limit = jest
        .fn()
        .mockResolvedValue([{ currentWeek: null, currentMatchup: null }]);
      const where = jest.fn(() => ({ limit }));
      const from = jest.fn(() => ({ where }));
      return { from };
    });
    const db = { select };

    await expect(
      checkPlayersNotLocked(db as never, [1]),
    ).resolves.toBeUndefined();
  });

  it('uses currentWeek directly when available (LS-1592)', async () => {
    const memberRows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        // getTeamMemberInfo
        const where = jest.fn().mockResolvedValue(memberRows);
        return { from: jest.fn(() => ({ where })) };
      }
      // League query — currentWeek is set (should NOT need refMatchup lookup)
      const limit = jest
        .fn()
        .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
      return {
        from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
      };
    });
    // locked check — no game selections for current week
    const selectDistinct = jest.fn(() => {
      const where = jest.fn().mockResolvedValue([]);
      const innerJoin = jest.fn().mockReturnThis();
      const from = jest.fn(() => ({ innerJoin, where }));
      return { from };
    });
    const db = { select, selectDistinct };

    // Should resolve without error — skips the refMatchup lookup entirely
    await expect(
      checkPlayersNotLocked(db as never, [1]),
    ).resolves.toBeUndefined();
    // Only 2 select calls: getTeamMemberInfo, league
    // (no refMatchup call because currentWeek was set)
    expect(selectCall).toBe(2);
  });

  it('falls back to currentMatchup FK when currentWeek is null', async () => {
    const memberRows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        // getTeamMemberInfo
        const where = jest.fn().mockResolvedValue(memberRows);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 2) {
        // League query — currentWeek is null, falls back to currentMatchup
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: null, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      // refMatchup week number (legacy fallback)
      const limit = jest.fn().mockResolvedValue([{ weekNumber: 5 }]);
      return {
        from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
      };
    });
    // locked check — no game selections for current week
    const selectDistinct = jest.fn(() => {
      const where = jest.fn().mockResolvedValue([]);
      const innerJoin = jest.fn().mockReturnThis();
      const from = jest.fn(() => ({ innerJoin, where }));
      return { from };
    });
    const db = { select, selectDistinct };

    await expect(
      checkPlayersNotLocked(db as never, [1]),
    ).resolves.toBeUndefined();
    // 3 select calls: getTeamMemberInfo, league, refMatchup
    expect(selectCall).toBe(3);
  });

  it('throws when a player is locked (game selections exist)', async () => {
    const memberRows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        // getTeamMemberInfo
        const where = jest.fn().mockResolvedValue(memberRows);
        return { from: jest.fn(() => ({ where })) };
      }
      // League query — currentWeek is set
      const limit = jest
        .fn()
        .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
      return {
        from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
      };
    });
    // locked check — player 50 on team 10 has game selections
    const selectDistinct = jest.fn(() => {
      const where = jest.fn().mockResolvedValue([{ playerId: 50, teamId: 10 }]);
      const innerJoin = jest.fn().mockReturnThis();
      const from = jest.fn(() => ({ innerJoin, where }));
      return { from };
    });
    const db = { select, selectDistinct };

    await expect(checkPlayersNotLocked(db as never, [1])).rejects.toThrow(
      'Player is locked — game selections have already been made for the current matchup',
    );
  });
});

// ── authorized() wrapper ───────────────────────────────────────────────────────

describe('authorized() wrapper', () => {
  it('throws UNAUTHENTICATED when no user in context', async () => {
    const handler = jest.fn();
    const resolve = authorized({}, handler);

    await expect(resolve({}, {}, makeContext(null))).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the handler with the authenticated user when no config flags set', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const resolve = authorized({}, handler);

    const result = await resolve({}, {}, makeContext(USER));
    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledWith({}, {}, expect.anything(), USER);
  });

  it('verifies league membership when memberOf is provided', async () => {
    const handler = jest.fn().mockResolvedValue('result');
    const resolve = authorized(
      { memberOf: (args: { leagueId: number }) => args.leagueId },
      handler,
    );

    const db = makeDb([{ permissionLevel: 'general_manager', teamId: 5 }]);
    const ctx = makeContext(USER, db);

    const result = await resolve({}, { leagueId: 1 }, ctx);
    expect(result).toBe('result');
    expect(handler).toHaveBeenCalledWith({}, { leagueId: 1 }, ctx, USER);
  });

  it('throws FORBIDDEN for memberOf check when user is not a member', async () => {
    const handler = jest.fn();
    const resolve = authorized(
      { memberOf: (args: { leagueId: number }) => args.leagueId },
      handler,
    );

    const db = makeDb([]); // no membership
    const ctx = makeContext(USER, db);

    await expect(resolve({}, { leagueId: 1 }, ctx)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('verifies commissioner access when commissionerOf is provided', async () => {
    const handler = jest.fn().mockResolvedValue('commissioner-result');
    const resolve = authorized(
      { commissionerOf: (args: { leagueId: number }) => args.leagueId },
      handler,
    );

    const db = makeDb([{ permissionLevel: 'commissioner', teamId: null }]);
    const ctx = makeContext(USER, db);

    const result = await resolve({}, { leagueId: 1 }, ctx);
    expect(result).toBe('commissioner-result');
  });

  it('throws FORBIDDEN for commissionerOf check when user is not a member', async () => {
    const handler = jest.fn();
    const resolve = authorized(
      { commissionerOf: (args: { leagueId: number }) => args.leagueId },
      handler,
    );

    const db = makeDb([]); // no membership
    await expect(
      resolve({}, { leagueId: 1 }, makeContext(USER, db)),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('allows the handler when teamMembers config is provided and user owns the team', async () => {
    const handler = jest.fn().mockResolvedValue('team-result');
    const resolve = authorized(
      { teamMembers: (args: { memberIds: number[] }) => args.memberIds },
      handler,
    );

    let selectCall = 0;
    const db = {
      select: jest.fn(() => {
        selectCall++;
        if (selectCall === 1) {
          // getTeamMemberInfo: .select().from().where() resolves directly
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        // getLeagueMembership: .select().from().where().limit()
        const limit = jest
          .fn()
          .mockResolvedValue([
            { permissionLevel: 'general_manager', teamId: 10 },
          ]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }),
    };

    const result = await resolve({}, { memberIds: [1] }, makeContext(USER, db));
    expect(result).toBe('team-result');
    expect(handler).toHaveBeenCalled();
  });

  it('throws FORBIDDEN via teamMembers config when user does not own the team', async () => {
    const handler = jest.fn();
    const resolve = authorized(
      { teamMembers: (args: { memberIds: number[] }) => args.memberIds },
      handler,
    );

    let selectCall = 0;
    const db = {
      select: jest.fn(() => {
        selectCall++;
        if (selectCall === 1) {
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        const limit = jest.fn().mockResolvedValue([
          {
            permissionLevel: 'viewer',
            teamId: 99,
          } as unknown as LeagueMembership,
        ]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }),
    };

    await expect(
      resolve({}, { memberIds: [1] }, makeContext(USER, db)),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when noImpersonation is set and user is impersonating', async () => {
    const handler = jest.fn();
    const resolve = authorized({ noImpersonation: true }, handler);

    const impersonatedUser = {
      ...USER,
      impersonatedBy: { id: 99, username: 'admin' },
    };
    await expect(
      resolve({}, {}, makeContext(impersonatedUser)),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows the handler when noImpersonation is set and user is not impersonating', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const resolve = authorized({ noImpersonation: true }, handler);

    const result = await resolve({}, {}, makeContext(USER));
    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalled();
  });

  it('throws FORBIDDEN (not PREMIUM_REQUIRED) for a free non-member when memberOf and premium are both set', async () => {
    const handler = jest.fn();
    const resolve = authorized(
      {
        memberOf: (args: { leagueId: number }) => args.leagueId,
        premium: true,
      },
      handler,
    );

    const db = makeDb([]); // no membership row → FORBIDDEN
    const ctx = makeContext(USER, db);

    await expect(resolve({}, { leagueId: 1 }, ctx)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('enforces checkPlayersNotLocked when checkLocked and teamMembers are both set', async () => {
    const handler = jest.fn();
    const resolve = authorized(
      {
        teamMembers: (args: { memberIds: number[] }) => args.memberIds,
        checkLocked: true,
      },
      handler,
    );

    let selectCall = 0;
    const db = {
      select: jest.fn(() => {
        selectCall++;
        if (selectCall === 1) {
          // verifyTeamEditAccess → getTeamMemberInfo
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        if (selectCall === 2) {
          // verifyTeamEditAccess → getLeagueMembership (commissioner passes)
          const limit = jest
            .fn()
            .mockResolvedValue([
              { permissionLevel: 'commissioner', teamId: null },
            ]);
          return {
            from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
          };
        }
        if (selectCall === 3) {
          // checkPlayersNotLocked → getTeamMemberInfo
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        // checkPlayersNotLocked → league currentWeek + currentMatchup
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }),
      // checkPlayersNotLocked → locked check (player is locked)
      selectDistinct: jest.fn(() => {
        const where = jest
          .fn()
          .mockResolvedValue([{ playerId: 50, teamId: 10 }]);
        const innerJoin = jest.fn().mockReturnThis();
        const from = jest.fn(() => ({ innerJoin, where }));
        return { from };
      }),
    };

    await expect(
      resolve({}, { memberIds: [1] }, makeContext(USER, db)),
    ).rejects.toThrow(
      'Player is locked — game selections have already been made for the current matchup',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
