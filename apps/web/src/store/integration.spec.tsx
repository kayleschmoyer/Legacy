import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import leagueReducer, {
  resetLeagueState,
  setIsCommissioner,
  setLeagueData,
  setLeagueId,
  setLeaguePositions,
  setTeamMembers,
  setUserTeamId,
} from './leagueSlice';
import { useAppDispatch, useAppSelector } from './hooks';
import type {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../api/db/graphql.generated';

// Test component that uses Redux
function TestComponent() {
  const dispatch = useAppDispatch();
  const { leagueId, leagueData, positions } = useAppSelector(
    (state) => state.league,
  );

  const handleSetLeague = () => {
    dispatch(setLeagueId(123));
    dispatch(setLeagueData({ id: 123, name: 'Test League' }));
  };

  const handleSetPositions = () => {
    dispatch(
      setLeaguePositions([
        { id: 1, positionType: 'C' },
        { id: 2, positionType: '1B' },
      ] as LeaguePositionFragment[]),
    );
  };

  const handleChangeLeague = () => {
    dispatch(setLeagueId(456));
  };

  return (
    <div>
      <div data-testid="league-id">{leagueId ?? 'none'}</div>
      <div data-testid="league-name">{leagueData?.name ?? 'none'}</div>
      <div data-testid="positions-count">{positions.length}</div>
      <button onClick={handleSetLeague}>Set League</button>
      <button onClick={handleSetPositions}>Set Positions</button>
      <button onClick={handleChangeLeague}>Change League</button>
    </div>
  );
}

describe('Redux integration tests', () => {
  const createTestStore = () => {
    return configureStore({
      reducer: {
        league: leagueReducer,
      },
    });
  };

  it('should update state when actions are dispatched', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>,
    );

    // Initial state
    expect(screen.getByTestId('league-id')).toHaveTextContent('none');
    expect(screen.getByTestId('league-name')).toHaveTextContent('none');
    expect(screen.getByTestId('positions-count')).toHaveTextContent('0');

    // Set league
    const setLeagueButton = screen.getByText('Set League');
    setLeagueButton.click();

    await waitFor(() => {
      expect(screen.getByTestId('league-id')).toHaveTextContent('123');
      expect(screen.getByTestId('league-name')).toHaveTextContent(
        'Test League',
      );
    });

    // Set positions
    const setPositionsButton = screen.getByText('Set Positions');
    setPositionsButton.click();

    await waitFor(() => {
      expect(screen.getByTestId('positions-count')).toHaveTextContent('2');
    });
  });

  it('should clear state when league ID changes', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <TestComponent />
      </Provider>,
    );

    // Set initial league and positions
    screen.getByText('Set League').click();
    screen.getByText('Set Positions').click();

    await waitFor(() => {
      expect(screen.getByTestId('league-id')).toHaveTextContent('123');
      expect(screen.getByTestId('positions-count')).toHaveTextContent('2');
    });

    // Change league
    screen.getByText('Change League').click();

    await waitFor(() => {
      expect(screen.getByTestId('league-id')).toHaveTextContent('456');
      // State should be reset
      expect(screen.getByTestId('league-name')).toHaveTextContent('none');
      expect(screen.getByTestId('positions-count')).toHaveTextContent('0');
    });
  });

  it('should clear user-specific data when resetLeagueState is dispatched (user logout scenario)', () => {
    // Simulates: User A logs in, views league 123 as commissioner, then logs out.
    // On logout, onLogout dispatches resetLeagueState() so User B never sees stale data.
    const store = createTestStore();

    // Populate User A's state (commissioner of league 123)
    store.dispatch(setLeagueId(123));
    store.dispatch(setLeagueData({ id: 123, name: 'User A League' }));
    store.dispatch(
      setLeaguePositions([
        { id: 1, positionType: 'C' },
      ] as LeaguePositionFragment[]),
    );
    store.dispatch(
      setTeamMembers([{ id: 1, playerId: 100 }] as TeamMemberFragment[]),
    );
    store.dispatch(setUserTeamId(456));
    store.dispatch(setIsCommissioner(true));

    // Simulate logout: onLogout dispatches resetLeagueState()
    store.dispatch(resetLeagueState());

    const state = store.getState().league;
    expect(state.leagueId).toBeNull();
    expect(state.leagueData).toBeNull();
    expect(state.positions).toEqual([]);
    expect(state.teamMembers).toEqual([]);
    expect(state.userTeamId).toBeNull();
    expect(state.isCommissioner).toBe(false);
  });

  it('should not inherit stale league data when same league is visited after user switch', () => {
    // When User A (commissioner of 123) logs out and User B opens league 123,
    // setLeagueId(123) would NOT reset state because the ID hasn't changed.
    // The fix (resetLeagueState on logout) ensures the state is already clear.
    const store = createTestStore();

    // User A's session
    store.dispatch(setLeagueId(123));
    store.dispatch(setIsCommissioner(true));
    store.dispatch(setUserTeamId(456));

    // Logout resets the league slice
    store.dispatch(resetLeagueState());

    // User B visits the same league
    store.dispatch(setLeagueId(123));

    const state = store.getState().league;
    expect(state.isCommissioner).toBe(false);
    expect(state.userTeamId).toBeNull();
  });

  it('should maintain state across component re-renders', async () => {
    const store = createTestStore();

    const { rerender } = render(
      <Provider store={store}>
        <TestComponent />
      </Provider>,
    );

    // Set league
    screen.getByText('Set League').click();

    await waitFor(() => {
      expect(screen.getByTestId('league-id')).toHaveTextContent('123');
    });

    // Re-render component
    rerender(
      <Provider store={store}>
        <TestComponent />
      </Provider>,
    );

    // State should persist
    expect(screen.getByTestId('league-id')).toHaveTextContent('123');
    expect(screen.getByTestId('league-name')).toHaveTextContent('Test League');
  });
});
