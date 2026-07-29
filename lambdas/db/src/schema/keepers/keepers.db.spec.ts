/**
 * Keeper Designations - DB Integration Tests (LS-8673)
 *
 * Exercises designateKeeper/undesignateKeeper against a real database:
 * roster ownership, keeperCount cap, rookieExempt bypass, maxConsecutiveKeeps
 * via the previousLeagueId lineage chain, and the draft-live lock.
 */

import { eq } from 'drizzle-orm';
import { designateKeeper, undesignateKeeper } from './mutations';
import { getLeague, getTeam, getUser } from '../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';

const { leagues, teams, leagueMembers, teamMembers, keeperDesignations } =
  integrationTestSchema;

describe('Keeper Designations - DB Integration Tests (LS-8673)', () => {
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
   * Seed a keeper league with one team, one manager, and a roster of players
   * on that team. `keeperSettingsOverrides` merges onto sane defaults;
   * `playerTotalGames` explicitly pins each seeded player's totalGames so
   * rookie-exemption outcomes are deterministic regardless of what the
   * shared test-player pool looks like in a given environment.
   */
  async function seedKeeperLeague(options: {
    keeperCount?: number;
    maxConsecutiveKeeps?: number | null;
    rookieExempt?: boolean;
    draftStatus?:
      | 'not-started'
      | 'queued'
      | 'in-progress'
      | 'paused'
      | 'completed';
    rosterSize?: number;
    playerTotalGames?: number[];
  }) {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        maxRosterSize: 25,
        draftStatus: options.draftStatus ?? 'not-started',
        rosterContinuity: 'keeper',
        keeperSettings: {
          keeperCount: options.keeperCount ?? 2,
          costModel: 'round-penalty',
          maxConsecutiveKeeps: options.maxConsecutiveKeeps ?? null,
          rookieExempt: options.rookieExempt ?? false,
        },
        seasonNumber: 2,
      })
      .returning();

    const teamFixture = { ...getTeam(0), leagueId: league.id };
    await db.insert(teams).values(teamFixture);

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: teamFixture.id,
      permissionLevel: 'general_manager' as const,
    });

    const rosterSize = options.rosterSize ?? 3;
    const players = getTestPlayers().slice(0, rosterSize);

    for (const [i, player] of players.entries()) {
      const totalGames = options.playerTotalGames?.[i] ?? 500;
      await db
        .update(integrationTestSchema.players)
        .set({ totalGames })
        .where(eq(integrationTestSchema.players.id, player.id));

      await db.insert(teamMembers).values({
        teamId: teamFixture.id,
        leagueId: league.id,
        playerId: player.id,
        draftRound: i + 1,
      });
    }

    return { owner, league, team: teamFixture, players };
  }

  it('designates an eligible roster player and returns the pending row', async () => {
    const { owner, league, team, players } = await seedKeeperLeague({
      keeperCount: 2,
    });

    const result = await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });

    expect(result).toMatchObject({
      leagueId: league.id,
      teamId: team.id,
      playerId: players[0].id,
      season: league.seasonNumber,
      status: 'pending',
    });
  });

  it('rejects a player who is not on the caller roster', async () => {
    const { owner, league } = await seedKeeperLeague({});
    const [otherPlayer] = getTestPlayers().slice(3, 4);

    await expect(
      designateKeeper(db, {
        leagueId: league.id,
        playerId: otherPlayer.id,
        userId: owner.id,
      }),
    ).rejects.toThrow('not on your roster');
  });

  it('rejects a duplicate designation for the same player/season', async () => {
    const { owner, league, players } = await seedKeeperLeague({
      keeperCount: 2,
    });

    await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });

    await expect(
      designateKeeper(db, {
        leagueId: league.id,
        playerId: players[0].id,
        userId: owner.id,
      }),
    ).rejects.toThrow('already designated');
  });

  it('enforces the keeperCount cap', async () => {
    const { owner, league, players } = await seedKeeperLeague({
      keeperCount: 1,
      rosterSize: 2,
    });

    await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });

    await expect(
      designateKeeper(db, {
        leagueId: league.id,
        playerId: players[1].id,
        userId: owner.id,
      }),
    ).rejects.toThrow('Keeper limit reached');
  });

  it('rookieExempt: a zero-career-games player does not count against the keeperCount cap', async () => {
    const { owner, league, players } = await seedKeeperLeague({
      keeperCount: 1,
      rookieExempt: true,
      rosterSize: 2,
      playerTotalGames: [0, 500], // players[0] is a "rookie", players[1] is not
    });

    // Rookie fills the (exempt) slot first — does not consume the cap.
    await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });

    // Non-rookie still gets the one real keeperCount slot.
    const result = await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[1].id,
      userId: owner.id,
    });
    expect(result.status).toBe('pending');
  });

  it('rejects designation once the draft is live', async () => {
    const { owner, league, players } = await seedKeeperLeague({
      draftStatus: 'in-progress',
    });

    await expect(
      designateKeeper(db, {
        leagueId: league.id,
        playerId: players[0].id,
        userId: owner.id,
      }),
    ).rejects.toThrow('locked once the draft has started');
  });

  it('enforces maxConsecutiveKeeps via the previousLeagueId lineage chain', async () => {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);
    const player = getTestPlayers()[0];
    await db
      .update(integrationTestSchema.players)
      .set({ totalGames: 500 })
      .where(eq(integrationTestSchema.players.id, player.id));

    // Season 1 (ancestor): the player was kept and the designation was
    // applied at draft init.
    const [priorLeague] = await db
      .insert(leagues)
      .values({
        name: `${leagueFixture.name} S1`,
        owner: owner.id,
        inviteCode: 'KPRS0001',
        maxRosterSize: 25,
        rosterContinuity: 'keeper',
        keeperSettings: {
          keeperCount: 2,
          costModel: 'round-penalty',
          maxConsecutiveKeeps: 1,
          rookieExempt: false,
        },
        seasonNumber: 1,
      })
      .returning();
    const priorTeam = { ...getTeam(0), leagueId: priorLeague.id };
    await db.insert(teams).values(priorTeam);
    await db.insert(leagueMembers).values({
      leagueId: priorLeague.id,
      userId: owner.id,
      teamId: priorTeam.id,
      permissionLevel: 'general_manager' as const,
    });
    await db.insert(keeperDesignations).values({
      leagueId: priorLeague.id,
      teamId: priorTeam.id,
      playerId: player.id,
      season: 1,
      status: 'applied',
    });

    // Season 2 (current): renewed league linked via previousLeagueId.
    const [league] = await db
      .insert(leagues)
      .values({
        name: `${leagueFixture.name} S2`,
        owner: owner.id,
        inviteCode: 'KPRS0002',
        maxRosterSize: 25,
        rosterContinuity: 'keeper',
        keeperSettings: {
          keeperCount: 2,
          costModel: 'round-penalty',
          maxConsecutiveKeeps: 1,
          rookieExempt: false,
        },
        seasonNumber: 2,
        previousLeagueId: priorLeague.id,
      })
      .returning();
    const team = { ...getTeam(1), leagueId: league.id };
    await db.insert(teams).values(team);
    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: team.id,
      permissionLevel: 'general_manager' as const,
    });
    await db.insert(teamMembers).values({
      teamId: team.id,
      leagueId: league.id,
      playerId: player.id,
      draftRound: 1,
    });

    // maxConsecutiveKeeps = 1 and the player was already kept for 1
    // consecutive season (Season 1) — Season 2 would be a 2nd consecutive
    // keep, which exceeds the cap.
    await expect(
      designateKeeper(db, {
        leagueId: league.id,
        playerId: player.id,
        userId: owner.id,
      }),
    ).rejects.toThrow('maximum 1 consecutive season');
  });

  it('undesignateKeeper releases a pending designation and allows re-designation', async () => {
    const { owner, league, players } = await seedKeeperLeague({
      keeperCount: 1,
    });

    await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });

    const released = await undesignateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });
    expect(released.status).toBe('released');

    // A manager can change their mind again before the draft — the released
    // row is reused (flipped back to 'pending'), not rejected as a duplicate.
    const redesignated = await designateKeeper(db, {
      leagueId: league.id,
      playerId: players[0].id,
      userId: owner.id,
    });
    expect(redesignated.id).toBe(released.id);
    expect(redesignated.status).toBe('pending');
  });

  it('undesignateKeeper rejects when there is no pending designation', async () => {
    const { owner, league, players } = await seedKeeperLeague({});

    await expect(
      undesignateKeeper(db, {
        leagueId: league.id,
        playerId: players[0].id,
        userId: owner.id,
      }),
    ).rejects.toThrow('No pending keeper designation');
  });
});
