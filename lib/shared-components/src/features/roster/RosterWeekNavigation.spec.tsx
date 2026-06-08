import React from 'react';
import { RosterWeekNavigation } from './RosterWeekNavigation';
import { fireEvent, render, screen } from '../../test-utils';

const baseProps = {
  week: 5,
  currentWeek: 5,
  totalWeeks: 10,
  onWeekChange: () => undefined,
  onResetToCurrent: () => undefined,
};

describe('RosterWeekNavigation', () => {
  it('shows the week number and the Current chip on the live week', () => {
    render(<RosterWeekNavigation {...baseProps} />);
    expect(screen.getByText('Week 5')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
  });

  it('shows the Frozen chip and Reset affordance on a past week', () => {
    render(<RosterWeekNavigation {...baseProps} week={3} />);
    expect(screen.getByText('Frozen')).toBeTruthy();
    expect(screen.getByText('Reset to Current')).toBeTruthy();
  });

  it('shows the Upcoming chip on a future week', () => {
    render(<RosterWeekNavigation {...baseProps} week={7} />);
    expect(screen.getByText('Upcoming')).toBeTruthy();
  });

  it('steps the week with the prev / next controls', () => {
    const onWeekChange = jest.fn();
    render(
      <RosterWeekNavigation
        {...baseProps}
        week={5}
        onWeekChange={onWeekChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onWeekChange).toHaveBeenCalledWith(6);
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onWeekChange).toHaveBeenCalledWith(4);
  });

  it('does not step before week 1 or past the final week', () => {
    const onWeekChange = jest.fn();
    const { rerender } = render(
      <RosterWeekNavigation
        {...baseProps}
        week={1}
        currentWeek={1}
        onWeekChange={onWeekChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onWeekChange).not.toHaveBeenCalled();

    rerender(
      <RosterWeekNavigation
        {...baseProps}
        week={10}
        currentWeek={10}
        onWeekChange={onWeekChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onWeekChange).not.toHaveBeenCalled();
  });
});
