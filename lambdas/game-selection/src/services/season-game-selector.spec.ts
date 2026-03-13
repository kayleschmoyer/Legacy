describe('season-game-selector', () => {
  describe('selectGamesForMatchupPlayer', () => {
    it.skip('should select random games for a player in a specific season', async () => {
      // Assert: returns array of randomly selected game IDs for the player/season
      // - Mock player season stats with available games
      // - Call selectGamesForMatchupPlayer
      // - Expect returned games count === gamesPerMatchup
    });

    it.skip('should not select pitching game for non-first game numbers', async () => {
      // Assert: pitching games only appear in game slot 1
      // - Mock player with pitching-only games
      // - Call selectGamesForMatchupPlayer
      // - Expect no pitching games selected for game numbers > 1
    });

    it.skip('should handle players with no fielding stats', async () => {
      // Assert: player without fielding stats still gets games selected
      // - Mock player with batting stats only
      // - Call selectGamesForMatchupPlayer
      // - Expect games selected from batting stats pool
    });
  });

  describe('selectGamesForMatchup', () => {
    it.skip('should throw error if matchup not found', async () => {
      // Assert: throws when matchup ID doesn't exist
      // - Call selectGamesForMatchup with invalid matchupId
      // - Expect error thrown with descriptive message
    });

    it.skip('should throw error if matchup has no selected_season', async () => {
      // Assert: throws when matchup.selected_season is null
      // - Create matchup without selected_season
      // - Call selectGamesForMatchup
      // - Expect error about missing season
    });

    it.skip('should use matchup selected_season for all players', async () => {
      // Assert: all player game selections use the matchup's selected_season
      // - Create matchup with selected_season = 2023
      // - Call selectGamesForMatchup
      // - Verify all selected games are from season 2023
    });

    it.skip('should skip players with already selected games', async () => {
      // Assert: players who already have games selected are not re-processed
      // - Create matchup with one player already having games
      // - Call selectGamesForMatchup
      // - Expect only unselected players get new games
    });
  });
});
