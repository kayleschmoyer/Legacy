import React from 'react';
import { LeagueCard } from './LeagueCard';
import { render } from '../test-utils';

const baseProps = { name: 'Dead Ball Dynasty', meta: 'Week 14/22 · 12 teams' };

const matchup = {
  away: {
    abbr: 'NYY Yankees',
    record: '8-4 · 1st',
    score: 127.5,
    colorVariant: 'navy' as const,
  },
  home: {
    abbr: 'BOS Red Sox',
    record: '7-5 · 2nd',
    score: 112.3,
    colorVariant: 'red' as const,
  },
};

describe('LeagueCard', () => {
  it('renders the league name', () => {
    const { getByText } = render(<LeagueCard {...baseProps} />);
    expect(getByText('Dead Ball Dynasty')).toBeTruthy();
  });

  it('renders meta text', () => {
    const { getByText } = render(<LeagueCard {...baseProps} />);
    expect(getByText('Week 14/22 · 12 teams')).toBeTruthy();
  });

  describe('with matchup', () => {
    it('renders team abbreviations', () => {
      const { getByText } = render(
        <LeagueCard {...baseProps} matchup={matchup} />,
      );
      expect(getByText('NYY Yankees')).toBeTruthy();
      expect(getByText('BOS Red Sox')).toBeTruthy();
    });

    it('renders team records', () => {
      const { getByText } = render(
        <LeagueCard {...baseProps} matchup={matchup} />,
      );
      expect(getByText('8-4 · 1st')).toBeTruthy();
      expect(getByText('7-5 · 2nd')).toBeTruthy();
    });

    it('renders scores formatted to one decimal place', () => {
      const { getByText } = render(
        <LeagueCard {...baseProps} matchup={matchup} />,
      );
      expect(getByText('127.5')).toBeTruthy();
      expect(getByText('112.3')).toBeTruthy();
    });

    it('does not render member avatars when matchup is present', () => {
      const { queryByText } = render(
        <LeagueCard
          {...baseProps}
          matchup={matchup}
          members={[{ name: 'Babe Ruth' }, { name: 'Cy Young' }]}
        />,
      );
      // Initials should not appear when a matchup is provided
      expect(queryByText('BR')).toBeNull();
      expect(queryByText('CY')).toBeNull();
    });

    it('renders both scores when teams are tied (home wins on tie)', () => {
      const tiedMatchup = {
        away: { abbr: 'NYY', score: 100.0 },
        home: { abbr: 'BOS', score: 100.0 },
      };
      const { getAllByText } = render(
        <LeagueCard {...baseProps} matchup={tiedMatchup} />,
      );
      expect(getAllByText('100.0')).toHaveLength(2);
    });
  });

  describe('without matchup', () => {
    it('renders member initials', () => {
      const { getByText } = render(
        <LeagueCard
          {...baseProps}
          members={[{ name: 'Babe Ruth' }, { name: 'Cy Young' }]}
        />,
      );
      expect(getByText('BR')).toBeTruthy();
      expect(getByText('CY')).toBeTruthy();
    });

    it('caps member avatars at 4 and shows overflow count', () => {
      const members = [
        { name: 'A A' },
        { name: 'B B' },
        { name: 'C C' },
        { name: 'D D' },
        { name: 'E E' },
      ];
      const { getByText } = render(
        <LeagueCard {...baseProps} members={members} />,
      );
      expect(getByText('+1')).toBeTruthy();
    });

    it('renders footer text', () => {
      const { getByText } = render(
        <LeagueCard {...baseProps} footer="Draft: Fri Apr 12 · 8:00 PM" />,
      );
      expect(getByText('Draft: Fri Apr 12 · 8:00 PM')).toBeTruthy();
    });
  });
});
