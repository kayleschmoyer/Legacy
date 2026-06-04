/**
 * Commissioner Tools — GraphQL mutations and queries
 *
 * Provides advanced league management tools accessible only to commissioners:
 *   - Force-add / force-drop players to/from any team
 *   - Edit past matchup scores (with audit trail)
 *   - Swap teams between two matchups (schedule adjustment)
 *   - Update the persistent commissioner note (LM note)
 *   - Lock / unlock individual teams
 *   - Bulk-drop all players from an inactive team
 *   - Query the commissioner audit log
 */

import {
  getMatchupPlayerGameStats,
  getScoringMultipliersForLeague,
  PublicSchema,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  calculateMatchupScore,
  type PlayerGameStats,
  type ScoringSettings,
} from '@legacy-sports/scoring';
import { and, eq } from 'drizzle-orm';

import { builder } from './builder';
import { checkAdminInDb, verifyCommissionerAccess } from './authorization';
import { CommissionerAuditLog } from './leagues';
import { AuthenticationError, UserInputError } from './graphql-errors';
import { addPlayerToRoster } from '../services/roster-service';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Insert a row into commissioner_audit_log. Never throws — errors are logged. */
async function writeAuditLog(
  db: Parameters<typeof verifyCommissionerAccess>[0],
  params: {
    leagueId: number;
    userId: number;
    action: string;
    targetType?: string;
    targetId?: number;
    details?: Record<string, unknown>;
    reason?: string | null;
  },
): Promise<void> {
  try {
    await db.insert(PublicSchema.commissionerAuditLog).values({
      leagueId: params.leagueId,
      userId: params.userId,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      details: params.details ?? null,
      reason: params.reason ?? null,
    });
  } catch (err) {
    LOGGER.error('Failed to write commissioner audit log', {
      params,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Input Types ────────────────────────────────────────────────────────────

const ForceAddPlayerInput = builder.inputType('ForceAddPlayerInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    teamId: t.int({ required: true }),
    playerId: t.int({ required: true }),
    reason: t.string({ required: false }),
  }),
});

const ForceDropPlayerInput = builder.inputType('ForceDropPlayerInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    teamId: t.int({ required: true }),
    playerId: t.int({ required: true }),
    reason: t.string({ required: false }),
  }),
});

const EditMatchupScoreInput = builder.inputType('EditMatchupScoreInput', {
  fields: (t) => ({
    matchupId: t.int({ required: true }),
    team1Score: t.float({ required: true }),
    team2Score: t.float({ required: true }),
    reason: t.string({ required: false }),
  }),
});

const SwapMatchupTeamsInput = builder.inputType('SwapMatchupTeamsInput', {
  fields: (t) => ({
    matchupId1: t.int({ required: true }),
    matchupId2: t.int({ required: true }),
    reason: t.string({ required: false }),
  }),
});

const UpdateCommissionerNoteInput = builder.inputType(
  'UpdateCommissionerNoteInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      note: t.string({ required: false }),
    }),
  },
);

const SetTeamLockInput = builder.inputType('SetTeamLockInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    teamId: t.int({ required: true }),
    locked: t.boolean({ required: true }),
    reason: t.string({ required: false }),
  }),
});

const BulkDropPlayersInput = builder.inputType('BulkDropPlayersInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    teamId: t.int({ required: true }),
    reason: t.string({ required: false }),
  }),
});

const RecalculateMatchupScoresInput = builder.inputType(
  'RecalculateMatchupScoresInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      weekNumber: t.int({ required: false }),
    }),
  },
);

// ── Simple result type ─────────────────────────────────────────────────────

const CommissionerActionResult = builder.objectRef<{
  success: boolean;
  message: string;
}>('CommissionerActionResult');

CommissionerActionResult.implement({
  description: 'Result of a commissioner action',
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    message: t.exposeString('message'),
  }),
});

const RecalculateMatchupScoresResult = builder.objectRef<{
  success: boolean;
  message: string;
  matchupsRecalculated: number;
  matchupsFailed: number;
}>('RecalculateMatchupScoresResult');

RecalculateMatchupScoresResult.implement({
  description: 'Result of a bulk matchup score recalculation',
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    message: t.exposeString('message'),
    matchupsRecalculated: t.exposeInt('matchupsRecalculated'),
    matchupsFailed: t.exposeInt('matchupsFailed'),
  }),
});

// ── Mutations ──────────────────────────────────────────────────────────────

// 1. Force-add a player to a team (bypasses waivers / roster locks)
builder.mutationField('forceAddPlayer', (t) =>
  t.field({
    type: CommissionerActionResult,
    description:
      'Commissioner: force-add a player to a team, bypassing normal acquisition rules.',
    args: {
      input: t.arg({ type: ForceAddPlayerInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, teamId, playerId, reason } = args.input;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;

      // If the player is already on another team in this league, remove them first
      const existing = await db
        .select({
          id: PublicSchema.teamMembers.id,
          teamId: PublicSchema.teamMembers.teamId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.playerId, playerId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        if (existing[0].teamId === teamId) {
          return { success: false, message: 'Player is already on this team.' };
        }
        // Remove from current team
        await db
          .delete(PublicSchema.teamMembers)
          .where(eq(PublicSchema.teamMembers.id, existing[0].id));

        LOGGER.info(
          'Commissioner: removed player from old team during force-add',
          {
            leagueId,
            playerId,
            oldTeamId: existing[0].teamId,
            newTeamId: teamId,
          },
        );
      }

      // Add to the new team (no position slot assigned — commissioner can adjust)
      await addPlayerToRoster(db, {
        teamId,
        leagueId,
        playerId,
        acquisitionType: 'commissioner',
      });

      await writeAuditLog(db, {
        leagueId,
        userId: context.user.id,
        action: 'force_add',
        targetType: 'player',
        targetId: playerId,
        details: { teamId, previousTeamId: existing[0]?.teamId ?? null },
        reason,
      });

      LOGGER.info('Commissioner: force-added player to team', {
        leagueId,
        teamId,
        playerId,
        commissionerId: context.user.id,
      });

      return { success: true, message: 'Player successfully added to team.' };
    },
  }),
);

// 2. Force-drop a player from a team
builder.mutationField('forceDropPlayer', (t) =>
  t.field({
    type: CommissionerActionResult,
    description: 'Commissioner: force-drop a player from a team.',
    args: {
      input: t.arg({ type: ForceDropPlayerInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, teamId, playerId, reason } = args.input;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;

      const existing = await db
        .select({ id: PublicSchema.teamMembers.id })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.playerId, playerId),
            eq(PublicSchema.teamMembers.teamId, teamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        return {
          success: false,
          message: 'Player is not on this team.',
        };
      }

      await db
        .delete(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.id, existing[0].id));

      await writeAuditLog(db, {
        leagueId,
        userId: context.user.id,
        action: 'force_drop',
        targetType: 'player',
        targetId: playerId,
        details: { teamId },
        reason,
      });

      LOGGER.info('Commissioner: force-dropped player from team', {
        leagueId,
        teamId,
        playerId,
        commissionerId: context.user.id,
      });

      return {
        success: true,
        message: 'Player successfully dropped from team.',
      };
    },
  }),
);

// 3. Edit past matchup scores
builder.mutationField('editMatchupScore', (t) =>
  t.field({
    type: CommissionerActionResult,
    description:
      'Commissioner: edit the scores of a past or current matchup. All edits are audit-logged.',
    args: {
      input: t.arg({ type: EditMatchupScoreInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { matchupId, team1Score, team2Score, reason } = args.input;

      const db = context.db;

      // Load the matchup to get leagueId for auth check
      const matchup = await db
        .select({
          id: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          team1Score: PublicSchema.matchups.team1Score,
          team2Score: PublicSchema.matchups.team2Score,
        })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, matchupId))
        .limit(1);

      if (matchup.length === 0) {
        return { success: false, message: 'Matchup not found.' };
      }

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(
          context.db,
          matchup[0].leagueId,
          context.user.id,
        );
      }

      const prevTeam1Score = matchup[0].team1Score;
      const prevTeam2Score = matchup[0].team2Score;

      await db
        .update(PublicSchema.matchups)
        .set({
          team1Score: String(team1Score),
          team2Score: String(team2Score),
          updatedAt: new Date(),
        })
        .where(eq(PublicSchema.matchups.id, matchupId));

      await writeAuditLog(db, {
        leagueId: matchup[0].leagueId,
        userId: context.user.id,
        action: 'edit_score',
        targetType: 'matchup',
        targetId: matchupId,
        details: {
          before: { team1Score: prevTeam1Score, team2Score: prevTeam2Score },
          after: { team1Score, team2Score },
        },
        reason,
      });

      LOGGER.info('Commissioner: edited matchup score', {
        matchupId,
        commissionerId: context.user.id,
        before: { team1Score: prevTeam1Score, team2Score: prevTeam2Score },
        after: { team1Score, team2Score },
      });

      return { success: true, message: 'Matchup scores updated successfully.' };
    },
  }),
);

// 4. Swap teams between two matchups (schedule adjustment)
builder.mutationField('swapMatchupTeams', (t) =>
  t.field({
    type: CommissionerActionResult,
    description:
      'Commissioner: swap the team assignments between two matchups in the same league.',
    args: {
      input: t.arg({ type: SwapMatchupTeamsInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { matchupId1, matchupId2, reason } = args.input;

      const db = context.db;

      const matchupsData = await db
        .select({
          id: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          team1Id: PublicSchema.matchups.team1Id,
          team2Id: PublicSchema.matchups.team2Id,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, matchupId1))
        .limit(1);

      const matchup2Data = await db
        .select({
          id: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          team1Id: PublicSchema.matchups.team1Id,
          team2Id: PublicSchema.matchups.team2Id,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, matchupId2))
        .limit(1);

      if (matchupsData.length === 0 || matchup2Data.length === 0) {
        return { success: false, message: 'One or both matchups not found.' };
      }

      const m1 = matchupsData[0];
      const m2 = matchup2Data[0];

      if (m1.leagueId !== m2.leagueId) {
        return {
          success: false,
          message: 'Both matchups must belong to the same league.',
        };
      }

      if (m1.weekNumber !== m2.weekNumber) {
        throw UserInputError('Both matchups must be from the same week.');
      }

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(
          context.db,
          m1.leagueId,
          context.user.id,
        );
      }

      // Swap teams: m1 gets m2's teams, m2 gets m1's teams
      await db
        .update(PublicSchema.matchups)
        .set({
          team1Id: m2.team1Id,
          team2Id: m2.team2Id,
          updatedAt: new Date(),
        })
        .where(eq(PublicSchema.matchups.id, matchupId1));

      await db
        .update(PublicSchema.matchups)
        .set({
          team1Id: m1.team1Id,
          team2Id: m1.team2Id,
          updatedAt: new Date(),
        })
        .where(eq(PublicSchema.matchups.id, matchupId2));

      await writeAuditLog(db, {
        leagueId: m1.leagueId,
        userId: context.user.id,
        action: 'swap_matchup_teams',
        targetType: 'matchup',
        targetId: matchupId1,
        details: {
          matchupId1,
          matchupId2,
          week1: m1.weekNumber,
          week2: m2.weekNumber,
          before: {
            m1: { team1Id: m1.team1Id, team2Id: m1.team2Id },
            m2: { team1Id: m2.team1Id, team2Id: m2.team2Id },
          },
          after: {
            m1: { team1Id: m2.team1Id, team2Id: m2.team2Id },
            m2: { team1Id: m1.team1Id, team2Id: m1.team2Id },
          },
        },
        reason,
      });

      LOGGER.info('Commissioner: swapped matchup teams', {
        matchupId1,
        matchupId2,
        commissionerId: context.user.id,
      });

      return {
        success: true,
        message: `Teams swapped between matchup #${matchupId1} and #${matchupId2}.`,
      };
    },
  }),
);

// 5. Update commissioner note (LM note) on a league
builder.mutationField('updateCommissionerNote', (t) =>
  t.field({
    type: CommissionerActionResult,
    description: 'Commissioner: update the persistent LM note for a league.',
    args: {
      input: t.arg({ type: UpdateCommissionerNoteInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, note } = args.input;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;
      const noteValue = note ?? null;

      await db
        .update(PublicSchema.leagues)
        .set({ lmNotes: noteValue, updatedAt: new Date() })
        .where(eq(PublicSchema.leagues.id, leagueId));

      await writeAuditLog(db, {
        leagueId,
        userId: context.user.id,
        action: 'update_lm_note',
        targetType: 'league',
        targetId: leagueId,
        details: { noteTruncated: (noteValue ?? '').slice(0, 100) },
      });

      LOGGER.info('Commissioner: updated LM note', {
        leagueId,
        commissionerId: context.user.id,
      });

      return {
        success: true,
        message: note
          ? 'Commissioner note updated.'
          : 'Commissioner note cleared.',
      };
    },
  }),
);

// 6. Lock or unlock an individual team
builder.mutationField('setTeamLock', (t) =>
  t.field({
    type: CommissionerActionResult,
    description:
      'Commissioner: lock or unlock a team to prevent/allow roster moves.',
    args: {
      input: t.arg({ type: SetTeamLockInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, teamId, locked, reason } = args.input;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;

      const team = await db
        .select({ id: PublicSchema.teams.id })
        .from(PublicSchema.teams)
        .where(
          and(
            eq(PublicSchema.teams.id, teamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (team.length === 0) {
        return {
          success: false,
          message: 'Team not found in this league.',
        };
      }

      await db
        .update(PublicSchema.teams)
        .set({ isLocked: locked, updatedAt: new Date() })
        .where(eq(PublicSchema.teams.id, teamId));

      await writeAuditLog(db, {
        leagueId,
        userId: context.user.id,
        action: locked ? 'lock_team' : 'unlock_team',
        targetType: 'team',
        targetId: teamId,
        details: { locked },
        reason,
      });

      LOGGER.info('Commissioner: set team lock status', {
        leagueId,
        teamId,
        locked,
        commissionerId: context.user.id,
      });

      return {
        success: true,
        message: locked
          ? 'Team is now locked. Roster moves are disabled.'
          : 'Team is now unlocked. Roster moves are enabled.',
      };
    },
  }),
);

// 7. Bulk-drop all players from an inactive team
builder.mutationField('bulkDropTeamPlayers', (t) =>
  t.field({
    type: CommissionerActionResult,
    description:
      'Commissioner: drop all players from a team (useful for inactive teams).',
    args: {
      input: t.arg({ type: BulkDropPlayersInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, teamId, reason } = args.input;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;

      // Count players before deleting for the audit log
      const players = await db
        .select({
          id: PublicSchema.teamMembers.id,
          playerId: PublicSchema.teamMembers.playerId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, teamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        );

      if (players.length === 0) {
        return {
          success: false,
          message: 'Team has no players to drop.',
        };
      }

      await db
        .delete(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, teamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        );

      await writeAuditLog(db, {
        leagueId,
        userId: context.user.id,
        action: 'bulk_drop_players',
        targetType: 'team',
        targetId: teamId,
        details: {
          droppedCount: players.length,
          playerIds: players.map((p) => p.playerId),
        },
        reason,
      });

      LOGGER.info('Commissioner: bulk-dropped players from team', {
        leagueId,
        teamId,
        droppedCount: players.length,
        commissionerId: context.user.id,
      });

      return {
        success: true,
        message: `Successfully dropped ${players.length} player${players.length === 1 ? '' : 's'} from the team.`,
      };
    },
  }),
);

// 8. Recalculate matchup scores for a league
builder.mutationField('recalculateLeagueMatchupScores', (t) =>
  t.field({
    type: RecalculateMatchupScoresResult,
    description:
      'Commissioner: recalculate all matchup scores for a league (or a specific week) using the current scoring profile.',
    args: {
      input: t.arg({
        type: RecalculateMatchupScoresInput,
        required: true,
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, weekNumber } = args.input;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;

      // 1. Fetch matchups for this league (optionally filtered by week)
      const conditions = [eq(PublicSchema.matchups.leagueId, leagueId)];
      if (weekNumber !== null && weekNumber !== undefined) {
        conditions.push(eq(PublicSchema.matchups.weekNumber, weekNumber));
      }

      const matchups = await db
        .select({
          id: PublicSchema.matchups.id,
          team1Id: PublicSchema.matchups.team1Id,
          team2Id: PublicSchema.matchups.team2Id,
          gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(and(...conditions));

      if (matchups.length === 0) {
        return {
          success: true,
          message:
            weekNumber != null
              ? `No matchups found for week ${weekNumber}.`
              : 'No matchups found for this league.',
          matchupsRecalculated: 0,
          matchupsFailed: 0,
        };
      }

      // 2. Get the league's current scoring multipliers
      const multipliers = await getScoringMultipliersForLeague(db, leagueId);
      const scoringSettings: ScoringSettings = {
        batting: multipliers.batting,
        pitching: multipliers.pitching,
        fielding: multipliers.fielding,
      };

      // 3. Recalculate each matchup
      let recalculated = 0;
      let failed = 0;

      for (const matchup of matchups) {
        try {
          const playerGameStatsResult = await getMatchupPlayerGameStats(
            db,
            matchup.id,
          );

          // TODO: The stat-to-PlayerGameStats mapping below duplicates the same
          // logic in lambdas/stats-lambda/src/scoring-utils.ts
          // (calculateAndUpdateMatchupScores). Consider extracting a shared
          // helper (e.g. mapStatRowsToPlayerGameStats) into lib/scoring or a
          // new lib/scoring-utils package to eliminate the duplication.

          // Organize stats by team
          const team1PlayerStats = new Map<number, PlayerGameStats[]>();
          const team2PlayerStats = new Map<number, PlayerGameStats[]>();

          for (const stat of playerGameStatsResult) {
            const playerGameStat: PlayerGameStats = {
              playerId: stat.playerId,
              season: stat.season,
              gameNum: stat.gameNum,
              batting: stat.battingStats
                ? {
                    pa: stat.battingStats.pa,
                    ab: stat.battingStats.ab,
                    r: stat.battingStats.r,
                    h: stat.battingStats.h,
                    doubles: stat.battingStats.doubles,
                    triples: stat.battingStats.triples,
                    hr: stat.battingStats.hr,
                    rbi: stat.battingStats.rbi,
                    sb: stat.battingStats.sb,
                    cs: stat.battingStats.cs,
                    bb: stat.battingStats.bb,
                    so: stat.battingStats.so,
                    gidp: stat.battingStats.gidp,
                    hbp: stat.battingStats.hbp,
                    sh: stat.battingStats.sh,
                    sf: stat.battingStats.sf,
                    ibb: stat.battingStats.ibb,
                  }
                : undefined,
              pitching: stat.pitchingStats
                ? {
                    w: stat.pitchingStats.w,
                    l: stat.pitchingStats.l,
                    gs: stat.pitchingStats.gs,
                    gf: stat.pitchingStats.gf,
                    cg: stat.pitchingStats.cg,
                    sho: stat.pitchingStats.sho,
                    sv: stat.pitchingStats.sv,
                    ip: stat.pitchingStats.ip,
                    h: stat.pitchingStats.h,
                    r: stat.pitchingStats.r,
                    er: stat.pitchingStats.er,
                    hr: stat.pitchingStats.hr,
                    bb: stat.pitchingStats.bb,
                    ibb: stat.pitchingStats.ibb,
                    so: stat.pitchingStats.so,
                    hbp: stat.pitchingStats.hbp,
                    battersFaced: stat.pitchingStats.battersFaced,
                    outsRecorded: stat.pitchingStats.outsRecorded,
                  }
                : undefined,
              fielding: stat.fieldingStats
                ? {
                    innDef: stat.fieldingStats.innDef,
                    chances: stat.fieldingStats.chances,
                    po: stat.fieldingStats.po,
                    a: stat.fieldingStats.a,
                    eDef: stat.fieldingStats.eDef,
                    dpDef: stat.fieldingStats.dpDef,
                  }
                : undefined,
            };

            if (stat.teamId === matchup.team1Id) {
              const existing = team1PlayerStats.get(stat.playerId);
              if (existing) {
                existing.push(playerGameStat);
              } else {
                team1PlayerStats.set(stat.playerId, [playerGameStat]);
              }
            } else if (stat.teamId === matchup.team2Id) {
              const existing = team2PlayerStats.get(stat.playerId);
              if (existing) {
                existing.push(playerGameStat);
              } else {
                team2PlayerStats.set(stat.playerId, [playerGameStat]);
              }
            }
          }

          // Calculate new scores
          const matchupScore = calculateMatchupScore(
            matchup.id,
            matchup.team1Id,
            matchup.team2Id,
            team1PlayerStats,
            team2PlayerStats,
            matchup.gamesPerMatchup ?? 5,
            scoringSettings,
          );

          // Update matchup with new scores
          await updateMatchupScore(
            db,
            matchup.id,
            matchupScore.team1Score?.totalScore ?? null,
            matchupScore.team2Score?.totalScore ?? null,
          );

          recalculated++;
        } catch (err) {
          failed++;
          LOGGER.error('Failed to recalculate matchup score', {
            matchupId: matchup.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await writeAuditLog(db, {
        leagueId,
        userId: context.user.id,
        action: 'recalculate_scores',
        targetType: 'league',
        targetId: leagueId,
        details: {
          weekNumber: weekNumber ?? 'all',
          totalMatchups: matchups.length,
          recalculated,
          failed,
        },
      });

      LOGGER.info('Commissioner: recalculated matchup scores', {
        leagueId,
        weekNumber: weekNumber ?? 'all',
        recalculated,
        failed,
        commissionerId: context.user.id,
      });

      const weekLabel = weekNumber ? ` for week ${weekNumber}` : '';
      const failMsg = failed > 0 ? ` (${failed} failed)` : '';

      return {
        success: failed === 0,
        message: `Recalculated ${recalculated} matchup${recalculated === 1 ? '' : 's'}${weekLabel}${failMsg}.`,
        matchupsRecalculated: recalculated,
        matchupsFailed: failed,
      };
    },
  }),
);

// ── Queries ────────────────────────────────────────────────────────────────

// Fetch commissioner audit log for a league
builder.queryField('commissionerAuditLogs', (t) =>
  t.field({
    type: [CommissionerAuditLog],
    description:
      'Commissioner: fetch the audit log for all commissioner actions in a league.',
    args: {
      leagueId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false, defaultValue: 50 }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { leagueId, limit } = args;

      if (!(await checkAdminInDb(context))) {
        await verifyCommissionerAccess(context.db, leagueId, context.user.id);
      }

      const db = context.db;

      const logs = await db
        .select()
        .from(PublicSchema.commissionerAuditLog)
        .where(eq(PublicSchema.commissionerAuditLog.leagueId, leagueId))
        .orderBy(PublicSchema.commissionerAuditLog.createdAt)
        .limit(limit ?? 50);

      return logs;
    },
  }),
);
