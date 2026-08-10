import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  RosterPositionsEditor,
  type RosterPositionsEditorProps,
} from './RosterPositionsEditor';
import { FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT } from './constants';
import { render } from '../../../test-utils';

function renderEditor(overrides: Partial<RosterPositionsEditorProps> = {}) {
  const props: RosterPositionsEditorProps = {
    rosterSlots: { ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst },
    defensiveFormat: 'dst',
    onChange: jest.fn(),
    isPremium: false,
    onUpgrade: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<RosterPositionsEditor {...props} />) };
}

describe('RosterPositionsEditor (LS-9108)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the base slot set for the D/ST format', () => {
    const { getByTestId } = renderEditor({ defensiveFormat: 'dst' });
    expect(getByTestId('roster-slot-QB')).toBeTruthy();
    expect(getByTestId('roster-slot-FLEX')).toBeTruthy();
    expect(getByTestId('roster-slot-DST')).toBeTruthy();
    expect(getByTestId('roster-slot-BN')).toBeTruthy();
  });

  it('renders the base slot set for the IDP format', () => {
    const { getByTestId, queryByTestId } = renderEditor({
      defensiveFormat: 'idp',
      rosterSlots: {
        ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.idp,
      },
    });
    expect(getByTestId('roster-slot-DL')).toBeTruthy();
    expect(getByTestId('roster-slot-LB')).toBeTruthy();
    expect(getByTestId('roster-slot-DB')).toBeTruthy();
    expect(queryByTestId('roster-slot-DST')).toBeNull();
  });

  it('always shows the SFLEX and K/P premium slots, whether or not the viewer is premium', () => {
    const { getByTestId } = renderEditor({ isPremium: false });
    expect(getByTestId('roster-premium-slot-SFLEX')).toBeTruthy();
    expect(getByTestId('roster-premium-slot-KP')).toBeTruthy();
    expect(getByTestId('roster-premium-slot-SFLEX').textContent).toContain(
      'Superflex',
    );
    expect(getByTestId('roster-premium-slot-KP').textContent).toContain(
      'Kicker/Punter',
    );
  });

  it('shows the running starters/bench/total counts', () => {
    const { getByTestId } = renderEditor({
      rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 7 },
    });
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Starters: 9',
    );
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Bench: 7',
    );
    expect(getByTestId('roster-positions-totals').textContent).toContain(
      'Total: 16',
    );
  });

  describe('non-premium viewer', () => {
    it('increments a base (non-gated) slot normally', () => {
      const onChange = jest.fn();
      const { getByTestId } = renderEditor({
        isPremium: false,
        onChange,
        rosterSlots: {
          ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst,
        },
      });
      fireEvent.click(getByTestId('roster-slot-WR-increment'));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ WR: 3 }));
    });

    it('routes interacting with a premium slot to onUpgrade instead of changing the count', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByTestId } = renderEditor({
        isPremium: false,
        onChange,
        onUpgrade,
      });
      fireEvent.click(getByTestId('roster-premium-slot-SFLEX-increment'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('routes interacting with the K/P slot to onUpgrade instead of changing the count', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByTestId } = renderEditor({
        isPremium: false,
        onChange,
        onUpgrade,
      });
      fireEvent.click(getByTestId('roster-premium-slot-KP-increment'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('marks the premium slot rows as locked, distinct from base rows', () => {
      const { getByTestId } = renderEditor({ isPremium: false });
      expect(
        getByTestId('roster-premium-slot-SFLEX-decrement'),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(getByTestId('roster-slot-WR-decrement')).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    });
  });

  describe('premium viewer', () => {
    it('increments a premium slot normally without calling onUpgrade', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByTestId } = renderEditor({
        isPremium: true,
        onChange,
        onUpgrade,
      });
      fireEvent.click(getByTestId('roster-premium-slot-SFLEX-increment'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ SFLEX: 1 }),
      );
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('decrements a premium slot once it has a count, without dropping below zero', () => {
      const onChange = jest.fn();
      const { getByTestId, rerender, props } = renderEditor({
        isPremium: true,
        onChange,
        rosterSlots: {
          ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst,
          SFLEX: 1,
        },
      });
      fireEvent.click(getByTestId('roster-premium-slot-SFLEX-decrement'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ SFLEX: 0 }),
      );

      onChange.mockClear();
      rerender(
        <RosterPositionsEditor
          {...props}
          rosterSlots={{
            ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst,
            SFLEX: 0,
          }}
        />,
      );
      expect(
        getByTestId('roster-premium-slot-SFLEX-decrement'),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not lock the premium slot rows', () => {
      const { getByTestId } = renderEditor({
        isPremium: true,
        rosterSlots: {
          ...FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT.dst,
          SFLEX: 1,
        },
      });
      expect(
        getByTestId('roster-premium-slot-SFLEX-decrement'),
      ).toHaveAttribute('aria-disabled', 'false');
    });
  });

  it('never lets a base slot count fall below zero', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderEditor({
      onChange,
      rosterSlots: { QB: 0, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 7 },
    });
    expect(getByTestId('roster-slot-QB-decrement')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(getByTestId('roster-slot-QB-decrement'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('surfaces a validation error passed in from the caller', () => {
    const { getByTestId } = renderEditor({
      error: 'Roster size must be between 10 and 25.',
    });
    expect(getByTestId('roster-positions-editor-error').textContent).toBe(
      'Roster size must be between 10 and 25.',
    );
  });
});
