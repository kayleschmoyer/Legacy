import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { and, asc, eq } from 'drizzle-orm';

/**
 * Playoff Service (LS-28)
 *
 * Handles playoff bracket creation, seeding, progression, and championship awards
 */

export interface CreateBracketParams {
  leagueId: number;
  season: number;
  format: '4-team' | '6-team' | '8-team';
  startWeek: number;
  multiWeekMatchups: boolean;
}

export interface BracketStructure {
  rounds: Array<{
    round: 'wildcard' | 'semifinals' | 'finals';
    weekNumber: number;
    matchups: Array<{
      matchupNumber: number;
      highSeed: number;
      lowSeed: number;
    }>;
  }>;
}

export class PlayoffService {
  /**
   * Create a playoff bracket with automatic seeding
   */
  static async createBracket(params: CreateBracketParams) {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      const { leagueId, season, format, startWeek, multiWeekMatchups } = params;

      // Get standings to determine seeding
      const { StandingsService } = await import('./standings-service');
      const standings = await StandingsService.getStandings({
        leagueId,
        season,
      });

      const numTeams = parseInt(format.split('-')[0]);
      if (standings.length < numTeams) {
        throw new Error(
          `Not enough teams for ${format} playoff. Need ${numTeams}, have ${standings.length}`,
        );
      }

      // Create bracket structure
      const bracketStructure = this.getBracketStructure(
        format,
        startWeek,
        multiWeekMatchups,
      );
      const endWeek =
        bracketStructure.rounds[bracketStructure.rounds.length - 1].weekNumber;

      // Insert playoff bracket record
      const bracketResults = await db
        .insert(PublicSchema.playoffBrackets)
        .values({
          leagueId,
          season,
          format,
          startWeek,
          endWeek,
          status: 'scheduled',
        })
        .returning();

      const bracket = bracketResults[0];

      // Insert seeds
      const seedValues = standings
        .slice(0, numTeams)
        .map((standing, index) => ({
          bracketId: bracket.id,
          teamId: standing.teamId,
          seedNumber: index + 1,
          regularSeasonWins: standing.wins,
          regularSeasonLosses: standing.losses,
          pointsFor: standing.pointsFor.toString(),
        }));

      await db.insert(PublicSchema.playoffSeeds).values(seedValues);

      // Create matchups based on bracket structure
      const matchupValues = bracketStructure.rounds.flatMap((round) =>
        round.matchups.map((matchup) => ({
          bracketId: bracket.id,
          round: round.round,
          matchupNumber: matchup.matchupNumber,
          highSeedTeamId:
            matchup.highSeed !== 0
              ? standings[matchup.highSeed - 1].teamId
              : null,
          lowSeedTeamId:
            matchup.lowSeed !== 0
              ? standings[matchup.lowSeed - 1].teamId
              : null,
          weekNumber: round.weekNumber,
          isMultiWeek: multiWeekMatchups,
          status: 'scheduled' as const,
        })),
      );

      await db.insert(PublicSchema.playoffMatchups).values(matchupValues);

      return bracket;
    });
  }

  /**
   * Get bracket structure based on format
   */
  private static getBracketStructure(
    format: '4-team' | '6-team' | '8-team',
    startWeek: number,
    multiWeek: boolean,
  ): BracketStructure {
    const weekIncrement = multiWeek ? 2 : 1;

    if (format === '4-team') {
      // 4-team: 2 semifinals, 1 final
      return {
        rounds: [
          {
            round: 'semifinals',
            weekNumber: startWeek,
            matchups: [
              { matchupNumber: 1, highSeed: 1, lowSeed: 4 },
              { matchupNumber: 2, highSeed: 2, lowSeed: 3 },
            ],
          },
          {
            round: 'finals',
            weekNumber: startWeek + weekIncrement,
            matchups: [{ matchupNumber: 1, highSeed: 0, lowSeed: 0 }], // Winners TBD
          },
        ],
      };
    } else if (format === '6-team') {
      // 6-team: 2 wildcards (3v6, 4v5), 2 semifinals (1v winner, 2v winner), 1 final
      return {
        rounds: [
          {
            round: 'wildcard',
            weekNumber: startWeek,
            matchups: [
              { matchupNumber: 1, highSeed: 3, lowSeed: 6 },
              { matchupNumber: 2, highSeed: 4, lowSeed: 5 },
            ],
          },
          {
            round: 'semifinals',
            weekNumber: startWeek + weekIncrement,
            matchups: [
              { matchupNumber: 1, highSeed: 1, lowSeed: 0 }, // #1 vs wildcard winner
              { matchupNumber: 2, highSeed: 2, lowSeed: 0 }, // #2 vs wildcard winner
            ],
          },
          {
            round: 'finals',
            weekNumber: startWeek + weekIncrement * 2,
            matchups: [{ matchupNumber: 1, highSeed: 0, lowSeed: 0 }], // Semifinal winners
          },
        ],
      };
    } else {
      // 8-team: 4 wildcards, 2 semifinals, 1 final
      return {
        rounds: [
          {
            round: 'wildcard',
            weekNumber: startWeek,
            matchups: [
              { matchupNumber: 1, highSeed: 1, lowSeed: 8 },
              { matchupNumber: 2, highSeed: 2, lowSeed: 7 },
              { matchupNumber: 3, highSeed: 3, lowSeed: 6 },
              { matchupNumber: 4, highSeed: 4, lowSeed: 5 },
            ],
          },
          {
            round: 'semifinals',
            weekNumber: startWeek + weekIncrement,
            matchups: [
              { matchupNumber: 1, highSeed: 0, lowSeed: 0 }, // Wildcard winners
              { matchupNumber: 2, highSeed: 0, lowSeed: 0 },
            ],
          },
          {
            round: 'finals',
            weekNumber: startWeek + weekIncrement * 2,
            matchups: [{ matchupNumber: 1, highSeed: 0, lowSeed: 0 }],
          },
        ],
      };
    }
  }

  /**
   * Advance bracket - move winners to next round
   */
  static async advanceBracket(bracketId: number) {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      // Get all matchups in bracket
      const matchups = await db
        .select()
        .from(PublicSchema.playoffMatchups)
        .where(eq(PublicSchema.playoffMatchups.bracketId, bracketId))
        .orderBy(
          asc(PublicSchema.playoffMatchups.round),
          asc(PublicSchema.playoffMatchups.matchupNumber),
        );

      // Determine which rounds are complete
      const wildcardMatchups = matchups.filter((m) => m.round === 'wildcard');
      const semifinalMatchups = matchups.filter(
        (m) => m.round === 'semifinals',
      );
      const finalMatchups = matchups.filter((m) => m.round === 'finals');

      const wildcardComplete = wildcardMatchups.every(
        (m) => m.status === 'completed',
      );
      const semifinalsComplete = semifinalMatchups.every(
        (m) => m.status === 'completed',
      );

      // Advance wildcard winners to semifinals
      if (wildcardComplete && wildcardMatchups.length > 0) {
        const wildcardWinners = wildcardMatchups
          .map((m) => m.winnerTeamId)
          .filter((id): id is number => id !== null);

        if (wildcardWinners.length === wildcardMatchups.length) {
          // Set semifinal opponents
          for (let i = 0; i < semifinalMatchups.length; i++) {
            const semifinal = semifinalMatchups[i];
            if (semifinal.lowSeedTeamId === null && wildcardWinners[i]) {
              await db
                .update(PublicSchema.playoffMatchups)
                .set({ lowSeedTeamId: wildcardWinners[i] })
                .where(eq(PublicSchema.playoffMatchups.id, semifinal.id));
            }
          }
        }
      }

      // Advance semifinal winners to finals
      if (semifinalsComplete && semifinalMatchups.length > 0) {
        const semifinalWinners = semifinalMatchups
          .map((m) => m.winnerTeamId)
          .filter((id): id is number => id !== null);

        if (semifinalWinners.length === 2 && finalMatchups.length > 0) {
          const final = finalMatchups[0];
          if (final.highSeedTeamId === null) {
            await db
              .update(PublicSchema.playoffMatchups)
              .set({
                highSeedTeamId: semifinalWinners[0],
                lowSeedTeamId: semifinalWinners[1],
              })
              .where(eq(PublicSchema.playoffMatchups.id, final.id));
          }
        }
      }

      // Update bracket status
      const allComplete = matchups.every((m) => m.status === 'completed');
      if (allComplete) {
        const championMatchup = finalMatchups[0];
        if (championMatchup && championMatchup.winnerTeamId) {
          await db
            .update(PublicSchema.playoffBrackets)
            .set({
              status: 'completed',
              championTeamId: championMatchup.winnerTeamId,
            })
            .where(eq(PublicSchema.playoffBrackets.id, bracketId));
        }
      } else {
        await db
          .update(PublicSchema.playoffBrackets)
          .set({ status: 'in_progress' })
          .where(eq(PublicSchema.playoffBrackets.id, bracketId));
      }

      // Return updated bracket
      const bracketResults = await db
        .select()
        .from(PublicSchema.playoffBrackets)
        .where(eq(PublicSchema.playoffBrackets.id, bracketId))
        .limit(1);

      return bracketResults[0];
    });
  }

  /**
   * Award championship trophy
   */
  static async awardChampionship(bracketId: number) {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      // Get bracket info
      const bracketResults = await db
        .select()
        .from(PublicSchema.playoffBrackets)
        .where(eq(PublicSchema.playoffBrackets.id, bracketId))
        .limit(1);

      const bracket = bracketResults[0];
      if (!bracket) {
        throw new Error('Bracket not found');
      }

      if (!bracket.championTeamId) {
        throw new Error('No champion determined yet');
      }

      // Get championship matchup
      const finalMatchups = await db
        .select()
        .from(PublicSchema.playoffMatchups)
        .where(
          and(
            eq(PublicSchema.playoffMatchups.bracketId, bracketId),
            eq(PublicSchema.playoffMatchups.round, 'finals'),
          ),
        )
        .limit(1);

      const finalMatchup = finalMatchups[0];
      if (!finalMatchup || !finalMatchup.winnerTeamId) {
        throw new Error('Championship matchup not completed');
      }

      // Determine runner-up
      const runnerUpTeamId =
        finalMatchup.winnerTeamId === finalMatchup.highSeedTeamId
          ? finalMatchup.lowSeedTeamId
          : finalMatchup.highSeedTeamId;
      const runnerUpScore =
        finalMatchup.winnerTeamId === finalMatchup.highSeedTeamId
          ? finalMatchup.lowSeedScore
          : finalMatchup.highSeedScore;
      const finalScore =
        finalMatchup.winnerTeamId === finalMatchup.highSeedTeamId
          ? finalMatchup.highSeedScore
          : finalMatchup.lowSeedScore;

      if (!finalScore) {
        throw new Error('Championship scores not available');
      }

      // Create trophy record
      const trophyResults = await db
        .insert(PublicSchema.championTrophies)
        .values({
          leagueId: bracket.leagueId,
          season: bracket.season,
          teamId: bracket.championTeamId,
          championshipWeek: finalMatchup.weekNumber,
          finalScore,
          runnerUpTeamId,
          runnerUpScore,
        })
        .returning();

      return trophyResults[0];
    });
  }
}
