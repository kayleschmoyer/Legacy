/**
 * Waivers domain — Helper utilities
 *
 * Contains shared helpers used across the waivers domain:
 *  - validateFaabBudget: consistent FAAB budget validation (submission + processing)
 *  - addClaimedPlayerToCurrentMatchup: set up a newly-claimed player's matchup data
 */
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  MIN_SEASON_WITH_GAME_DATA,
  SEASON_MATCHUP_MULTIPLIER,
} from '@legacy-sports/utils';
import { and, eq, gte, isNotNull, or, sql } from 'drizzle-orm';

/**
 * Validate that a team has sufficient FAAB budget for a bid, accounting for
 * all currently pending (committed) bids.
 *
 * Throws an Error if the bid exceeds available budget.
 * Used at both submission time (mutations.ts) and processing time
 * (waiver-processor.ts) to ensure consistent validation.
 *
 * At processing time the claim being validated has already been set to
 * 'processing' (not 'pending'), so it is naturally excluded from the
 * committed-bids sum — no explicit exclusion needed.
 */
export async function validateFaabBudget(
  db: PublicDb,
  teamId: number,
  faabBid: number,
): Promise<void> {
  const result = await db
    .select({
      faabBudget: PublicSchema.teams.faabBudget,
      committedBids: sql<number>`COALESCE((
        SELECT SUM(${PublicSchema.waiverClaims.faabBid})
        FROM ${PublicSchema.waiverClaims}
        WHERE ${PublicSchema.waiverClaims.teamId} = ${PublicSchema.teams.id}
          AND ${PublicSchema.waiverClaims.status} = 'pending'
      ), 0)`,
    })
    .from(PublicSchema.teams)
    .where(eq(PublicSchema.teams.id, teamId))
    .limit(1);

  const remainingBudget = result[0]?.faabBudget ?? 0;
  const alreadyCommitted = Number(result[0]?.committedBids ?? 0);

  if (faabBid > remainingBudget - alreadyCommitted) {
    throw new Error(
      `Insufficient FAAB budget. You have $${remainingBudget - alreadyCommitted} available (total: $${remainingBudget}, committed: $${alreadyCommitted}).`,
    );
  }
}

/**
 * After a player is claimed off waivers, this function:
 *   1. Selects a random eligible season and inserts into `league_week_player_seasons`
 *   2. Adds them to `matchup_players` for every current-week matchup involving the team
 *
 * The player is already on the bench (positionId: null) from the roster insertion.
 */
export async function addClaimedPlayerToCurrentMatchup(
  db: PublicDb,
  leagueId: number,
  teamId: number,
  playerId: number,
): Promise<void> {
  // 1. Get the current week to determine the active week
  const leagueRows = await db
    .select({
      currentWeek: PublicSchema.leagues.currentWeek,
      // Keep legacy fallback for leagues not yet migrated
      currentMatchup: PublicSchema.leagues.currentMatchup,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  // Resolve week number: prefer authoritative currentWeek, fall back to
  // fetching from the legacy currentMatchup pointer.
  let weekNumber: number | null | undefined;
  if (leagueRows[0]?.currentWeek != null) {
    weekNumber = leagueRows[0].currentWeek;
  } else {
    const currentMatchupId = leagueRows[0]?.currentMatchup;
    if (!currentMatchupId) {
      LOGGER.info(
        'No active matchup — skipping matchup player setup for waiver claim',
        {
          leagueId,
          playerId,
        },
      );
      return;
    }
    const refMatchup = await db
      .select({ weekNumber: PublicSchema.matchups.weekNumber })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, currentMatchupId))
      .limit(1);
    weekNumber = refMatchup[0]?.weekNumber;
  }

  if (weekNumber == null) {
    LOGGER.info(
      'No active match week — skipping matchup player setup for waiver claim',
      { leagueId, playerId },
    );
    return;
  }

  // Fetch gamesPerMatchup for eligibility threshold from any matchup this week
  const weekMatchupRef = await db
    .select({ gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        eq(PublicSchema.matchups.weekNumber, weekNumber),
      ),
    )
    .limit(1);
  const gamesPerMatchup = weekMatchupRef[0]?.gamesPerMatchup ?? 7;

  // 2. Season selection — pick a random eligible season for this player
  //    Mirrors the logic in game-selection lambda's createMatchupForLeagueWeek
  const existingSeason = await db
    .select({ season: PublicSchema.leagueWeekPlayerSeasons.season })
    .from(PublicSchema.leagueWeekPlayerSeasons)
    .where(
      and(
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
        eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
        eq(PublicSchema.leagueWeekPlayerSeasons.playerId, playerId),
      ),
    )
    .limit(1);

  if (existingSeason.length === 0) {
    // Need to pick a season — query batting & pitching for eligible seasons
    const minGames = gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER;

    const [battingSeasons, pitchingSeasons] = await Promise.all([
      db
        .select({
          season: PublicSchema.seasonBatting.season,
          g: PublicSchema.seasonBatting.g,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            eq(PublicSchema.seasonBatting.playerId, playerId),
            isNotNull(PublicSchema.seasonBatting.g),
            gte(PublicSchema.seasonBatting.season, MIN_SEASON_WITH_GAME_DATA),
          ),
        ),
      db
        .select({
          season: PublicSchema.seasonPitching.season,
          g: PublicSchema.seasonPitching.g,
        })
        .from(PublicSchema.seasonPitching)
        .where(
          and(
            eq(PublicSchema.seasonPitching.playerId, playerId),
            isNotNull(PublicSchema.seasonPitching.g),
            gte(PublicSchema.seasonPitching.season, MIN_SEASON_WITH_GAME_DATA),
          ),
        ),
    ]);

    // Build a map of max games per season
    const seasonGames = new Map<number, number>();
    for (const s of battingSeasons) {
      const g = s.g ?? 0;
      seasonGames.set(s.season, Math.max(seasonGames.get(s.season) ?? 0, g));
    }
    for (const s of pitchingSeasons) {
      const g = s.g ?? 0;
      seasonGames.set(s.season, Math.max(seasonGames.get(s.season) ?? 0, g));
    }

    // Filter to only seasons with enough games
    const eligible = [...seasonGames.entries()]
      .filter(([, games]) => games >= minGames)
      .map(([season]) => season);

    if (eligible.length === 0) {
      LOGGER.warn(
        'No eligible seasons for waiver-claimed player — skipping season selection',
        {
          playerId,
          leagueId,
          weekNumber,
          minGames,
        },
      );
      // Still insert matchup_players below so the player shows up
    } else {
      const selectedSeason =
        eligible[Math.floor(Math.random() * eligible.length)];

      await db
        .insert(PublicSchema.leagueWeekPlayerSeasons)
        .values({
          leagueId,
          weekNumber,
          playerId,
          season: selectedSeason,
        })
        .onConflictDoNothing();

      LOGGER.info('Season selected for waiver-claimed player', {
        playerId,
        leagueId,
        weekNumber,
        season: selectedSeason,
      });
    }
  }

  // 3. Add the player to matchup_players for every matchup this week involving their team
  const weekMatchups = await db
    .select({ id: PublicSchema.matchups.id })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        eq(PublicSchema.matchups.weekNumber, weekNumber),
        or(
          eq(PublicSchema.matchups.team1Id, teamId),
          eq(PublicSchema.matchups.team2Id, teamId),
        ),
      ),
    );

  if (weekMatchups.length > 0) {
    await db
      .insert(PublicSchema.matchupPlayers)
      .values(
        weekMatchups.map((matchup) => ({
          matchupId: matchup.id,
          playerId,
          teamId,
        })),
      )
      .onConflictDoNothing({
        target: [
          PublicSchema.matchupPlayers.matchupId,
          PublicSchema.matchupPlayers.playerId,
          PublicSchema.matchupPlayers.teamId,
        ],
      });

    LOGGER.info('Ensured waiver-claimed player in matchups', {
      matchupIds: weekMatchups.map((m) => m.id),
      playerId,
      teamId,
    });
  }
}
