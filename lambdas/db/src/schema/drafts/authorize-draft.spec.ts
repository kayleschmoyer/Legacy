/**
 * Unit tests for the draft access guard (LS-10074).
 *
 * `authorizeDraft` replaces the per-resolver `verifyLeagueReadAccess` /
 * `verifyLeagueMembership` calls so a draft-first mock draft (epic LS-9252)
 * can be guarded without a league. The league branch has to stay
 * behavior-neutral, so these run the *real* `../authorization` helpers against
 * a scripted db and assert the full access matrix the ticket calls for:
 * member, commissioner, non-member on a private league (Forbidden),
 * non-member on a public league (spectator, read-only), and a spectator
 * refused `participate`.
 */

import { authorizeDraft, requireSeat } from './authorize-draft';
import type { Context } from '../builder';

const DRAFT_ID = 100;
const LEAGUE_ID = 7;
const USER_ID = 42;

const LEAGUE_DRAFT_ROW = {
  id: DRAFT_ID,
  leagueId: LEAGUE_ID,
  kind: 'league' as const,
  status: 'in-progress' as const,
};

const SEAT_ROW = {
  id: 900,
  draftId: DRAFT_ID,
  slot: 3,
  teamId: 11,
  leagueId: LEAGUE_ID,
  userId: USER_ID,
  controller: 'user' as const,
  seatName: 'Team Rocket',
  autoPick: false,
};

/**
 * A drizzle-shaped stub that answers each terminal `.limit(1)` from a script,
 * in call order. Every query `authorizeDraft` and the real authorization
 * helpers issue terminates in `.limit(1)`, so one queue covers them all.
 */
function makeDb(limitResults: unknown[][]) {
  let call = 0;
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(limitResults[call++] ?? []));
  return chain as typeof chain & { limit: jest.Mock };
}

function makeContext(
  db: ReturnType<typeof makeDb>,
  { isAdmin = false }: { isAdmin?: boolean } = {},
): Context {
  return {
    user: { id: USER_ID, isAdmin },
    db,
  } as unknown as Context;
}

describe('authorizeDraft — league drafts (LS-10074)', () => {
  it('throws UNAUTHENTICATED when there is no signed-in user', async () => {
    const db = makeDb([]);
    const context = { db } as unknown as Context;

    await expect(
      authorizeDraft(context, DRAFT_ID, 'read'),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    // The guard short-circuits before touching the database.
    expect(db.limit).not.toHaveBeenCalled();
  });

  it('throws BAD_USER_INPUT when the draft does not exist', async () => {
    const db = makeDb([[]]);

    await expect(
      authorizeDraft(makeContext(db), DRAFT_ID, 'read'),
    ).rejects.toMatchObject({
      message: 'Draft not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  // ── member ────────────────────────────────────────────────────────────────

  it('grants a member read access and resolves their seat', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [{ permissionLevel: 'assistant_manager', teamId: 11 }],
      [SEAT_ROW],
    ]);

    const auth = await authorizeDraft(makeContext(db), DRAFT_ID, 'read');

    expect(auth.role).toBe('participant');
    expect(auth.membership).toMatchObject({ teamId: 11 });
    expect(auth.seat).toMatchObject({ id: 900, slot: 3, teamId: 11 });
    expect(auth.draft).toMatchObject({ id: DRAFT_ID, leagueId: LEAGUE_ID });
  });

  it('grants a member participate access', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [{ permissionLevel: 'assistant_manager', teamId: 11 }],
      [SEAT_ROW],
    ]);

    const auth = await authorizeDraft(makeContext(db), DRAFT_ID, 'participate');

    expect(auth.role).toBe('participant');
    expect(auth.seat).not.toBeNull();
  });

  it('refuses a member host access', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [{ permissionLevel: 'assistant_manager', teamId: 11 }],
    ]);

    await expect(
      authorizeDraft(makeContext(db), DRAFT_ID, 'host'),
    ).rejects.toMatchObject({
      message:
        'Only a league General Manager or commissioner can perform this action',
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('skips the seat lookup for a member with no team', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [{ permissionLevel: 'commissioner', teamId: null }],
    ]);

    const auth = await authorizeDraft(makeContext(db), DRAFT_ID, 'participate');

    expect(auth.seat).toBeNull();
    // draft + membership only — no third query for a seat that cannot exist.
    expect(db.limit).toHaveBeenCalledTimes(2);
  });

  // ── commissioner ──────────────────────────────────────────────────────────

  it.each(['commissioner', 'general_manager'] as const)(
    'grants %s host access with role "host"',
    async (permissionLevel) => {
      const db = makeDb([
        [LEAGUE_DRAFT_ROW],
        [{ permissionLevel, teamId: 11 }],
        [SEAT_ROW],
      ]);

      const auth = await authorizeDraft(makeContext(db), DRAFT_ID, 'host');

      expect(auth.role).toBe('host');
      expect(auth.membership).toMatchObject({ permissionLevel });
    },
  );

  // ── non-member, private league ────────────────────────────────────────────

  it.each(['preview', 'read'] as const)(
    'refuses a non-member on a private league: %s',
    async (need) => {
      const db = makeDb([
        [LEAGUE_DRAFT_ROW],
        [], // no membership
        [{ isPublic: false }],
      ]);

      await expect(
        authorizeDraft(makeContext(db), DRAFT_ID, need),
      ).rejects.toMatchObject({
        message: 'User is not a member of this league',
        extensions: { code: 'FORBIDDEN' },
      });
    },
  );

  // ── non-member, public league → spectator ─────────────────────────────────

  it.each(['preview', 'read'] as const)(
    'admits a non-member of a public league as a read-only spectator: %s',
    async (need) => {
      const db = makeDb([
        [LEAGUE_DRAFT_ROW],
        [], // no membership
        [{ isPublic: true }],
      ]);

      const auth = await authorizeDraft(makeContext(db), DRAFT_ID, need);

      expect(auth.role).toBe('spectator');
      expect(auth.membership).toBeNull();
      // A spectator holds no seat, so no seat query is issued.
      expect(auth.seat).toBeNull();
      expect(auth.draft).toMatchObject({ id: DRAFT_ID });
    },
  );

  it('admits an admin non-member of a private league as a spectator (LS-8939)', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [], // no membership
      [{ isPublic: false }],
    ]);

    const auth = await authorizeDraft(
      makeContext(db, { isAdmin: true }),
      DRAFT_ID,
      'read',
    );

    expect(auth.role).toBe('spectator');
  });

  // ── spectator cannot participate ──────────────────────────────────────────

  it.each(['participate', 'host'] as const)(
    'refuses a spectator of a public league: %s',
    async (need) => {
      // 'participate' and 'host' go through verifyLeagueMembership, which
      // never consults league visibility — a public league buys a spectator
      // read access only.
      const db = makeDb([
        [LEAGUE_DRAFT_ROW],
        [], // no membership
        [{ isPublic: true }],
      ]);

      await expect(
        authorizeDraft(makeContext(db), DRAFT_ID, need),
      ).rejects.toMatchObject({
        message: 'User is not a member of this league',
        extensions: { code: 'FORBIDDEN' },
      });
    },
  );

  // ── mock drafts are not yet supported ─────────────────────────────────────

  it('refuses a kind="mock" draft until the slice-4 branch lands', async () => {
    const db = makeDb([
      [{ ...LEAGUE_DRAFT_ROW, kind: 'mock', leagueId: null }],
    ]);

    await expect(
      authorizeDraft(makeContext(db), DRAFT_ID, 'read'),
    ).rejects.toThrow('LS-10076');
  });
});

describe('requireSeat (LS-10074)', () => {
  it('returns the seat when the caller holds one', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [{ permissionLevel: 'general_manager', teamId: 11 }],
      [SEAT_ROW],
    ]);
    const auth = await authorizeDraft(makeContext(db), DRAFT_ID, 'participate');

    expect(requireSeat(auth)).toMatchObject({ id: 900 });
  });

  it('throws FORBIDDEN when the caller holds no seat', async () => {
    const db = makeDb([
      [LEAGUE_DRAFT_ROW],
      [{ permissionLevel: 'commissioner', teamId: null }],
    ]);
    const auth = await authorizeDraft(makeContext(db), DRAFT_ID, 'participate');

    expect(() => requireSeat(auth)).toThrow('You do not have a seat');
  });
});
