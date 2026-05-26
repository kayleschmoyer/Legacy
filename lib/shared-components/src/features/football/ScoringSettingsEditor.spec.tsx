/**
 * Tests for ScoringSettingsEditor (LS-4158).
 * Covers the pure `defaultFootballScoringValues` factory and basic component rendering.
 */
import React from 'react';
import {
  defaultFootballScoringValues,
  ScoringSettingsEditor,
} from './ScoringSettingsEditor';
import { fireEvent, render } from '../../test-utils';

// ── defaultFootballScoringValues ─────────────────────────────────────────────

describe('defaultFootballScoringValues', () => {
  it('defaults to PPR (rec = 1) when no format is supplied', () => {
    expect(defaultFootballScoringValues().receiving_rec).toBe(1);
  });

  it('sets rec = 0 for standard format', () => {
    expect(defaultFootballScoringValues('standard').receiving_rec).toBe(0);
  });

  it('sets rec = 0.5 for half_ppr format', () => {
    expect(defaultFootballScoringValues('half_ppr').receiving_rec).toBe(0.5);
  });

  it('sets rec = 1 for ppr format', () => {
    expect(defaultFootballScoringValues('ppr').receiving_rec).toBe(1);
  });

  it('passes through other scoring values unchanged across formats', () => {
    const std = defaultFootballScoringValues('standard');
    const ppr = defaultFootballScoringValues('ppr');
    expect(std.passing_td).toBe(ppr.passing_td);
    expect(std.rushing_td).toBe(ppr.rushing_td);
    expect(std.receiving_yds).toBe(ppr.receiving_yds);
  });

  it('returns correct DST pts_allowed band values', () => {
    const vals = defaultFootballScoringValues();
    expect(vals.pts_0).toBe(10);
    expect(vals.pts_1_6).toBe(7);
    expect(vals.pts_7_13).toBe(4);
    expect(vals.pts_14_17).toBe(1);
    expect(vals.pts_18_27).toBe(0);
    expect(vals.pts_28_34).toBe(-1);
    expect(vals.pts_35_plus).toBe(-4);
  });

  it('returns correct IDP multiplier values', () => {
    const vals = defaultFootballScoringValues();
    expect(vals.idp_solo_tkl).toBe(1);
    expect(vals.idp_ast_tkl).toBe(0.5);
    expect(vals.idp_sacks).toBe(2);
    expect(vals.idp_int).toBe(3);
    expect(vals.idp_pd).toBe(1);
    expect(vals.idp_ff).toBe(2);
    expect(vals.idp_fr).toBe(2);
    expect(vals.idp_def_td).toBe(6);
  });

  it('rates fg_50_plus higher than fg_0_39', () => {
    const vals = defaultFootballScoringValues();
    expect(vals.fg_50_plus).toBeGreaterThan(vals.fg_0_39);
  });

  it('fg_40_49 is between fg_0_39 and fg_50_plus', () => {
    const vals = defaultFootballScoringValues();
    expect(vals.fg_40_49).toBeGreaterThan(vals.fg_0_39);
    expect(vals.fg_40_49).toBeLessThan(vals.fg_50_plus);
  });
});

// ── ScoringSettingsEditor component ─────────────────────────────────────────

describe('ScoringSettingsEditor', () => {
  const noop = () => undefined;
  const defaultValues = defaultFootballScoringValues();

  it('renders the three preset buttons', () => {
    const { getByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="dst"
        onChange={noop}
      />,
    );
    expect(getByText('Standard')).toBeTruthy();
    expect(getByText('Half-PPR')).toBeTruthy();
    expect(getByText('PPR')).toBeTruthy();
  });

  it('calls onChange with rec = 0 when Standard preset is pressed', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="dst"
        onChange={onChange}
      />,
    );
    fireEvent.click(getByText('Standard'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ receiving_rec: 0 }),
    );
  });

  it('calls onChange with rec = 0.5 when Half-PPR preset is pressed', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="dst"
        onChange={onChange}
      />,
    );
    fireEvent.click(getByText('Half-PPR'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ receiving_rec: 0.5 }),
    );
  });

  it('hides presets when showPresets = false', () => {
    const { queryByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="dst"
        onChange={noop}
        showPresets={false}
      />,
    );
    expect(queryByText('Standard')).toBeNull();
    expect(queryByText('Half-PPR')).toBeNull();
    expect(queryByText('PPR')).toBeNull();
  });

  it('renders DST section when defensiveFormat = dst', () => {
    const { getByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="dst"
        onChange={noop}
      />,
    );
    expect(getByText('D/ST — Flat Stats')).toBeTruthy();
  });

  it('renders IDP section when defensiveFormat = idp', () => {
    const { getByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="idp"
        onChange={noop}
      />,
    );
    expect(getByText('Individual Defensive Players (IDP)')).toBeTruthy();
  });

  it('does not render DST section for IDP format', () => {
    const { queryByText } = render(
      <ScoringSettingsEditor
        values={defaultValues}
        defensiveFormat="idp"
        onChange={noop}
      />,
    );
    expect(queryByText('D/ST — Flat Stats')).toBeNull();
  });
});
