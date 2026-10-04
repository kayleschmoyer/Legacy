/**
 * myActiveMockDrafts — real-Postgres (LS-10465).
 *
 * The resume banner lists the mock drafts a user can go back to, so the query
 * has to include exactly the lobbies and live drafts the caller hosts or sits
 * in, and leave out finished drafts, expired lobbies and other users' drafts.
 */

import { eq } from 'drizzle-orm';

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

const { drafts } = integrationTestSchema;

type Db = Awaited<ReturnType<typeof getTestDatabase>>;

describe('myActiveMockDrafts — DB integration (LS-10465)', () => {
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

  async function createDraft(
    hostId: number,
    mode: 'offline' | 'online',
  ): Promise<{ draftId: number; inviteCode: string | null }> {
    const created = await resolvers.createMockDraft(
      {},
      { sport: 'baseball', numTeams: 3, pickPosition: 1, mode },
      contextFor(hostId),
    );
    return {
      draftId: created.draftId as number,
      inviteCode: (created.inviteCode as string | null) ?? null,
    };
  }

  async function activeIds(userId: number): Promise<number[]> {
    const rows = await resolvers.myActiveMockDrafts({}, {}, contextFor(userId));
    return rows.map((r) => r.draftId as number).sort((a, b) => a - b);
  }

  it('lists a hosted live draft and a hosted lobby with their shape', async () => {
    const host = getUser(0);
    const live = await createDraft(host.id, 'offline');
    const lobby = await createDraft(host.id, 'online');

    const rows = await resolvers.myActiveMockDrafts(
      {},
      {},
      contextFor(host.id),
    );

    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [r.draftId, r]));
    expect(byId.get(live.draftId)).toMatchObject({
      sport: 'baseball',
      status: 'in-progress',
      mode: 'offline',
      isHost: true,
      totalSeats: 3,
    });
    expect(byId.get(lobby.draftId)).toMatchObject({
      status: 'not-started',
      mode: 'online',
      isHost: true,
    });
  });

  it('lists a lobby the caller joined, but not one they have no seat in', async () => {
    const host = getUser(0);
    const joiner = getUser(1);
    const outsider = getUser(2);
    const lobby = await createDraft(host.id, 'online');

    await resolvers.joinMockDraft(
      {},
      { inviteCode: lobby.inviteCode, teamName: 'Joiners' },
      contextFor(joiner.id),
    );

    const joinerRows = await resolvers.myActiveMockDrafts(
      {},
      {},
      contextFor(joiner.id),
    );
    expect(joinerRows).toEqual([
      expect.objectContaining({ draftId: lobby.draftId, isHost: false }),
    ]);
    expect(await activeIds(outsider.id)).toEqual([]);
  });

  it('leaves out completed drafts and expired lobbies', async () => {
    const host = getUser(0);
    const done = await createDraft(host.id, 'offline');
    const expired = await createDraft(host.id, 'online');
    const kept = await createDraft(host.id, 'online');

    await db
      .update(drafts)
      .set({ status: 'completed' })
      .where(eq(drafts.id, done.draftId));
    await db
      .update(drafts)
      .set({ lobbyExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(drafts.id, expired.draftId));

    expect(await activeIds(host.id)).toEqual([kept.draftId]);
  });

  it('requires a signed-in user', async () => {
    await expect(
      resolvers.myActiveMockDrafts(
        {},
        {},
        { db, user: null, notificationService: null, isSystemRequest: false },
      ),
    ).rejects.toThrow('Authentication required');
  });
});
