/**
 * Dashboard league summaries — team count (LS-10429) - DB Integration Tests
 *
 * `teamCount` on `UserLeagueSummary` used to count `league_members` rows, i.e.
 * human users. Bot/unclaimed teams have no member row, so a 12-team league
 * with one human showed "1 TEAMS" next to a "#1 OF 12" rank label. Both
 * summary resolvers must count `teams` rows instead.
 */

import type { GraphQLSchema } from 'graphql';
import { eq } from 'drizzle-orm';
import { getLeague, getUser } from '../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { schema } from '../index';

const { leagues, teams, leagueMembers } = integrationTestSchema;

type SummaryRow = { leagueId: number; teamCount: number; totalTeams: number };

function getResolver(s: GraphQLSchema, name: string) {
  const field = s.getQueryType()?.getFields()[name];
  if (!field?.resolve) throw new Error(`${name} resolver not found`);
  return field.resolve.bind(field);
}

describe('UserLeagueSummary.teamCount (LS-10429) - DB Integration Tests', () => {
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

  /** A 12-team league where only the owner's team has a league_members row. */
  async function seedOneMemberTwelveTeamLeague() {
    const owner = getUser(1);
    const [league] = await db
      .insert(leagues)
      .values({
        name: getLeague(0).name,
        owner: owner.id,
        inviteCode: getLeague(0).inviteCode,
        maxRosterSize: 2,
        draftStatus: 'completed',
      })
      .returning();

    const insertedTeams = await db
      .insert(teams)
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          name: `LS-10429 Team ${i + 1}`,
          leagueId: league.id,
        })),
      )
      .returning();

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: insertedTeams[0].id,
      permissionLevel: 'commissioner' as const,
    });

    return { owner, league };
  }

  async function runSummaries(name: string, userId: number) {
    return (await getResolver(schema, name)(
      {},
      {},
      { user: { id: userId, isAdmin: false }, db },
      undefined as never,
    )) as SummaryRow[];
  }

  it('getUserLeagueSummaries counts teams, not human members', async () => {
    const { owner, league } = await seedOneMemberTwelveTeamLeague();

    const result = await runSummaries('getUserLeagueSummaries', owner.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ leagueId: league.id, teamCount: 12 });
  });

  it('getArchivedUserLeagueSummaries counts teams and agrees with totalTeams', async () => {
    const { owner, league } = await seedOneMemberTwelveTeamLeague();
    await db
      .update(leagues)
      .set({ leaguePhase: 'offseason' })
      .where(eq(leagues.id, league.id));

    const result = await runSummaries(
      'getArchivedUserLeagueSummaries',
      owner.id,
    );

    expect(result).toHaveLength(1);
    // totalTeams comes from standings, which already counted teams — the two
    // numbers on the card must now agree.
    expect(result[0]).toMatchObject({
      leagueId: league.id,
      teamCount: 12,
      totalTeams: 12,
    });
  });
});
