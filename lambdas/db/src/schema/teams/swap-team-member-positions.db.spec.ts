/**
 * swapTeamMemberPositionsInTx — third-member slot contention (LS-10245 / LS-10246)
 *
 * A swap request built from stale client state can target a slot that a third
 * member of the team holds. Clearing only the two swapped members left that
 * incumbent in place, so assigning the slot violated
 * `team_members_uk_team_position` and the mutation failed with an opaque 500.
 * These tests run the real transaction body against Postgres.
 */
import { eq } from 'drizzle-orm';
import { swapTeamMemberPositionsInTx } from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, teamMembers, leaguePosition } = integrationTestSchema;

describe('swapTeamMemberPositionsInTx (LS-10245 / LS-10246)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function seedThreeMemberTeam() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);
    const [playerA, playerB, playerC] = getTestPlayers();

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        currentWeek: 1,
      })
      .returning();
    const [team] = await db
      .insert(teams)
      .values({ name: 'Test Team', leagueId: league.id })
      .returning();

    const [posC] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'C' })
      .returning();
    const [pos1B] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: '1B' })
      .returning();
    const [pos2B] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: '2B' })
      .returning();

    const insertMember = async (playerId: number, positionId: number | null) =>
      (
        await db
          .insert(teamMembers)
          .values({
            teamId: team.id,
            leagueId: league.id,
            playerId,
            positionId,
          })
          .returning()
      )[0];

    return { insertMember, playerA, playerB, playerC, posC, pos1B, pos2B };
  }

  async function loadPositionId(memberId: number) {
    const [row] = await db
      .select({ positionId: teamMembers.positionId })
      .from(teamMembers)
      .where(eq(teamMembers.id, memberId));
    return row.positionId;
  }

  it('swaps two members holding each other’s slots', async () => {
    const { insertMember, playerA, playerB, posC, pos1B } =
      await seedThreeMemberTeam();
    const a = await insertMember(playerA.id, posC.id);
    const b = await insertMember(playerB.id, pos1B.id);

    await db.transaction((tx) =>
      swapTeamMemberPositionsInTx(tx, {
        teamMemberIdA: a.id,
        positionIdA: pos1B.id,
        teamMemberIdB: b.id,
        positionIdB: posC.id,
      }),
    );

    expect(await loadPositionId(a.id)).toBe(pos1B.id);
    expect(await loadPositionId(b.id)).toBe(posC.id);
  });

  it('benches a third member holding the target slot instead of violating the unique constraint', async () => {
    const { insertMember, playerA, playerB, playerC, posC, pos1B, pos2B } =
      await seedThreeMemberTeam();
    // Stale-client scenario: the caller believes A holds pos2B, but the server
    // has A on posC and a third member (C) on pos2B.
    const a = await insertMember(playerA.id, posC.id);
    const b = await insertMember(playerB.id, pos1B.id);
    const c = await insertMember(playerC.id, pos2B.id);

    const [updatedA, updatedB] = await db.transaction((tx) =>
      swapTeamMemberPositionsInTx(tx, {
        teamMemberIdA: a.id,
        positionIdA: pos1B.id,
        teamMemberIdB: b.id,
        positionIdB: pos2B.id,
      }),
    );

    expect(updatedA.positionId).toBe(pos1B.id);
    expect(updatedB.positionId).toBe(pos2B.id);
    expect(await loadPositionId(c.id)).toBeNull();
  });
});
