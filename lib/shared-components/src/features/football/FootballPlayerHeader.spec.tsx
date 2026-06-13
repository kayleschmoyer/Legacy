import React from 'react';
import {
  FootballPlayerHeader,
  type FootballPlayerHeaderPlayer,
} from './FootballPlayerHeader';
import { render, screen } from '../../test-utils';

const QB_PLAYER: FootballPlayerHeaderPlayer = {
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoP00',
};

const DST_PLAYER: FootballPlayerHeaderPlayer = {
  id: 2,
  firstName: 'Kansas City',
  lastName: 'Chiefs',
  position: 'DST',
  isDst: true,
  nflTeam: 'KC',
  pfrId: null,
};

const FREE_AGENT: FootballPlayerHeaderPlayer = {
  id: 3,
  firstName: 'John',
  lastName: 'Doe',
  position: 'WR',
  isDst: false,
  nflTeam: null,
  pfrId: null,
};

const LB_PLAYER: FootballPlayerHeaderPlayer = {
  id: 4,
  firstName: 'Micah',
  lastName: 'Parsons',
  position: 'LB',
  isDst: false,
  nflTeam: 'DAL',
  pfrId: 'ParsM00',
};

describe('FootballPlayerHeader', () => {
  it('renders the player name', () => {
    render(<FootballPlayerHeader player={QB_PLAYER} />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
  });

  it('renders the position badge for a QB', () => {
    render(<FootballPlayerHeader player={QB_PLAYER} />);
    expect(screen.getByText('QB')).toBeTruthy();
  });

  it('renders DST position badge and team name for a DST player', () => {
    render(<FootballPlayerHeader player={DST_PLAYER} />);
    expect(screen.getByText('DST')).toBeTruthy();
    expect(
      screen.getAllByText('Kansas City Chiefs').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders NFL team full name and conference/division for a known team', () => {
    render(<FootballPlayerHeader player={QB_PLAYER} />);
    expect(screen.getByText('Kansas City Chiefs')).toBeTruthy();
    expect(screen.getByText('AFC')).toBeTruthy();
    expect(screen.getByText('West')).toBeTruthy();
  });

  it('renders the Free Agent badge when nflTeam is null', () => {
    render(<FootballPlayerHeader player={FREE_AGENT} />);
    expect(screen.getByText('Free Agent')).toBeTruthy();
  });

  it('does not render team name when player is a free agent', () => {
    render(<FootballPlayerHeader player={FREE_AGENT} />);
    expect(screen.queryByText(/AFC|NFC/)).toBeNull();
  });

  it('renders position badge for an IDP linebacker', () => {
    render(<FootballPlayerHeader player={LB_PLAYER} />);
    expect(screen.getByText('LB')).toBeTruthy();
    expect(screen.getByText('Dallas Cowboys')).toBeTruthy();
  });

  it('renders "Unknown" for a player with no name', () => {
    render(
      <FootballPlayerHeader
        player={{ id: 99, firstName: null, lastName: null, nflTeam: null }}
      />,
    );
    expect(screen.getByText('Unknown')).toBeTruthy();
  });
});
