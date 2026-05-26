import React from 'react';
import { Linescore } from './Linescore';
import { render } from '../../test-utils';

describe('Linescore', () => {
  const baseProps = {
    awayAbbr: 'NYY',
    homeAbbr: 'BOS',
    awayInnings: [1, 0, 0, 2, 0, 0, 1],
    homeInnings: [0, 1, 0, 0, 0, 2, 0],
    awayHits: 8,
    homeHits: 7,
    awayErrors: 0,
    homeErrors: 1,
  };

  it('renders both team abbreviations', () => {
    const { getByText } = render(<Linescore {...baseProps} />);
    expect(getByText('NYY')).toBeTruthy();
    expect(getByText('BOS')).toBeTruthy();
  });

  it('pads to nine inning columns when fewer innings have been played', () => {
    const { getAllByText } = render(<Linescore {...baseProps} />);
    // Innings 8 and 9 have not been played for either team — both rows
    // render an em-dash placeholder, so we expect 4 dashes total.
    expect(getAllByText('–').length).toBe(4);
  });

  it('renders inning header numbers up to the longest played count', () => {
    const longProps = {
      ...baseProps,
      awayInnings: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2],
      homeInnings: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    };
    const { getByText } = render(<Linescore {...longProps} />);
    expect(getByText('11')).toBeTruthy();
  });

  it('totals R correctly from per-inning values', () => {
    const { getAllByText } = render(<Linescore {...baseProps} />);
    // Away total: 1+0+0+2+0+0+1 = 4. Home total: 0+1+0+0+0+2+0 = 3.
    // Each appears at least twice — once as an inning header (innings 1–9)
    // and once as the row total — so we just assert both surface at all.
    expect(getAllByText('4').length).toBeGreaterThanOrEqual(2);
    expect(getAllByText('3').length).toBeGreaterThanOrEqual(2);
  });

  it('renders R / H / E header labels', () => {
    const { getByText } = render(<Linescore {...baseProps} />);
    expect(getByText('R')).toBeTruthy();
    expect(getByText('H')).toBeTruthy();
    expect(getByText('E')).toBeTruthy();
  });

  describe('football mode (sport="football")', () => {
    const footballProps = {
      awayAbbr: 'KC',
      homeAbbr: 'SF',
      awayInnings: [7, 14, 0, 3],
      homeInnings: [3, 0, 10, 7],
      sport: 'football' as const,
    };

    it('renders Q1/Q2/Q3/Q4 period headers instead of inning numbers', () => {
      const { getByText } = render(<Linescore {...footballProps} />);
      expect(getByText('Q1')).toBeTruthy();
      expect(getByText('Q2')).toBeTruthy();
      expect(getByText('Q3')).toBeTruthy();
      expect(getByText('Q4')).toBeTruthy();
    });

    it('renders "PTS" total column instead of R / H / E', () => {
      const { getByText, queryByText } = render(
        <Linescore {...footballProps} />,
      );
      expect(getByText('PTS')).toBeTruthy();
      expect(queryByText('R')).toBeNull();
      expect(queryByText('H')).toBeNull();
      expect(queryByText('E')).toBeNull();
    });

    it('does not render inning numbers in football mode', () => {
      const { queryByText } = render(<Linescore {...footballProps} />);
      // Inning numbers 1–9 should not appear as column headers in football mode
      expect(queryByText('1')).toBeNull();
      expect(queryByText('9')).toBeNull();
    });
  });
});
