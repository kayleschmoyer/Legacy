import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { orderFactsByDifficulty } from './DifficultyOrdering';
import type { DifficultyTier, FactCategory } from './DifficultyOrdering';
import * as PublicSchema from '../../drizzle/public/schema';
import type { PublicDb } from '../client/PublicDbClient';

/**
 * DisclosureGameService — Progressive Disclosure Minigame (LS-1883 / LS-2103)
 *
 * Responsibilities:
 *  1. Seed the `player_facts` table from existing player/stats data
 *  2. Query eligible players (those with enough facts to make a round interesting)
 *  3. Retrieve an ordered fact list for a player (difficulty-sorted, ready for session use)
 */

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

/** Minimum number of distinct facts a player must have to be eligible for the game. */
export const MIN_FACT_COUNT = 5;

/**
 * Difficulty tier ordering used to sort facts before a session.
 * Facts within the same tier are randomised at session-start time.
 */
export const TIER_SORT_ORDER: Record<
  (typeof PublicSchema.difficultyTier.enumValues)[number],
  number
> = {
  vague: 1,
  moderate: 2,
  identifying: 3,
};

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface PlayerFact {
  id: number;
  playerId: number;
  clueText: string;
  category: FactCategory;
  difficultyTier: DifficultyTier;
  season: number | null;
  sortOrder: number;
}

export interface EligiblePlayer {
  id: number;
  firstName: string;
  lastName: string;
  factCount: number;
}

// ──────────────────────────────────────────────────────────────
// Seed helpers — build clue text from raw stat rows
// ──────────────────────────────────────────────────────────────

/**
 * Bucket a career WAR value into a vague range string.
 * e.g. 52.3 → "between 50 and 60"
 */
function warBucket(war: number): string {
  const lo = Math.floor(war / 10) * 10;
  return `between ${lo} and ${lo + 10}`;
}

/**
 * Produce a human-readable batting average string rounded to 3 decimal places.
 */
function fmtAvg(avg: number): string {
  return avg.toFixed(3);
}

// ──────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────

export class DisclosureGameService {
  constructor(private readonly db: PublicDb) {}

  // ── Seeding ──────────────────────────────────────────────────

  /**
   * Seed the `player_facts` table from existing player/stats data. The seed is
   * idempotent and insert-only — existing facts are not updated; run after
   * initial migration or data loader jobs.
   *
   * Returns the number of newly inserted facts.
   */
  async seedPlayerFacts(): Promise<number> {
    LOGGER.info('DisclosureGameService.seedPlayerFacts: starting seed');

    let inserted = 0;

    // Fetch all players with their career achievements and career stats
    const playerRows = await this.db
      .select({
        id: PublicSchema.players.id,
        firstName: PublicSchema.players.firstName,
        lastName: PublicSchema.players.lastName,
        allStarSelections: PublicSchema.players.allStarSelections,
        goldGloves: PublicSchema.players.goldGloves,
        silverSluggers: PublicSchema.players.silverSluggers,
        mvpAwards: PublicSchema.players.mvpAwards,
        cyYoungAwards: PublicSchema.players.cyYoungAwards,
        worldSeriesRings: PublicSchema.players.worldSeriesRings,
        hallOfFame: PublicSchema.players.hallOfFame,
        rookieOfTheYear: PublicSchema.players.rookieOfTheYear,
      })
      .from(PublicSchema.players);

    LOGGER.info(
      `DisclosureGameService.seedPlayerFacts: seeding facts for ${playerRows.length} players`,
    );

    for (const player of playerRows) {
      const facts: Array<{
        playerId: number;
        clueText: string;
        category: (typeof PublicSchema.playerFactCategory.enumValues)[number];
        difficultyTier: (typeof PublicSchema.difficultyTier.enumValues)[number];
        season: number | null;
        sortOrder: number;
      }> = [];

      // ── Achievement facts (identifying tier) ─────────────────────
      if (player.hallOfFame) {
        facts.push({
          playerId: player.id,
          clueText: 'This player is a Hall of Famer.',
          category: 'achievement',
          difficultyTier: 'identifying',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.rookieOfTheYear) {
        facts.push({
          playerId: player.id,
          clueText: 'This player won Rookie of the Year.',
          category: 'achievement',
          difficultyTier: 'moderate',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.mvpAwards > 0) {
        facts.push({
          playerId: player.id,
          clueText:
            player.mvpAwards === 1
              ? 'This player won 1 MVP award.'
              : `This player won ${player.mvpAwards} MVP awards.`,
          category: 'award',
          difficultyTier: player.mvpAwards >= 2 ? 'identifying' : 'moderate',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.cyYoungAwards > 0) {
        facts.push({
          playerId: player.id,
          clueText:
            player.cyYoungAwards === 1
              ? 'This player won 1 Cy Young Award.'
              : `This player won ${player.cyYoungAwards} Cy Young Awards.`,
          category: 'award',
          difficultyTier:
            player.cyYoungAwards >= 2 ? 'identifying' : 'moderate',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.allStarSelections > 0) {
        facts.push({
          playerId: player.id,
          clueText:
            player.allStarSelections === 1
              ? 'This player was selected to 1 All-Star Game.'
              : `This player was selected to ${player.allStarSelections} All-Star Games.`,
          category: 'achievement',
          // Many players are All-Stars; keep vague unless 10+
          difficultyTier:
            player.allStarSelections >= 10
              ? 'identifying'
              : player.allStarSelections >= 5
                ? 'moderate'
                : 'vague',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.goldGloves > 0) {
        facts.push({
          playerId: player.id,
          clueText:
            player.goldGloves === 1
              ? 'This player won 1 Gold Glove.'
              : `This player won ${player.goldGloves} Gold Gloves.`,
          category: 'achievement',
          difficultyTier: player.goldGloves >= 5 ? 'identifying' : 'moderate',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.silverSluggers > 0) {
        facts.push({
          playerId: player.id,
          clueText:
            player.silverSluggers === 1
              ? 'This player won 1 Silver Slugger award.'
              : `This player won ${player.silverSluggers} Silver Slugger awards.`,
          category: 'achievement',
          difficultyTier:
            player.silverSluggers >= 5 ? 'identifying' : 'moderate',
          season: null,
          sortOrder: 0,
        });
      }

      if (player.worldSeriesRings > 0) {
        facts.push({
          playerId: player.id,
          clueText:
            player.worldSeriesRings === 1
              ? 'This player won 1 World Series ring.'
              : `This player won ${player.worldSeriesRings} World Series rings.`,
          category: 'achievement',
          difficultyTier:
            player.worldSeriesRings >= 4 ? 'identifying' : 'moderate',
          season: null,
          sortOrder: 0,
        });
      }

      // ── Career batting stats ──────────────────────────────────────
      const [careerBatting] = await this.db
        .select({
          g: PublicSchema.careerBatting.g,
          hr: PublicSchema.careerBatting.hr,
          h: PublicSchema.careerBatting.h,
          rbi: PublicSchema.careerBatting.rbi,
          sb: PublicSchema.careerBatting.sb,
          bwar: sql<number>`sum(${PublicSchema.seasonBatting.bwar})`,
        })
        .from(PublicSchema.careerBatting)
        .leftJoin(
          PublicSchema.seasonBatting,
          eq(
            PublicSchema.seasonBatting.playerId,
            PublicSchema.careerBatting.playerId,
          ),
        )
        .where(eq(PublicSchema.careerBatting.playerId, player.id))
        .groupBy(
          PublicSchema.careerBatting.playerId,
          PublicSchema.careerBatting.g,
          PublicSchema.careerBatting.hr,
          PublicSchema.careerBatting.h,
          PublicSchema.careerBatting.rbi,
          PublicSchema.careerBatting.sb,
        )
        .limit(1);

      if (careerBatting) {
        if (careerBatting.hr && careerBatting.hr >= 100) {
          facts.push({
            playerId: player.id,
            clueText: `This player hit ${careerBatting.hr} career home runs.`,
            category: 'career_stat',
            difficultyTier:
              careerBatting.hr >= 400
                ? 'identifying'
                : careerBatting.hr >= 200
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerBatting.h && careerBatting.h >= 1000) {
          facts.push({
            playerId: player.id,
            clueText: `This player collected ${careerBatting.h} career hits.`,
            category: 'career_stat',
            difficultyTier:
              careerBatting.h >= 3000
                ? 'identifying'
                : careerBatting.h >= 2000
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerBatting.rbi && careerBatting.rbi >= 200) {
          facts.push({
            playerId: player.id,
            clueText: `This player drove in ${careerBatting.rbi} career runs.`,
            category: 'career_stat',
            difficultyTier:
              careerBatting.rbi >= 1200
                ? 'identifying'
                : careerBatting.rbi >= 700
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerBatting.sb && careerBatting.sb >= 50) {
          facts.push({
            playerId: player.id,
            clueText: `This player stole ${careerBatting.sb} career bases.`,
            category: 'career_stat',
            difficultyTier:
              careerBatting.sb >= 500
                ? 'identifying'
                : careerBatting.sb >= 200
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerBatting.bwar && careerBatting.bwar >= 10) {
          facts.push({
            playerId: player.id,
            clueText: `This player's career batting WAR was ${warBucket(careerBatting.bwar)}.`,
            category: 'career_stat',
            difficultyTier: 'vague', // WAR bucket is deliberately imprecise
            season: null,
            sortOrder: 0,
          });
        }
      }

      // ── Career pitching stats ─────────────────────────────────────
      const [careerPitching] = await this.db
        .select({
          w: sql<number>`sum(${PublicSchema.seasonPitching.w})`,
          so: sql<number>`sum(${PublicSchema.seasonPitching.so})`,
          sv: sql<number>`sum(${PublicSchema.seasonPitching.sv})`,
          pwar: sql<number>`sum(${PublicSchema.seasonPitching.pwar})`,
        })
        .from(PublicSchema.seasonPitching)
        .where(eq(PublicSchema.seasonPitching.playerId, player.id))
        .limit(1);

      if (careerPitching) {
        if (careerPitching.w && careerPitching.w >= 50) {
          facts.push({
            playerId: player.id,
            clueText: `This player won ${careerPitching.w} games as a pitcher.`,
            category: 'career_stat',
            difficultyTier:
              careerPitching.w >= 300
                ? 'identifying'
                : careerPitching.w >= 150
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerPitching.so && careerPitching.so >= 200) {
          facts.push({
            playerId: player.id,
            clueText: `This player struck out ${careerPitching.so} batters.`,
            category: 'career_stat',
            difficultyTier:
              careerPitching.so >= 3000
                ? 'identifying'
                : careerPitching.so >= 1500
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerPitching.sv && careerPitching.sv >= 50) {
          facts.push({
            playerId: player.id,
            clueText: `This player recorded ${careerPitching.sv} career saves.`,
            category: 'career_stat',
            difficultyTier:
              careerPitching.sv >= 300
                ? 'identifying'
                : careerPitching.sv >= 150
                  ? 'moderate'
                  : 'vague',
            season: null,
            sortOrder: 0,
          });
        }

        if (careerPitching.pwar && careerPitching.pwar >= 10) {
          facts.push({
            playerId: player.id,
            clueText: `This pitcher's career WAR was ${warBucket(careerPitching.pwar)}.`,
            category: 'career_stat',
            difficultyTier: 'vague',
            season: null,
            sortOrder: 0,
          });
        }
      }

      // ── Team history (most prominent teams) ───────────────────────
      const teamRows = await this.db
        .select({
          team: PublicSchema.seasonBatting.team,
          seasons: sql<number>`count(distinct ${PublicSchema.seasonBatting.season})`,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            eq(PublicSchema.seasonBatting.playerId, player.id),
            sql`${PublicSchema.seasonBatting.lgId} IN ('AL', 'NL')`,
          ),
        )
        .groupBy(PublicSchema.seasonBatting.team)
        .orderBy(sql`count(distinct ${PublicSchema.seasonBatting.season}) desc`)
        .limit(3);

      for (const { team, seasons } of teamRows) {
        if (seasons >= 2) {
          facts.push({
            playerId: player.id,
            clueText: `This player spent ${seasons} season${seasons !== 1 ? 's' : ''} with the ${team}.`,
            category: 'team_history',
            difficultyTier: seasons >= 8 ? 'identifying' : 'moderate',
            season: null,
            sortOrder: 0,
          });
        }
      }

      // ── Notable single seasons ────────────────────────────────────
      // Best batting average season (>= .300, at least 300 PA)
      const [bestAvgSeason] = await this.db
        .select({
          season: PublicSchema.seasonBatting.season,
          battingAvg: PublicSchema.seasonBatting.battingAvg,
          team: PublicSchema.seasonBatting.team,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            eq(PublicSchema.seasonBatting.playerId, player.id),
            gte(PublicSchema.seasonBatting.pa, 300),
            gte(PublicSchema.seasonBatting.battingAvg, 0.3),
          ),
        )
        .orderBy(sql`${PublicSchema.seasonBatting.battingAvg} desc`)
        .limit(1);

      if (bestAvgSeason?.battingAvg) {
        facts.push({
          playerId: player.id,
          clueText: `This player batted ${fmtAvg(bestAvgSeason.battingAvg)} in the ${bestAvgSeason.season} season.`,
          category: 'season_stat',
          difficultyTier:
            bestAvgSeason.battingAvg >= 0.38 ? 'identifying' : 'moderate',
          season: bestAvgSeason.season,
          sortOrder: 0,
        });
      }

      // Best HR season (>= 30 HR)
      const [bestHrSeason] = await this.db
        .select({
          season: PublicSchema.seasonBatting.season,
          hr: PublicSchema.seasonBatting.hr,
          team: PublicSchema.seasonBatting.team,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            eq(PublicSchema.seasonBatting.playerId, player.id),
            gte(PublicSchema.seasonBatting.hr, 30),
          ),
        )
        .orderBy(sql`${PublicSchema.seasonBatting.hr} desc`)
        .limit(1);

      if (bestHrSeason?.hr) {
        facts.push({
          playerId: player.id,
          clueText: `This player hit ${bestHrSeason.hr} home runs in the ${bestHrSeason.season} season.`,
          category: 'season_stat',
          difficultyTier:
            bestHrSeason.hr >= 60
              ? 'identifying'
              : bestHrSeason.hr >= 50
                ? 'moderate'
                : 'vague',
          season: bestHrSeason.season,
          sortOrder: 0,
        });
      }

      // Best SO season for pitchers (>= 200 K)
      const [bestKSeason] = await this.db
        .select({
          season: PublicSchema.seasonPitching.season,
          so: PublicSchema.seasonPitching.so,
        })
        .from(PublicSchema.seasonPitching)
        .where(
          and(
            eq(PublicSchema.seasonPitching.playerId, player.id),
            gte(PublicSchema.seasonPitching.so, 200),
          ),
        )
        .orderBy(sql`${PublicSchema.seasonPitching.so} desc`)
        .limit(1);

      if (bestKSeason?.so) {
        facts.push({
          playerId: player.id,
          clueText: `This pitcher struck out ${bestKSeason.so} batters in the ${bestKSeason.season} season.`,
          category: 'season_stat',
          difficultyTier:
            bestKSeason.so >= 380
              ? 'identifying'
              : bestKSeason.so >= 280
                ? 'moderate'
                : 'vague',
          season: bestKSeason.season,
          sortOrder: 0,
        });
      }

      // Insert facts for this player (idempotent)
      if (facts.length > 0) {
        const result = await this.db
          .insert(PublicSchema.playerFacts)
          .values(facts)
          .onConflictDoNothing()
          .returning({ id: PublicSchema.playerFacts.id });
        inserted += result.length;
      }
    }

    LOGGER.info(
      `DisclosureGameService.seedPlayerFacts: inserted ${inserted} new facts`,
    );
    return inserted;
  }

  // ── Queries ──────────────────────────────────────────────────

  /**
   * Return players with at least `minFactCount` facts (default: MIN_FACT_COUNT).
   * Results are ordered by fact count descending so the richest players appear first.
   *
   * @param minFactCount Minimum number of facts required (defaults to MIN_FACT_COUNT)
   * @param limit Max number of players to return (defaults to 100)
   */
  async getEligiblePlayers(
    minFactCount = MIN_FACT_COUNT,
    limit = 100,
  ): Promise<EligiblePlayer[]> {
    const rows = await this.db
      .select({
        id: PublicSchema.players.id,
        firstName: PublicSchema.players.firstName,
        lastName: PublicSchema.players.lastName,
        factCount: count(PublicSchema.playerFacts.id),
      })
      .from(PublicSchema.players)
      .innerJoin(
        PublicSchema.playerFacts,
        eq(PublicSchema.playerFacts.playerId, PublicSchema.players.id),
      )
      .groupBy(
        PublicSchema.players.id,
        PublicSchema.players.firstName,
        PublicSchema.players.lastName,
      )
      .having(gte(count(PublicSchema.playerFacts.id), minFactCount))
      .orderBy(sql`count(${PublicSchema.playerFacts.id}) desc`)
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      factCount: Number(r.factCount),
    }));
  }

  /**
   * Return a random eligible player ID for use in starting a new game session.
   * Eligibility threshold is MIN_FACT_COUNT.
   */
  async getRandomEligiblePlayerId(): Promise<number | null> {
    const [row] = await this.db
      .select({ playerId: PublicSchema.playerFacts.playerId })
      .from(PublicSchema.playerFacts)
      .groupBy(PublicSchema.playerFacts.playerId)
      .having(gte(count(PublicSchema.playerFacts.id), MIN_FACT_COUNT))
      .orderBy(sql`random()`)
      .limit(1);

    return row?.playerId ?? null;
  }

  /**
   * Return all facts for a player, sorted by difficulty tier then sortOrder.
   * The session layer adds intra-tier randomisation on top of this order.
   */
  async getPlayerFacts(playerId: number): Promise<PlayerFact[]> {
    const rows = await this.db
      .select()
      .from(PublicSchema.playerFacts)
      .where(eq(PublicSchema.playerFacts.playerId, playerId))
      .orderBy(
        // Sort by difficulty tier ordinal (vague=1 first)
        sql`CASE ${PublicSchema.playerFacts.difficultyTier}
              WHEN 'vague'       THEN 1
              WHEN 'moderate'    THEN 2
              WHEN 'identifying' THEN 3
            END`,
        PublicSchema.playerFacts.sortOrder,
      );

    return rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      clueText: r.clueText,
      category: r.category,
      difficultyTier: r.difficultyTier,
      season: r.season ?? null,
      sortOrder: r.sortOrder,
    }));
  }

  /**
   * Return the fact count for one or more players.
   * Used by eligibility checks without fetching full fact rows.
   */
  async getFactCountsForPlayers(
    playerIds: number[],
  ): Promise<Map<number, number>> {
    if (playerIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        playerId: PublicSchema.playerFacts.playerId,
        factCount: count(PublicSchema.playerFacts.id),
      })
      .from(PublicSchema.playerFacts)
      .where(inArray(PublicSchema.playerFacts.playerId, playerIds))
      .groupBy(PublicSchema.playerFacts.playerId);

    return new Map(rows.map((r) => [r.playerId, Number(r.factCount)]));
  }

  // ── Session management ────────────────────────────────────────

  /**
   * Calculate score for a session based on how many clues were revealed.
   *
   * Scoring: 1000 points for the first clue, scaling linearly down to a
   * minimum of 100 points on the last clue.
   *
   * score = max(100, round(1000 - (cluesRevealed - 1) * (900 / (totalClues - 1))))
   *
   * When totalClues <= 1, the full 1000 points is always awarded.
   */
  static calculateScore(cluesRevealed: number, totalClues: number): number {
    if (totalClues <= 1 || cluesRevealed <= 1) return 1000;
    const penalty = Math.round((900 * (cluesRevealed - 1)) / (totalClues - 1));
    return Math.max(100, 1000 - penalty);
  }

  /**
   * Start a new disclosure game session for the given user.
   *
   * Selects a random eligible player, loads their facts ordered by difficulty
   * tier (with intra-tier shuffling), persists the session, and returns the
   * session ID plus the total number of available clues.
   */
  async startSession(userId: number): Promise<{
    sessionId: number;
    totalClues: number;
  }> {
    const playerId = await this.getRandomEligiblePlayerId();
    if (playerId === null) {
      throw new Error(
        'No eligible players found. Run seedPlayerFacts() first.',
      );
    }

    // Load facts and order by difficulty tier (vague → moderate → identifying),
    // with Fisher-Yates shuffle within each tier for freshness.
    const facts = await this.getPlayerFacts(playerId);
    const orderedFacts = orderFactsByDifficulty(facts);
    const orderedFactIds = orderedFacts.map((f) => f.id);
    const now = new Date().toISOString();

    const [session] = await this.db
      .insert(PublicSchema.disclosureGameSessions)
      .values({
        userId,
        playerId,
        status: 'active',
        cluesRevealed: 0,
        orderedFactIds,
        score: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: PublicSchema.disclosureGameSessions.id });

    LOGGER.info(
      `DisclosureGameService.startSession: created session ${session.id} for user ${userId}, player ${playerId}, ${orderedFactIds.length} clues`,
    );

    return { sessionId: session.id, totalClues: orderedFactIds.length };
  }

  /**
   * Advance the session to the next clue and return its text.
   *
   * Throws if:
   *  - Session not found or not owned by userId
   *  - Session is not active
   *  - All clues have already been revealed (marks session 'lost' first, then throws)
   */
  async nextClue(
    sessionId: number,
    userId: number,
  ): Promise<{
    clueText: string;
    difficultyTier: string;
    clueIndex: number; // 1-based position of this clue
    totalClues: number;
    isLastClue: boolean;
  }> {
    const [session] = await this.db
      .select()
      .from(PublicSchema.disclosureGameSessions)
      .where(eq(PublicSchema.disclosureGameSessions.id, sessionId))
      .limit(1);

    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error(`Session is already ${session.status}`);
    }

    const orderedFactIds = session.orderedFactIds;
    const nextIndex = session.cluesRevealed; // 0-based index of the next fact to reveal

    if (nextIndex >= orderedFactIds.length) {
      // All clues exhausted — mark as lost
      await this.db
        .update(PublicSchema.disclosureGameSessions)
        .set({
          status: 'lost',
          score: 0,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(PublicSchema.disclosureGameSessions.id, sessionId));
      throw new Error('No more clues available — session ended as lost');
    }

    const factId = orderedFactIds[nextIndex];
    const [fact] = await this.db
      .select({
        clueText: PublicSchema.playerFacts.clueText,
        difficultyTier: PublicSchema.playerFacts.difficultyTier,
      })
      .from(PublicSchema.playerFacts)
      .where(eq(PublicSchema.playerFacts.id, factId))
      .limit(1);

    if (!fact) {
      throw new Error(`Fact ${factId} not found`);
    }

    const newCluesRevealed = session.cluesRevealed + 1;
    const isLastClue = newCluesRevealed >= orderedFactIds.length;

    // Atomic conditional UPDATE: only succeeds when clues_revealed hasn't changed
    // since we read it, preventing concurrent calls from returning the same clue.
    const updated = await this.db
      .update(PublicSchema.disclosureGameSessions)
      .set({
        cluesRevealed: newCluesRevealed,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(PublicSchema.disclosureGameSessions.id, sessionId),
          eq(PublicSchema.disclosureGameSessions.status, 'active'),
          eq(
            PublicSchema.disclosureGameSessions.cluesRevealed,
            session.cluesRevealed,
          ),
        ),
      )
      .returning({ id: PublicSchema.disclosureGameSessions.id });

    if (updated.length === 0) {
      throw new Error('Concurrent nextClue call detected — please retry');
    }

    return {
      clueText: fact.clueText,
      difficultyTier: fact.difficultyTier,
      clueIndex: newCluesRevealed,
      totalClues: orderedFactIds.length,
      isLastClue,
    };
  }

  /**
   * Submit a player ID as a guess for the given session.
   *
   * Returns:
   *  - correct: boolean
   *  - score: number (only meaningful when correct === true)
   *  - correctPlayerId: number (only returned when correct === false, so the caller can reveal it)
   *
   * Session must be active and owned by userId.
   * A wrong guess when clues remain does NOT end the session — the user may request more clues
   * and try again. A wrong guess when all clues are exhausted transitions the session to 'lost'
   * (score=0, completedAt set) and returns correctPlayerId.
   */
  async submitGuess(
    sessionId: number,
    userId: number,
    guessedPlayerId: number,
  ): Promise<{
    correct: boolean;
    score: number;
    correctPlayerId: number | null;
    cluesUsed: number;
  }> {
    const [session] = await this.db
      .select()
      .from(PublicSchema.disclosureGameSessions)
      .where(eq(PublicSchema.disclosureGameSessions.id, sessionId))
      .limit(1);

    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error(`Session is already ${session.status}`);
    }

    const orderedFactIds = session.orderedFactIds;
    const correct = guessedPlayerId === session.playerId;

    if (correct) {
      const score = DisclosureGameService.calculateScore(
        session.cluesRevealed,
        orderedFactIds.length,
      );
      await this.db
        .update(PublicSchema.disclosureGameSessions)
        .set({
          status: 'won',
          score,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(PublicSchema.disclosureGameSessions.id, sessionId));

      LOGGER.info(
        `DisclosureGameService.submitGuess: session ${sessionId} won with score ${score} (${session.cluesRevealed} clues used)`,
      );

      return {
        correct: true,
        score,
        correctPlayerId: null,
        cluesUsed: session.cluesRevealed,
      };
    }

    // Wrong guess — check if all clues are exhausted
    if (session.cluesRevealed >= orderedFactIds.length) {
      // No more clues to reveal — end the session as lost
      await this.db
        .update(PublicSchema.disclosureGameSessions)
        .set({
          status: 'lost',
          score: 0,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(PublicSchema.disclosureGameSessions.id, sessionId));

      LOGGER.info(
        `DisclosureGameService.submitGuess: session ${sessionId} lost after last clue — wrong guess`,
      );

      return {
        correct: false,
        score: 0,
        correctPlayerId: session.playerId,
        cluesUsed: session.cluesRevealed,
      };
    }

    // Clues still available — session remains active, no state change
    return {
      correct: false,
      score: 0,
      correctPlayerId: null,
      cluesUsed: session.cluesRevealed,
    };
  }

  /**
   * Give up on the current session — reveals the answer without awarding points.
   */
  async giveUp(
    sessionId: number,
    userId: number,
  ): Promise<{ correctPlayerId: number }> {
    const [session] = await this.db
      .select()
      .from(PublicSchema.disclosureGameSessions)
      .where(eq(PublicSchema.disclosureGameSessions.id, sessionId))
      .limit(1);

    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error(`Session is already ${session.status}`);
    }

    await this.db
      .update(PublicSchema.disclosureGameSessions)
      .set({
        status: 'given_up',
        score: 0,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(PublicSchema.disclosureGameSessions.id, sessionId));

    return { correctPlayerId: session.playerId };
  }

  /**
   * Fetch session state (for the disclosureGameSession query).
   * Returns null when the session doesn't exist or doesn't belong to userId.
   */
  async getSession(
    sessionId: number,
    userId: number,
  ): Promise<{
    id: number;
    status: 'active' | 'won' | 'lost' | 'given_up';
    cluesRevealed: number;
    totalClues: number;
    score: number | null;
    correctPlayerId: number | null;
    createdAt: string;
    completedAt: string | null;
  } | null> {
    const [session] = await this.db
      .select()
      .from(PublicSchema.disclosureGameSessions)
      .where(eq(PublicSchema.disclosureGameSessions.id, sessionId))
      .limit(1);

    if (!session || session.userId !== userId) return null;

    const orderedFactIds = session.orderedFactIds;

    return {
      id: session.id,
      status: session.status,
      cluesRevealed: session.cluesRevealed,
      totalClues: orderedFactIds.length,
      score: session.score ?? null,
      // Reveal the correct player only after the session ends
      correctPlayerId: session.status !== 'active' ? session.playerId : null,
      createdAt: session.createdAt,
      completedAt: session.completedAt ?? null,
    };
  }

  /**
   * Return the most recent sessions for a user (for history/leaderboard).
   */
  async getRecentSessions(
    userId: number,
    limit = 10,
  ): Promise<
    Array<{
      id: number;
      status: string;
      cluesRevealed: number;
      score: number | null;
      createdAt: string;
      completedAt: string | null;
    }>
  > {
    const rows = await this.db
      .select({
        id: PublicSchema.disclosureGameSessions.id,
        status: PublicSchema.disclosureGameSessions.status,
        cluesRevealed: PublicSchema.disclosureGameSessions.cluesRevealed,
        score: PublicSchema.disclosureGameSessions.score,
        createdAt: PublicSchema.disclosureGameSessions.createdAt,
        completedAt: PublicSchema.disclosureGameSessions.completedAt,
      })
      .from(PublicSchema.disclosureGameSessions)
      .where(eq(PublicSchema.disclosureGameSessions.userId, userId))
      .orderBy(desc(PublicSchema.disclosureGameSessions.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      cluesRevealed: r.cluesRevealed,
      score: r.score ?? null,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? null,
    }));
  }
}
