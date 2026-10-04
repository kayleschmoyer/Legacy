/**
 * LS-10440: the /standings shortcut must open the last-visited league (when
 * the user is still a member), else the first league — not always the first.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  LAST_VISITED_LEAGUE_KEY,
  serializeLastVisitedLeague,
} from '@legacy-sports/shared-components/utils';

import {
  leagueStandingsPath,
  pickStandingsLeague,
  StandingsRedirectPage,
} from './StandingsRedirectPage';

let mockQueryResult: {
  data?: { userLeagues: { id: number; sport: string }[] };
  loading: boolean;
  error?: Error;
};

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => mockQueryResult,
}));

const LEAGUES = [
  { id: 1, sport: 'baseball' },
  { id: 2, sport: 'football' },
];

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/standings']}>
      <Routes>
        <Route path="/standings" element={<StandingsRedirectPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

describe('pickStandingsLeague', () => {
  it('prefers the last-visited league when the user is a member', () => {
    expect(pickStandingsLeague(LEAGUES, 2)).toEqual(LEAGUES[1]);
  });

  it('falls back to the first league when last-visited is unknown or stale', () => {
    expect(pickStandingsLeague(LEAGUES, null)).toEqual(LEAGUES[0]);
    expect(pickStandingsLeague(LEAGUES, 999)).toEqual(LEAGUES[0]);
  });

  it('returns null when the user has no leagues', () => {
    expect(pickStandingsLeague([], 2)).toBeNull();
  });
});

describe('leagueStandingsPath', () => {
  it('builds sport-aware standings routes', () => {
    expect(leagueStandingsPath({ id: 1, sport: 'baseball' })).toBe(
      '/baseball/league/1/standings',
    );
    expect(leagueStandingsPath({ id: 2, sport: 'football' })).toBe(
      '/football/league/2/standings',
    );
  });
});

describe('StandingsRedirectPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockQueryResult = { data: { userLeagues: LEAGUES }, loading: false };
  });

  it('redirects to the last-visited league standings', () => {
    localStorage.setItem(
      LAST_VISITED_LEAGUE_KEY,
      serializeLastVisitedLeague({ leagueId: 2, sport: 'football' }),
    );
    renderPage();
    expect(screen.getByTestId('location').textContent).toBe(
      '/football/league/2/standings',
    );
  });

  it('redirects to the first league when nothing was visited', () => {
    renderPage();
    expect(screen.getByTestId('location').textContent).toBe(
      '/baseball/league/1/standings',
    );
  });

  it('shows an error instead of spinning forever when the query fails', () => {
    mockQueryResult = { loading: false, error: new Error('network') };
    renderPage();
    expect(screen.getByText("Couldn't load standings")).toBeTruthy();
    expect(screen.queryByText('Loading standings...')).toBeNull();
  });
});
