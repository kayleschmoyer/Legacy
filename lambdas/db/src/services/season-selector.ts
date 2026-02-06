import { LOGGER } from '@legacy-sports/logging';

export interface PlayerSeasonStats {
  playerId: number;
  season: number;
  g: number | null;
}

export interface SeasonSelection {
  leagueId: number;
  weekNumber: number;
  playerId: number;
  season: number;
}

export interface SeasonSelectionResult {
  selections: SeasonSelection[];
  skippedPlayers: Array<{
    playerId: number;
    reason: string;
    battingSeasons: string[];
    pitchingSeasons: string[];
  }>;
}

/**
 * Select random seasons for players based on their available batting, pitching, and fielding stats.
 * A player qualifies for a season if they have at least minGames in ANY of: batting, pitching, or fielding.
 *
 * @param playerIds - List of player IDs to assign seasons to
 * @param battingStats - All batting season stats for the players
 * @param pitchingStats - All pitching season stats for the players
 * @param fieldingStats - All fielding season stats for the players
 * @param minGames - Minimum games required in a season (batting, pitching, OR fielding)
 * @param leagueId - League ID for the selections
 * @param weekNumber - Week number for the selections
 * @returns Object containing season selections and skipped players with reasons
 */
export function selectSeasonsForPlayers(
  playerIds: number[],
  battingStats: PlayerSeasonStats[],
  pitchingStats: PlayerSeasonStats[],
  fieldingStats: PlayerSeasonStats[],
  minGames: number,
  leagueId: number,
  weekNumber: number,
): SeasonSelectionResult {
  LOGGER.info('Starting season selection', {
    playerCount: playerIds.length,
    battingSeasonCount: battingStats.length,
    pitchingSeasonCount: pitchingStats.length,
    fieldingSeasonCount: fieldingStats.length,
    minGames,
  });

  // Track max games per player-season (batting, pitching, OR fielding - whichever is highest)
  const playerSeasonGames = new Map<string, number>(); // key: "playerId-season"

  // Process batting stats
  battingStats.forEach((seasonStat) => {
    const key = `${seasonStat.playerId}-${seasonStat.season}`;
    const games = seasonStat.g ?? 0;
    const currentMax = playerSeasonGames.get(key) ?? 0;
    playerSeasonGames.set(key, Math.max(currentMax, games));
  });

  // Process pitching stats - this will update the same key if the player has both
  pitchingStats.forEach((seasonStat) => {
    const key = `${seasonStat.playerId}-${seasonStat.season}`;
    const games = seasonStat.g ?? 0;
    const currentMax = playerSeasonGames.get(key) ?? 0;
    playerSeasonGames.set(key, Math.max(currentMax, games));
  });

  // Process fielding stats - aggregate all positions for the same player-season
  const fieldingGamesByPlayerSeason = new Map<string, number>();
  fieldingStats.forEach((seasonStat) => {
    const key = `${seasonStat.playerId}-${seasonStat.season}`;
    const games = seasonStat.g ?? 0;
    const currentTotal = fieldingGamesByPlayerSeason.get(key) ?? 0;
    fieldingGamesByPlayerSeason.set(key, currentTotal + games);
  });

  // Add fielding totals to player-season games
  fieldingGamesByPlayerSeason.forEach((games, key) => {
    const currentMax = playerSeasonGames.get(key) ?? 0;
    playerSeasonGames.set(key, Math.max(currentMax, games));
  });

  LOGGER.debug('Player-season game counts calculated', {
    uniquePlayerSeasons: playerSeasonGames.size,
  });

  // Group seasons by player ID, filtering to only those with enough games
  const seasonsByPlayer = new Map<number, number[]>();

  playerSeasonGames.forEach((games, key) => {
    if (games >= minGames) {
      const [playerIdStr, seasonStr] = key.split('-');
      const playerId = parseInt(playerIdStr, 10);
      const season = parseInt(seasonStr, 10);

      if (!seasonsByPlayer.has(playerId)) {
        seasonsByPlayer.set(playerId, []);
      }
      const seasons = seasonsByPlayer.get(playerId);
      if (seasons && !seasons.includes(season)) {
        seasons.push(season);
      }
    }
  });

  LOGGER.info('Eligible seasons by player', {
    playersWithSeasons: seasonsByPlayer.size,
    playersWithoutSeasons: playerIds.length - seasonsByPlayer.size,
  });

  // Assign random season to each player
  const selections: SeasonSelection[] = [];
  const skippedPlayers: SeasonSelectionResult['skippedPlayers'] = [];

  for (const playerId of playerIds) {
    const availableSeasons = seasonsByPlayer.get(playerId) || [];

    if (availableSeasons.length === 0) {
      // Log detailed info about why no seasons were found
      const playerBattingSeasons = battingStats
        .filter((s) => s.playerId === playerId)
        .map((s) => `${s.season}(${s.g}g)`);
      const playerPitchingSeasons = pitchingStats
        .filter((s) => s.playerId === playerId)
        .map((s) => `${s.season}(${s.g}g)`);

      // For fielding, aggregate by season
      const fieldingBySeasonMap = new Map<number, number>();
      fieldingStats
        .filter((s) => s.playerId === playerId)
        .forEach((s) => {
          const games = s.g ?? 0;
          fieldingBySeasonMap.set(
            s.season,
            (fieldingBySeasonMap.get(s.season) ?? 0) + games,
          );
        });
      const playerFieldingSeasons = Array.from(
        fieldingBySeasonMap.entries(),
      ).map(([season, games]) => `${season}(${games}g)`);

      const reason = `No seasons with at least ${minGames} games`;

      skippedPlayers.push({
        playerId,
        reason,
        battingSeasons: playerBattingSeasons,
        pitchingSeasons: playerPitchingSeasons,
      });

      LOGGER.warn(`No eligible seasons for player ${playerId}`, {
        minGamesRequired: minGames,
        battingSeasons: playerBattingSeasons,
        pitchingSeasons: playerPitchingSeasons,
        fieldingSeasons: playerFieldingSeasons,
      });
      continue;
    }

    // Randomly select a season
    const seasonIdx = Math.floor(Math.random() * availableSeasons.length);
    const selectedSeason = availableSeasons[seasonIdx];

    selections.push({
      leagueId,
      weekNumber,
      playerId,
      season: selectedSeason,
    });

    LOGGER.debug(`Selected season ${selectedSeason} for player ${playerId}`, {
      availableSeasons,
    });
  }

  LOGGER.info('Season selection completed', {
    selectionsCreated: selections.length,
    playersSkipped: skippedPlayers.length,
  });

  return {
    selections,
    skippedPlayers,
  };
}
