/**
 * Keeper Application at Draft Initialization - DB Integration Tests (LS-8674)
 *
 * Exercises applyKeeperDesignationsForDraft against a real database: both
 * cost models (round-penalty forfeited-pick recording, auction-budget
 * deduction), pool exclusion (kept players land in team_members), and a
 * keeper league with zero designations behaving identically to redraft.
 */

import { eq } from 'drizzle-orm';
import { applyKeeperDesignationsForDraft } from './keeper-application';
import { getLeague, getTeam, getUser } from '../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';

const {
  leagues,
  teams,
  leagueMembers,
  teamMembers,
  keeperDesignations,
  drafts,
  draftTeams,
  draftForfeitedPicks,
  auctionBudgets,
} = integrationTestSchema;

describe('applyKeeperDesignationsForDraft - DB Integration Tests (LS-8674)', () => {
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
   * Seeds a keeper league with two teams, a live draft row, and (for team 0)
   * a carried-forward roster of `rosterSize` players — mirroring what
   * renewLeague(keepRosters=true) + designateKeeper would have produced
   * before draft initialization.
   */
  async function seedKeeperDraft(options: {
    costModel: 'round-penalty' | 'auction-budget';
    rosterSize?: number;
    maxRosterSize?: number;
    auctionBudget?: number;
    auctionMinBid?: number;
  }) {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);
    const maxRosterSize = options.maxRosterSize ?? 10;

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        maxRosterSize,
        draftStatus: 'not-started',
        rosterContinuity: 'keeper',
        keeperSettings: {
          keeperCount: 3,
          costModel: options.costModel,
          maxConsecutiveKeeps: null,
          rookieExempt: false,
        },
        seasonNumber: 2,
        auctionBudget: options.auctionBudget ?? 260,
        auctionMinBid: options.auctionMinBid ?? 1,
      })
      .returning();

    const teamA = { ...getTeam(0), leagueId: league.id };
    const teamB = { ...getTeam(1), leagueId: league.id };
    await db.insert(teams).values([teamA, teamB]);

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: teamA.id,
      permissionLevel: 'commissioner' as const,
    });

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
    await db.insert(draftTeams).values([
      {
        draftId: draft.id,
        teamId: teamA.id,
        leagueId: league.id,
        draftOrder: 1,
      },
      {
        draftId: draft.id,
        teamId: teamB.id,
        leagueId: league.id,
        draftOrder: 2,
      },
    ]);

    const rosterSize = options.rosterSize ?? 2;
    const players = getTestPlayers().slice(0, rosterSize);
    for (const [i, player] of players.entries()) {
      await db.insert(teamMembers).values({
        teamId: teamA.id,
        leagueId: league.id,
        playerId: player.id,
        draftRound: i + 1,
        salary: 10 + i * 5,
      });
    }

    return { owner, league, teamA, teamB, draft, players };
  }

  it('round-penalty: applies cost from the carried-forward draftRound and records the forfeited pick', async () => {
    const { league, teamA, draft, players } = await seedKeeperDraft({
      costModel: 'round-penalty',
      rosterSize: 1,
    });
    await db.insert(keeperDesignations).values({
      leagueId: league.id,
      teamId: teamA.id,
      playerId: players[0].id,
      season: league.seasonNumber,
      status: 'pending',
    });

    const result = await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'round-penalty',
      auctionBudget: league.auctionBudget,
      auctionMinBid: league.auctionMinBid ?? 1,
    });

    expect(result.appliedCount).toBe(1);
    expect(result.keptPlayerIdsByTeam.get(teamA.id)).toEqual([players[0].id]);

    const [designation] = await db
      .select()
      .from(keeperDesignations)
      .where(eq(keeperDesignations.leagueId, league.id));
    expect(designation).toMatchObject({ status: 'applied', costRound: 1 });

    const roster = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.leagueId, league.id));
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      playerId: players[0].id,
      teamId: teamA.id,
      acquisitionType: 'keeper',
      draftRound: 1,
    });

    const forfeited = await db
      .select()
      .from(draftForfeitedPicks)
      .where(eq(draftForfeitedPicks.draftId, draft.id));
    expect(forfeited).toHaveLength(1);
    expect(forfeited[0]).toMatchObject({ teamId: teamA.id, round: 1 });
  });

  it('round-penalty: falls back to the league last round for a keeper with no carried-forward draftRound', async () => {
    const { league, teamA, draft, players } = await seedKeeperDraft({
      costModel: 'round-penalty',
      rosterSize: 0,
      maxRosterSize: 12,
    });
    const [undraftedPickup] = getTestPlayers().slice(0, 1);
    await db.insert(teamMembers).values({
      teamId: teamA.id,
      leagueId: league.id,
      playerId: undraftedPickup.id,
      acquisitionType: 'waiver',
      draftRound: null,
    });
    await db.insert(keeperDesignations).values({
      leagueId: league.id,
      teamId: teamA.id,
      playerId: undraftedPickup.id,
      season: league.seasonNumber,
      status: 'pending',
    });

    await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'round-penalty',
      auctionBudget: league.auctionBudget,
      auctionMinBid: league.auctionMinBid ?? 1,
    });

    const [designation] = await db
      .select()
      .from(keeperDesignations)
      .where(eq(keeperDesignations.leagueId, league.id));
    expect(designation.costRound).toBe(12);
  });

  it('round-penalty: bumps a colliding forfeited round to the next open round for the same team', async () => {
    const { league, teamA, draft, players } = await seedKeeperDraft({
      costModel: 'round-penalty',
      rosterSize: 2,
    });
    // Both seeded players are drafted in round 1 last season.
    await db
      .update(teamMembers)
      .set({ draftRound: 1 })
      .where(eq(teamMembers.leagueId, league.id));
    for (const player of players) {
      await db.insert(keeperDesignations).values({
        leagueId: league.id,
        teamId: teamA.id,
        playerId: player.id,
        season: league.seasonNumber,
        status: 'pending',
      });
    }

    await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'round-penalty',
      auctionBudget: league.auctionBudget,
      auctionMinBid: league.auctionMinBid ?? 1,
    });

    const forfeited = await db
      .select()
      .from(draftForfeitedPicks)
      .where(eq(draftForfeitedPicks.draftId, draft.id));
    expect(forfeited).toHaveLength(2);
    expect(forfeited.map((f) => f.round).sort()).toEqual([1, 2]);
  });

  it('round-penalty: throws when a team has more keepers than available draft rounds', async () => {
    const { league, teamA, draft, players } = await seedKeeperDraft({
      costModel: 'round-penalty',
      rosterSize: 2,
      maxRosterSize: 1,
    });
    // Both seeded players are drafted in round 1 last season, but the league
    // only has a single round — no open round exists for the second keeper.
    await db
      .update(teamMembers)
      .set({ draftRound: 1 })
      .where(eq(teamMembers.leagueId, league.id));
    for (const player of players) {
      await db.insert(keeperDesignations).values({
        leagueId: league.id,
        teamId: teamA.id,
        playerId: player.id,
        season: league.seasonNumber,
        status: 'pending',
      });
    }

    await expect(
      applyKeeperDesignationsForDraft(db, {
        leagueId: league.id,
        draftId: draft.id,
        season: league.seasonNumber,
        maxRosterSize: league.maxRosterSize,
        costModel: 'round-penalty',
        auctionBudget: league.auctionBudget,
        auctionMinBid: league.auctionMinBid ?? 1,
      }),
    ).rejects.toThrow(/more keepers than available draft rounds/);
  });

  it('auction-budget: deducts the carried-forward salary and seeds auction_budgets before bidding opens', async () => {
    const { league, teamA, draft, players } = await seedKeeperDraft({
      costModel: 'auction-budget',
      rosterSize: 1,
      auctionBudget: 260,
    });
    await db.insert(keeperDesignations).values({
      leagueId: league.id,
      teamId: teamA.id,
      playerId: players[0].id,
      season: league.seasonNumber,
      status: 'pending',
    });

    await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'auction-budget',
      auctionBudget: league.auctionBudget,
      auctionMinBid: league.auctionMinBid ?? 1,
    });

    const [designation] = await db
      .select()
      .from(keeperDesignations)
      .where(eq(keeperDesignations.leagueId, league.id));
    expect(designation).toMatchObject({ status: 'applied', costAmount: 10 });

    const [budget] = await db
      .select()
      .from(auctionBudgets)
      .where(eq(auctionBudgets.draftId, draft.id));
    expect(budget).toMatchObject({
      teamId: teamA.id,
      remainingBudget: 250,
      playersWon: 1,
    });
  });

  it('auction-budget: falls back to auctionMinBid for a keeper with no carried-forward salary', async () => {
    const { league, teamA, draft } = await seedKeeperDraft({
      costModel: 'auction-budget',
      rosterSize: 0,
      auctionBudget: 260,
      auctionMinBid: 5,
    });
    const [undraftedPickup] = getTestPlayers().slice(0, 1);
    await db.insert(teamMembers).values({
      teamId: teamA.id,
      leagueId: league.id,
      playerId: undraftedPickup.id,
      acquisitionType: 'waiver',
      salary: null,
    });
    await db.insert(keeperDesignations).values({
      leagueId: league.id,
      teamId: teamA.id,
      playerId: undraftedPickup.id,
      season: league.seasonNumber,
      status: 'pending',
    });

    await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'auction-budget',
      auctionBudget: league.auctionBudget,
      auctionMinBid: 5,
    });

    const [budget] = await db
      .select()
      .from(auctionBudgets)
      .where(eq(auctionBudgets.draftId, draft.id));
    expect(budget).toMatchObject({ remainingBudget: 255, playersWon: 1 });
  });

  it('zero designations: wipes any carried-over roster and behaves identically to redraft', async () => {
    const { league, draft } = await seedKeeperDraft({
      costModel: 'round-penalty',
      rosterSize: 2,
    });
    // No keeper_designations rows at all — the league's commissioner
    // renewed with keepRosters=true but nobody designated a keeper.

    const result = await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'round-penalty',
      auctionBudget: league.auctionBudget,
      auctionMinBid: league.auctionMinBid ?? 1,
    });

    expect(result).toEqual({ appliedCount: 0, keptPlayerIdsByTeam: new Map() });

    const roster = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.leagueId, league.id));
    expect(roster).toHaveLength(0);

    const forfeited = await db
      .select()
      .from(draftForfeitedPicks)
      .where(eq(draftForfeitedPicks.draftId, draft.id));
    expect(forfeited).toHaveLength(0);

    const budgets = await db
      .select()
      .from(auctionBudgets)
      .where(eq(auctionBudgets.draftId, draft.id));
    expect(budgets).toHaveLength(0);
  });

  it('a released designation is not applied and does not block the roster wipe', async () => {
    const { league, teamA, draft, players } = await seedKeeperDraft({
      costModel: 'round-penalty',
      rosterSize: 1,
    });
    await db.insert(keeperDesignations).values({
      leagueId: league.id,
      teamId: teamA.id,
      playerId: players[0].id,
      season: league.seasonNumber,
      status: 'released',
    });

    const result = await applyKeeperDesignationsForDraft(db, {
      leagueId: league.id,
      draftId: draft.id,
      season: league.seasonNumber,
      maxRosterSize: league.maxRosterSize,
      costModel: 'round-penalty',
      auctionBudget: league.auctionBudget,
      auctionMinBid: league.auctionMinBid ?? 1,
    });

    expect(result.appliedCount).toBe(0);
    const roster = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.leagueId, league.id));
    expect(roster).toHaveLength(0);
  });
});
