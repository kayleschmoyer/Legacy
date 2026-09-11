import React from 'react';
import { DraftSlotChip, slotAccentColor, slotChipLabel } from './DraftSlotChip';
import { render } from '../../test-utils';
import { getPositionColor } from '../../utils/colors';

describe('DraftSlotChip', () => {
  it('shows the player monogram for a filled slot', () => {
    const { getByText, getByLabelText } = render(
      <DraftSlotChip
        positionType="C"
        sport="baseball"
        state="filled"
        playerName="Yogi Berra"
      />,
    );

    expect(getByText('C')).toBeTruthy();
    expect(getByText('YB')).toBeTruthy();
    expect(getByLabelText('C — Yogi Berra')).toBeTruthy();
  });

  it('marks the priority hole with a gold "+" and a priority label', () => {
    const { getByText, getByLabelText } = render(
      <DraftSlotChip positionType="1B" sport="baseball" state="need" />,
    );

    expect(getByText('+')).toBeTruthy();
    expect(getByLabelText('1B — open, priority')).toBeTruthy();
  });

  it('renders an empty marker for a plain open slot', () => {
    const { getByLabelText, queryByText } = render(
      <DraftSlotChip positionType="2B" sport="baseball" state="open" />,
    );

    expect(getByLabelText('2B — open')).toBeTruthy();
    expect(queryByText('+')).toBeNull();
  });

  it('labels the synthetic BENCH bucket "BN"', () => {
    const { getByText, getByLabelText } = render(
      <DraftSlotChip
        positionType="BENCH"
        sport="baseball"
        state="open"
        isBench
      />,
    );

    expect(getByText('BN')).toBeTruthy();
    expect(getByLabelText('BN — open')).toBeTruthy();
  });

  it('renders at phone sizing without changing its content', () => {
    const { getByText } = render(
      <DraftSlotChip
        positionType="WR"
        sport="football"
        state="filled"
        playerName="Tyreek Hill"
        size="sm"
      />,
    );

    expect(getByText('WR')).toBeTruthy();
    expect(getByText('TH')).toBeTruthy();
  });
});

describe('slotChipLabel', () => {
  it('abbreviates BENCH and passes every other slot name through', () => {
    expect(slotChipLabel('BENCH')).toBe('BN');
    expect(slotChipLabel('FLEX')).toBe('FLEX');
  });
});

describe('slotAccentColor', () => {
  const MUTED = '#6C80BA';

  // LS-10004 AC: accents come from the canonical `getPositionColor`
  // vocabulary and cover both sports' slot names.
  it.each([
    ['baseball', 'P'],
    ['baseball', 'C'],
    ['baseball', '1B'],
    ['baseball', '2B'],
    ['baseball', '3B'],
    ['baseball', 'SS'],
    ['baseball', 'OF'],
    ['baseball', 'UTIL'],
    ['football', 'QB'],
    ['football', 'RB'],
    ['football', 'WR'],
    ['football', 'TE'],
    ['football', 'K'],
    ['football', 'DEF'],
    ['football', 'FLEX'],
  ] as const)('resolves %s %s through getPositionColor', (sport, position) => {
    expect(slotAccentColor(sport, position, MUTED)).toBe(
      getPositionColor(sport, position),
    );
  });

  it('gives every covered slot name a real color, never the muted fallback', () => {
    const covered = [
      ...(['P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL'] as const).map(
        (p) => ['baseball', p] as const,
      ),
      ...(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX'] as const).map(
        (p) => ['football', p] as const,
      ),
    ];

    for (const [sport, position] of covered) {
      expect(slotAccentColor(sport, position, MUTED)).toMatch(
        /^#[0-9A-Fa-f]{6}$/,
      );
      expect(slotAccentColor(sport, position, MUTED)).not.toBe(MUTED);
    }
  });

  it('de-accents bench slots to the muted tone under either key', () => {
    expect(slotAccentColor('baseball', 'BN', MUTED)).toBe(MUTED);
    expect(slotAccentColor('football', 'BENCH', MUTED)).toBe(MUTED);
  });
});
