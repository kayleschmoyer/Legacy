/**
 * LS-10511: My Leagues rows take their sport label and link from
 * `league.sport`, not from `playerPool` (football leagues use pool `all`).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MyLeaguesDropdown } from './MyLeaguesDropdown';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => ({
    loading: false,
    data: {
      userLeagues: [
        {
          id: 1,
          name: 'Baseball League',
          sport: 'baseball',
          playerPool: 'all',
          leaguePhase: 'active',
        },
        {
          id: 2,
          name: 'NFL League',
          sport: 'football',
          playerPool: 'all',
          leaguePhase: 'active',
        },
      ],
    },
  }),
}));

describe('MyLeaguesDropdown — LS-10511 uses league.sport', () => {
  const openMenu = (path = '/') => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <MyLeaguesDropdown />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('My Leagues'));
  };

  it('links each league to its own sport route', () => {
    openMenu();
    expect(screen.getByText('Baseball League').closest('a')).toHaveAttribute(
      'href',
      '/baseball/league/1',
    );
    expect(screen.getByText('NFL League').closest('a')).toHaveAttribute(
      'href',
      '/football/league/2',
    );
  });

  it('labels each league with its real sport', () => {
    openMenu();
    expect(screen.getByText(/^Baseball · /)).toBeTruthy();
    expect(screen.getByText(/^Football · /)).toBeTruthy();
  });

  it('marks a football league active on a /football/ route', () => {
    openMenu('/football/league/2');
    expect(
      screen.getByText('NFL League').closest('a')?.firstElementChild,
    ).toHaveAttribute('aria-current', 'page');
  });
});
