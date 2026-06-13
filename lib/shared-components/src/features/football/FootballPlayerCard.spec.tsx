/**
 * Tests for FootballPlayerCard — the cross-platform NFL player list card shared
 * by the web players page. LS-6242 covers multi-category stat rendering: the
 * card must surface every populated career category, not just the one mapped to
 * the player's nominal position.
 */
import React from 'react';
import {
  FootballPlayerCard,
  type FootballPlayerCardPlayer,
} from './FootballPlayerCard';
import { fireEvent, render, screen } from '../../test-utils';

const QB_PLAYER: FootballPlayerCardPlayer = {
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

const DUAL_THREAT_QB: FootballPlayerCardPlayer = {
  id: 2,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  careerStats: {
    passing: { yds: 21000, td: 150, int: 60, rating: 96.3 },
    rushing: { yds: 762, td: 15 },
  },
};

const PASS_CATCHING_RB: FootballPlayerCardPlayer = {
  id: 3,
  firstName: 'Christian',
  lastName: 'McCaffrey',
  position: 'RB',
  isDst: false,
  nflTeam: 'SF',
  careerStats: {
    rushing: { yds: 1459, td: 14 },
    receiving: { rec: 67, yds: 564, td: 7 },
  },
};

const DST_PLAYER: FootballPlayerCardPlayer = {
  id: 4,
  firstName: 'Kansas City',
  lastName: 'Chiefs',
  position: 'DST',
  isDst: true,
  nflTeam: 'KC',
  careerStats: {
    defense: { sacks: 45.5, int: 18, ptsAllowedPerG: 19.3 },
  },
};

describe('FootballPlayerCard', () => {
  it('renders the player name and position badge', () => {
    render(<FootballPlayerCard player={QB_PLAYER} />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    expect(screen.getByText('QB')).toBeTruthy();
  });

  it('fires onNavigateToPlayer with the player id when pressed', () => {
    const onNavigate = jest.fn();
    render(
      <FootballPlayerCard player={QB_PLAYER} onNavigateToPlayer={onNavigate} />,
    );
    fireEvent.click(screen.getByText('Patrick Mahomes'));
    expect(onNavigate).toHaveBeenCalledWith('1');
  });

  describe('LS-6242 — multi-category players render every populated category', () => {
    it('renders both passing and rushing rows for a dual-threat QB', () => {
      render(<FootballPlayerCard player={DUAL_THREAT_QB} />);
      expect(screen.getByText('Pass')).toBeTruthy();
      expect(screen.getByText('Rush')).toBeTruthy();
      // Rushing yards (762) — the data the position-switch bug hid.
      expect(screen.getByText('762')).toBeTruthy();
    });

    it('renders both rushing and receiving rows for a pass-catching RB', () => {
      render(<FootballPlayerCard player={PASS_CATCHING_RB} />);
      expect(screen.getByText('Rush')).toBeTruthy();
      expect(screen.getByText('Rec')).toBeTruthy();
      expect(screen.getByText('564')).toBeTruthy();
    });

    it('renders only the populated category for a single-category QB', () => {
      render(<FootballPlayerCard player={QB_PLAYER} />);
      expect(screen.getByText('Pass')).toBeTruthy();
      expect(screen.queryByText('Rush')).toBeNull();
      expect(screen.queryByText('Rec')).toBeNull();
    });

    it('shows "No stats available" when careerStats is null', () => {
      render(
        <FootballPlayerCard player={{ ...QB_PLAYER, careerStats: null }} />,
      );
      expect(screen.getByText('No stats available')).toBeTruthy();
    });
  });

  it('renders DST stats for a defense without offense rows', () => {
    render(<FootballPlayerCard player={DST_PLAYER} />);
    expect(screen.getByText('Sacks')).toBeTruthy();
    expect(screen.getByText('Pts Allowed/G')).toBeTruthy();
  });

  describe('LS-6460 — selectable state for player comparison', () => {
    it('fires onSelect with the numeric id (not onNavigateToPlayer) when selectable and pressed', () => {
      const onSelect = jest.fn();
      const onNavigate = jest.fn();
      render(
        <FootballPlayerCard
          player={QB_PLAYER}
          isSelectable
          onSelect={onSelect}
          onNavigateToPlayer={onNavigate}
        />,
      );
      fireEvent.click(screen.getByText('Patrick Mahomes'));
      expect(onSelect).toHaveBeenCalledWith(1);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('renders a checkmark when selected', () => {
      render(<FootballPlayerCard player={QB_PLAYER} isSelectable isSelected />);
      expect(screen.getByText('✓')).toBeTruthy();
    });

    it('does not render a checkmark when selectable but not selected', () => {
      render(<FootballPlayerCard player={QB_PLAYER} isSelectable />);
      expect(screen.queryByText('✓')).toBeNull();
    });
  });
});
