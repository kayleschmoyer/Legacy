import React from 'react';
import { RosterActionBar } from './RosterActionBar';
import { fireEvent, render, screen } from '../../test-utils';

describe('RosterActionBar', () => {
  it('renders nothing when no handlers are provided', () => {
    const { container } = render(<RosterActionBar />);
    expect(container.firstChild).toBeNull();
  });

  it('fires the Optimal Lineup handler', () => {
    const onOptimalLineup = jest.fn();
    render(<RosterActionBar onOptimalLineup={onOptimalLineup} />);
    fireEvent.click(screen.getByRole('button', { name: 'Optimal Lineup' }));
    expect(onOptimalLineup).toHaveBeenCalledTimes(1);
  });

  it('does not fire a disabled Optimal Lineup button', () => {
    const onOptimalLineup = jest.fn();
    render(
      <RosterActionBar
        onOptimalLineup={onOptimalLineup}
        optimalLineupDisabled
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Optimal Lineup' }));
    expect(onOptimalLineup).not.toHaveBeenCalled();
  });

  it('fires the Quick Swap handler', () => {
    const onQuickSwap = jest.fn();
    render(<RosterActionBar onQuickSwap={onQuickSwap} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick Swap' }));
    expect(onQuickSwap).toHaveBeenCalledTimes(1);
  });
});
