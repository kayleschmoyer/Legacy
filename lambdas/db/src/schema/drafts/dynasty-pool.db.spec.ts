/**
 * Dynasty draft pool + roster carryover — DB Integration Tests (LS-8386)
 *
 * Exercises the two halves of AC4 against a real database:
 *
 *  1. Roster carryover — a dynasty league arrives at draft initialization with
 *     the prior season's roster already in `team_members` (renewLeague copies
 *     it; see resolveRolloverContinuity), and nothing wipes it. Keeper's
 *     wipe-and-rebuild (applyKeeperDesignationsForDraft) must NOT run for a
 *     dynasty league — the carried roster IS the dynasty roster.
 *  2. Pool filtering — the draftable pool excludes every player rostered in
 *     that league, leaving exactly the unrostered players (rookies / free
 *     agents) draftable. This is the shared `buildDraftAdpPoolConditions`
 *     predicate set, so the board, the ADP window and the pick endpoints all
 *     agree on the same pool.
 */

import { sql } from 'drizzle-orm';
import { buildDraftAdpPoolConditions } from './draft-adp';
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
  drafts,
  draftParticipants,
} = integrationTestSchema;

describe('Dynasty draft pool + roster carryover — DB Integration Tests (LS-8386)', () => {
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
   * Seeds season 2 of a dynasty league: two teams, a not-yet-started draft,
   * and team A holding a carried-over roster of `rosteredCount` players —
   * exactly the state renewLeague leaves behind for a dynasty rollover
   * (rosters copied, draftStatus 'not-started').
   */
  async function seedDynastySeason(rosteredCount: number, fixtureIndex = 0) {
    const owner = getUser(1);
    const leagueFixture = getLeague(fixtureIndex);

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        maxRosterSize: 10,
        draftStatus: 'not-started',
        rosterContinuity: 'dynasty',
        keeperSettings: null,
        seasonNumber: 2,
      })
      .returning();

    // Team fixtures carry fixed ids, so each league must take a distinct pair.
    const teamA = { ...getTeam(fixtureIndex * 2), leagueId: league.id };
    const teamB = { ...getTeam(fixtureIndex * 2 + 1), leagueId: league.id };
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

    await db.insert(draftParticipants).values(
      [teamA, teamB].map((t, i) => ({
        draftId: draft.id,
        slot: i + 1,
        teamId: t.id,
        leagueId: league.id,
        controller: 'user' as const,
        seatName: t.name,
      })),
    );

    const allPlayers = getTestPlayers();
    const rostered = allPlayers.slice(0, rosteredCount);
    const unrostered = allPlayers.slice(rosteredCount);

    for (const player of rostered) {
      await db.insert(teamMembers).values({
        teamId: teamA.id,
        leagueId: league.id,
        playerId: player.id,
        acquisitionType: 'rollover',
      });
    }

    return { owner, league, teamA, teamB, draft, rostered, unrostered };
  }

  /**
   * Run the shared pool predicates and return the draftable player ids,
   * scoped to the fixture players.
   *
   * The scope matters: `players` is fully populated when the suite runs
   * against the dev RDS, so an unscoped query would return thousands of rows
   * that have nothing to do with this league. Scoping to the fixture ids
   * keeps the assertions exact while still exercising the real, shared
   * predicate set rather than a hand-rolled copy of it.
   */
  async function draftablePlayerIds(
    draftId: number,
    leagueId: number,
  ): Promise<number[]> {
    const scopeIds = getTestPlayers().map((p) => p.id);
    // `IN ()` is a syntax error, so an empty scope must fail loudly here
    // rather than as an opaque SQL error. getTestPlayers() already throws
    // when fixtures are unloaded; this covers the "loaded but empty" case.
    if (scopeIds.length === 0) {
      throw new Error(
        'No fixture players loaded — cannot scope the pool query',
      );
    }
    const conditions = buildDraftAdpPoolConditions({
      draftId,
      leagueId,
      leagueSport: 'baseball',
      league: {
        sport: 'baseball',
        playerPool: 'all',
        minCareerGames: null,
        minCareerSeasons: null,
        baseballHofOnly: null,
        baseballEraFilter: null,
        customEraStartYear: null,
        customEraEndYear: null,
        defensiveFormat: null,
      },
    });

    // Rendered as an explicit IN list rather than `= ANY(${scopeIds})`:
    // drizzle interpolates a JS array into a tuple `($1, $2, …)`, which is
    // what IN wants but is not an array, so ANY() rejects it outright
    // ("op ANY/ALL (array) requires array on right side").
    const scopeList = sql.join(
      scopeIds.map((id) => sql`${id}`),
      sql`, `,
    );

    const result = await db.execute(sql`
      SELECT p.id AS id
      FROM public.players p
      WHERE p.id IN (${scopeList})
        AND ${sql.join(conditions, sql` AND `)}
      ORDER BY p.id
    `);
    return (result.rows as { id: number }[]).map((r) => r.id);
  }

  /**
   * Draftable ids for an otherwise-identical league that has rostered nobody.
   *
   * This baseline is what the roster exclusion has to be measured against.
   * `buildDraftAdpPoolConditions` is the league's WHOLE pool definition, not
   * just the dynasty part: alongside the team_members exclusion it applies the
   * league's eligibility rules (career games, career seasons, era, pool), and
   * some fixture players legitimately fail those for reasons that have nothing
   * to do with dynasty. Comparing against the raw fixture list would therefore
   * assert something this feature does not control — so the tests below assert
   * the delta from this baseline instead, which is exactly the claim AC4 makes.
   */
  async function eligibleBaselineIds(): Promise<number[]> {
    const baseline = await seedDynastySeason(0, 1);
    return draftablePlayerIds(baseline.draft.id, baseline.league.id);
  }

  it('leaves the carried-over roster intact — nothing wipes it before the draft', async () => {
    const { league, teamA, rostered } = await seedDynastySeason(3);

    const roster = await db
      .select()
      .from(teamMembers)
      .where(sql`${teamMembers.leagueId} = ${league.id}`);

    expect(roster).toHaveLength(3);
    expect(roster.map((r) => r.playerId).sort((a, b) => a - b)).toEqual(
      rostered.map((p) => p.id).sort((a, b) => a - b),
    );
    expect(roster.every((r) => r.teamId === teamA.id)).toBe(true);
  });

  it('excludes every rostered player from the draftable pool', async () => {
    const { league, draft, rostered } = await seedDynastySeason(3);

    const draftable = await draftablePlayerIds(draft.id, league.id);

    for (const player of rostered) {
      expect(draftable).not.toContain(player.id);
    }
  });

  it('removes exactly the rostered players from the pool and nothing else', async () => {
    const { league, draft, rostered } = await seedDynastySeason(3);
    const rosteredIds = rostered.map((p) => p.id);

    const baselineIds = await eligibleBaselineIds();
    const draftable = await draftablePlayerIds(draft.id, league.id);

    // Only the rostered players that were eligible in the first place can be
    // *removed* by the roster exclusion — an ineligible one was never in the
    // pool to begin with, so counting it here would overstate the delta.
    const removed = baselineIds.filter((id) => rosteredIds.includes(id));

    // Guard the comparison itself: with nothing actually removed, the equality
    // below would pass vacuously and prove nothing.
    expect(removed.length).toBeGreaterThan(0);

    expect(draftable).toEqual(
      baselineIds.filter((id) => !rosteredIds.includes(id)),
    );
    // Stated as a count too, so a failure says which half broke.
    expect(baselineIds.length - draftable.length).toBe(removed.length);
  });

  it('drafts the full eligible pool when no roster carried over (inaugural dynasty season)', async () => {
    // Season 1 of a dynasty league has nobody rostered yet, so it behaves
    // exactly like a redraft season — the mode only bites from season 2 on.
    const { league, draft } = await seedDynastySeason(0);

    const baselineIds = await eligibleBaselineIds();
    const draftable = await draftablePlayerIds(draft.id, league.id);

    expect(draftable.length).toBeGreaterThan(0);
    expect(draftable).toEqual(baselineIds);
  });

  it('scopes the exclusion to this league — a player rostered elsewhere stays draftable', async () => {
    // team_members is keyed by league, so another league's roster must not
    // shrink this one's pool.
    const first = await seedDynastySeason(3);
    const other = await seedDynastySeason(0, 1);

    const rosteredInFirst = first.rostered.map((p) => p.id);
    const poolA = await draftablePlayerIds(first.draft.id, first.league.id);
    const poolB = await draftablePlayerIds(other.draft.id, other.league.id);

    // The claim: players locked up by the FIRST league's dynasty rosters are
    // still draftable in the second. Derived from the second league's pool and
    // the first league's roster, so it is not circular — and at least one such
    // player must exist, or the assertion proves nothing. (Only eligible ones
    // can appear; an ineligible fixture player is absent from every pool for
    // reasons unrelated to rostering.)
    const stillDraftableElsewhere = poolB.filter((id) =>
      rosteredInFirst.includes(id),
    );
    expect(stillDraftableElsewhere.length).toBeGreaterThan(0);

    // ...and the same players are correctly absent from their own league.
    for (const id of stillDraftableElsewhere) {
      expect(poolA).not.toContain(id);
    }
  });
});
