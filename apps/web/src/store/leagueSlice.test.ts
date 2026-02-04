import leagueReducer, {
  resetLeagueState,
  setIsCommissioner,
  setLeagueData,
  setLeagueId,
  setLeagueLoading,
  setLeaguePositions,
  setLeagueTeams,
  setPositionsLoading,
  setTeamMembers,
  setTeamMembersLoading,
  setTeamsLoading,
  setUserTeamId,
  updateTeamMember,
} from './leagueSlice';
import type {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../api/db/graphql.generated';

describe('leagueSlice', () => {
  const initialState = {
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

  it('should return the initial state', () => {
    expect(leagueReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  describe('resetLeagueState', () => {
    it('should reset to initial state', () => {
      const currentState = {
        ...initialState,
        leagueId: 123,
        leagueData: { id: 123, name: 'Test League' },
        positions: [{ id: 1 } as LeaguePositionFragment],
      };

      const actual = leagueReducer(currentState, resetLeagueState());
      expect(actual).toEqual(initialState);
    });
  });

  describe('setLeagueId', () => {
    it('should set league ID and reset state when ID changes', () => {
      const currentState = {
        ...initialState,
        leagueId: 123,
        leagueData: { id: 123, name: 'Old League' },
        positions: [{ id: 1 } as LeaguePositionFragment],
      };

      const actual = leagueReducer(currentState, setLeagueId(456));
      expect(actual.leagueId).toBe(456);
      expect(actual.leagueData).toBeNull();
      expect(actual.positions).toEqual([]);
    });

    it('should not reset state when setting same ID', () => {
      const currentState = {
        ...initialState,
        leagueId: 123,
        leagueData: { id: 123, name: 'Test League' },
        positions: [{ id: 1 } as LeaguePositionFragment],
      };

      const actual = leagueReducer(currentState, setLeagueId(123));
      // State should remain the same
      expect(actual).toEqual(currentState);
    });
  });

  describe('setLeagueData', () => {
    it('should set league data and clear loading', () => {
      const leagueData = {
        id: 123,
        name: 'Test League',
        owner: 456,
        maxRosterSize: 25,
      };

      const currentState = {
        ...initialState,
        loading: { ...initialState.loading, league: true },
      };

      const actual = leagueReducer(currentState, setLeagueData(leagueData));
      expect(actual.leagueData).toEqual(leagueData);
      expect(actual.loading.league).toBe(false);
    });
  });

  describe('setLeaguePositions', () => {
    it('should set positions and clear loading', () => {
      const positions = [
        { id: 1, position: 'C' },
        { id: 2, position: '1B' },
      ] as LeaguePositionFragment[];

      const currentState = {
        ...initialState,
        loading: { ...initialState.loading, positions: true },
      };

      const actual = leagueReducer(currentState, setLeaguePositions(positions));
      expect(actual.positions).toEqual(positions);
      expect(actual.loading.positions).toBe(false);
    });
  });

  describe('setTeamMembers', () => {
    it('should set team members and clear loading', () => {
      const teamMembers = [
        { id: 1, playerId: 100 },
        { id: 2, playerId: 101 },
      ] as TeamMemberFragment[];

      const currentState = {
        ...initialState,
        loading: { ...initialState.loading, teamMembers: true },
      };

      const actual = leagueReducer(currentState, setTeamMembers(teamMembers));
      expect(actual.teamMembers).toEqual(teamMembers);
      expect(actual.loading.teamMembers).toBe(false);
    });
  });

  describe('setLeagueTeams', () => {
    it('should set league teams and clear loading', () => {
      const teams = [
        { id: 1, name: 'Team A', leagueId: 123 },
        { id: 2, name: 'Team B', leagueId: 123 },
      ];

      const currentState = {
        ...initialState,
        loading: { ...initialState.loading, teams: true },
      };

      const actual = leagueReducer(currentState, setLeagueTeams(teams));
      expect(actual.leagueTeams).toEqual(teams);
      expect(actual.loading.teams).toBe(false);
    });
  });

  describe('setUserTeamId', () => {
    it('should set user team ID', () => {
      const actual = leagueReducer(initialState, setUserTeamId(789));
      expect(actual.userTeamId).toBe(789);
    });

    it('should set user team ID to null', () => {
      const currentState = { ...initialState, userTeamId: 789 };
      const actual = leagueReducer(currentState, setUserTeamId(null));
      expect(actual.userTeamId).toBeNull();
    });
  });

  describe('setIsCommissioner', () => {
    it('should set commissioner status to true', () => {
      const actual = leagueReducer(initialState, setIsCommissioner(true));
      expect(actual.isCommissioner).toBe(true);
    });

    it('should set commissioner status to false', () => {
      const currentState = { ...initialState, isCommissioner: true };
      const actual = leagueReducer(currentState, setIsCommissioner(false));
      expect(actual.isCommissioner).toBe(false);
    });
  });

  describe('loading states', () => {
    it('should set league loading', () => {
      const actual = leagueReducer(initialState, setLeagueLoading(true));
      expect(actual.loading.league).toBe(true);
    });

    it('should set positions loading', () => {
      const actual = leagueReducer(initialState, setPositionsLoading(true));
      expect(actual.loading.positions).toBe(true);
    });

    it('should set team members loading', () => {
      const actual = leagueReducer(initialState, setTeamMembersLoading(true));
      expect(actual.loading.teamMembers).toBe(true);
    });

    it('should set teams loading', () => {
      const actual = leagueReducer(initialState, setTeamsLoading(true));
      expect(actual.loading.teams).toBe(true);
    });
  });

  describe('updateTeamMember', () => {
    it('should update existing team member', () => {
      const teamMembers = [
        { id: 1, playerId: 100, positionId: 1 },
        { id: 2, playerId: 101, positionId: 2 },
      ] as TeamMemberFragment[];

      const currentState = {
        ...initialState,
        teamMembers,
      };

      const updatedMember = {
        id: 1,
        playerId: 100,
        positionId: 3,
      } as TeamMemberFragment;

      const actual = leagueReducer(
        currentState,
        updateTeamMember(updatedMember),
      );
      expect(actual.teamMembers[0]).toEqual(updatedMember);
      expect(actual.teamMembers[1]).toEqual(teamMembers[1]);
    });

    it('should not modify state if team member not found', () => {
      const teamMembers = [
        { id: 1, playerId: 100 },
        { id: 2, playerId: 101 },
      ] as TeamMemberFragment[];

      const currentState = {
        ...initialState,
        teamMembers,
      };

      const updatedMember = {
        id: 999,
        playerId: 100,
      } as TeamMemberFragment;

      const actual = leagueReducer(
        currentState,
        updateTeamMember(updatedMember),
      );
      expect(actual.teamMembers).toEqual(teamMembers);
    });
  });

  describe('complex state transitions', () => {
    it('should handle multiple state updates in sequence', () => {
      let state = initialState;

      // Set league ID
      state = leagueReducer(state, setLeagueId(123));
      expect(state.leagueId).toBe(123);

      // Set league data
      const leagueData = { id: 123, name: 'Test League' };
      state = leagueReducer(state, setLeagueData(leagueData));
      expect(state.leagueData).toEqual(leagueData);

      // Set positions
      const positions = [{ id: 1, position: 'C' }] as LeaguePositionFragment[];
      state = leagueReducer(state, setLeaguePositions(positions));
      expect(state.positions).toEqual(positions);

      // Set commissioner status
      state = leagueReducer(state, setIsCommissioner(true));
      expect(state.isCommissioner).toBe(true);

      // Verify all data persists
      expect(state.leagueId).toBe(123);
      expect(state.leagueData).toEqual(leagueData);
      expect(state.positions).toEqual(positions);
      expect(state.isCommissioner).toBe(true);
    });

    it('should clear all data when league ID changes', () => {
      let state = initialState;

      // Set up complete state
      state = leagueReducer(state, setLeagueId(123));
      state = leagueReducer(
        state,
        setLeagueData({ id: 123, name: 'League 1' }),
      );
      state = leagueReducer(
        state,
        setLeaguePositions([{ id: 1 } as LeaguePositionFragment]),
      );
      state = leagueReducer(
        state,
        setTeamMembers([{ id: 1 } as TeamMemberFragment]),
      );
      state = leagueReducer(state, setUserTeamId(456));
      state = leagueReducer(state, setIsCommissioner(true));

      // Change league ID
      state = leagueReducer(state, setLeagueId(789));

      // Verify only new league ID remains
      expect(state.leagueId).toBe(789);
      expect(state.leagueData).toBeNull();
      expect(state.positions).toEqual([]);
      expect(state.teamMembers).toEqual([]);
      expect(state.leagueTeams).toEqual([]);
      expect(state.userTeamId).toBeNull();
      expect(state.isCommissioner).toBe(false);
    });
  });
});
