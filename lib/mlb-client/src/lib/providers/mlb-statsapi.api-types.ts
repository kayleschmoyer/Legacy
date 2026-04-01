/**
 * Raw response shapes from statsapi.mlb.com.
 * All fields optional — the API may omit fields for in-progress games.
 */

export interface MlbApiLinescoreTeam {
  runs?: number;
  hits?: number;
  errors?: number;
  innings?: Array<{ runs?: number }>;
}

export interface MlbApiLinescore {
  currentInning?: number;
  inningHalf?: string;
  outs?: number;
  balls?: number;
  strikes?: number;
  teams?: {
    home?: MlbApiLinescoreTeam;
    away?: MlbApiLinescoreTeam;
  };
}

export interface MlbApiTeamRef {
  id?: number;
  name?: string;
  abbreviation?: string;
}

export interface MlbApiScheduleGame {
  gamePk?: number;
  gameDate?: string;
  status?: { detailedState?: string };
  teams?: {
    home?: { team?: MlbApiTeamRef };
    away?: { team?: MlbApiTeamRef };
  };
  venue?: { name?: string };
  linescore?: MlbApiLinescore;
}

export interface MlbApiScheduleResponse {
  dates?: Array<{
    games?: MlbApiScheduleGame[];
  }>;
}

export interface MlbApiGameFeedResponse {
  liveData?: {
    linescore?: MlbApiLinescore;
  };
  gameData?: {
    status?: { detailedState?: string };
    teams?: {
      home?: MlbApiTeamRef;
      away?: MlbApiTeamRef;
    };
    venue?: { name?: string };
  };
}

export interface MlbApiStatLine {
  gamesPlayed?: number;
  atBats?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  stolenBases?: number;
  strikeOuts?: number;
  baseOnBalls?: number;
  avg?: string;
  obp?: string;
  slg?: string;
  ops?: string;
  wins?: number;
  losses?: number;
  saves?: number;
  era?: string;
  inningsPitched?: string;
  earnedRuns?: number;
  whip?: string;
  putOuts?: number;
  assists?: number;
  errors?: number;
  fielding?: string;
}

export interface MlbApiPlayerStatsResponse {
  stats?: Array<{
    group?: { displayName?: string };
    splits?: Array<{
      stat?: MlbApiStatLine;
      game?: { gamePk?: number };
    }>;
  }>;
}

export interface MlbApiStandingsResponse {
  records?: Array<{
    division?: { id?: number; name?: string };
    teamRecords?: Array<{
      team?: { id?: number; name?: string };
      wins?: number;
      losses?: number;
      winningPercentage?: string;
      gamesBack?: string;
      divisionRank?: string;
      leagueRank?: string;
    }>;
  }>;
}

export interface MlbApiTeamsResponse {
  teams?: Array<{
    id?: number;
    name?: string;
    abbreviation?: string;
    locationName?: string;
    division?: { id?: number };
    league?: { id?: number };
  }>;
}
