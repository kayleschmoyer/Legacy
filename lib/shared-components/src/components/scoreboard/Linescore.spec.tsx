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
});
