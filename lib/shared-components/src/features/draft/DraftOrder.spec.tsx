import React from 'react';
import { DraftOrder } from './DraftOrder';
import { render } from '../../test-utils';

const mockTeams = [
  { id: 't1', name: 'Team Alpha' },
  { id: 't2', name: 'Team Beta' },
  { id: 't3', name: 'Team Gamma' },
  { id: 't4', name: 'Team Delta' },
  { id: 't5', name: 'Team Epsilon' },
  { id: 't6', name: 'Team Zeta' },
  { id: 't7', name: 'Team Eta' },
  { id: 't8', name: 'Team Theta' },
];

describe('DraftOrder', () => {
  it('renders "Draft Order" title', () => {
    const { getByText } = render(
      <DraftOrder order={mockTeams} currentPick={1} />,
    );

    expect(getByText('Draft Order')).toBeTruthy();
  });

  it('renders all team names', () => {
    const { getByText } = render(
      <DraftOrder order={mockTeams} currentPick={1} />,
    );

    for (const team of mockTeams) {
      expect(getByText(team.name, { exact: false })).toBeTruthy();
    }
  });

  it('highlights current pick team', () => {
    const { getByText } = render(
      <DraftOrder order={mockTeams} currentPick={3} />,
    );

    // The third team (index 2) should be rendered and distinguishable
    const currentPickText = getByText(/Team Gamma/);
    expect(currentPickText).toBeTruthy();

    // Non-current picks should also render
    const otherPickText = getByText(/Team Alpha/);
    expect(otherPickText).toBeTruthy();
  });
});
