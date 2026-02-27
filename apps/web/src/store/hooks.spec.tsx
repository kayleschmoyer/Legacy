import React from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAppDispatch, useAppSelector } from './hooks';
import leagueReducer from './leagueSlice';

describe('Redux hooks', () => {
  const createMockStore = (preloadedState = {}) => {
    return configureStore({
      reducer: {
        league: leagueReducer,
      },
      preloadedState,
    });
  };

  describe('useAppSelector', () => {
    it('should select state from the store', () => {
      const store = createMockStore({
        league: {
          leagueId: 123,
          leagueData: { id: 123, name: 'Test League' },
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
        },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(
        () => useAppSelector((state) => state.league.leagueId),
        { wrapper },
      );

      expect(result.current).toBe(123);
    });

    it('should select nested state correctly', () => {
      const store = createMockStore({
        league: {
          leagueId: null,
          leagueData: null,
          positions: [],
          teamMembers: [],
          leagueTeams: [],
          userTeamId: null,
          isCommissioner: false,
          loading: {
            league: true,
            positions: false,
            teamMembers: false,
            teams: false,
          },
        },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(
        () => useAppSelector((state) => state.league.loading.league),
        { wrapper },
      );

      expect(result.current).toBe(true);
    });
  });

  describe('useAppDispatch', () => {
    it('should return dispatch function', () => {
      const store = createMockStore();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(() => useAppDispatch(), { wrapper });

      expect(typeof result.current).toBe('function');
    });
  });
});
