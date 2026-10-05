/**
 * Mock Drafts hub queries — real-Postgres (LS-10079).
 *
 * `publicMockDrafts` is a filter whose every clause guards a promise the hub
 * makes to a stranger ("you can join this"), so each excluded shape — full,
 * reserved-full, started, expired, private, offline — gets its own lobby here
 * and the list must return exactly the one joinable lobby. Pagination is
 * walked page by page to prove it neither repeats nor skips a row.
 */

import { eq, sql } from 'drizzle-orm';

import {
  type CapturedMockDraftResolvers,
  captureMockDraftResolvers,
  testEntitlements,
} from './mock-draft-resolvers.testkit';
import { getUser } from '../../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../../integration-test-setup';

const { drafts, invitations } = integrationTestSchema;

type Db = Awaited<ReturnType<typeof getTestDatabase>>;

interface Page<T> {
  nodes: T[];
  endCursor: string | null;
  hasNextPage: boolean;
}

interface PublicNode {
  draftId: number;
  hostUsername: string;
  playerPool: string;
  filledSeats: number;
  totalSeats: number;
  openSeats: number;
  rounds: number;
}

interface MyNode {
  draftId: number;
  listStatus: string;
  isHost: boolean;
  mode: string;
}

describe('Mock Drafts hub — DB integration (LS-10079)', () => {
  let db: Db;
  let resolvers: CapturedMockDraftResolvers;

  beforeAll(async () => {
    db = await getTestDatabase();
    resolvers = await captureMockDraftResolvers();
  });

  beforeEach(async () => {
    testEntitlements.unlimitedMockDrafts = true;
    testEntitlements.controlAllTeams = true;
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function contextFor(userId: number) {
    return {
      db,
      user: { id: userId, username: `user_${String(userId)}`, isAdmin: false },
      notificationService: null,
      isSystemRequest: false,
    };
  }

  async function createLobby(
    hostId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<{ draftId: number; inviteCode: string }> {
    const created = await resolvers.createMockDraft(
      {},
      {
        sport: 'baseball',
        numTeams: 3,
        pickPosition: 1,
        mode: 'online',
        isPublic: true,
        ...overrides,
      },
      contextFor(hostId),
    );
    return {
      draftId: created.draftId as number,
      inviteCode: created.inviteCode as string,
    };
  }

  async function listPublic(
    viewerId: number,
    args: Record<string, unknown> = {},
  ): Promise<Page<PublicNode>> {
    return (await resolvers.publicMockDrafts(
      {},
      { sport: 'baseball', ...args },
      contextFor(viewerId),
    )) as unknown as Page<PublicNode>;
  }

  async function listMine(
    viewerId: number,
    args: Record<string, unknown> = {},
  ): Promise<Page<MyNode>> {
    return (await resolvers.myMockDrafts(
      {},
      args,
      contextFor(viewerId),
    )) as unknown as Page<MyNode>;
  }

  it('rejects a signed-out caller on both queries', async () => {
    const signedOut = {
      db,
      user: null,
      notificationService: null,
      isSystemRequest: false,
    };

    await expect(
      resolvers.publicMockDrafts({}, { sport: 'baseball' }, signedOut),
    ).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
    await expect(
      resolvers.myMockDrafts({}, {}, signedOut),
    ).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  describe('publicMockDrafts', () => {
    it('lists only public, online, unstarted, unexpired lobbies with an open seat', async () => {
      const host = getUser(0);
      const joiner = getUser(1);
      const invitee = getUser(2);
      // Sits in none of the lobbies, so only the filters can hide them.
      const browser = getUser(2);

      const joinable = await createLobby(host.id);

      // Private.
      await createLobby(host.id, { isPublic: false });
      // Offline (createMockDraft never makes an offline draft public).
      await createLobby(host.id, { mode: 'offline', isPublic: true });
      // Started.
      const started = await createLobby(host.id);
      await resolvers.startMockDraft(
        {},
        { draftId: started.draftId },
        contextFor(host.id),
      );
      // Expired.
      const expired = await createLobby(host.id);
      await db
        .update(drafts)
        .set({ lobbyExpiresAt: sql`now() - interval '1 minute'` })
        .where(eq(drafts.id, expired.draftId));
      // Full.
      const full = await createLobby(host.id, { numTeams: 2 });
      await resolvers.joinMockDraft(
        {},
        { draftId: full.draftId, teamName: 'Filler' },
        contextFor(joiner.id),
      );
      // Its one open seat is held by a pending invite.
      const reserved = await createLobby(host.id, { numTeams: 2 });
      await db.insert(invitations).values({
        draftId: reserved.draftId,
        invitedUserId: invitee.id,
        invitedBy: host.id,
        status: 'pending',
        reservedSlot: 2,
        expiresAt: sql`now() + interval '1 hour'`,
      });

      const page = await listPublic(browser.id);

      expect(page.nodes.map((n) => n.draftId)).toEqual([joinable.draftId]);
      expect(page.hasNextPage).toBe(false);
      expect(page.nodes[0]).toMatchObject({
        filledSeats: 1,
        totalSeats: 3,
        openSeats: 2,
        playerPool: 'all',
        rounds: 25,
      });
    });

    it('counts a seat as open again once its reservation has expired', async () => {
      const host = getUser(0);
      const invitee = getUser(2);
      const lobby = await createLobby(host.id, { numTeams: 2 });
      await db.insert(invitations).values({
        draftId: lobby.draftId,
        invitedUserId: invitee.id,
        invitedBy: host.id,
        status: 'pending',
        reservedSlot: 2,
        expiresAt: sql`now() - interval '1 minute'`,
      });

      const page = await listPublic(getUser(1).id);

      expect(page.nodes.map((n) => n.draftId)).toEqual([lobby.draftId]);
      expect(page.nodes[0].openSeats).toBe(1);
    });

    it('leaves out lobbies the viewer already sits in', async () => {
      const host = getUser(0);
      const lobby = await createLobby(host.id);

      expect((await listPublic(host.id)).nodes).toHaveLength(0);
      expect(
        (await listPublic(getUser(1).id)).nodes.map((n) => n.draftId),
      ).toEqual([lobby.draftId]);
    });

    it('filters by sport and player pool', async () => {
      const host = getUser(0);
      const nl = await createLobby(host.id, { playerPool: 'nl' });
      await createLobby(host.id, { playerPool: 'al' });
      const football = await createLobby(host.id, { sport: 'football' });
      const viewer = getUser(1).id;

      expect(
        (await listPublic(viewer, { playerPool: 'nl' })).nodes.map(
          (n) => n.draftId,
        ),
      ).toEqual([nl.draftId]);
      expect(
        (await listPublic(viewer, { sport: 'football' })).nodes.map(
          (n) => n.draftId,
        ),
      ).toEqual([football.draftId]);
      await expect(listPublic(viewer, { playerPool: 'xyz' })).rejects.toThrow(
        /Unknown player pool/,
      );
    });

    it('pages newest first without repeating or skipping a lobby', async () => {
      const host = getUser(0);
      const ids: number[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((await createLobby(host.id)).draftId);
      }
      // Two lobbies share one created_at: the id tiebreak must still order them.
      await db
        .update(drafts)
        .set({
          createdAt: sql`(SELECT created_at FROM drafts WHERE id = ${ids[1]})`,
        })
        .where(eq(drafts.id, ids[2]));

      const viewer = getUser(1).id;
      const seen: number[] = [];
      let after: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const page: Page<PublicNode> = await listPublic(viewer, {
          first: 2,
          after,
        });
        seen.push(...page.nodes.map((n) => n.draftId));
        if (!page.hasNextPage) break;
        after = page.endCursor;
      }

      expect([...seen].sort((a, b) => a - b)).toEqual(ids);
      expect(new Set(seen).size).toBe(ids.length);
      // ids[2] was moved back to ids[1]'s timestamp, so it now follows ids[3].
      expect(seen).toEqual([ids[4], ids[3], ids[2], ids[1], ids[0]]);
    });

    it('rejects a malformed cursor', async () => {
      await expect(
        listPublic(getUser(1).id, { after: 'not-a-cursor' }),
      ).rejects.toThrow(/Invalid cursor/);
    });
  });

  describe('myMockDrafts', () => {
    it('lists every draft the viewer sits in, once each, newest first', async () => {
      const host = getUser(0);
      const joiner = getUser(1);
      const stranger = getUser(2);

      const offline = await createLobby(host.id, {
        mode: 'offline',
        isPublic: false,
      });
      // Control All Teams puts the host on every seat: still one row.
      const controlAll = await createLobby(host.id, {
        mode: 'offline',
        isPublic: false,
        controlAllTeams: true,
      });
      const lobby = await createLobby(host.id);
      await resolvers.joinMockDraft(
        {},
        { draftId: lobby.draftId, teamName: 'Guests' },
        contextFor(joiner.id),
      );

      const mine = await listMine(host.id);
      expect(mine.nodes.map((n) => n.draftId)).toEqual([
        lobby.draftId,
        controlAll.draftId,
        offline.draftId,
      ]);
      expect(mine.nodes[0]).toMatchObject({
        listStatus: 'lobby',
        isHost: true,
        mode: 'online',
      });
      expect(mine.nodes[2]).toMatchObject({
        listStatus: 'live',
        mode: 'offline',
      });

      const joined = await listMine(joiner.id);
      expect(joined.nodes.map((n) => n.draftId)).toEqual([lobby.draftId]);
      expect(joined.nodes[0].isHost).toBe(false);

      expect((await listMine(stranger.id)).nodes).toHaveLength(0);
    });

    it('filters by list status and drops expired lobbies', async () => {
      const host = getUser(0);
      const live = await createLobby(host.id, {
        mode: 'offline',
        isPublic: false,
      });
      const done = await createLobby(host.id, {
        mode: 'offline',
        isPublic: false,
      });
      await db
        .update(drafts)
        .set({ status: 'completed', draftCompletedAt: sql`now()` })
        .where(eq(drafts.id, done.draftId));
      const expired = await createLobby(host.id);
      await db
        .update(drafts)
        .set({ lobbyExpiresAt: sql`now() - interval '1 minute'` })
        .where(eq(drafts.id, expired.draftId));

      expect(
        (await listMine(host.id, { status: 'completed' })).nodes.map(
          (n) => n.draftId,
        ),
      ).toEqual([done.draftId]);
      expect(
        (await listMine(host.id, { status: 'live' })).nodes.map(
          (n) => n.draftId,
        ),
      ).toEqual([live.draftId]);
      expect((await listMine(host.id, { status: 'lobby' })).nodes).toHaveLength(
        0,
      );
      expect((await listMine(host.id)).nodes.map((n) => n.draftId)).toEqual([
        done.draftId,
        live.draftId,
      ]);
    });

    it('pages by draft id', async () => {
      const host = getUser(0);
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(
          (await createLobby(host.id, { mode: 'offline', isPublic: false }))
            .draftId,
        );
      }

      const first = await listMine(host.id, { first: 2 });
      expect(first.nodes.map((n) => n.draftId)).toEqual([ids[2], ids[1]]);
      expect(first.hasNextPage).toBe(true);

      const second = await listMine(host.id, {
        first: 2,
        after: first.endCursor,
      });
      expect(second.nodes.map((n) => n.draftId)).toEqual([ids[0]]);
      expect(second.hasNextPage).toBe(false);
    });
  });
});
