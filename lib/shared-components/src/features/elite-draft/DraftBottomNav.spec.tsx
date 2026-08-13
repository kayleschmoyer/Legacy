import React from 'react';
import { DraftBottomNav } from './DraftBottomNav';
import { fireEvent, render, screen } from '../../test-utils';

describe('DraftBottomNav', () => {
  it('renders all 5 tabs', () => {
    render(<DraftBottomNav activeTab="board" onChangeTab={jest.fn()} />);

    expect(screen.getByText('Board')).toBeTruthy();
    expect(screen.getByText('Players')).toBeTruthy();
    expect(screen.getByText('Queue')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('marks the active tab selected and the rest not selected', () => {
    render(<DraftBottomNav activeTab="queue" onChangeTab={jest.fn()} />);

    expect(screen.getByTestId('draft-bottom-nav-queue')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('draft-bottom-nav-board')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChangeTab with the tapped tab', () => {
    const onChangeTab = jest.fn();
    render(<DraftBottomNav activeTab="board" onChangeTab={onChangeTab} />);

    fireEvent.click(screen.getByTestId('draft-bottom-nav-team'));

    expect(onChangeTab).toHaveBeenCalledWith('team');
  });
});
