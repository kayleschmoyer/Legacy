/**
 * DB Integration Tests — LS-9319 Phase 1 / Phase 2 split for
 * autoProcessDraftPicks.
 *
 * Exercises predictAutoPick + runAutoPickLockedTransaction directly against a
 * real Postgres database (no mocks), mirroring the pattern draft-picks.db.spec.ts
 * uses for the sibling make-draft-pick / commissioner-pick call sites.
 *
 * Two scenarios:
 *   - Reuse path: nothing races between Phase 1 and Phase 2 — the locked
 *     transaction reuses the Phase 1 prediction instead of recomputing it.
 *   - TOCTOU fallback path: a concurrent pick advances the draft between
 *     Phase 1 and Phase 2 — the locked transaction detects the stale
 *     prediction and falls back to a full in-lock recomputation, still
 *     producing a correct pick for the NEW current team/pick slot.
 */

import { eq } from 'drizzle-orm';
import { commitDraftPick, getCurrentDraftPickInfo } from './helpers';
import * as helpersModule from './helpers';
import { fetchCandidatePool } from './candidate-pool';
import * as autoPickScorerModule from './auto-pick-scorer';
import {
  predictAutoPick,
  runAutoPickLockedTransaction,
} from './scheduled-mutations';
import { getLeague, getTeam, getUser } from '../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';

const { drafts, draftTeams, draftPicks, leagues, teams, leagueMembers } =
  integrationTestSchema;

describe('autoProcessDraftPicks Phase 1 / Phase 2 split — DB Integration (LS-9319)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  const PAST_DEADLINE = new Date(Date.now() - 60_000);

  /**
   * Seed a 2-team, live, in-progress draft with an already-expired deadline.
   * minCareerGames/minCareerSeasons are forced to 0 so the freshly-inserted
   * test players (no career_batting rows) pass league eligibility — the
   * schema default (50 games / 3 seasons) would otherwise filter every
   * candidate out of fetchCandidatePool.
   */
  async function seedExpiredDraftFixture() {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        maxRosterSize: 4,
        draftStatus: 'in-progress',
        sport: 'baseball',
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons: 0,
      })
      .returning();

    const teamFixtures = [0, 1].map((i) => ({
      ...getTeam(i),
      leagueId: league.id,
    }));
    await db.insert(teams).values(teamFixtures);

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: teamFixtures[0].id,
      permissionLevel: 'general_manager' as const,
    });

    const [draft] = await db
      .insert(drafts)
      .values({
        leagueId: league.id,
        draftMode: 'live',
        selectionMethod: 'standard',
        draftOrder: 'snake',
        currentPick: 0,
        currentPickDeadline: PAST_DEADLINE,
      })
      .returning();

    await db.insert(draftTeams).values(
      teamFixtures.map((t, i) => ({
        draftId: draft.id,
        teamId: t.id,
        leagueId: league.id,
        draftOrder: i + 1,
      })),
    );

    const players = getTestPlayers().slice(0, 8);

    return { owner, league, teams: teamFixtures, draft, players };
  }

  describe('reuse path — nothing races between Phase 1 and Phase 2', () => {
    it('reuses the Phase 1 prediction instead of recomputing under the lock', async () => {
      const { league, teams: teamFix, draft } = await seedExpiredDraftFixture();

      const getUnfilledPositionTypesSpy = jest.spyOn(
        helpersModule,
        'getUnfilledPositionTypes',
      );
      const guardConcurrentPickSpy = jest.spyOn(
        autoPickScorerModule,
        'guardConcurrentPick',
      );

      const candidatePool = await fetchCandidatePool(db, draft.id, league.id);
      expect(candidatePool).not.toBeNull();

      const predicted = await predictAutoPick(
        db,
        draft.id,
        league.id,
        candidatePool!,
      );
      expect(predicted).not.toBeNull();
      expect(predicted!.currentPickInfo.teamId).toBe(teamFix[0].id);
      expect(predicted!.currentPickInfo.overallPick).toBe(1);
      expect(getUnfilledPositionTypesSpy).toHaveBeenCalledTimes(1);
      // Not asserted here: Phase 1's own guardConcurrentPick call happens
      // inside selectAutoPickPlayer's same-module invocation, which jest.spyOn
      // cannot observe (it only intercepts calls made through the exported
      // binding from another module, like scheduled-mutations.ts's direct
      // Phase 2 call below).

      // Nothing races — Phase 2 runs immediately after Phase 1 with no
      // interleaving change to the draft's current pick.
      const pickResult = await runAutoPickLockedTransaction({
        db,
        draftId: draft.id,
        draftLeagueId: league.id,
        pickTimeLimitSeconds: 60,
        candidatePool: candidatePool!,
        predicted,
      });

      expect(pickResult).not.toBeNull();
      expect(pickResult!.currentPickInfo.teamId).toBe(teamFix[0].id);
      expect(pickResult!.currentPickInfo.overallPick).toBe(1);
      // Reused, not recomputed: the same player Phase 1 predicted.
      expect(pickResult!.autoPlayerId).toBe(predicted!.autoPlayerId);

      // getUnfilledPositionTypes must NOT be called again under the lock on
      // the reuse path — that's the whole point of AC1.
      expect(getUnfilledPositionTypesSpy).toHaveBeenCalledTimes(1);
      // guardConcurrentPick DOES still run under the lock (AC2) — this is the
      // one call scheduled-mutations.ts makes directly on the reuse path.
      expect(guardConcurrentPickSpy).toHaveBeenCalledTimes(1);

      const [insertedPick] = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));
      expect(insertedPick.teamId).toBe(teamFix[0].id);
      expect(insertedPick.overallPick).toBe(1);
      expect(insertedPick.playerId).toBe(pickResult!.autoPlayerId);
    });
  });

  describe('TOCTOU fallback path — a concurrent pick races ahead of the prediction', () => {
    it('falls back to a full in-lock recomputation and still produces a correct pick for the new current team', async () => {
      const {
        league,
        teams: teamFix,
        draft,
        players,
      } = await seedExpiredDraftFixture();

      const getUnfilledPositionTypesSpy = jest.spyOn(
        helpersModule,
        'getUnfilledPositionTypes',
      );
      const selectAutoPickPlayerSpy = jest.spyOn(
        autoPickScorerModule,
        'selectAutoPickPlayer',
      );

      const candidatePool = await fetchCandidatePool(db, draft.id, league.id);
      expect(candidatePool).not.toBeNull();

      // Phase 1: predict for the CURRENT state (team[0], overallPick 1).
      const predicted = await predictAutoPick(
        db,
        draft.id,
        league.id,
        candidatePool!,
      );
      expect(predicted).not.toBeNull();
      expect(predicted!.currentPickInfo.teamId).toBe(teamFix[0].id);
      expect(predicted!.currentPickInfo.overallPick).toBe(1);
      expect(getUnfilledPositionTypesSpy).toHaveBeenCalledTimes(1);
      expect(selectAutoPickPlayerSpy).toHaveBeenCalledTimes(1);

      // ── Simulate a concurrent invocation winning the race ────────────────
      // A different auto-pick/manual-pick invocation commits pick #1 for
      // team[0] and advances the draft to overallPick 2 (team[1]) BEFORE our
      // Phase 2 acquires the lock. Use a player Phase 1 did not predict so a
      // "double pick" bug would surface as a unique-constraint violation.
      const concurrentPlayerId = players[players.length - 1].id;
      expect(concurrentPlayerId).not.toBe(predicted!.autoPlayerId);

      const currentPickInfoBeforeRace = await getCurrentDraftPickInfo(
        db,
        draft.id,
      );
      await commitDraftPick({
        tx: db,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: currentPickInfoBeforeRace!,
        playerId: concurrentPlayerId,
        maxRosterSize: league.maxRosterSize,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      // The concurrent commit set a future deadline for team[1] (now + 60s).
      // Re-expire it to model two consecutively-expired picks racing through
      // the same window — otherwise our stale invocation's Phase 2 would
      // correctly bail out at the deadline re-check rather than reach the
      // TOCTOU comparison this test targets.
      await db
        .update(drafts)
        .set({ currentPickDeadline: PAST_DEADLINE })
        .where(eq(drafts.id, draft.id));

      // Phase 2 runs with the now-STALE Phase 1 prediction (team[0]/pick 1).
      const pickResult = await runAutoPickLockedTransaction({
        db,
        draftId: draft.id,
        draftLeagueId: league.id,
        pickTimeLimitSeconds: 60,
        candidatePool: candidatePool!,
        predicted,
      });

      expect(pickResult).not.toBeNull();
      // Fell back to the AUTHORITATIVE state, not the stale prediction.
      expect(pickResult!.currentPickInfo.teamId).toBe(teamFix[1].id);
      expect(pickResult!.currentPickInfo.overallPick).toBe(2);
      expect(pickResult!.autoPlayerId).not.toBe(concurrentPlayerId);

      // Full in-lock recomputation happened — one more call each beyond
      // Phase 1's own.
      expect(getUnfilledPositionTypesSpy).toHaveBeenCalledTimes(2);
      expect(selectAutoPickPlayerSpy).toHaveBeenCalledTimes(2);

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));
      expect(picks).toHaveLength(2);
      const secondPick = picks.find(
        (p: (typeof picks)[number]) => p.overallPick === 2,
      );
      expect(secondPick).toBeDefined();
      expect(secondPick!.teamId).toBe(teamFix[1].id);
      expect(secondPick!.playerId).toBe(pickResult!.autoPlayerId);
    });
  });
});
