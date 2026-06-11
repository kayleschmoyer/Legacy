/**
 * Tests for FootballPlayerDetail (LS-7805, LS-5435) — the cross-platform NFL
 * player detail view shared by web and mobile.
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
  seasonStats: {
    passing: [
      {
        season: 2023,
        team: 'KC',
        g: 16,
        cmp: 401,
        att: 597,
        yds: 4839,
        td: 41,
        int: 12,
        rating: 105.2,
      },
      {
        season: 2022,
        team: 'KC',
        g: 17,
        cmp: 435,
        att: 648,
        yds: 5250,
        td: 37,
        int: 14,
        rating: 105.2,
      },
    ],
  },
};

const RB_PLAYER: FootballPlayerDetailPlayer = {
  id: 4,
  firstName: 'Christian',
  lastName: 'McCaffrey',
  position: 'RB',
  isDst: false,
  nflTeam: 'SF',
  careerStats: {
    rushing: { yds: 1459, td: 14 },
    receiving: { rec: 67, yds: 564, td: 7 },
  },
  seasonStats: {
    rushing: [
      {
        season: 2023,
        team: 'SF',
        g: 16,
        att: 272,
        yds: 1459,
        td: 14,
        ydsPerAtt: 5.4,
      },
    ],
    receiving: [
      {
        season: 2023,
        team: 'SF',
        g: 16,
        tgt: 85,
        rec: 67,
        yds: 564,
        td: 7,
        ydsPerRec: 8.4,
      },
    ],
  },
};

const WR_PLAYER: FootballPlayerDetailPlayer = {
  id: 5,
  firstName: 'Davante',
  lastName: 'Adams',
  position: 'WR',
  isDst: false,
  nflTeam: 'LV',
  careerStats: {
    receiving: { rec: 100, yds: 1144, td: 8 },
  },
  seasonStats: {
    receiving: [
      {
        season: 2023,
        team: 'LV',
        g: 17,
        tgt: 154,
        rec: 103,
        yds: 1144,
        td: 8,
        ydsPerRec: 11.1,
      },
    ],
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
    expect(screen.getAllByText('RTG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('105.2').length).toBeGreaterThanOrEqual(1);
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

  describe('LS-5435 — Passing / Rushing / Receiving Stat Breakdowns', () => {
    it('renders passing season breakdown table for a QB', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      expect(screen.getByText('Passing — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('CMP')).toBeTruthy();
      expect(screen.getAllByText('ATT').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('RTG').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('2023')).toBeTruthy();
      expect(screen.getByText('2022')).toBeTruthy();
    });

    it('shows team column in passing breakdown rows', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      const kcs = screen.getAllByText('KC');
      expect(kcs.length).toBeGreaterThanOrEqual(2);
    });

    it('renders rushing season breakdown table for an RB', () => {
      render(<FootballPlayerDetail player={RB_PLAYER} />);
      expect(screen.getByText('Rushing — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('YDS/ATT')).toBeTruthy();
      expect(screen.getByText('5.4')).toBeTruthy();
    });

    it('renders receiving season breakdown table for an RB with receptions', () => {
      render(<FootballPlayerDetail player={RB_PLAYER} />);
      expect(screen.getByText('Receiving — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('TGT')).toBeTruthy();
      expect(screen.getByText('YDS/REC')).toBeTruthy();
    });

    it('renders receiving season breakdown table for a WR', () => {
      render(<FootballPlayerDetail player={WR_PLAYER} />);
      expect(screen.getByText('Receiving — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('103')).toBeTruthy();
      expect(screen.getByText('11.1')).toBeTruthy();
    });

    it('shows NFL team context in each receiving breakdown row', () => {
      render(<FootballPlayerDetail player={WR_PLAYER} />);
      expect(screen.getAllByText('LV').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render breakdown tables when seasonStats is null', () => {
      const player: FootballPlayerDetailPlayer = {
        ...QB_PLAYER,
        seasonStats: null,
      };
      render(<FootballPlayerDetail player={player} />);
      expect(screen.queryByText('Passing — Season Breakdown')).toBeNull();
    });

    it('does not render breakdown tables when all season arrays are empty', () => {
      const player: FootballPlayerDetailPlayer = {
        ...QB_PLAYER,
        seasonStats: { passing: [], rushing: [], receiving: [] },
      };
      render(<FootballPlayerDetail player={player} />);
      expect(screen.queryByText('Passing — Season Breakdown')).toBeNull();
    });
  });

  it('renders FA badge and Free Agent subtitle when nflTeam is null', () => {
    const FREE_AGENT: FootballPlayerDetailPlayer = {
      id: 99,
      firstName: 'Odell',
      lastName: 'Beckham',
      position: 'WR',
      isDst: false,
      nflTeam: null,
      careerStats: null,
    };
    render(<FootballPlayerDetail player={FREE_AGENT} />);
    expect(screen.getByText('FA')).toBeTruthy();
    expect(screen.getByText('Free Agent')).toBeTruthy();
    expect(screen.queryByText('?')).toBeNull();
  });
});
