/**
 * Waivers domain — Helper utilities
 *
 * Contains the addClaimedPlayerToCurrentMatchup function used by
 * processWaiverClaims to set up a newly-claimed player's matchup data.
 */
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { MIN_SEASON_WITH_GAME_DATA } from '@legacy-sports/utils';
import { and, eq, gte, isNotNull, or } from 'drizzle-orm';

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
  // 1. Get the current matchup to determine the active week
  const leagueRows = await db
    .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

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
    .select({
      weekNumber: PublicSchema.matchups.weekNumber,
      gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
    })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, currentMatchupId))
    .limit(1);

  const weekNumber = refMatchup[0]?.weekNumber;
  if (weekNumber == null) return;

  const gamesPerMatchup = refMatchup[0]?.gamesPerMatchup ?? 7;

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
    const minGames = gamesPerMatchup * 2;

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

  for (const matchup of weekMatchups) {
    // Check if already exists (idempotent)
    const existing = await db
      .select({ id: PublicSchema.matchupPlayers.id })
      .from(PublicSchema.matchupPlayers)
      .where(
        and(
          eq(PublicSchema.matchupPlayers.matchupId, matchup.id),
          eq(PublicSchema.matchupPlayers.playerId, playerId),
          eq(PublicSchema.matchupPlayers.teamId, teamId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(PublicSchema.matchupPlayers).values({
        matchupId: matchup.id,
        playerId,
        teamId,
      });

      LOGGER.info('Added waiver-claimed player to matchup', {
        matchupId: matchup.id,
        playerId,
        teamId,
      });
    }
  }
}
