/**
 * Tests for FootballPlayerDetail (LS-7805) — the cross-platform NFL player
 * detail view shared by web and mobile.
 */
import React from 'react';
import {
  FootballPlayerDetail,
  type FootballPlayerDetailPlayer,
} from './FootballPlayerDetail';
import { fireEvent, render, screen } from '../../test-utils';

const QB_PLAYER: FootballPlayerDetailPlayer = {
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  careerStats: {
    passing: { yds: 5000, td: 37, int: 14, rating: 105.2 },
  },
};

const DST_PLAYER: FootballPlayerDetailPlayer = {
  id: 2,
  firstName: 'Kansas City',
  lastName: 'Chiefs',
  position: 'DST',
  isDst: true,
  nflTeam: 'KC',
  careerStats: {
    defense: { sacks: 45.5, int: 18, ptsAllowedPerG: 19.3 },
  },
};

const LB_PLAYER: FootballPlayerDetailPlayer = {
  id: 3,
  firstName: 'Micah',
  lastName: 'Parsons',
  position: 'LB',
  isDst: false,
  nflTeam: 'DAL',
  careerStats: {
    idp: { soloTkl: 48, astTkl: 12, sacks: 13.0, int: 1, ff: 4 },
  },
};

describe('FootballPlayerDetail', () => {
  it('renders the player name, position badge, and team', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    expect(screen.getByText('QB')).toBeTruthy();
    expect(screen.getByText(/Kansas City/)).toBeTruthy();
  });

  it('renders position-specific passing stats for a QB', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.getByText('Career Passing')).toBeTruthy();
    expect(screen.getByText('5,000')).toBeTruthy();
    expect(screen.getByText('RTG')).toBeTruthy();
    expect(screen.getByText('105.2')).toBeTruthy();
  });

  it('renders DST stats for a defense', () => {
    render(<FootballPlayerDetail player={DST_PLAYER} />);
    expect(screen.getByText('Career DST Stats')).toBeTruthy();
    expect(screen.getByText('Pts Allowed/G')).toBeTruthy();
  });

  it('renders IDP stats including assisted tackles for a linebacker', () => {
    render(<FootballPlayerDetail player={LB_PLAYER} />);
    expect(screen.getByText('Career IDP Stats')).toBeTruthy();
    expect(screen.getByText('Ast')).toBeTruthy();
    expect(screen.getByText('48')).toBeTruthy();
  });

  it('shows "No stats available" when careerStats is null', () => {
    render(
      <FootballPlayerDetail player={{ ...QB_PLAYER, careerStats: null }} />,
    );
    expect(screen.getByText('No stats available')).toBeTruthy();
  });

  it('shows an error message when error is true', () => {
    render(<FootballPlayerDetail player={null} error />);
    expect(
      screen.getByText('Failed to load player. Please try again.'),
    ).toBeTruthy();
  });

  it('renders the back affordance and fires onBack when pressed', () => {
    const onBack = jest.fn();
    render(<FootballPlayerDetail player={QB_PLAYER} onBack={onBack} />);
    fireEvent.click(screen.getByText('Back to Players'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back affordance when onBack is not provided', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.queryByText('Back to Players')).toBeNull();
  });
});
