import { gql } from '@apollo/client';

// Query to fetch ALL season stats for a player (batting, pitching, fielding) across all seasons
export const GET_ALL_PLAYER_SEASON_STATS = gql`
  query GetAllPlayerSeasonStats($playerId: Int!) {
    playerSeasonBatting(playerId: $playerId) {
      season
      team
      games
      plateAppearances
      atBats
      runs
      hits
      doubles
      triples
      homeRuns
      rbi
      stolenBases
      caughtStealing
      baseOnBalls
      strikeouts
      battingAverage
      onBasePercentage
      sluggingPercentage
    }
    playerSeasonPitching(playerId: $playerId) {
      season
      team
      games
      wins
      losses
      gamesStarted
      completeGames
      shutouts
      saves
      inningsPitched
      hits
      runs
      earnedRuns
      homeRuns
      baseOnBalls
      strikeouts
      earnedRunAverage
      whip
    }
    playerSeasonFielding(playerId: $playerId) {
      season
      team
      position
      games
      gamesStarted
      inningsDefended
      putouts
      assists
      errors
      doublePlays
      fieldingPercentage
    }
  }
`;
