import { configureStore } from '@reduxjs/toolkit';
import leagueReducer from './leagueSlice';

export const store = configureStore({
  reducer: {
    league: leagueReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for serializable check
        ignoredActions: ['league/setLeagueData', 'league/setTeamMembers'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
