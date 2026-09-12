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
  getTeamKickoffTimes: jest.fn().mockResolvedValue(new Map()),
  InternalSchema: {
    usersInAppInternal: {
      id: 'app_internal.users.id',
      subscriptionTier: 'app_internal.users.subscription_tier',
    },
  },
  PublicDb: {},
  PublicSchema: {
    players: {
      id: 'players.id',
      nflTeam: 'players.nfl_team',
      firstName: 'players.first_name',
      lastName: 'players.last_name',
    },
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
      status: 'matchups.status',
    },
    users: {
      id: 'users.id',
      accessLevel: 'users.access_level',
    },
  },
}));

import { getTeamKickoffTimes } from '@legacy-sports/db-client';
import {
  assertPlayerGamesNotStarted,
  authorized,
  checkAdminInDb,
  checkPlayersNotLocked,
  getLeagueMembership,
  getTeamMemberInfo,
  isCommissionerOrOwner,
  isTeamGeneralManager,
  type LeagueMembership,
  requireAdmin,
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

// ── checkAdminInDb ─────────────────────────────────────────────────────────────

describe('checkAdminInDb', () => {
  it('returns false immediately (no DB call) when JWT does not claim admin', async () => {
    const db = makeDb([]);
    const ctx = makeContext({ ...USER, isAdmin: false }, db);
    const result = await checkAdminInDb(ctx);
    expect(result).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns false when user is null', async () => {
    const db = makeDb([]);
    const ctx = makeContext(null, db);
    const result = await checkAdminInDb(ctx);
    expect(result).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('queries DB and returns true when DB confirms admin', async () => {
    const db = makeDb([{ accessLevel: 'admin' }]);
    const ctx = makeContext({ ...USER, isAdmin: true }, db);
    const result = await checkAdminInDb(ctx);
    expect(result).toBe(true);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('queries DB and returns false when DB shows access has been revoked', async () => {
    const db = makeDb([{ accessLevel: 'none' }]);
    const ctx = makeContext({ ...USER, isAdmin: true }, db);
    const result = await checkAdminInDb(ctx);
    expect(result).toBe(false);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns false when DB row is missing (user not found)', async () => {
    const db = makeDb([]);
    const ctx = makeContext({ ...USER, isAdmin: true }, db);
    const result = await checkAdminInDb(ctx);
    expect(result).toBe(false);
  });
});

// ── requireAdmin ───────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('throws UNAUTHENTICATED when context.user is null', async () => {
    const ctx = makeContext(null);
    await expect(requireAdmin(ctx)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  it('throws FORBIDDEN immediately (no DB call) when JWT does not claim admin', async () => {
    const db = makeDb([]);
    const ctx = makeContext({ ...USER, isAdmin: false }, db);
    await expect(requireAdmin(ctx)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when DB confirms access has been revoked', async () => {
    const db = makeDb([{ accessLevel: 'none' }]);
    const ctx = makeContext({ ...USER, isAdmin: true }, db);
    await expect(requireAdmin(ctx)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns the user when DB confirms admin access', async () => {
    const db = makeDb([{ accessLevel: 'admin' }]);
    const adminUser = { ...USER, isAdmin: true };
    const ctx = makeContext(adminUser, db);
    const result = await requireAdmin(ctx);
    expect(result).toEqual(adminUser);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

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

  it('throws FORBIDDEN for an assistant_manager (member but not commissioner/GM)', async () => {
    const db = makeDb([{ permissionLevel: 'assistant_manager', teamId: 5 }]);
    await expect(
      verifyCommissionerAccess(db as never, 1, 5),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
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

  // LS-6024: an assistant_manager's teamId matches the assisted team, so
  // absent an explicit opt-in this must NOT silently grant edit access.
  it('throws FORBIDDEN for an assistant_manager who owns the team when allowAssistantManager is not set', async () => {
    const members = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    const membership = [{ permissionLevel: 'assistant_manager', teamId: 10 }];
    const db = makeDbForTeamEdit(members, membership);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1]),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('allows an assistant_manager who owns the team when allowAssistantManager is true', async () => {
    const members = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    const membership = [{ permissionLevel: 'assistant_manager', teamId: 10 }];
    const db = makeDbForTeamEdit(members, membership);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1], true),
    ).resolves.toBeUndefined();
  });

  it('throws FORBIDDEN for an assistant_manager of a different team even when allowAssistantManager is true', async () => {
    const members = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    const membership = [{ permissionLevel: 'assistant_manager', teamId: 99 }];
    const db = makeDbForTeamEdit(members, membership);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1], true),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('throws FORBIDDEN when team members span different leagues', async () => {
    const members = [
      { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
      { id: 2, teamId: 20, leagueId: 3, playerId: 60 },
    ];
    const db = makeDbForTeamEdit(members, []);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1, 2]),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('throws FORBIDDEN when team members are on different teams in the same league', async () => {
    const members = [
      { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
      { id: 2, teamId: 11, leagueId: 2, playerId: 60 },
    ];
    const db = makeDbForTeamEdit(members, []);

    await expect(
      verifyTeamEditAccess(db as never, 1, [1, 2]),
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
      if (selectCall === 2) {
        // assertPlayerGamesNotStarted (LS-9687) → players lookup — no team
        const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: null }]);
        return { from: jest.fn(() => ({ where })) };
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
      if (selectCall === 2) {
        // assertPlayerGamesNotStarted (LS-9687) → players lookup — no team
        const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: null }]);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 3) {
        // League query — currentWeek is set (should NOT need refMatchup lookup)
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      // matchup-status check — no started matchup for this team this week
      const where = jest.fn().mockResolvedValue([]);
      return { from: jest.fn(() => ({ where })) };
    });
    const db = { select };

    // Should resolve without error — skips the refMatchup lookup entirely
    await expect(
      checkPlayersNotLocked(db as never, [1]),
    ).resolves.toBeUndefined();
    // 4 select calls: getTeamMemberInfo, players (LS-9687), league,
    // matchup-status (no refMatchup call because currentWeek was set)
    expect(selectCall).toBe(4);
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
        // assertPlayerGamesNotStarted (LS-9687) → players lookup — no team
        const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: null }]);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 3) {
        // League query — currentWeek is null, falls back to currentMatchup
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: null, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      if (selectCall === 4) {
        // refMatchup week number (legacy fallback)
        const limit = jest.fn().mockResolvedValue([{ weekNumber: 5 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      // matchup-status check — no started matchup for this team this week
      const where = jest.fn().mockResolvedValue([]);
      return { from: jest.fn(() => ({ where })) };
    });
    const db = { select };

    await expect(
      checkPlayersNotLocked(db as never, [1]),
    ).resolves.toBeUndefined();
    // 5 select calls: getTeamMemberInfo, players (LS-9687), league,
    // refMatchup, matchup-status
    expect(selectCall).toBe(5);
  });

  it('throws when the team matchup for the current week has already started', async () => {
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
        // assertPlayerGamesNotStarted (LS-9687) → players lookup — no team
        const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: null }]);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 3) {
        // League query — currentWeek is set
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      if (selectCall === 4) {
        // matchup-status check — team 10's matchup for the current week has
        // already started (status !== 'scheduled')
        const where = jest
          .fn()
          .mockResolvedValue([{ team1Id: 10, team2Id: 20 }]);
        return { from: jest.fn(() => ({ where })) };
      }
      // player-name lookup for the locked player
      const where = jest
        .fn()
        .mockResolvedValue([{ id: 50, firstName: 'Josh', lastName: 'Allen' }]);
      return { from: jest.fn(() => ({ where })) };
    });
    const db = { select };

    await expect(checkPlayersNotLocked(db as never, [1])).rejects.toThrow(
      "Player is locked — Josh Allen cannot be moved because their team's matchup for the current week has already started.",
    );
  });

  // Regression guard for LS-6031: locking must never depend on whether
  // matchup_player_games rows exist. `db` below exposes only `select` (no
  // `selectDistinct`, no matchupPlayerGames-shaped chain) — if the
  // implementation regressed to querying stats existence, this test would
  // fail with a TypeError instead of resolving.
  it('locks a started matchup even though no matchup_player_games rows have been written yet', async () => {
    const memberRows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        const where = jest.fn().mockResolvedValue(memberRows);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 2) {
        // assertPlayerGamesNotStarted (LS-9687) → players lookup — no team
        const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: null }]);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 3) {
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      if (selectCall === 4) {
        // matchup-status check reports the team's matchup as in_progress —
        // no stats rows are consulted anywhere in this mock.
        const where = jest
          .fn()
          .mockResolvedValue([{ team1Id: 10, team2Id: 20 }]);
        return { from: jest.fn(() => ({ where })) };
      }
      // player-name lookup for the locked player
      const where = jest
        .fn()
        .mockResolvedValue([{ id: 50, firstName: 'Josh', lastName: 'Allen' }]);
      return { from: jest.fn(() => ({ where })) };
    });
    const db = { select };

    await expect(checkPlayersNotLocked(db as never, [1])).rejects.toThrow(
      "Player is locked — Josh Allen cannot be moved because their team's matchup for the current week has already started.",
    );
  });

  // Regression guard for LS-6428: the reported bug was that locking was keyed
  // to per-player `matchup_player_games` row existence, so a Thursday Night
  // Football starter stayed editable until the stats seeder wrote a row for
  // them, while their non-Thursday (e.g. Sunday) teammates were never
  // auto-locked at all because the old check keyed off `playerId`, not
  // `teamId`. The LS-6031 fix (matchup-status based locking, asserted above)
  // already closes this: once ANY game causes the team's fantasy matchup to
  // leave `scheduled`, every roster move for every player on that team is
  // rejected in the same batch — regardless of which of the team's players
  // has an individual game in progress and regardless of stats-row
  // existence. This test locks that in with the exact multi-player scenario
  // from the ticket (a Thursday starter + a not-yet-played Sunday starter on
  // the same fantasy team, submitted together).
  it('locks every roster move for a team once its matchup has started, including players whose own game has not kicked off yet', async () => {
    const memberRows = [
      // Thursday Night Football starter (e.g. Josh Allen)
      { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
      // Teammate whose Sunday game has not started yet
      { id: 2, teamId: 10, leagueId: 2, playerId: 51 },
    ];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        // getTeamMemberInfo — both players returned in one batch
        const where = jest.fn().mockResolvedValue(memberRows);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 2) {
        // assertPlayerGamesNotStarted (LS-9687) → players lookup — neither
        // has a known NFL team, so this check is a no-op here; the
        // matchup-status check below is what locks this scenario.
        const where = jest.fn().mockResolvedValue([
          { id: 50, nflTeam: null },
          { id: 51, nflTeam: null },
        ]);
        return { from: jest.fn(() => ({ where })) };
      }
      if (selectCall === 3) {
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }
      if (selectCall === 4) {
        // matchup-status check — team 10's fantasy matchup is in_progress
        // because the Thursday game already flipped it; no
        // matchup_player_games rows are consulted anywhere in this mock.
        const where = jest
          .fn()
          .mockResolvedValue([{ team1Id: 10, team2Id: 20 }]);
        return { from: jest.fn(() => ({ where })) };
      }
      // player-name lookup for both locked players
      const where = jest.fn().mockResolvedValue([
        { id: 50, firstName: 'Josh', lastName: 'Allen' },
        { id: 51, firstName: 'Stefon', lastName: 'Diggs' },
      ]);
      return { from: jest.fn(() => ({ where })) };
    });
    const db = { select };

    // Attempting to move EITHER player throws — the whole team is locked
    // together, so the not-yet-played Sunday starter can't be used as a
    // loophole to bypass the Thursday starter's lock. Both locked players'
    // names are named in the message, not just the first one hit (LS-6440).
    await expect(checkPlayersNotLocked(db as never, [1, 2])).rejects.toThrow(
      "Players are locked — Josh Allen, Stefon Diggs cannot be moved because their teams' matchups for the current week have already started.",
    );
  });

  // LS-9687: closes the bootstrap-timing race left open by LS-6031's
  // matchup-status check. A freshly-drafted league's week-1 matchup is
  // still 'scheduled' (no currentWeek/currentMatchup yet — the coarse check
  // alone would resolve undefined, as asserted above), but the player's own
  // NFL team has already kicked off per the real-time kickoff data source.
  it('rejects the move purely from game-start-time before the matchup-status cron has run (bootstrap race)', async () => {
    const memberRows = [{ id: 1, teamId: 10, leagueId: 2, playerId: 50 }];
    let selectCall = 0;
    const select = jest.fn(() => {
      selectCall++;
      if (selectCall === 1) {
        // getTeamMemberInfo
        const where = jest.fn().mockResolvedValue(memberRows);
        return { from: jest.fn(() => ({ where })) };
      }
      // assertPlayerGamesNotStarted (LS-9687) → players lookup
      const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: 'KC' }]);
      return { from: jest.fn(() => ({ where })) };
    });
    const db = { select };

    (getTeamKickoffTimes as jest.Mock).mockResolvedValueOnce(
      new Map([['KC', new Date(Date.now() - 60_000)]]),
    );

    await expect(checkPlayersNotLocked(db as never, [1])).rejects.toThrow(
      'Player is locked — their NFL game has already started',
    );
    // Only getTeamMemberInfo + the players lookup ran — the coarse
    // matchup-status check (which would need a league query) never ran,
    // proving this check has no dependency on league/matchup/cron state.
    expect(selectCall).toBe(2);
  });

  // LS-9687 AC4(b): two teammates with staggered real kickoff times each
  // lock independently at their own kickoff, instead of the whole team
  // locking together the way the coarse matchup-status check does.
  it('locks a Thursday-kickoff player while a Sunday-kickoff teammate stays editable', async () => {
    const makeDbFor = (playerId: number, nflTeam: string) => {
      let selectCall = 0;
      const select = jest.fn(() => {
        selectCall++;
        if (selectCall === 1) {
          // getTeamMemberInfo
          const where = jest
            .fn()
            .mockResolvedValue([{ id: 1, teamId: 10, leagueId: 2, playerId }]);
          return { from: jest.fn(() => ({ where })) };
        }
        if (selectCall === 2) {
          // assertPlayerGamesNotStarted (LS-9687) → players lookup
          const where = jest
            .fn()
            .mockResolvedValue([{ id: playerId, nflTeam }]);
          return { from: jest.fn(() => ({ where })) };
        }
        // league query — no active matchup, so the coarse check no-ops and
        // this test exercises only the new per-player kickoff check.
        const limit = jest
          .fn()
          .mockResolvedValue([{ currentWeek: null, currentMatchup: null }]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      });
      return { select };
    };

    const kickoffTimes = new Map([
      ['KC', new Date(Date.now() - 60_000)], // Thursday game, already started
      ['SF', new Date(Date.now() + 60_000)], // Sunday game, not started yet
    ]);

    // Thursday starter (KC) is locked.
    (getTeamKickoffTimes as jest.Mock).mockResolvedValueOnce(kickoffTimes);
    await expect(
      checkPlayersNotLocked(makeDbFor(50, 'KC') as never, [1]),
    ).rejects.toThrow('Player is locked — their NFL game has already started');

    // Sunday starter (SF) on the same real week is not locked by this check.
    (getTeamKickoffTimes as jest.Mock).mockResolvedValueOnce(kickoffTimes);
    await expect(
      checkPlayersNotLocked(makeDbFor(51, 'SF') as never, [1]),
    ).resolves.toBeUndefined();
  });
});

// ── assertPlayerGamesNotStarted (LS-9687) ───────────────────────────────────────

describe('assertPlayerGamesNotStarted', () => {
  afterEach(() => {
    (getTeamKickoffTimes as jest.Mock).mockClear();
  });

  it('resolves immediately when playerIds is empty (no DB call)', async () => {
    const db = { select: jest.fn() };
    await expect(
      assertPlayerGamesNotStarted(db as never, []),
    ).resolves.toBeUndefined();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('resolves without querying kickoff times when no player has an NFL team (e.g. bye/unknown)', async () => {
    const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: null }]);
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where })) })),
    };

    await expect(
      assertPlayerGamesNotStarted(db as never, [50]),
    ).resolves.toBeUndefined();
    expect(getTeamKickoffTimes).not.toHaveBeenCalled();
  });

  it('resolves when the team has no known kickoff row (bye week / not yet populated) — fails open', async () => {
    const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: 'KC' }]);
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where })) })),
    };

    // Default mock (from jest.mock factory) resolves an empty Map — no row
    // for 'KC' at all, simulating a bye week or unpopulated schedule.
    await expect(
      assertPlayerGamesNotStarted(db as never, [50]),
    ).resolves.toBeUndefined();
  });

  it('resolves when the team kickoff is still in the future', async () => {
    const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: 'SF' }]);
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where })) })),
    };

    (getTeamKickoffTimes as jest.Mock).mockResolvedValueOnce(
      new Map([['SF', new Date(Date.now() + 60_000)]]),
    );

    await expect(
      assertPlayerGamesNotStarted(db as never, [50]),
    ).resolves.toBeUndefined();
  });

  it('throws once the team kickoff instant has passed, regardless of matchup/league state', async () => {
    const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: 'KC' }]);
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where })) })),
    };

    (getTeamKickoffTimes as jest.Mock).mockResolvedValueOnce(
      new Map([['KC', new Date(Date.now() - 60_000)]]),
    );

    await expect(
      assertPlayerGamesNotStarted(db as never, [50]),
    ).rejects.toThrow('Player is locked — their NFL game has already started');
  });

  it('handles a postponed/rescheduled game by simply re-reading the current kickoff value — no special code path', async () => {
    const where = jest.fn().mockResolvedValue([{ id: 50, nflTeam: 'KC' }]);
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where })) })),
    };

    // Originally scheduled kickoff already passed, but the game was
    // postponed — the data source now reports a future instant.
    (getTeamKickoffTimes as jest.Mock).mockResolvedValueOnce(
      new Map([['KC', new Date(Date.now() + 3_600_000)]]),
    );

    await expect(
      assertPlayerGamesNotStarted(db as never, [50]),
    ).resolves.toBeUndefined();
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
    expect(handler).toHaveBeenCalledWith({}, {}, expect.anything(), USER, {
      isCommissionerLockOverride: false,
    });
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
    expect(handler).toHaveBeenCalledWith({}, { leagueId: 1 }, ctx, USER, {
      isCommissionerLockOverride: false,
    });
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
          },
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

  // LS-6024: allowAssistantManager must be opt-in per call site.
  it('throws FORBIDDEN via teamMembers config for an assistant_manager when allowAssistantManager is not set', async () => {
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
        const limit = jest
          .fn()
          .mockResolvedValue([
            { permissionLevel: 'assistant_manager', teamId: 10 },
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

  it('allows the handler via teamMembers config for an assistant_manager when allowAssistantManager is true', async () => {
    const handler = jest.fn().mockResolvedValue('am-result');
    const resolve = authorized(
      {
        teamMembers: (args: { memberIds: number[] }) => args.memberIds,
        allowAssistantManager: true,
      },
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
        const limit = jest
          .fn()
          .mockResolvedValue([
            { permissionLevel: 'assistant_manager', teamId: 10 },
          ]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }),
    };

    const result = await resolve({}, { memberIds: [1] }, makeContext(USER, db));
    expect(result).toBe('am-result');
    expect(handler).toHaveBeenCalled();
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
        if (selectCall === 4) {
          // checkPlayersNotLocked → assertPlayerGamesNotStarted (LS-9687) →
          // players lookup — no team, so this check is a no-op here.
          const where = jest
            .fn()
            .mockResolvedValue([{ id: 50, nflTeam: null }]);
          return { from: jest.fn(() => ({ where })) };
        }
        if (selectCall === 5) {
          // checkPlayersNotLocked → league currentWeek + currentMatchup
          const limit = jest
            .fn()
            .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
          return {
            from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
          };
        }
        if (selectCall === 6) {
          // checkPlayersNotLocked → matchup-status check (team's matchup started)
          const where = jest
            .fn()
            .mockResolvedValue([{ team1Id: 10, team2Id: 20 }]);
          return { from: jest.fn(() => ({ where })) };
        }
        // checkPlayersNotLocked → player-name lookup for the locked player
        const where = jest
          .fn()
          .mockResolvedValue([
            { id: 50, firstName: 'Josh', lastName: 'Allen' },
          ]);
        return { from: jest.fn(() => ({ where })) };
      }),
    };

    await expect(
      resolve({}, { memberIds: [1] }, makeContext(USER, db)),
    ).rejects.toThrow(
      "Player is locked — Josh Allen cannot be moved because their team's matchup for the current week has already started.",
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('bypasses checkPlayersNotLocked for a commissioner editing a team they do not own when allowCommissionerLockOverride is set (LS-6443)', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const resolve = authorized(
      {
        teamMembers: (args: { memberIds: number[] }) => args.memberIds,
        checkLocked: true,
        allowCommissionerLockOverride: true,
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
          // verifyTeamEditAccess → getLeagueMembership (commissioner of a
          // different team than the one being edited)
          const limit = jest
            .fn()
            .mockResolvedValue([
              { permissionLevel: 'commissioner', teamId: 999 },
            ]);
          return {
            from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
          };
        }
        if (selectCall === 3) {
          // isCommissionerActingOnOtherTeam → getTeamMemberInfo
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        // isCommissionerActingOnOtherTeam → getLeagueMembership
        const limit = jest
          .fn()
          .mockResolvedValue([
            { permissionLevel: 'commissioner', teamId: 999 },
          ]);
        return {
          from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
        };
      }),
    };

    const result = await resolve({}, { memberIds: [1] }, makeContext(USER, db));

    expect(result).toBe('ok');
    // No checkPlayersNotLocked calls happen beyond the 4 above (it's skipped).
    expect(db.select).toHaveBeenCalledTimes(4);
    expect(handler).toHaveBeenCalledWith(
      {},
      { memberIds: [1] },
      expect.anything(),
      expect.anything(),
      { isCommissionerLockOverride: true },
    );
  });

  it('still enforces checkPlayersNotLocked for a commissioner editing their OWN team even with allowCommissionerLockOverride set', async () => {
    const handler = jest.fn();
    const resolve = authorized(
      {
        teamMembers: (args: { memberIds: number[] }) => args.memberIds,
        checkLocked: true,
        allowCommissionerLockOverride: true,
      },
      handler,
    );

    let selectCall = 0;
    const db = {
      select: jest.fn(() => {
        selectCall++;
        if (selectCall === 1 || selectCall === 3) {
          // getTeamMemberInfo (verifyTeamEditAccess, then
          // isCommissionerActingOnOtherTeam)
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        if (selectCall === 2 || selectCall === 4) {
          // getLeagueMembership — commissioner IS the owner of team 10
          const limit = jest
            .fn()
            .mockResolvedValue([
              { permissionLevel: 'commissioner', teamId: 10 },
            ]);
          return {
            from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
          };
        }
        if (selectCall === 5) {
          // checkPlayersNotLocked → getTeamMemberInfo
          const where = jest
            .fn()
            .mockResolvedValue([
              { id: 1, teamId: 10, leagueId: 2, playerId: 50 },
            ]);
          return { from: jest.fn(() => ({ where })) };
        }
        if (selectCall === 6) {
          // checkPlayersNotLocked → assertPlayerGamesNotStarted → players
          // lookup (LS-9687). No nflTeam means it fails open, leaving the
          // matchup-status check below as this test's only lock.
          const where = jest
            .fn()
            .mockResolvedValue([{ id: 50, nflTeam: null }]);
          return { from: jest.fn(() => ({ where })) };
        }
        if (selectCall === 7) {
          // checkPlayersNotLocked → league currentWeek + currentMatchup
          const limit = jest
            .fn()
            .mockResolvedValue([{ currentWeek: 5, currentMatchup: 42 }]);
          return {
            from: jest.fn(() => ({ where: jest.fn(() => ({ limit })) })),
          };
        }
        if (selectCall === 8) {
          // checkPlayersNotLocked → matchup-status check (team's matchup started)
          const where = jest
            .fn()
            .mockResolvedValue([{ team1Id: 10, team2Id: 20 }]);
          return { from: jest.fn(() => ({ where })) };
        }
        // checkPlayersNotLocked → player-name lookup for the locked player
        const where = jest
          .fn()
          .mockResolvedValue([
            { id: 50, firstName: 'Josh', lastName: 'Allen' },
          ]);
        return { from: jest.fn(() => ({ where })) };
      }),
    };

    await expect(
      resolve({}, { memberIds: [1] }, makeContext(USER, db)),
    ).rejects.toThrow(
      "Player is locked — Josh Allen cannot be moved because their team's matchup for the current week has already started.",
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
