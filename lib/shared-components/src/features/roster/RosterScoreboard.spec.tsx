import React from 'react';
import { RosterScoreboard } from './RosterScoreboard';
import { fireEvent, render, screen } from '../../test-utils';

const noop = () => undefined;

const MY_TEAM = {
  name: 'Dead Ball Archive',
  score: 175.0,
  projected: 217.4,
  playersPlayed: 4,
  playersTotal: 10,
};
const OPPONENT = {
  name: 'Lambeau Leapers',
  score: 168.2,
  projected: 201.8,
  playersPlayed: 5,
  playersTotal: 10,
};

describe('RosterScoreboard', () => {
  it('renders the week title, Current chip, and both scoreline sides', () => {
    render(
      <RosterScoreboard
        week={11}
        currentWeek={11}
        totalWeeks={14}
        onWeekChange={noop}
        onResetToCurrent={noop}
        myTeam={MY_TEAM}
        opponent={OPPONENT}
      />,
    );
    expect(screen.getByText('Week 11')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Dead Ball Archive')).toBeTruthy();
    expect(screen.getByText('Lambeau Leapers')).toBeTruthy();
    expect(screen.getByText('175.0')).toBeTruthy();
    expect(screen.getByText('168.2')).toBeTruthy();
  });

  it('hides the scoreline when either side is missing', () => {
    render(
      <RosterScoreboard
        week={11}
        currentWeek={11}
        totalWeeks={14}
        onWeekChange={noop}
        onResetToCurrent={noop}
        myTeam={MY_TEAM}
        opponent={null}
      />,
    );
    expect(screen.getByText('Week 11')).toBeTruthy();
    expect(screen.queryByText('Dead Ball Archive')).toBeNull();
  });

  it('steps the week with the prev / next controls', () => {
    const onWeekChange = jest.fn<void, [number]>();
    render(
      <RosterScoreboard
        week={11}
        currentWeek={11}
        totalWeeks={14}
        onWeekChange={onWeekChange}
        onResetToCurrent={noop}
        myTeam={MY_TEAM}
        opponent={OPPONENT}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onWeekChange).toHaveBeenCalledWith(10);
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onWeekChange).toHaveBeenCalledWith(12);
  });

  it('shows the Frozen chip and Reset affordance on a past week', () => {
    const onResetToCurrent = jest.fn();
    render(
      <RosterScoreboard
        week={9}
        currentWeek={11}
        totalWeeks={14}
        onWeekChange={noop}
        onResetToCurrent={onResetToCurrent}
        myTeam={MY_TEAM}
        opponent={OPPONENT}
      />,
    );
    expect(screen.getByText('Frozen')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to current week' }),
    );
    expect(onResetToCurrent).toHaveBeenCalledTimes(1);
  });

  it('shows the Upcoming chip on a future week', () => {
    render(
      <RosterScoreboard
        week={12}
        currentWeek={11}
        totalWeeks={14}
        onWeekChange={noop}
        onResetToCurrent={noop}
        myTeam={MY_TEAM}
        opponent={OPPONENT}
      />,
    );
    expect(screen.getByText('Upcoming')).toBeTruthy();
  });
});
