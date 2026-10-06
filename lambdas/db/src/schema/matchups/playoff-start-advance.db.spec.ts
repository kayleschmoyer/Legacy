/**
 * autoAdvanceMatchups — final-week Advance starts the playoffs (LS-10804).
 *
 * Bug: advancing from the final regular-season week created the playoff
 * bracket and inserted round-1 matchups as 'scheduled', but never moved
 * leagues.currentWeek onto the playoff week. autoSelectGames only activates
 * matchups at leagues.currentWeek, so the playoffs never started, and a
 * repeated Advance hit the "bracket already exists" branch and silently
 * skipped.
 */
import { and, eq } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getUser } from '../../__fixtures__';
import { builder } from '../builder';
import type { Context } from '../builder';
import '../index';

const {
  leagues,
  teams,
  teamMembers,
  matchups,
  matchupPlayers,
  matchupPlayerGames,
  playoffBrackets,
} = integrationTestSchema;

type AdvanceResult = {
  leaguesProcessed: number;
  leaguesAdvanced: number;
  leaguesSkipped: number;
  errors: string[];
  skipReason: string | null;
};

describe('autoAdvanceMatchups final-week playoff start (LS-10804)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  function advance(leagueId: number): Promise<AdvanceResult> {
    const field = builder.toSchema().getMutationType()?.getFields()[
      'autoAdvanceMatchups'
    ];
    if (!field?.resolve) throw new Error('autoAdvanceMatchups not found');
    const context = {
      user: { id: getUser(1).id, isAdmin: true },
      db,
    } as unknown as Context;
    return Promise.resolve(
      field.resolve(undefined, { leagueId }, context, {} as never),
    ) as Promise<AdvanceResult>;
  }

  // Marks every rostered player in the given matchups as having game 1
  // resolved, so the advance gate (getSelectedGamesCountBatch) sees 1/1.
  async function completeGame1(matchupIds: number[]) {
    for (const matchupId of matchupIds) {
      const players = await db
        .select({ id: matchupPlayers.id })
        .from(matchupPlayers)
        .where(eq(matchupPlayers.matchupId, matchupId));
      await db.insert(matchupPlayerGames).values(
        players.map((p) => ({
          matchupPlayerId: p.id,
          gameNum: 1,
          noGameDataFound: true,
        })),
      );
    }
  }

  // 4-team league, 1 regular-season week (1 game/week), 4-team playoffs.
  // Week 1 is fully played, so the next Advance is the final-week one.
  async function seedFinalWeekLeague() {
    const players = getTestPlayers();
    const [league] = await db
      .insert(leagues)
      .values({
        name: 'LS-10804 Playoff Start',
        owner: getUser(0).id,
        inviteCode: `P${String(Date.now()).slice(-7)}`,
        draftStatus: 'completed',
        gamesPerMatchup: 1,
        totalMatchups: 1,
        playoffEnabled: true,
        playoffFormat: '4-team',
        playoffMultiWeek: false,
        currentWeek: 1,
        weekAdvanceStatus: 'idle',
      })
      .returning();

    const teamRows = await db
      .insert(teams)
      .values(
        [1, 2, 3, 4].map((n) => ({ name: `Team ${n}`, leagueId: league.id })),
      )
      .returning();

    await db.insert(teamMembers).values(
      teamRows.map((t, i) => ({
        leagueId: league.id,
        teamId: t.id,
        playerId: players[i].id,
      })),
    );

    const week1 = await db
      .insert(matchups)
      .values([
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: teamRows[0].id,
          team2Id: teamRows[1].id,
          gamesPerMatchup: 1,
          status: 'in_progress' as const,
          team1Score: '10',
          team2Score: '5',
        },
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: teamRows[2].id,
          team2Id: teamRows[3].id,
          gamesPerMatchup: 1,
          status: 'in_progress' as const,
          team1Score: '8',
          team2Score: '3',
        },
      ])
      .returning();

    await db.insert(matchupPlayers).values(
      week1.flatMap((m) =>
        [m.team1Id, m.team2Id].map((teamId) => ({
          matchupId: m.id,
          teamId: teamId as number,
          playerId: players[teamRows.findIndex((t) => t.id === teamId)].id,
        })),
      ),
    );
    await completeGame1(week1.map((m) => m.id));

    return { league, teamRows };
  }

  async function readLeague(leagueId: number) {
    const [row] = await db
      .select({
        currentWeek: leagues.currentWeek,
        currentMatchup: leagues.currentMatchup,
        weekAdvanceStatus: leagues.weekAdvanceStatus,
      })
      .from(leagues)
      .where(eq(leagues.id, leagueId));
    return row;
  }

  async function readWeek(leagueId: number, weekNumber: number) {
    return db
      .select({ id: matchups.id, status: matchups.status })
      .from(matchups)
      .where(
        and(
          eq(matchups.leagueId, leagueId),
          eq(matchups.weekNumber, weekNumber),
        ),
      );
  }

  it('moves currentWeek to the playoff start week and activates round 1 (AC1)', async () => {
    const { league } = await seedFinalWeekLeague();

    const result = await advance(league.id);

    expect(result.errors).toEqual([]);
    expect(result.skipReason).toBeNull();
    expect(result.leaguesAdvanced).toBe(1);

    const bracket = await db
      .select({ startWeek: playoffBrackets.startWeek })
      .from(playoffBrackets)
      .where(eq(playoffBrackets.leagueId, league.id));
    expect(bracket).toEqual([{ startWeek: 2 }]);

    const week2 = await readWeek(league.id, 2);
    expect(week2).toHaveLength(2);
    expect(week2.every((m) => m.status === 'in_progress')).toBe(true);

    const leagueRow = await readLeague(league.id);
    expect(leagueRow.currentWeek).toBe(2);
    expect(week2.map((m) => m.id)).toContain(leagueRow.currentMatchup);
    expect(leagueRow.weekAdvanceStatus).toBe('idle');

    const week1 = await readWeek(league.id, 1);
    expect(week1.every((m) => m.status === 'completed')).toBe(true);
  });

  it('starts the playoffs for a league stranded by the old behaviour (AC3)', async () => {
    const { league } = await seedFinalWeekLeague();
    await advance(league.id);

    // Recreate the pre-fix state: bracket + scheduled round-1 matchups exist,
    // but currentWeek is still the final regular-season week.
    await db
      .update(matchups)
      .set({ status: 'scheduled' })
      .where(and(eq(matchups.leagueId, league.id), eq(matchups.weekNumber, 2)));
    await db
      .update(leagues)
      .set({ currentWeek: 1 })
      .where(eq(leagues.id, league.id));

    const result = await advance(league.id);

    expect(result.errors).toEqual([]);
    expect(result.skipReason).toBeNull();
    expect(result.leaguesAdvanced).toBe(1);
    expect((await readLeague(league.id)).currentWeek).toBe(2);
    const week2 = await readWeek(league.id, 2);
    expect(week2.every((m) => m.status === 'in_progress')).toBe(true);
  });

  it('reports a specific reason instead of silently skipping once the playoffs are underway (AC3)', async () => {
    const { league } = await seedFinalWeekLeague();
    await advance(league.id);
    const week2 = await readWeek(league.id, 2);
    await completeGame1(week2.map((m) => m.id));

    const result = await advance(league.id);

    expect(result.leaguesAdvanced).toBe(0);
    expect(result.leaguesSkipped).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.skipReason).toBe(
      'Playoff week 2 is already underway. Advancing to the next playoff round is not supported yet.',
    );
    expect((await readLeague(league.id)).currentWeek).toBe(2);
  });
});
