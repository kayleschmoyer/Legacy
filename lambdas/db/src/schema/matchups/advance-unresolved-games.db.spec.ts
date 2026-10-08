/**
 * Advance League Week with unresolved game slots (LS-10795).
 *
 * Bug: Next Step showed "Games Selected 1 of 1" and enabled Advance League
 * Week because Matchup.selectedGamesCount counted DISTINCT game_num across
 * ANY player row, while the autoAdvanceMatchups gate counts the MINIMUM
 * resolved slots per rostered player. With one player's Game 1 slot still
 * unresolved (prod league 14261), the gate saw 0/1 and skipped the league
 * without a skipReason, so the commissioner's Advance silently did nothing.
 */
import { and, eq } from 'drizzle-orm';
import { getSelectedGamesCountBatch } from '@legacy-sports/db-client';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getUser } from '../../__fixtures__';
import { builder } from '../builder';
import type { Context } from '../builder';
import { createSelectedGamesCountLoader } from '../dataloaders/matchup-loaders';
import '../index';

const {
  leagues,
  teams,
  teamMembers,
  matchups,
  matchupPlayers,
  matchupPlayerGames,
} = integrationTestSchema;

type AdvanceResult = {
  leaguesAdvanced: number;
  leaguesSkipped: number;
  errors: string[];
  skipReason: string | null;
};

describe('autoAdvanceMatchups with unresolved game slots (LS-10795)', () => {
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

  // 2-team league, 2 rostered players per team, 1 game per week. Week 1 is
  // in progress with Game 1 resolved for every player except one, whose
  // slot row exists but has no gameIdentifier yet (the league 14261 shape).
  async function seedWeekWithOneUnresolvedSlot() {
    const players = getTestPlayers();
    const [league] = await db
      .insert(leagues)
      .values({
        name: 'LS-10795 Unresolved Slot',
        owner: getUser(0).id,
        inviteCode: `U${String(Date.now()).slice(-7)}`,
        draftStatus: 'completed',
        gamesPerMatchup: 1,
        totalMatchups: 3,
        playoffEnabled: false,
        currentWeek: 1,
        weekAdvanceStatus: 'idle',
      })
      .returning();

    const teamRows = await db
      .insert(teams)
      .values([1, 2].map((n) => ({ name: `Team ${n}`, leagueId: league.id })))
      .returning();
    const roster = teamRows.flatMap((t, i) =>
      [players[i * 2], players[i * 2 + 1]].map((p) => ({
        teamId: t.id,
        playerId: p.id,
      })),
    );
    await db
      .insert(teamMembers)
      .values(roster.map((r) => ({ ...r, leagueId: league.id })));

    const [week1] = await db
      .insert(matchups)
      .values(
        [1, 2].map((weekNumber) => ({
          leagueId: league.id,
          weekNumber,
          team1Id: teamRows[0].id,
          team2Id: teamRows[1].id,
          gamesPerMatchup: 1,
          status:
            weekNumber === 1
              ? ('in_progress' as const)
              : ('scheduled' as const),
        })),
      )
      .returning();

    const mps = await db
      .insert(matchupPlayers)
      .values(roster.map((r) => ({ ...r, matchupId: week1.id })))
      .returning({ id: matchupPlayers.id });
    const [unresolved, ...resolved] = mps;
    await db.insert(matchupPlayerGames).values([
      { matchupPlayerId: unresolved.id, gameNum: 1 },
      ...resolved.map((mp) => ({
        matchupPlayerId: mp.id,
        gameNum: 1,
        noGameDataFound: true,
      })),
    ]);

    return { league, week1, unresolved };
  }

  async function readCurrentWeek(leagueId: number) {
    const [row] = await db
      .select({ currentWeek: leagues.currentWeek })
      .from(leagues)
      .where(eq(leagues.id, leagueId));
    return row.currentWeek;
  }

  it('reports the same Games Selected count the advance gate uses (AC1)', async () => {
    const { week1 } = await seedWeekWithOneUnresolvedSlot();

    const uiCount = await createSelectedGamesCountLoader(db).load(week1.id);
    const gateCount = (await getSelectedGamesCountBatch(db, [week1.id])).get(
      week1.id,
    );

    expect(uiCount).toBe(0);
    expect(uiCount).toBe(gateCount);
  });

  it('returns a specific skipReason instead of silently doing nothing (AC2)', async () => {
    const { league } = await seedWeekWithOneUnresolvedSlot();

    const result = await advance(league.id);

    expect(result.leaguesAdvanced).toBe(0);
    expect(result.leaguesSkipped).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.skipReason).toBe(
      "Week 1 can't advance yet: only 0 of 1 games are resolved for every rostered player. Some players' games are still being looked up — wait for game selection to finish, then try again.",
    );
    expect(await readCurrentWeek(league.id)).toBe(1);
  });

  it('advances Week 1 to Week 2 once every slot is resolved (AC3)', async () => {
    const { league, unresolved } = await seedWeekWithOneUnresolvedSlot();
    await db
      .update(matchupPlayerGames)
      .set({ noGameDataFound: true })
      .where(
        and(
          eq(matchupPlayerGames.matchupPlayerId, unresolved.id),
          eq(matchupPlayerGames.gameNum, 1),
        ),
      );

    const result = await advance(league.id);

    expect(result.errors).toEqual([]);
    expect(result.skipReason).toBeNull();
    expect(result.leaguesAdvanced).toBe(1);
    expect(await readCurrentWeek(league.id)).toBe(2);
  });
});
