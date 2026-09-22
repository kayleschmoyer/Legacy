/**
 * performUpdateMatchupScore — row lock + optimistic version check (LS-6391)
 *
 * FMD-011: `updateMatchupScore` used to run a bare
 * `UPDATE ... WHERE id = :matchupId` with no row-level lock and no version
 * check. Two concurrent scoring writers for the same matchup (e.g. a live
 * tick and a stat correction re-processing the same game) could commit in an
 * order that didn't match which one had the freshest stats, silently losing
 * the fresher update. This suite proves two things against a real Postgres
 * instance: the write now serializes behind a `SELECT ... FOR UPDATE` on the
 * matchup row, and a caller that passes a stale `expectedScoreVersion` is
 * rejected with a conflict rather than clobbering a fresher write.
 */
import { eq } from 'drizzle-orm';
import { performUpdateMatchupScore } from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, matchups } = integrationTestSchema;

describe('performUpdateMatchupScore - row lock + version check (LS-6391)', () => {
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

  async function seedMatchup() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);

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

    const [matchup] = await db
      .insert(matchups)
      .values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: team.id,
        status: 'scheduled',
      })
      .returning();

    return { league, team, matchup };
  }

  it('starts a new matchup at scoreVersion 0', async () => {
    const { matchup } = await seedMatchup();
    expect(matchup.scoreVersion).toBe(0);
  });

  it('bumps scoreVersion and stamps scoredAt on a score write', async () => {
    const { matchup } = await seedMatchup();

    const updated = await performUpdateMatchupScore(db, {
      matchupId: matchup.id,
      team1Score: 10,
      team2Score: 7,
    });

    expect(parseFloat(updated.team1Score!)).toBe(10);
    expect(parseFloat(updated.team2Score!)).toBe(7);
    expect(updated.scoreVersion).toBe(1);
    expect(updated.scoredAt).not.toBeNull();
  });

  it('does not bump scoreVersion when no score is provided', async () => {
    const { matchup } = await seedMatchup();

    const result = await performUpdateMatchupScore(db, {
      matchupId: matchup.id,
    });

    expect(result.scoreVersion).toBe(0);
  });

  it('rejects a write whose expectedScoreVersion is stale', async () => {
    const { matchup } = await seedMatchup();

    // A prior writer already bumped the version to 1.
    await performUpdateMatchupScore(db, {
      matchupId: matchup.id,
      team1Score: 5,
      team2Score: 3,
    });

    // A second writer that read the matchup before that write still has
    // expectedScoreVersion 0 — its write must be rejected, not silently
    // applied over the fresher score.
    await expect(
      performUpdateMatchupScore(db, {
        matchupId: matchup.id,
        team1Score: 999,
        team2Score: 999,
        expectedScoreVersion: 0,
      }),
    ).rejects.toThrow('updated by another writer');

    const [current] = await db
      .select({
        team1Score: matchups.team1Score,
        team2Score: matchups.team2Score,
        scoreVersion: matchups.scoreVersion,
      })
      .from(matchups)
      .where(eq(matchups.id, matchup.id));

    // The stale write must not have persisted.
    expect(parseFloat(current.team1Score!)).toBe(5);
    expect(parseFloat(current.team2Score!)).toBe(3);
    expect(current.scoreVersion).toBe(1);
  });

  it('accepts a write whose expectedScoreVersion matches current', async () => {
    const { matchup } = await seedMatchup();

    await performUpdateMatchupScore(db, {
      matchupId: matchup.id,
      team1Score: 5,
      team2Score: 3,
      expectedScoreVersion: 0,
    });

    const updated = await performUpdateMatchupScore(db, {
      matchupId: matchup.id,
      team1Score: 12,
      team2Score: 9,
      expectedScoreVersion: 1,
    });

    expect(parseFloat(updated.team1Score!)).toBe(12);
    expect(parseFloat(updated.team2Score!)).toBe(9);
    expect(updated.scoreVersion).toBe(2);
  });

  it('serializes two concurrent writers taking the same row lock, and rejects the loser instead of letting both apply', async () => {
    const { matchup } = await seedMatchup();

    // Both writers read the matchup before either wrote, so both carry
    // expectedScoreVersion 0. Without the row lock + version check, this is
    // exactly FMD-011's lost-update race: whichever commits last silently
    // wins regardless of freshness. With the fix, the row lock forces them
    // to serialize, and whichever runs second observes the first's
    // committed version and is rejected — the write is never silently lost,
    // it's an explicit conflict the caller can recompute and retry from.
    const settled = await Promise.allSettled([
      performUpdateMatchupScore(db, {
        matchupId: matchup.id,
        team1Score: 14,
        team2Score: 10,
        expectedScoreVersion: 0,
      }),
      performUpdateMatchupScore(db, {
        matchupId: matchup.id,
        team1Score: 13,
        team2Score: 11,
        expectedScoreVersion: 0,
      }),
    ]);

    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');

    // Exactly one writer must win — never both (a lost update silently
    // overwritten) and never neither (the lock never released).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toContain('updated by another writer');

    const winner = fulfilled[0].value;
    expect(winner.scoreVersion).toBe(1);

    const [current] = await db
      .select({
        team1Score: matchups.team1Score,
        team2Score: matchups.team2Score,
        scoreVersion: matchups.scoreVersion,
      })
      .from(matchups)
      .where(eq(matchups.id, matchup.id));

    // The persisted row must match the winner exactly — no blend of both
    // writers' scores, and no silent second write clobbering the first.
    expect(current.scoreVersion).toBe(1);
    expect(current.team1Score).toBe(winner.team1Score);
    expect(current.team2Score).toBe(winner.team2Score);
  });
});
