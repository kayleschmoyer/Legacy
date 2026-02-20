// GraphQL operation types for leagues
export interface CreateLeagueAndTeamsInput {
  leagueName: string;
  numberOfTeams: number;
  playerPool: 'all' | 'nl' | 'al';
  draftMode?: 'live' | 'automated';
  selectionMethod?: 'standard' | 'auction' | 'random';
  draftOrder?: 'snake' | 'linear';
  isPublic?: boolean;
  maxBatters?: number;
  maxPitchers?: number;
  tradingEnabled?: boolean;
  waiverEnabled?: boolean;
  startDate?: string;
}

export interface League {
  id: string;
  name: string;
  owner: number;
  currentMatchup?: number;
  description?: string;
  numberOfTeams?: number;
  playerPool?: string;
  draftMode?: string;
  selectionMethod?: string;
  draftOrder?: string;
  isPublic?: boolean;
  maxBatters?: number;
  maxPitchers?: number;
  tradingEnabled?: boolean;
  waiverEnabled?: boolean;
  startDate?: string;
}

export interface Team {
  id: string;
  name: string;
  leagueId: number;
}

export interface User {
  id: string;
  email?: string;
  username?: string;
}

export interface LeagueMember {
  id: string;
  leagueId: number;
  userId: number;
  isCommissioner?: boolean;
  permissionLevel?: string;
  teamId?: number;
  user?: User;
}

export interface CreateLeagueAndTeamsMutation {
  createLeagueAndTeams: {
    league: League & {
      leagueMembers?: {
        nodes: LeagueMember[];
      };
      teams?: {
        nodes: Team[];
      };
    };
  };
}

export interface CreateLeagueAndTeamsMutationVariables {
  input: CreateLeagueAndTeamsInput;
}
