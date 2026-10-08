/**
 * Regression guard for LS-10797: the Enable Salary Cap toggle was a
 * pointer-only XStack — no role, no tab stop, no checked state, no
 * Enter/Space handling — so keyboard users tabbed straight past it.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { LeagueSettingsControl } from './LeagueSettingsControl';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/graphql', () => ({
  useUpdateLeagueSettingsMutation: () => [jest.fn(), { loading: false }],
}));

const salaryCapSwitch = () =>
  screen.getByRole('switch', { name: 'Enable Salary Cap' });

describe('LeagueSettingsControl — Enable Salary Cap keyboard + screen reader (LS-10797)', () => {
  it('exposes Enable Salary Cap as a focusable switch with its checked state', () => {
    render(<LeagueSettingsControl leagueId={1} isPremium />);

    expect(salaryCapSwitch().getAttribute('aria-checked')).toBe('false');
    expect(salaryCapSwitch().getAttribute('tabindex')).toBe('0');

    salaryCapSwitch().focus();
    expect(document.activeElement).toBe(salaryCapSwitch());
  });

  it('toggles with Enter and Space and reveals the cap limit field', () => {
    render(<LeagueSettingsControl leagueId={1} isPremium />);
    expect(screen.queryByText('Salary Cap Limit')).toBeNull();

    fireEvent.keyDown(salaryCapSwitch(), { key: 'Enter' });
    expect(salaryCapSwitch().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Salary Cap Limit')).toBeTruthy();

    fireEvent.keyDown(salaryCapSwitch(), { key: ' ' });
    expect(salaryCapSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Salary Cap Limit')).toBeNull();
  });

  it('starts checked when the league already has a salary cap', () => {
    render(
      <LeagueSettingsControl
        leagueId={1}
        isPremium
        currentSalaryCapEnabled
        currentSalaryCap={200}
      />,
    );

    expect(salaryCapSwitch().getAttribute('aria-checked')).toBe('true');
  });
});
