import React from 'react';
import { DraftOpenSlotsBanner } from './DraftOpenSlotsBanner';
import { fireEvent, render, screen } from '../../test-utils';

describe('DraftOpenSlotsBanner (LS-10593)', () => {
  it('names the open-slot positions the board is narrowed to', () => {
    render(
      <DraftOpenSlotsBanner
        openSlotPositions={['C', 'SS']}
        showAllPositions={false}
        onToggleShowAll={jest.fn()}
      />,
    );
    expect(screen.getByText('Showing open roster spots: C, SS')).toBeTruthy();
  });

  it('lifts the filter on "Show all" and restores it again', () => {
    const onToggle = jest.fn();
    const { rerender } = render(
      <DraftOpenSlotsBanner
        openSlotPositions={['C']}
        showAllPositions={false}
        onToggleShowAll={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('draft-open-slots-toggle'));
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(
      <DraftOpenSlotsBanner
        openSlotPositions={['C']}
        showAllPositions
        onToggleShowAll={onToggle}
      />,
    );
    expect(screen.getByText('Showing all positions')).toBeTruthy();
    fireEvent.click(screen.getByTestId('draft-open-slots-toggle'));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('renders nothing when no filter applies', () => {
    render(
      <DraftOpenSlotsBanner
        openSlotPositions={[]}
        showAllPositions={false}
        onToggleShowAll={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('draft-open-slots-banner')).toBeNull();
  });
});
