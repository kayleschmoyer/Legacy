/**
 * Commissioner "Select Game N" silently did nothing (LS-10780).
 *
 * Bug: autoSelectGames derived the week's next game number from an arbitrary
 * "reference" matchup (`currentMatchups[0]`, unordered SELECT). In prod
 * league 14253 one Week 1 matchup had a rostered player with no assigned
 * season and therefore no slot rows, pinning that matchup's min resolved
 * count at 0 while the other matchup sat at 3/7. Depending on row order the
 * mutation re-queued an already-finished game (a fast no-op) instead of
 * Game 4, and every skip branch returned nothing the UI could show.
 */
const mockSqsSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSqsSend })),
  SendMessageCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

import { eq } from 'drizzle-orm';
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
} = integrationTestSchema;

type SelectResult = {
  leaguesProcessed: number;
  gamesTriggered: number;
  errors: string[];
  skipReason: string | null;
};

const GAMES_PER_MATCHUP = 3;

describe('autoSelectGames for a single league (LS-10780)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
    mockSqsSend.mockClear();
    process.env.SQS_SELECT_GAME_URL =
      'https://sqs.us-east-1.amazonaws.com/123/select-game.fifo';
  });

  afterEach(() => {
    delete process.env.SQS_SELECT_GAME_URL;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  function selectGames(leagueId: number): Promise<SelectResult> {
    const field = builder.toSchema().getMutationType()?.getFields()[
      'autoSelectGames'
    ];
    if (!field?.resolve) throw new Error('autoSelectGames not found');
    const context = {
      user: { id: getUser(1).id, isAdmin: true },
      db,
    } as unknown as Context;
    return Promise.resolve(
      field.resolve(undefined, { leagueId }, context, {} as never),
    ) as Promise<SelectResult>;
  }

  function queuedGameNumbers(): number[] {
    return mockSqsSend.mock.calls.map(
      ([command]: [{ MessageBody: string }]) =>
        (JSON.parse(command.MessageBody) as { game: number }).game,
    );
  }

  // 4-team league, 2 rostered players per team, two Week 1 matchups. The
  // first-inserted matchup has `aheadGames` resolved for every player; the
  // second has one player with no slot rows at all (no assigned season —
  // the league 14253 shape) and `aheadGames` for the other three.
  async function seedWeek1({
    aheadGames,
    week1Status = 'in_progress',
  }: {
    aheadGames: number;
    week1Status?: 'in_progress' | 'completed';
  }) {
    const players = getTestPlayers();
    const [league] = await db
      .insert(leagues)
      .values({
        name: 'LS-10780 Select Game',
        owner: getUser(0).id,
        inviteCode: `S${String(Date.now()).slice(-7)}`,
        draftStatus: 'completed',
        gamesPerMatchup: GAMES_PER_MATCHUP,
        totalMatchups: 3,
        playoffEnabled: false,
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
    const roster = teamRows.flatMap((t, i) =>
      [players[i * 2], players[i * 2 + 1]].map((p) => ({
        teamId: t.id,
        playerId: p.id,
      })),
    );
    await db
      .insert(teamMembers)
      .values(roster.map((r) => ({ ...r, leagueId: league.id })));

    const [ahead, stuck] = await db
      .insert(matchups)
      .values(
        [0, 2].map((i) => ({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: teamRows[i].id,
          team2Id: teamRows[i + 1].id,
          gamesPerMatchup: GAMES_PER_MATCHUP,
          status: week1Status,
          statsLoadingStatus: 'completed' as const,
        })),
      )
      .returning();

    const aheadPlayers = await db
      .insert(matchupPlayers)
      .values(roster.slice(0, 4).map((r) => ({ ...r, matchupId: ahead.id })))
      .returning({ id: matchupPlayers.id });
    const [seasonless, ...stuckPlayers] = await db
      .insert(matchupPlayers)
      .values(roster.slice(4).map((r) => ({ ...r, matchupId: stuck.id })))
      .returning({ id: matchupPlayers.id });

    const resolvedSlots = [...aheadPlayers, ...stuckPlayers].flatMap((mp) =>
      Array.from({ length: aheadGames }, (_, g) => ({
        matchupPlayerId: mp.id,
        gameNum: g + 1,
        noGameDataFound: true,
      })),
    );
    if (resolvedSlots.length > 0) {
      await db.insert(matchupPlayerGames).values(resolvedSlots);
    }

    return { league, ahead, stuck, seasonless };
  }

  it('queues the least-progressed matchup’s next game, not an arbitrary matchup’s', async () => {
    const { league } = await seedWeek1({ aheadGames: 2 });

    const result = await selectGames(league.id);

    // The "stuck" matchup is at 0 resolved games, so Game 1 is next for the
    // week — queuing Game 3 off the first matchup would skip Games 1-2 for
    // the stuck matchup's seasonless player forever.
    expect(result.errors).toEqual([]);
    expect(result.skipReason).toBeNull();
    expect(result.gamesTriggered).toBe(2);
    expect(queuedGameNumbers()).toEqual([1, 1]);
  });

  it('queues the next game for every matchup once the week is level', async () => {
    const { league, seasonless } = await seedWeek1({ aheadGames: 2 });
    // What the game-selection lambda now writes for a seasonless player.
    await db.insert(matchupPlayerGames).values(
      [1, 2].map((gameNum) => ({
        matchupPlayerId: seasonless.id,
        gameNum,
        noGameDataFound: true,
      })),
    );

    const result = await selectGames(league.id);

    expect(result.skipReason).toBeNull();
    expect(queuedGameNumbers()).toEqual([3, 3]);
    const statuses = await db
      .select({ status: matchups.statsLoadingStatus })
      .from(matchups)
      .where(eq(matchups.leagueId, league.id));
    expect(statuses.map((s) => s.status)).toEqual(['queued', 'queued']);
  });

  it('returns a specific skipReason when every game is already selected', async () => {
    const { league, seasonless } = await seedWeek1({
      aheadGames: GAMES_PER_MATCHUP,
    });
    await db.insert(matchupPlayerGames).values(
      [1, 2, 3].map((gameNum) => ({
        matchupPlayerId: seasonless.id,
        gameNum,
        noGameDataFound: true,
      })),
    );

    const result = await selectGames(league.id);

    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(result.skipReason).toBe(
      'All 3 games are already selected for week 1. Advance the league to the next week.',
    );
  });

  it('returns a specific skipReason when the current week has no matchups in progress', async () => {
    const { league } = await seedWeek1({
      aheadGames: GAMES_PER_MATCHUP,
      week1Status: 'completed',
    });

    const result = await selectGames(league.id);

    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(result.skipReason).toBe(
      'No games to select: week 1 has no matchups in progress. Advance the league to the next week first.',
    );
  });
});
