/**
 * Invites — real-Postgres integration (LS-10078).
 *
 * The seat reservation is only as good as the locking around it, which no
 * mocked DB can show, so these drive the true resolvers against Postgres:
 *
 *   1. A pending invite's reserved seat cannot be taken by a public joiner —
 *      not sequentially, not racing.
 *   2. Accepting after the reservation is released (revoke, expiry, draft
 *      start) fails with a clear message, and the seat goes back to the pool.
 *   3. Decline releases the seat; accept takes exactly the reserved slot.
 *   4. League invites: commissioner-only, accept joins the league, the
 *      active-league cap applies, and seven-day expiry.
 *   5. resolveInviteCode previews both kinds; myInvites pages by cursor.
 */

import { and, eq, sql } from 'drizzle-orm';

import {
  type CapturedMockDraftResolvers,
  captureMockDraftResolvers,
  testEntitlements,
} from '../drafts/mock/mock-draft-resolvers.testkit';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../integration-test-setup';

const { draftParticipants, invitations, leagueMembers, leagues, teams } =
  integrationTestSchema;

type Db = Awaited<ReturnType<typeof getTestDatabase>>;

/** The shared seeded test users (integration-test-setup TEST_USERS). */
const HOST = { id: 1, username: 'testuser' };
const INVITEE = { id: 2, username: 'admin' };
const STRANGER = { id: 3, username: 'leagueowner' };

const UNAVAILABLE = /no longer available/;

describe('Invites — DB integration (LS-10078)', () => {
  let db: Db;
  let resolvers: CapturedMockDraftResolvers;

  beforeAll(async () => {
    db = await getTestDatabase();
    resolvers = await captureMockDraftResolvers();
  });

  beforeEach(async () => {
    testEntitlements.unlimitedMockDrafts = true;
    testEntitlements.controlAllTeams = true;
    testEntitlements.unlimitedLeagues = true;
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function contextFor(user: { id: number; username: string }) {
    return {
      db,
      user: { id: user.id, username: user.username, isAdmin: false },
      notificationService: null,
      notificationPublisher: null,
      isSystemRequest: false,
    };
  }

  /** An online, private, 2-seat lobby: the host in slot 1, slot 2 open. */
  async function createLobby(
    numTeams = 2,
  ): Promise<{ draftId: number; inviteCode: string }> {
    const created = await resolvers.createMockDraft(
      {},
      {
        sport: 'baseball',
        numTeams,
        pickPosition: 1,
        mode: 'online',
        isPublic: false,
      },
      contextFor(HOST),
    );
    return {
      draftId: created.draftId as number,
      inviteCode: created.inviteCode as string,
    };
  }

  async function inviteToDraft(draftId: number, username = INVITEE.username) {
    return resolvers.sendDraftInvite(
      {},
      { draftId, username },
      contextFor(HOST),
    );
  }

  async function seatOf(draftId: number, userId: number) {
    const [seat] = await db
      .select()
      .from(draftParticipants)
      .where(
        and(
          eq(draftParticipants.draftId, draftId),
          eq(draftParticipants.userId, userId),
        ),
      );
    return seat;
  }

  describe('mock draft seat reservation', () => {
    it('reserves an open slot and hides it from a public joiner', async () => {
      const { draftId, inviteCode } = await createLobby();

      const invite = await inviteToDraft(draftId);
      expect(invite.status).toBe('pending');
      expect(invite.reservedSlot).toBe(2);

      const room = (await resolvers.draftRoom(
        {},
        { draftId },
        contextFor(HOST),
      )) as { availability: { openSlots: number[] } };
      expect(room.availability.openSlots).toEqual([]);

      await expect(
        resolvers.joinMockDraft(
          {},
          { inviteCode, teamName: 'Gatecrashers' },
          contextFor(STRANGER),
        ),
      ).rejects.toThrow(/full/);

      expect(await seatOf(draftId, STRANGER.id)).toBeUndefined();
    });

    it('an invitee racing a public joiner for the last seat always gets it', async () => {
      const { draftId, inviteCode } = await createLobby();
      const invite = await inviteToDraft(draftId);

      const [accept, join] = await Promise.allSettled([
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(INVITEE),
        ),
        resolvers.joinMockDraft(
          {},
          { inviteCode, teamName: 'Gatecrashers' },
          contextFor(STRANGER),
        ),
      ]);

      expect(accept.status).toBe('fulfilled');
      expect(join.status).toBe('rejected');
      expect((await seatOf(draftId, INVITEE.id))?.slot).toBe(2);
      expect(await seatOf(draftId, STRANGER.id)).toBeUndefined();
    });

    it('accept takes exactly the reserved slot', async () => {
      const { draftId, inviteCode } = await createLobby(3);
      const invite = await inviteToDraft(draftId);
      expect(invite.reservedSlot).toBe(2);

      // A public joiner fills the one unreserved seat, slot 3.
      await resolvers.joinMockDraft(
        {},
        { inviteCode, teamName: 'Walk-ins' },
        contextFor(STRANGER),
      );
      expect((await seatOf(draftId, STRANGER.id))?.slot).toBe(3);

      const accepted = await resolvers.respondToInvite(
        {},
        { inviteId: invite.id, accept: true, teamName: 'Invited' },
        contextFor(INVITEE),
      );
      expect(accepted.status).toBe('accepted');

      const seat = await seatOf(draftId, INVITEE.id);
      expect(seat.slot).toBe(2);
      expect(seat.controller).toBe('user');
      expect(seat.seatName).toBe('Invited');
    });

    it('accept after a revoke fails gracefully and the seat reopens', async () => {
      const { draftId, inviteCode } = await createLobby();
      const invite = await inviteToDraft(draftId);

      const revoked = await resolvers.revokeInvite(
        {},
        { inviteId: invite.id },
        contextFor(HOST),
      );
      expect(revoked.status).toBe('revoked');

      await expect(
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(UNAVAILABLE);
      expect(await seatOf(draftId, INVITEE.id)).toBeUndefined();

      // The released seat is a public seat again.
      await resolvers.joinMockDraft(
        {},
        { inviteCode, teamName: 'Walk-ins' },
        contextFor(STRANGER),
      );
      expect((await seatOf(draftId, STRANGER.id))?.slot).toBe(2);
    });

    it('accept after the invite expired fails and frees the seat', async () => {
      const { draftId, inviteCode } = await createLobby();
      const invite = await inviteToDraft(draftId);

      await db
        .update(invitations)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(invitations.id, invite.id as number));

      await expect(
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(UNAVAILABLE);

      await resolvers.joinMockDraft(
        {},
        { inviteCode, teamName: 'Walk-ins' },
        contextFor(STRANGER),
      );
      expect((await seatOf(draftId, STRANGER.id))?.slot).toBe(2);
    });

    it('starting the draft expires the invite', async () => {
      const { draftId } = await createLobby();
      const invite = await inviteToDraft(draftId);

      await resolvers.startMockDraft({}, { draftId }, contextFor(HOST));

      const [row] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, invite.id as number));
      expect(row.status).toBe('expired');

      await expect(
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(UNAVAILABLE);
    });

    it('decline releases the seat', async () => {
      const { draftId, inviteCode } = await createLobby();
      const invite = await inviteToDraft(draftId);

      const declined = await resolvers.respondToInvite(
        {},
        { inviteId: invite.id, accept: false },
        contextFor(INVITEE),
      );
      expect(declined.status).toBe('declined');

      await resolvers.joinMockDraft(
        {},
        { inviteCode, teamName: 'Walk-ins' },
        contextFor(STRANGER),
      );
      expect((await seatOf(draftId, STRANGER.id))?.slot).toBe(2);
    });

    it('refuses invites from a non-host and when no seat is left', async () => {
      const { draftId } = await createLobby();

      await expect(
        resolvers.sendDraftInvite(
          {},
          { draftId, username: STRANGER.username },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(/host/);

      await inviteToDraft(draftId);
      await expect(inviteToDraft(draftId, STRANGER.username)).rejects.toThrow(
        /no open seat/,
      );
    });

    it('only the invitee can answer an invite', async () => {
      const { draftId } = await createLobby();
      const invite = await inviteToDraft(draftId);

      await expect(
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(STRANGER),
        ),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('league invites', () => {
    let codeSeq = 0;

    /** A league `owner` commissions, with `teamCount` teams, one of them his. */
    async function createLeague(
      owner: { id: number },
      teamCount = 4,
    ): Promise<{ leagueId: number; inviteCode: string }> {
      codeSeq += 1;
      const inviteCode = `LSINV${String(codeSeq).padStart(3, '0')}`;
      const [league] = await db
        .insert(leagues)
        .values({
          name: `Invite League ${String(codeSeq)}`,
          owner: owner.id,
          sport: 'baseball',
          inviteCode,
        })
        .returning();

      const teamRows = await db
        .insert(teams)
        .values(
          Array.from({ length: teamCount }, (_, i) => ({
            name: `Team ${String(i + 1)}`,
            leagueId: league.id,
          })),
        )
        .returning();

      await db.insert(leagueMembers).values({
        leagueId: league.id,
        userId: owner.id,
        teamId: teamRows[0].id,
        permissionLevel: 'commissioner' as const,
      });

      return { leagueId: league.id, inviteCode };
    }

    async function isMember(leagueId: number, userId: number) {
      const rows = await db
        .select()
        .from(leagueMembers)
        .where(
          and(
            eq(leagueMembers.leagueId, leagueId),
            eq(leagueMembers.userId, userId),
          ),
        );
      return rows.length > 0;
    }

    it('accepting joins the league', async () => {
      const { leagueId } = await createLeague(STRANGER);

      const invite = await resolvers.sendDraftInvite(
        {},
        { leagueId, username: INVITEE.username },
        contextFor(STRANGER),
      );
      expect(invite.kind).toBe('league');
      expect(invite.reservedSlot).toBeNull();

      const accepted = await resolvers.respondToInvite(
        {},
        { inviteId: invite.id, accept: true },
        contextFor(INVITEE),
      );
      expect(accepted.status).toBe('accepted');
      expect(await isMember(leagueId, INVITEE.id)).toBe(true);
    });

    it('only the commissioner can invite', async () => {
      const { leagueId } = await createLeague(STRANGER);

      await expect(
        resolvers.sendDraftInvite(
          {},
          { leagueId, username: HOST.username },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(/commissioner/);
    });

    it('respects the active-league cap and leaves the invite pending', async () => {
      // The invitee already plays in three active leagues.
      for (let i = 0; i < 3; i++) {
        const { leagueId } = await createLeague(STRANGER);
        const [freeTeam] = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.leagueId, leagueId))
          .orderBy(sql`${teams.id} desc`)
          .limit(1);
        await db.insert(leagueMembers).values({
          leagueId,
          userId: INVITEE.id,
          teamId: freeTeam.id,
          permissionLevel: 'general_manager' as const,
        });
      }

      const { leagueId } = await createLeague(STRANGER);
      const invite = await resolvers.sendDraftInvite(
        {},
        { leagueId, username: INVITEE.username },
        contextFor(STRANGER),
      );

      testEntitlements.unlimitedLeagues = false;
      await expect(
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(/3-league limit/);

      expect(await isMember(leagueId, INVITEE.id)).toBe(false);
      const [row] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, invite.id as number));
      expect(row.status).toBe('pending');

      // After upgrading, the same invite still works.
      testEntitlements.unlimitedLeagues = true;
      await resolvers.respondToInvite(
        {},
        { inviteId: invite.id, accept: true },
        contextFor(INVITEE),
      );
      expect(await isMember(leagueId, INVITEE.id)).toBe(true);
    });

    it('expires after seven days', async () => {
      const { leagueId } = await createLeague(STRANGER);
      const invite = await resolvers.sendDraftInvite(
        {},
        { leagueId, username: INVITEE.username },
        contextFor(STRANGER),
      );

      const expiresAt = new Date(invite.expiresAt as string).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresAt - (Date.now() + sevenDays))).toBeLessThan(
        60_000,
      );

      await db
        .update(invitations)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(invitations.id, invite.id as number));

      await expect(
        resolvers.respondToInvite(
          {},
          { inviteId: invite.id, accept: true },
          contextFor(INVITEE),
        ),
      ).rejects.toThrow(UNAVAILABLE);
      expect(await isMember(leagueId, INVITEE.id)).toBe(false);

      // A lapsed invite does not block a fresh one.
      const again = await resolvers.sendDraftInvite(
        {},
        { leagueId, username: INVITEE.username },
        contextFor(STRANGER),
      );
      expect(again.status).toBe('pending');
    });
  });

  describe('league invites settle on join (LS-10831)', () => {
    async function createLeague(): Promise<{
      leagueId: number;
      inviteCode: string;
      freeTeamId: number;
    }> {
      const [league] = await db
        .insert(leagues)
        .values({
          name: 'Settle League',
          owner: STRANGER.id,
          sport: 'baseball',
          inviteCode: 'LSSETL01',
        })
        .returning();
      const [ownTeam, freeTeam] = await db
        .insert(teams)
        .values([
          { name: 'Team 1', leagueId: league.id },
          { name: 'Team 2', leagueId: league.id },
        ])
        .returning();
      await db.insert(leagueMembers).values({
        leagueId: league.id,
        userId: STRANGER.id,
        teamId: ownTeam.id,
        permissionLevel: 'commissioner' as const,
      });
      return {
        leagueId: league.id,
        inviteCode: 'LSSETL01',
        freeTeamId: freeTeam.id,
      };
    }

    async function inviteRow(inviteId: number) {
      const [row] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, inviteId));
      return row;
    }

    it('joining by invite code accepts the pending direct invite', async () => {
      const { leagueId, inviteCode } = await createLeague();
      const invite = await resolvers.sendDraftInvite(
        {},
        { leagueId, username: INVITEE.username },
        contextFor(STRANGER),
      );

      await resolvers.joinLeagueByCode(
        {},
        { inviteCode, teamName: 'Code Joiners' },
        contextFor(INVITEE),
      );

      const row = await inviteRow(invite.id as number);
      expect(row.status).toBe('accepted');
      expect(row.respondedAt).not.toBeNull();
      await expect(
        resolvers.pendingInvites({}, { leagueId }, contextFor(STRANGER)),
      ).resolves.toEqual([]);
    });

    it('pendingInvites never lists an invite for a current member', async () => {
      const { leagueId, freeTeamId } = await createLeague();
      const invite = await resolvers.sendDraftInvite(
        {},
        { leagueId, username: INVITEE.username },
        contextFor(STRANGER),
      );
      // Membership written outside any join path, as rows predating the fix were.
      await db.insert(leagueMembers).values({
        leagueId,
        userId: INVITEE.id,
        teamId: freeTeamId,
        permissionLevel: 'general_manager' as const,
      });

      await expect(
        resolvers.pendingInvites({}, { leagueId }, contextFor(STRANGER)),
      ).resolves.toEqual([]);
      expect((await inviteRow(invite.id as number)).status).toBe('pending');
    });
  });

  describe('resolveInviteCode and myInvites', () => {
    it('previews a mock-draft code and a league code', async () => {
      const { draftId, inviteCode } = await createLobby(3);
      await inviteToDraft(draftId);

      const mock = await resolvers.resolveInviteCode(
        {},
        { code: inviteCode.toLowerCase() },
        contextFor(STRANGER),
      );
      expect(mock).toMatchObject({
        kind: 'mock',
        draftId,
        hostUsername: HOST.username,
        filledSeats: 1,
        totalSeats: 3,
        openSeats: 1,
        isJoinable: true,
        isAlreadySeated: false,
      });

      const [league] = await db
        .insert(leagues)
        .values({
          name: 'Preview League',
          owner: STRANGER.id,
          sport: 'baseball',
          inviteCode: 'LSPRV001',
        })
        .returning();
      await db.insert(teams).values([
        { name: 'A', leagueId: league.id },
        { name: 'B', leagueId: league.id },
      ]);

      const preview = await resolvers.resolveInviteCode(
        {},
        { code: 'LSPRV001' },
        contextFor(INVITEE),
      );
      expect(preview).toMatchObject({
        kind: 'league',
        leagueId: league.id,
        name: 'Preview League',
        totalTeams: 2,
        openTeams: 2,
        isAlreadyMember: false,
      });

      expect(
        await resolvers.resolveInviteCode(
          {},
          { code: 'ZZZZZZZZ' },
          contextFor(INVITEE),
        ),
      ).toBeNull();
    });

    it("pages the invitee's pending invites newest first", async () => {
      const first = await createLobby();
      const second = await createLobby();
      const older = await inviteToDraft(first.draftId);
      const newer = await inviteToDraft(second.draftId);

      const page1 = await resolvers.myInvites(
        {},
        { first: 1 },
        contextFor(INVITEE),
      );
      expect((page1.nodes as { id: number }[]).map((n) => n.id)).toEqual([
        newer.id,
      ]);
      expect(page1.hasNextPage).toBe(true);

      const page2 = await resolvers.myInvites(
        {},
        { first: 1, after: page1.endCursor },
        contextFor(INVITEE),
      );
      expect((page2.nodes as { id: number }[]).map((n) => n.id)).toEqual([
        older.id,
      ]);
      expect(page2.hasNextPage).toBe(false);

      const pending = await resolvers.pendingInvites(
        {},
        { draftId: first.draftId },
        contextFor(HOST),
      );
      expect(pending.map((p) => p.id)).toEqual([older.id]);
    });
  });
});
