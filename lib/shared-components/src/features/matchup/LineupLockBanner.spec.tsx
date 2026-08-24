import React from 'react';
import { screen } from '@testing-library/react';
import { LineupLockBanner } from './LineupLockBanner';
import { render } from '../../test-utils';

describe('LineupLockBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when the matchup is not scheduled', () => {
    render(
      <LineupLockBanner
        matchup={{
          status: 'in_progress',
          lockTime: '2026-08-24T13:00:00.000Z',
        }}
      />,
    );
    expect(screen.queryByTestId('lineup-lock-banner')).toBeNull();
  });

  it('renders nothing when there is no lockTime', () => {
    render(
      <LineupLockBanner matchup={{ status: 'scheduled', lockTime: null }} />,
    );
    expect(screen.queryByTestId('lineup-lock-banner')).toBeNull();
  });

  it('renders nothing when matchup is null/undefined', () => {
    render(<LineupLockBanner matchup={null} />);
    expect(screen.queryByTestId('lineup-lock-banner')).toBeNull();
  });

  it('shows a "Lineup locks in Xh Ym" countdown for a scheduled matchup', () => {
    // "10am local for 1pm ET kickoffs" from the ticket — expressed here as
    // the absolute UTC instant the server would compute either way.
    render(
      <LineupLockBanner
        matchup={{
          status: 'scheduled',
          lockTime: '2026-08-24T12:14:00.000Z',
        }}
      />,
    );
    expect(screen.getByText('Lineup locks in 2h 14m')).toBeTruthy();
  });
});
