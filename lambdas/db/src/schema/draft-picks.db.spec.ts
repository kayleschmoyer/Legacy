/**
 * Draft Picks - DB Integration Tests
 *
 * Tests database-level draft pick operations: schema constraints, ordering,
 * cascade behavior, and roster integration. Resolver-level authorization
 * (whose turn it is) is exercised by the GraphQL resolver unit tests.
 */

import { eq } from 'drizzle-orm';
import type { PublicDb } from '@legacy-sports/db-client';
import {
  commitDraftPick,
  enableAutoPickForUnmanagedTeams,
  getCurrentDraftPickInfo,
} from './drafts/helpers';
import { executePickEffects } from './drafts/draft-pick-effects';
import { createAllMatchupsForLeague } from './matchups/mutations';
import { getLeague, getTeam, getUser } from '../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../integration-test-setup';

jest.mock('./matchups/mutations', () => ({
  createAllMatchupsForLeague: jest.fn().mockResolvedValue({ matchupCount: 0 }),
}));
jest.mock('../services/activity-log', () => ({
  logDraftPickActivity: jest.fn().mockResolvedValue(undefined),
}));

const {
  drafts,
  draftTeams,
  draftPicks,
  leagues,
  matchups,
  teams,
  leagueMembers,
  teamMembers,
} = integrationTestSchema;

describe('Draft Picks - DB Integration Tests', () => {
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
   * Seed helper — creates the minimal rows needed for most draft pick tests.
   */
  async function seedDraftFixture(teamCount = 2) {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);

    // owner is pre-seeded — no insert needed; omit id so the DB auto-generates it
    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        maxRosterSize: 2,
        draftStatus: 'in-progress',
      })
      .returning();

    const teamFixtures = Array.from({ length: teamCount }, (_, i) => ({
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

    // Use real players from the DB (fetched at setup time)
    const insertedPlayers = getTestPlayers().slice(0, 8);

    return {
      owner,
      league,
      teams: teamFixtures,
      draft,
      players: insertedPlayers,
    };
  }

  // ---------------------------------------------------------------------------
  describe('Schema constraints', () => {
    it('should insert a draft pick with all required fields', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      const [pick] = await db
        .insert(draftPicks)
        .values({
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date(),
        })
        .returning();

      expect(pick.draftId).toBe(draft.id);
      expect(pick.teamId).toBe(teamFix[0].id);
      expect(pick.playerId).toBe(playerFix[0].id);
      expect(pick.round).toBe(1);
      expect(pick.pickNumber).toBe(1);
      expect(pick.overallPick).toBe(1);
    });

    it('should store a unique player per draft', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[0].id,
        playerId: playerFix[0].id,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date(),
      });

      // A valid second pick for a different player
      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[1].id,
        playerId: playerFix[1].id,
        round: 1,
        pickNumber: 2,
        overallPick: 2,
        pickedAt: new Date(),
      });

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(picks).toHaveLength(2);
      const playerIds = picks.map((p) => p.playerId);
      expect(new Set(playerIds).size).toBe(2); // all unique
    });

    it('should store unique overall pick slots per draft', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[0].id,
        playerId: playerFix[0].id,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date(),
      });

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[1].id,
        playerId: playerFix[1].id,
        round: 1,
        pickNumber: 2,
        overallPick: 2,
        pickedAt: new Date(),
      });

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(picks).toHaveLength(2);
      const overallPicks = picks.map((p) => p.overallPick);
      expect(new Set(overallPicks).size).toBe(2); // all unique
    });

    it('should cascade-delete picks when the parent draft is deleted', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[0].id,
        playerId: playerFix[0].id,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date(),
      });

      await db.delete(drafts).where(eq(drafts.id, draft.id));

      const remaining = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(remaining).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Pick ordering', () => {
    it('should store picks in correct snake-draft round/team order', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      // Round 1: Team Alpha -> Team Beta  |  Round 2 (snake): Team Beta -> Team Alpha
      await db.insert(draftPicks).values([
        {
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: playerFix[1].id,
          round: 1,
          pickNumber: 2,
          overallPick: 2,
          pickedAt: new Date(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: playerFix[2].id,
          round: 2,
          pickNumber: 1,
          overallPick: 3,
          pickedAt: new Date(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[3].id,
          round: 2,
          pickNumber: 2,
          overallPick: 4,
          pickedAt: new Date(),
        },
      ]);

      const stored = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id))
        .orderBy(draftPicks.overallPick);

      expect(stored).toHaveLength(4);
      expect(stored[0].teamId).toBe(teamFix[0].id); // R1 P1
      expect(stored[1].teamId).toBe(teamFix[1].id); // R1 P2
      expect(stored[2].teamId).toBe(teamFix[1].id); // R2 P1 (snake)
      expect(stored[3].teamId).toBe(teamFix[0].id); // R2 P2 (snake)

      expect(stored[0].round).toBe(1);
      expect(stored[2].round).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Team roster integration', () => {
    it('should allow recording a drafted player in team_members', async () => {
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      const [pick] = await db
        .insert(draftPicks)
        .values({
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date(),
        })
        .returning();

      const [member] = await db
        .insert(teamMembers)
        .values({
          teamId: teamFix[0].id,
          leagueId: league.id,
          playerId: playerFix[0].id,
          draftRound: pick.round,
          draftPick: pick.pickNumber,
          acquisitionType: 'draft',
        })
        .returning();

      expect(member.teamId).toBe(teamFix[0].id);
      expect(member.playerId).toBe(playerFix[0].id);
      expect(member.draftRound).toBe(1);
      expect(member.draftPick).toBe(1);
      expect(member.acquisitionType).toBe('draft');
    });
  });

  // ---------------------------------------------------------------------------
  describe('getDraftPicks query behavior', () => {
    it('should retrieve all picks ordered by overallPick', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await db.insert(draftPicks).values([
        {
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: playerFix[1].id,
          round: 1,
          pickNumber: 2,
          overallPick: 2,
          pickedAt: new Date(),
        },
      ]);

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id))
        .orderBy(draftPicks.overallPick);

      expect(picks).toHaveLength(2);
      expect(picks[0].overallPick).toBeLessThan(picks[1].overallPick);
    });

    it('should return empty for a draft with no picks', async () => {
      const { draft } = await seedDraftFixture();

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(picks).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('initializeDraft — DB preconditions', () => {
    it('seeded league should have draftStatus = in-progress', async () => {
      const { league } = await seedDraftFixture();

      const [found] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));

      expect(found.draftStatus).toBe('in-progress');
    });

    it('should have correctly ordered draft_teams after seeding', async () => {
      const { draft } = await seedDraftFixture(3);

      const entries = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id))
        .orderBy(draftTeams.draftOrder);

      expect(entries).toHaveLength(3);
      expect(entries[0].draftOrder).toBe(1);
      expect(entries[1].draftOrder).toBe(2);
      expect(entries[2].draftOrder).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  describe('isMockDraft guards', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('mock draft: creates draft_picks row but skips team_members insertion', async () => {
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: db as unknown as PublicDb,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));
      expect(picks).toHaveLength(1);
      expect(picks[0].playerId).toBe(playerFix[0].id);

      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.leagueId, league.id));
      expect(members).toHaveLength(0);
    });

    it('completing a mock draft: executePickEffects skips createAllMatchupsForLeague', async () => {
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(2);

      await executePickEffects({
        db: db as unknown as PublicDb,
        notificationService: null,
        draftLeagueId: league.id,
        draftId: draft.id,
        selectionMethod: 'standard',
        isMockDraft: true,
        pickResult: {
          draftPick: { id: 99 },
          autoPlayerId: playerFix[0].id,
          autoPickReason: 'auto-pick',
          isDraftComplete: true,
          currentPickInfo: {
            teamId: teamFix[0].id,
            round: 2,
            pickNumber: 2,
            overallPick: 4,
          },
          nextPickInfo: null,
          nextDeadline: null,
        },
      });

      expect(jest.mocked(createAllMatchupsForLeague)).not.toHaveBeenCalled();

      const matchupRows = await db
        .select()
        .from(matchups)
        .where(eq(matchups.leagueId, league.id));
      expect(matchupRows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // LS-3833: Regression integration tests for isDraftComplete boundary and
  // draftCompletedAt persistence.
  describe('Draft completion — draftCompletedAt and draftStatus (LS-3833)', () => {
    it('sets draftCompletedAt and draftStatus=completed on the final pick (overallPick === totalPicks)', async () => {
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: db as unknown as PublicDb,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[0].id,
          round: 2,
          pickNumber: 2,
          overallPick: 4,
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const [updatedDraft] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id));
      expect(updatedDraft.draftCompletedAt).not.toBeNull();

      const [updatedLeague] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));
      expect(updatedLeague.draftStatus).toBe('completed');
    });

    it('does NOT set draftCompletedAt on a non-final pick (overallPick < totalPicks)', async () => {
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: db as unknown as PublicDb,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[1].id,
          round: 2,
          pickNumber: 1,
          overallPick: 3,
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const [updatedDraft] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id));
      expect(updatedDraft.draftCompletedAt).toBeNull();

      const [updatedLeague] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));
      expect(updatedLeague.draftStatus).not.toBe('completed');
    });
  });

  // ---------------------------------------------------------------------------
  // LS-3851: Multi-user pick flow unit coverage.
  describe('Snake draft — multi-user pick flow (LS-3851)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('getCurrentDraftPickInfo returns the correct team for all 8 picks in a 4-team snake draft', async () => {
      const { draft, teams: teamFix } = await seedDraftFixture(4);

      // Snake order for 4 teams, 2 rounds:
      //   Round 1 (normal):  A B C D  -> team indices 0 1 2 3
      //   Round 2 (reverse): D C B A  -> team indices 3 2 1 0
      const expectedIdx = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let overall = 1; overall <= 8; overall++) {
        await db
          .update(drafts)
          .set({ currentPick: overall - 1 })
          .where(eq(drafts.id, draft.id));

        const pick = await getCurrentDraftPickInfo(publicDb(), draft.id);

        expect(pick).not.toBeNull();
        expect(pick!.overallPick).toBe(overall);
        expect(pick!.teamId).toBe(teamFix[expectedIdx[overall - 1]].id);
        expect(pick!.round).toBe(overall <= 4 ? 1 : 2);
        expect(pick!.pickNumber).toBe(overall <= 4 ? overall : overall - 4);
      }
    });

    it('commitDraftPick advances currentPick and nextPickInfo through a full 4-team snake draft', async () => {
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(4);

      // Snake order for 4 teams, 2 rounds: A B C D D C B A
      const expectedTeamIndices = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);

        expect(pickInfo).not.toBeNull();
        expect(pickInfo!.teamId).toBe(teamFix[expectedTeamIndices[i]].id);
        expect(pickInfo!.overallPick).toBe(i + 1);

        const result = await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: playerFix[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const [updatedDraft] = await db
          .select()
          .from(drafts)
          .where(eq(drafts.id, draft.id));

        expect(updatedDraft.currentPick).toBe(i + 1);

        if (i < 7) {
          expect(result.isDraftComplete).toBe(false);
          expect(result.nextPickInfo).not.toBeNull();
          expect(result.nextPickInfo!.teamId).toBe(
            teamFix[expectedTeamIndices[i + 1]].id,
          );
          expect(updatedDraft.draftCompletedAt).toBeNull();
        } else {
          expect(result.isDraftComplete).toBe(true);
          expect(result.nextPickInfo).toBeNull();
          expect(updatedDraft.draftCompletedAt).not.toBeNull();

          const [updatedLeague] = await db
            .select()
            .from(leagues)
            .where(eq(leagues.id, league.id));
          expect(updatedLeague.draftStatus).toBe('completed');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4132: Multi-user turn-detection state machine.
  describe('Multi-user turn-detection — polling state correctness (LS-4132)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('getCurrentDraftPickInfo returns the next team immediately after currentPick advances', async () => {
      const { draft, teams: teamFix } = await seedDraftFixture(2);

      const pick1 = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pick1).not.toBeNull();
      expect(pick1!.teamId).toBe(teamFix[0].id);
      expect(pick1!.overallPick).toBe(1);

      await db
        .update(drafts)
        .set({ currentPick: 1 })
        .where(eq(drafts.id, draft.id));

      const pick2 = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pick2).not.toBeNull();
      expect(pick2!.teamId).toBe(teamFix[1].id);
      expect(pick2!.overallPick).toBe(2);
    });

    it('stale currentPickInfo is detectably different from fresh state after a pick advances the draft', async () => {
      const { draft } = await seedDraftFixture(2);

      const stalePick1Info = await getCurrentDraftPickInfo(
        publicDb(),
        draft.id,
      );
      expect(stalePick1Info).not.toBeNull();

      await db
        .update(drafts)
        .set({ currentPick: 1 })
        .where(eq(drafts.id, draft.id));

      const freshPick = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(freshPick).not.toBeNull();

      expect(freshPick!.overallPick).toBeGreaterThan(
        stalePick1Info!.overallPick,
      );
      expect(freshPick!.teamId).not.toBe(stalePick1Info!.teamId);
    });

    it('4-team snake draft: each getCurrentDraftPickInfo call returns the correct team in sequence', async () => {
      const { draft, teams: teamFix } = await seedDraftFixture(4);

      // Snake order for 4 teams, 2 rounds: A B C D D C B A
      const expectedTeamOrder = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        await db
          .update(drafts)
          .set({ currentPick: i })
          .where(eq(drafts.id, draft.id));

        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();
        expect(pickInfo!.teamId).toBe(teamFix[expectedTeamOrder[i]].id);
        expect(pickInfo!.overallPick).toBe(i + 1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4191: "Draft Complete!" banner missing after final pick.
  describe('Draft completion — getCurrentDraftPickInfo.isComplete (LS-4191)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('returns isComplete:false while the draft is still in progress', async () => {
      const { draft } = await seedDraftFixture(2);

      const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pickInfo).not.toBeNull();
      expect(pickInfo!.isComplete).toBe(false);
    });

    it('returns isComplete:false on a mid-draft pick (overallPick < totalPicks)', async () => {
      const { draft } = await seedDraftFixture(2);

      await db
        .update(drafts)
        .set({ currentPick: 2 })
        .where(eq(drafts.id, draft.id));

      const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pickInfo).not.toBeNull();
      expect(pickInfo!.isComplete).toBe(false);
    });

    it('returns isComplete:true once draftCompletedAt is set (final pick committed)', async () => {
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: publicDb(),
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[0].id,
          round: 2,
          pickNumber: 2,
          overallPick: 4,
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pickInfo).not.toBeNull();
      expect(pickInfo!.isComplete).toBe(true);
    });

    it('4-team snake draft: last pick (A, round 2) sets isComplete on next poll', async () => {
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(4);

      // Snake order for 4 teams, 2 rounds: A B C D D C B A
      const expectedTeamIndices = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();

        await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: playerFix[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const afterPick = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(afterPick).not.toBeNull();

        const isLastPick = i === 7;
        expect(afterPick!.isComplete).toBe(isLastPick);

        if (!isLastPick) {
          expect(afterPick!.teamId).toBe(
            teamFix[expectedTeamIndices[i + 1]].id,
          );
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4205: "Draft Complete!" banner not shown (7th consecutive run).
  describe('Draft completion — banner persistence across page reloads (LS-4205)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('atomically sets draftCompletedAt and draftStatus=completed only on the final pick', async () => {
      const { league, draft, players: playerFix } = await seedDraftFixture(4);

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();

        await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: playerFix[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const [draftRow] = await db
          .select()
          .from(drafts)
          .where(eq(drafts.id, draft.id));
        const [leagueRow] = await db
          .select()
          .from(leagues)
          .where(eq(leagues.id, league.id));

        const isLastPick = i === 7;

        if (isLastPick) {
          expect(draftRow.draftCompletedAt).not.toBeNull();
          expect(leagueRow.draftStatus).toBe('completed');
        } else {
          expect(draftRow.draftCompletedAt).toBeNull();
          expect(leagueRow.draftStatus).not.toBe('completed');
        }
      }

      const finalPickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(finalPickInfo).not.toBeNull();
      expect(finalPickInfo!.isComplete).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4281: "Draft Complete!" missing — regression coverage for the
  // commissioner-as-managed-team fix (LS-4277) and the round-boundary
  // consecutive-pick scenario that triggered State B.
  describe('Draft completion — commissioner makes final pick in snake round boundary (LS-4281)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('4-team snake draft: isDraftComplete fires correctly when team A (commissioner slot) makes the last pick', async () => {
      // In a 4-team snake draft the pick order is A B C D D C B A.
      // teamFix[0] (A) makes pick #1 AND pick #8 (the final pick).
      // Before LS-4277, A was marked autoPick=true (commissioner bug), so the
      // auto-pick chain at the round boundary caused the "Your pick" indicator
      // to briefly disappear then reappear, breaking the wasAccepted check.
      // Here we verify through commitDraftPick directly (no auto-pick chaining)
      // that the final pick correctly sets isDraftComplete=true.
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(4);

      const expectedTeamIndices = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();
        expect(pickInfo!.teamId).toBe(teamFix[expectedTeamIndices[i]].id);
        expect(pickInfo!.overallPick).toBe(i + 1);

        const result = await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: playerFix[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const isLastPick = i === 7;
        expect(result.isDraftComplete).toBe(isLastPick);
      }

      // After the final pick by team A, the next poll must return isComplete:true.
      const afterComplete = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(afterComplete).not.toBeNull();
      expect(afterComplete!.isComplete).toBe(true);

      const [leagueRow] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));
      expect(leagueRow.draftStatus).toBe('completed');
    });
  });

  // ---------------------------------------------------------------------------
  describe('enableAutoPickForUnmanagedTeams', () => {
    async function seedLeagueWithDraft() {
      const owner = getUser(1);
      const leagueFixture = getLeague(0);

      const [league] = await db
        .insert(leagues)
        .values({
          name: leagueFixture.name,
          owner: owner.id,
          inviteCode: leagueFixture.inviteCode,
          draftStatus: 'pre-draft',
        })
        .returning();

      const teamFixtures = Array.from({ length: 3 }, (_, i) => ({
        ...getTeam(i),
        leagueId: league.id,
      }));
      await db.insert(teams).values(teamFixtures);

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

      await db.insert(draftTeams).values(
        teamFixtures.map((t, i) => ({
          draftId: draft.id,
          teamId: t.id,
          leagueId: league.id,
          draftOrder: i + 1,
          autoPick: false,
        })),
      );

      return { owner, league, teams: teamFixtures, draft };
    }

    it('does not mark the commissioner team as autoPick', async () => {
      const {
        owner,
        league,
        teams: teamFix,
        draft,
      } = await seedLeagueWithDraft();

      // Commissioner membership — only team[0] has a commissioner member
      await db.insert(leagueMembers).values({
        leagueId: league.id,
        userId: owner.id,
        teamId: teamFix[0].id,
        permissionLevel: 'commissioner',
      });

      const allTeamIds = teamFix.map((t) => t.id);
      const markedIds = await enableAutoPickForUnmanagedTeams(
        db,
        league.id,
        draft.id,
        allTeamIds,
      );

      // Commissioner's team must NOT be marked
      expect(markedIds).not.toContain(teamFix[0].id);

      const rows = await db
        .select({ teamId: draftTeams.teamId, autoPick: draftTeams.autoPick })
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id));

      const byTeam = Object.fromEntries(
        rows.map((r) => [r.teamId, r.autoPick]),
      );
      expect(byTeam[teamFix[0].id]).toBe(false); // commissioner — not auto-picked
      expect(byTeam[teamFix[1].id]).toBe(true); // unmanaged slot
      expect(byTeam[teamFix[2].id]).toBe(true); // unmanaged slot
    });

    it('does not mark teams with a general_manager as autoPick', async () => {
      const {
        owner,
        league,
        teams: teamFix,
        draft,
      } = await seedLeagueWithDraft();

      const otherUser = getUser(2);
      await db.insert(leagueMembers).values([
        {
          leagueId: league.id,
          userId: owner.id,
          teamId: teamFix[0].id,
          permissionLevel: 'general_manager',
        },
        {
          leagueId: league.id,
          userId: otherUser.id,
          teamId: teamFix[1].id,
          permissionLevel: 'general_manager',
        },
      ]);

      const allTeamIds = teamFix.map((t) => t.id);
      const markedIds = await enableAutoPickForUnmanagedTeams(
        db,
        league.id,
        draft.id,
        allTeamIds,
      );

      expect(markedIds).not.toContain(teamFix[0].id);
      expect(markedIds).not.toContain(teamFix[1].id);
      expect(markedIds).toContain(teamFix[2].id); // no member → auto-pick

      const rows = await db
        .select({ teamId: draftTeams.teamId, autoPick: draftTeams.autoPick })
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id));

      const byTeam = Object.fromEntries(
        rows.map((r) => [r.teamId, r.autoPick]),
      );
      expect(byTeam[teamFix[0].id]).toBe(false);
      expect(byTeam[teamFix[1].id]).toBe(false);
      expect(byTeam[teamFix[2].id]).toBe(true);
    });

    it('marks all teams as autoPick when no managed members exist', async () => {
      const { league, teams: teamFix, draft } = await seedLeagueWithDraft();

      const allTeamIds = teamFix.map((t) => t.id);
      const markedIds = await enableAutoPickForUnmanagedTeams(
        db,
        league.id,
        draft.id,
        allTeamIds,
      );

      expect(markedIds).toHaveLength(3);
      expect(markedIds).toEqual(expect.arrayContaining(allTeamIds));

      const rows = await db
        .select({ autoPick: draftTeams.autoPick })
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id));

      expect(rows.every((r) => r.autoPick)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4286: autoProcessDraftPicks must not mark managed teams as autoPick.
  // The same bug that LS-4277 fixed at initialization was present mid-draft:
  // any timed-out team was marked autoPick=true even if a GM/commissioner was
  // actively managing it. Fix reuses enableAutoPickForUnmanagedTeams.
  describe('autoProcessDraftPicks — managed-team exclusion (LS-4286)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('does not mark a commissioner-managed team autoPick when their turn times out', async () => {
      const { league, draft, teams: teamFix } = await seedDraftFixture(2);

      // teamFix[0] already has a general_manager member from seedDraftFixture.
      // Override to commissioner to match the exact scenario from LS-4286.
      await db
        .update(leagueMembers)
        .set({ permissionLevel: 'commissioner' })
        .where(eq(leagueMembers.leagueId, league.id));

      // Simulate enableAutoPickForUnmanagedTeams being called for teamFix[0]
      // (the commissioner's team) — it must NOT be marked autoPick.
      const marked = await enableAutoPickForUnmanagedTeams(
        publicDb(),
        league.id,
        draft.id,
        [teamFix[0].id],
      );

      expect(marked).toHaveLength(0);
      expect(marked).not.toContain(teamFix[0].id);

      const [row] = await db
        .select({ autoPick: draftTeams.autoPick })
        .from(draftTeams)
        .where(eq(draftTeams.teamId, teamFix[0].id));
      expect(row.autoPick).toBe(false);
    });

    it('marks an unmanaged team autoPick when their turn times out', async () => {
      const { league, draft, teams: teamFix } = await seedDraftFixture(2);

      // teamFix[1] has no league member → unmanaged.
      const marked = await enableAutoPickForUnmanagedTeams(
        publicDb(),
        league.id,
        draft.id,
        [teamFix[1].id],
      );

      expect(marked).toContain(teamFix[1].id);

      const [row] = await db
        .select({ autoPick: draftTeams.autoPick })
        .from(draftTeams)
        .where(eq(draftTeams.teamId, teamFix[1].id));
      expect(row.autoPick).toBe(true);
    });

    it('full pick-to-completion: commissioner team makes every pick and draft completes', async () => {
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(2);

      // Both teams managed — no team should ever get autoPick=true.
      const user2 = getUser(2);
      await db.insert(leagueMembers).values({
        leagueId: league.id,
        userId: user2.id,
        teamId: teamFix[1].id,
        permissionLevel: 'general_manager',
      });

      // Snake order for 2 teams, maxRosterSize=2: A B B A
      const expectedOrder = [0, 1, 1, 0];

      for (let i = 0; i < 4; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();
        expect(pickInfo!.teamId).toBe(teamFix[expectedOrder[i]].id);

        // Verify neither team has been incorrectly marked autoPick
        const dtRows = await db
          .select({ teamId: draftTeams.teamId, autoPick: draftTeams.autoPick })
          .from(draftTeams)
          .where(eq(draftTeams.draftId, draft.id));
        for (const row of dtRows) {
          expect(row.autoPick).toBe(false);
        }

        const result = await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: playerFix[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        expect(result.isDraftComplete).toBe(i === 3);
      }

      const finalPick = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(finalPick!.isComplete).toBe(true);
    });
  });
});
