/**
 * Regression guard for LS-10440: the drawer listed a "Trophy Case" item that
 * routed to Profile Settings (no trophy feature exists), and the Standings
 * shortcut ignored the league the user was currently viewing.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MobileNavDrawer } from './MobileNavDrawer';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, logout: jest.fn() }),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => ({
    data: { userLeagues: [{ id: 1, name: 'First League', sport: 'baseball' }] },
  }),
}));

const renderDrawer = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNavDrawer isOpen onClose={jest.fn()} />
    </MemoryRouter>,
  );

describe('MobileNavDrawer — LS-10440', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('does not render a Trophy Case item', () => {
    renderDrawer('/');
    expect(screen.queryByRole('button', { name: /Trophy Case/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Standings/ })).toBeTruthy();
  });

  it('opens the current baseball league standings from a league route', () => {
    renderDrawer('/baseball/league/8514/matchups');
    fireEvent.click(screen.getByRole('button', { name: /Standings/ }));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/baseball/league/8514/standings',
    );
  });

  it('opens the current football league standings from a league route', () => {
    renderDrawer('/football/league/42');
    fireEvent.click(screen.getByRole('button', { name: /Standings/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/football/league/42/standings');
  });

  it('falls back to the /standings redirect outside a league', () => {
    renderDrawer('/players');
    fireEvent.click(screen.getByRole('button', { name: /Standings/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/standings');
  });
});
