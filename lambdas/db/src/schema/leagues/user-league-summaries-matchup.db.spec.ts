/**
 * Dashboard league summaries — the user's own matchup (LS-10776) - DB Integration Tests
 *
 * `leagues.current_matchup` is a single league-level pointer, not a per-team
 * one. `getUserLeagueSummaries` used to treat that row as the user's matchup
 * and assumed the user was team2 whenever they weren't team1, so a pointer at
 * another pairing (Theta vs Zeta) rendered a stranger's scores and opponent on
 * the dashboard card. The resolver must return the matchup the user's team is
 * actually in for the current week, or no matchup at all (bye).
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

const { leagues, teams, leagueMembers, matchups } = integrationTestSchema;

type SummaryRow = {
  leagueId: number;
  matchupId: number | null;
  matchupStatus: string | null;
  userScore: number | null;
  opponentScore: number | null;
  opponentTeamName: string | null;
};

function getResolver(s: GraphQLSchema, name: string) {
  const field = s.getQueryType()?.getFields()[name];
  if (!field?.resolve) throw new Error(`${name} resolver not found`);
  return field.resolve.bind(field);
}

describe('getUserLeagueSummaries user matchup (LS-10776) - DB Integration Tests', () => {
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

  /**
   * An active league in week 1 with four teams. The user owns "Mine"; week 1
   * pairs Mine vs Beta and Theta vs Zeta. `current_matchup` points at the
   * Theta vs Zeta row, which does not include the user.
   */
  async function seedLeague() {
    const owner = getUser(1);
    const [league] = await db
      .insert(leagues)
      .values({
        name: getLeague(0).name,
        owner: owner.id,
        inviteCode: getLeague(0).inviteCode,
        maxRosterSize: 2,
        draftStatus: 'completed',
        leaguePhase: 'active',
        currentWeek: 1,
      })
      .returning();

    const [mine, beta, theta, zeta] = await db
      .insert(teams)
      .values(
        ['Mine', 'Team Beta', 'Team Theta', 'Team Zeta'].map((name) => ({
          name,
          leagueId: league.id,
        })),
      )
      .returning();

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: mine.id,
      permissionLevel: 'commissioner' as const,
    });

    const [thetaVsZeta, betaVsMine] = await db
      .insert(matchups)
      .values([
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: theta.id,
          team2Id: zeta.id,
          team1Score: '324.54',
          team2Score: '503.34',
          status: 'in_progress' as const,
        },
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: beta.id,
          team2Id: mine.id,
          team1Score: '153.18',
          team2Score: '253.42',
          status: 'in_progress' as const,
        },
      ])
      .returning();

    await db
      .update(leagues)
      .set({ currentMatchup: thetaVsZeta.id })
      .where(eq(leagues.id, league.id));

    return { owner, league, mine, beta, thetaVsZeta, betaVsMine };
  }

  async function runSummaries(userId: number) {
    return (await getResolver(schema, 'getUserLeagueSummaries')(
      {},
      {},
      { user: { id: userId, isAdmin: false }, db },
      undefined as never,
    )) as SummaryRow[];
  }

  it("returns the user's own matchup when current_matchup points at another pairing", async () => {
    const { owner, league, betaVsMine } = await seedLeague();

    const result = await runSummaries(owner.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      leagueId: league.id,
      matchupId: betaVsMine.id,
      matchupStatus: 'in_progress',
      userScore: 253.42,
      opponentScore: 153.18,
      opponentTeamName: 'Team Beta',
    });
  });

  it('returns no matchup (bye) when the user has no matchup this week', async () => {
    const { owner, league, betaVsMine } = await seedLeague();
    await db.delete(matchups).where(eq(matchups.id, betaVsMine.id));

    const result = await runSummaries(owner.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      leagueId: league.id,
      matchupId: null,
      matchupStatus: null,
      userScore: null,
      opponentScore: null,
      opponentTeamName: null,
    });
  });

  it('ignores a matchup the user is in from a different week', async () => {
    const { owner, league, betaVsMine } = await seedLeague();
    await db
      .update(matchups)
      .set({ weekNumber: 2 })
      .where(eq(matchups.id, betaVsMine.id));

    const result = await runSummaries(owner.id);

    expect(result[0]).toMatchObject({ leagueId: league.id, matchupId: null });
  });

  it('still returns the current_matchup row when the user is in it', async () => {
    const { owner, league, betaVsMine } = await seedLeague();
    await db
      .update(leagues)
      .set({ currentMatchup: betaVsMine.id })
      .where(eq(leagues.id, league.id));

    const result = await runSummaries(owner.id);

    expect(result[0]).toMatchObject({
      leagueId: league.id,
      matchupId: betaVsMine.id,
      userScore: 253.42,
      opponentScore: 153.18,
      opponentTeamName: 'Team Beta',
    });
  });
});
