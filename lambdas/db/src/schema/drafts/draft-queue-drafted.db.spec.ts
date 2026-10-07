/**
 * Drafted players leave the draft queue (LS-10680) - DB Integration Tests
 *
 * A pick never touched `draft_queue`, and `getMyDraftQueue` returned every row
 * for the seat, so a drafted player stayed in the queue (and its count) after
 * the pick, a refetch, and a reload. The read now leaves drafted players out,
 * and queue edits prune them so `reorderDraftQueue` matches the shown set.
 */

import type { GraphQLFieldResolver, GraphQLSchema } from 'graphql';
import { and, eq, sql } from 'drizzle-orm';
import { getLeague, getTeam, getUser } from '../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { schema } from '../index';

const {
  drafts,
  draftParticipants,
  draftPicks,
  draftQueue,
  leagues,
  leagueMembers,
  teams,
} = integrationTestSchema;

type QueueRow = { playerId: number; priority: number };

function getField(
  s: GraphQLSchema,
  kind: 'query' | 'mutation',
  name: string,
): GraphQLFieldResolver<unknown, unknown> {
  const type = kind === 'query' ? s.getQueryType() : s.getMutationType();
  const field = type?.getFields()[name];
  if (!field?.resolve) throw new Error(`${name} resolver not found`);
  return field.resolve.bind(field);
}

describe('draft queue excludes drafted players (LS-10680) - DB Integration Tests', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    // Test-data cleanup only removes league-owned drafts.
    await db.execute(sql`DELETE FROM drafts WHERE kind = 'mock'`);
    await cleanupTestData();
  });

  function call(
    kind: 'query' | 'mutation',
    name: string,
    userId: number,
    args: Record<string, unknown>,
  ) {
    return getField(schema, kind, name)(
      {},
      args,
      { user: { id: userId, isAdmin: false }, db },
      {} as never,
    ) as Promise<QueueRow[]>;
  }

  const queueOf = (userId: number, draftId: number) =>
    call('query', 'getMyDraftQueue', userId, { draftId });

  async function seedQueue(
    draftId: number,
    participantId: number,
    playerIds: number[],
  ) {
    await db.insert(draftQueue).values(
      playerIds.map((playerId, idx) => ({
        draftId,
        participantId,
        playerId,
        priority: idx + 1,
      })),
    );
  }

  async function draftPlayer(
    draftId: number,
    participantId: number,
    playerId: number,
  ) {
    await db.insert(draftPicks).values({
      draftId,
      participantId,
      playerId,
      round: 1,
      pickNumber: 1,
      overallPick: 1,
    });
  }

  /** A 2-team league draft whose two seats are each run by a general manager. */
  async function seedLeagueDraft() {
    const gmA = getUser(1);
    const gmB = getUser(2);
    const [league] = await db
      .insert(leagues)
      .values({
        name: getLeague(0).name,
        owner: gmA.id,
        inviteCode: getLeague(0).inviteCode,
        maxRosterSize: 4,
        draftStatus: 'in-progress',
        sport: 'baseball',
      })
      .returning();

    const teamFixtures = [0, 1].map((i) => ({
      ...getTeam(i),
      leagueId: league.id,
    }));
    await db.insert(teams).values(teamFixtures);
    await db.insert(leagueMembers).values(
      [gmA, gmB].map((user, i) => ({
        leagueId: league.id,
        userId: user.id,
        teamId: teamFixtures[i].id,
        permissionLevel: 'general_manager' as const,
      })),
    );

    const [draft] = await db
      .insert(drafts)
      .values({
        leagueId: league.id,
        draftMode: 'live',
        selectionMethod: 'standard',
        draftOrder: 'snake',
        currentPick: 0,
      })
      .returning();
    const [seatA, seatB] = await db
      .insert(draftParticipants)
      .values(
        teamFixtures.map((t, i) => ({
          draftId: draft.id,
          slot: i + 1,
          teamId: t.id,
          leagueId: league.id,
          controller: 'user' as const,
          seatName: t.name,
        })),
      )
      .returning();

    return { draft, gmA, gmB, seatA, seatB };
  }

  /** An offline mock draft with one seat held by the host. */
  async function seedMockDraft() {
    const host = getUser(1);
    const [draft] = await db
      .insert(drafts)
      .values({
        kind: 'mock',
        mockMode: 'offline',
        status: 'in-progress',
        createdBy: host.id,
        sport: 'baseball',
        draftMode: 'live',
        selectionMethod: 'standard',
      })
      .returning();
    const [seat] = await db
      .insert(draftParticipants)
      .values({
        draftId: draft.id,
        slot: 1,
        userId: host.id,
        controller: 'user',
        seatName: 'Host',
      })
      .returning();
    return { draft, host, seat };
  }

  it("league draft: a drafted player drops out of every seat's queue", async () => {
    const { draft, gmA, gmB, seatA, seatB } = await seedLeagueDraft();
    const [p1, p2, p3] = getTestPlayers().map((p) => p.id);
    await seedQueue(draft.id, seatA.id, [p1, p2, p3]);
    await seedQueue(draft.id, seatB.id, [p2, p3]);

    await draftPlayer(draft.id, seatB.id, p2);

    expect((await queueOf(gmA.id, draft.id)).map((r) => r.playerId)).toEqual([
      p1,
      p3,
    ]);
    expect((await queueOf(gmB.id, draft.id)).map((r) => r.playerId)).toEqual([
      p3,
    ]);
  });

  it('mock draft: a drafted player drops out of the seat queue', async () => {
    const { draft, host, seat } = await seedMockDraft();
    const [p1, p2] = getTestPlayers().map((p) => p.id);
    await seedQueue(draft.id, seat.id, [p1, p2]);

    await draftPlayer(draft.id, seat.id, p1);

    expect((await queueOf(host.id, draft.id)).map((r) => r.playerId)).toEqual([
      p2,
    ]);
  });

  it('reorders the shown queue once a queued player is drafted', async () => {
    const { draft, gmA, seatA, seatB } = await seedLeagueDraft();
    const [p1, p2, p3] = getTestPlayers().map((p) => p.id);
    await seedQueue(draft.id, seatA.id, [p1, p2, p3]);
    await draftPlayer(draft.id, seatB.id, p2);

    // The client only knows the undrafted entries.
    const reordered = await call('mutation', 'reorderDraftQueue', gmA.id, {
      draftId: draft.id,
      playerIds: [p3, p1],
    });

    expect(reordered.map((r) => [r.playerId, r.priority])).toEqual([
      [p3, 1],
      [p1, 2],
    ]);
    const stored = await db
      .select({ playerId: draftQueue.playerId })
      .from(draftQueue)
      .where(
        and(
          eq(draftQueue.draftId, draft.id),
          eq(draftQueue.participantId, seatA.id),
        ),
      );
    expect(stored.map((r) => r.playerId).sort()).toEqual([p1, p3].sort());
  });

  it('add and remove return the queue without drafted players', async () => {
    const { draft, gmA, seatA, seatB } = await seedLeagueDraft();
    const [p1, p2, p3, p4] = getTestPlayers().map((p) => p.id);
    await seedQueue(draft.id, seatA.id, [p1, p2, p3]);
    await draftPlayer(draft.id, seatB.id, p1);

    const added = await call('mutation', 'addToDraftQueue', gmA.id, {
      draftId: draft.id,
      playerId: p4,
    });
    expect(added.map((r) => r.playerId)).toEqual([p2, p3, p4]);

    const removed = await call('mutation', 'removeFromDraftQueue', gmA.id, {
      draftId: draft.id,
      playerId: p3,
    });
    expect(removed.map((r) => [r.playerId, r.priority])).toEqual([
      [p2, 1],
      [p4, 2],
    ]);
  });
});
