import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../api/db/graphql.generated';

interface LeagueState {
  leagueId: number | null;
  leagueData: {
    id?: number | null;
    name?: string | null;
    owner?: number | null;
    maxRosterSize?: number | null;
    currentMatchup?: number | null;
    draftStatus?: string | null;
    inviteCode?: string | null;
    playerPool?: string | null;
    weekAdvanceStatus?: string | null;
    waiverType?: string | null;
    waiverEnabled?: boolean | null;
    faabBudgetDefault?: number | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    minCareerGames?: number | null;
    minCareerSeasons?: number | null;
    totalMatchups?: number | null;
    playoffEnabled?: boolean | null;
    playoffFormat?: string | null;
    playoffMultiWeek?: boolean | null;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    previousLeagueId?: number | null;
    frozenAt?: string | null;
    seasonNumber?: number | null;
    eraFilter?: string | null;
    hofOnly?: boolean | null;
    customEraStartYear?: number | null;
    customEraEndYear?: number | null;
  } | null;
  positions: LeaguePositionFragment[];
  teamMembers: TeamMemberFragment[];
  leagueTeams: Array<{
    id: number;
    name: string;
    leagueId: number;
    waiverOrder?: number | null;
    faabBudget?: number | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  }>;
  userTeamId: number | null;
  isCommissioner: boolean;
  loading: {
    league: boolean;
    positions: boolean;
    teamMembers: boolean;
    teams: boolean;
  };
}

const initialState: LeagueState = {
  leagueId: null,
  leagueData: null,
  positions: [],
  teamMembers: [],
  leagueTeams: [],
  userTeamId: null,
  isCommissioner: false,
  loading: {
    league: false,
    positions: false,
    teamMembers: false,
    teams: false,
  },
};

const leagueSlice = createSlice({
  name: 'league',
  initialState,
  reducers: {
    // Reset state when selecting a new league
    resetLeagueState: () => initialState,

    // Set the current league ID
    setLeagueId: (state, action: PayloadAction<number>) => {
      if (state.leagueId !== action.payload) {
        // Reset state when changing leagues
        return {
          ...initialState,
          leagueId: action.payload,
        };
      }
    },

    // Set league data
    setLeagueData: (
      state,
      action: PayloadAction<LeagueState['leagueData']>,
    ) => {
      state.leagueData = action.payload;
      state.loading.league = false;
    },

    // Set league positions
    setLeaguePositions: (
      state,
      action: PayloadAction<LeaguePositionFragment[]>,
    ) => {
      state.positions = action.payload;
      state.loading.positions = false;
    },

    // Set team members
    setTeamMembers: (state, action: PayloadAction<TeamMemberFragment[]>) => {
      state.teamMembers = action.payload;
      state.loading.teamMembers = false;
    },

    // Set league teams
    setLeagueTeams: (
      state,
      action: PayloadAction<LeagueState['leagueTeams']>,
    ) => {
      state.leagueTeams = action.payload;
      state.loading.teams = false;
    },

    // Set user team ID
    setUserTeamId: (state, action: PayloadAction<number | null>) => {
      state.userTeamId = action.payload;
    },

    // Set commissioner status
    setIsCommissioner: (state, action: PayloadAction<boolean>) => {
      state.isCommissioner = action.payload;
    },

    // Loading states
    setLeagueLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.league = action.payload;
    },
    setPositionsLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.positions = action.payload;
    },
    setTeamMembersLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.teamMembers = action.payload;
    },
    setTeamsLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.teams = action.payload;
    },

    // Update a single team member (for roster management)
    updateTeamMember: (state, action: PayloadAction<TeamMemberFragment>) => {
      const index = state.teamMembers.findIndex(
        (member) => member.id === action.payload.id,
      );
      if (index !== -1) {
        state.teamMembers[index] = action.payload;
      }
    },
  },
});

export const {
  resetLeagueState,
  setLeagueId,
  setLeagueData,
  setLeaguePositions,
  setTeamMembers,
  setLeagueTeams,
  setUserTeamId,
  setIsCommissioner,
  setLeagueLoading,
  setPositionsLoading,
  setTeamMembersLoading,
  setTeamsLoading,
  updateTeamMember,
} = leagueSlice.actions;

export default leagueSlice.reducer;
