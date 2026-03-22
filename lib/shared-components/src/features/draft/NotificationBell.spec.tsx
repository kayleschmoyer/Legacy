import React from 'react';
import { NotificationBell } from './NotificationBell';
import { render } from '../../test-utils';

const mockUpdates = [
  { type: 'pick', data: { playerId: '1', teamId: 't1' } },
  { type: 'trade', data: { from: 't1', to: 't2' } },
  { type: 'chat', data: { message: 'Good pick!' } },
];

describe('NotificationBell', () => {
  it('renders the bell', () => {
    const { getByRole } = render(
      <NotificationBell
        updates={mockUpdates}
        settings={{ sound: true, vibration: true }}
      />,
    );

    expect(getByRole('img', { name: 'notifications' })).toBeTruthy();
  });

  it('shows badge with update count when there are updates', () => {
    const { getByText } = render(
      <NotificationBell
        updates={mockUpdates}
        settings={{ sound: true, vibration: true }}
      />,
    );

    expect(getByText('3')).toBeTruthy();
  });

  it('does not show badge when there are no updates', () => {
    const { queryByTestId } = render(
      <NotificationBell
        updates={[]}
        settings={{ sound: false, vibration: false }}
      />,
    );

    expect(queryByTestId('BadgeIcon')).toBeFalsy();
  });
});
