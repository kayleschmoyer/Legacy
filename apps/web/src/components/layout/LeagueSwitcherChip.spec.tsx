/**
 * Regression guard for LS-9127: clicking "Create a new league" in the header
 * League Switcher while the "Football" sport tab is selected sent the user to
 * the baseball league-creation page instead of football's, because the
 * create-league button hardcoded `/baseball/league/create` regardless of the
 * dropdown's selected sport.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { LeagueSwitcherChip } from './LeagueSwitcherChip';

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
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockLeaguesFixture = [
  { id: 1, name: 'Baseball League', playerPool: 'baseball' },
  { id: 2, name: 'Football League', playerPool: 'football' },
];

let mockUserLeagues: unknown[] = [];

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => ({ data: { userLeagues: mockUserLeagues } }),
}));

const renderChip = () =>
  render(
    <MemoryRouter>
      <LeagueSwitcherChip />
    </MemoryRouter>,
  );

describe('LeagueSwitcherChip — LS-9127 create-league sport routing', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUserLeagues = [];
  });

  it('navigates to the baseball create-league route by default', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Create a new league'));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/create');
  });

  it('navigates to the football create-league route after selecting the Football tab', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Football'));
    fireEvent.click(screen.getByText('Create a new league'));
    expect(mockNavigate).toHaveBeenCalledWith('/football/league/create');
  });
});

describe('LeagueSwitcherChip — LS-9127 existing-league and find-a-league sport routing', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUserLeagues = mockLeaguesFixture;
  });

  it('navigates to the selected football league when the Football tab is active', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Football'));
    fireEvent.click(screen.getByRole('option', { name: /Football League/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/football/league/2');
  });

  it('navigates to the selected baseball league when the Baseball tab is active', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByRole('option', { name: /Baseball League/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/1');
  });

  it('routes "Browse public leagues" and "Join with invite code" using the selected sport', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Football'));
    fireEvent.click(screen.getByText('Browse public leagues'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/football/leagues');

    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Join with invite code'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/football/league/join');
  });
});
