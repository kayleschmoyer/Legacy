/**
 * Draft-first schema (LS-10073, contracted in LS-10080) — real-Postgres guard.
 *
 * 1. Conformance: every column the new/changed Drizzle models map exists
 *    (same technique as football-stats-schema.db.spec.ts, LS-8553).
 * 2. The CHECK constraints the migrations promise are present and enforced.
 * 3. The fill triggers that outlived the draft_teams bridge (dropped in
 *    LS-10080): drafts.status/created_by/sport from the league, the
 *    leagues.draft_status mirror, and draft_picks.participant_id from team_id.
 */

import { eq, sql } from 'drizzle-orm';
import { getLeague, getTeam, getUser } from '../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';

const {
  auctionBudgets,
  auctionState,
  draftMessages,
  draftParticipants,
  draftPicks,
  draftQueue,
  drafts,
  invitations,
  leagueMembers,
  leagues,
  mockDraftSettings,
  teams,
} = integrationTestSchema;

describe('Draft-first schema (LS-10073)', () => {
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

  /** League-draft seed: a drafts row without the trigger-filled columns, plus one seat per team. */
  async function seedLeagueDraft(teamCount = 3) {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);
    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        sport: 'football',
        inviteCode: leagueFixture.inviteCode,
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
      permissionLevel: 'commissioner' as const,
    });

    const [draft] = await db
      .insert(drafts)
      .values({
        leagueId: league.id,
        // draft_mode and selection_method are NOT NULL with no physical
        // default (the Drizzle .default() is insert-typing only), so every
        // drafts insert must pass them explicitly (LS-10085).
        draftMode: 'live',
        selectionMethod: 'standard',
        currentPick: 0,
      })
      .returning();

    await db.insert(draftParticipants).values(
      teamFixtures.map((t, i) => ({
        draftId: draft.id,
        slot: i + 1,
        teamId: t.id,
        leagueId: league.id,
        controller: i > 0 ? ('ai' as const) : ('user' as const),
        seatName: t.name,
        autoPick: i > 0,
      })),
    );

    return { owner, league, draft, teams: teamFixtures };
  }

  /**
   * Assert a write fails on a specific constraint. Drizzle wraps pg errors, so
   * `error.message` is only "Failed query: ..." — the constraint name lives on
   * `error.cause`. Takes a thunk because a Drizzle query builder re-executes
   * every time it is awaited.
   */
  async function expectConstraintViolation(
    run: () => PromiseLike<unknown>,
    constraint: string,
  ) {
    const error = await Promise.resolve(run()).then(
      () => null,
      (e: unknown) => e as (Error & { cause?: { message?: string } }) | null,
    );
    expect(error).not.toBeNull();
    const chain = [error?.message, error?.cause?.message]
      .filter(Boolean)
      .join(' | ');
    expect(chain).toContain(constraint);
  }

  const seatsOf = (draftId: number) =>
    db
      .select({
        id: draftParticipants.id,
        teamId: draftParticipants.teamId,
        slot: draftParticipants.slot,
        controller: draftParticipants.controller,
      })
      .from(draftParticipants)
      .where(eq(draftParticipants.draftId, draftId))
      .orderBy(draftParticipants.slot);

  describe('model conformance', () => {
    it.each([
      ['drafts', drafts],
      ['draftParticipants', draftParticipants],
      ['mockDraftSettings', mockDraftSettings],
      ['invitations', invitations],
      ['draftMessages', draftMessages],
      ['draftPicks', draftPicks],
      ['draftQueue', draftQueue],
      ['auctionState', auctionState],
      ['auctionBudgets', auctionBudgets],
    ] as const)('every column mapped by %s exists', async (_name, table) => {
      await expect(db.select().from(table).limit(1)).resolves.toBeDefined();
    });
  });

  describe('CHECK constraints', () => {
    it('are all present', async () => {
      const result = await db.execute<{ conname: string }>(sql`
        SELECT conname FROM pg_constraint
        WHERE contype = 'c'
          AND conrelid IN ('drafts'::regclass, 'draft_participants'::regclass,
                           'invitations'::regclass, 'mock_draft_settings'::regclass)
        ORDER BY conname
      `);
      expect(result.rows.map((r) => r.conname)).toEqual([
        'draft_participants_slot_positive_ck',
        'draft_participants_team_league_pair_ck',
        'draft_participants_team_or_user_ck',
        'drafts_control_all_teams_ck',
        'drafts_invite_code_mock_ck',
        'drafts_is_public_ck',
        'drafts_kind_league_ck',
        'drafts_mock_mode_ck',
        'invitations_reserved_slot_ck',
        'invitations_target_ck',
        'mock_draft_settings_defensive_format_ck',
        'mock_draft_settings_roster_size_ck',
      ]);
    });

    it('reject a mock draft that is tied to a league', async () => {
      const { league, owner } = await seedLeagueDraft(1);
      await expectConstraintViolation(
        () =>
          db.insert(drafts).values({
            leagueId: league.id,
            kind: 'mock',
            mockMode: 'online',
            createdBy: owner.id,
            draftMode: 'live',
            selectionMethod: 'standard',
          }),
        'drafts_kind_league_ck',
      );
    });

    it('accept a league-less online mock draft and reject it going public offline', async () => {
      const owner = getUser(1);
      await db.execute(sql`
        INSERT INTO drafts
          (kind, mock_mode, is_public, status, created_by, sport, draft_mode, selection_method)
        VALUES ('mock', 'online', true, 'not-started', ${owner.id}, 'baseball', 'live', 'standard')
      `);
      await expectConstraintViolation(
        () =>
          db.execute(sql`
            INSERT INTO drafts
              (kind, mock_mode, is_public, status, created_by, sport, draft_mode, selection_method)
            VALUES ('mock', 'offline', true, 'not-started', ${owner.id}, 'baseball', 'live', 'standard')
          `),
        'drafts_is_public_ck',
      );
      // Test-data cleanup only removes league-owned drafts.
      await db.execute(sql`DELETE FROM drafts WHERE kind = 'mock'`);
    });

    it('reject a seat holding both a team and a user', async () => {
      const { draft, league, teams: teamFix, owner } = await seedLeagueDraft(1);
      await expectConstraintViolation(
        () =>
          db.insert(draftParticipants).values({
            draftId: draft.id,
            slot: 2,
            teamId: teamFix[0].id,
            leagueId: league.id,
            userId: owner.id,
            controller: 'user',
            seatName: 'x',
          }),
        'draft_participants_team_or_user_ck',
      );
    });
  });

  describe('fill triggers', () => {
    it('fills drafts.status/created_by/sport from the league', async () => {
      const { draft, owner } = await seedLeagueDraft();
      expect(draft.kind).toBe('league');
      expect(draft.status).toBe('in-progress');
      expect(draft.createdBy).toBe(owner.id);
      expect(draft.sport).toBe('football');
    });

    it('resolves participant_id on a pick inserted without one', async () => {
      const { draft, teams: teamFix } = await seedLeagueDraft();
      const [pick] = await db
        .insert(draftPicks)
        .values({
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: getTestPlayers()[0].id,
          round: 1,
          pickNumber: 2,
          overallPick: 2,
        })
        .returning();
      const seat = (await seatsOf(draft.id)).find(
        (s) => s.teamId === teamFix[1].id,
      );
      expect(pick.participantId).toBe(seat?.id);
    });

    it('mirrors leagues.draft_status onto drafts.status', async () => {
      const { draft, league } = await seedLeagueDraft();
      await db
        .update(leagues)
        .set({ draftStatus: 'paused' })
        .where(eq(leagues.id, league.id));
      const [row] = await db
        .select({ status: drafts.status })
        .from(drafts)
        .where(eq(drafts.id, draft.id));
      expect(row.status).toBe('paused');
    });
  });
});
