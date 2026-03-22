import type { Meta, StoryObj } from '@storybook/react';
import { NotificationBell } from './NotificationBell';

const mockUpdates = [
  { type: 'pick', data: { playerId: '1', teamId: 't1' } },
  { type: 'trade', data: { from: 't1', to: 't2' } },
  { type: 'chat', data: { message: 'Good pick!' } },
];

const meta: Meta<typeof NotificationBell> = {
  title: 'Features/Draft/NotificationBell',
  component: NotificationBell,
  parameters: {
    docs: {
      description: {
        component:
          'Notification bell button with badge count showing the number of unread draft updates.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithUpdates: Story = {
  args: {
    updates: mockUpdates,
    settings: { sound: true, vibration: true },
  },
};

export const NoUpdates: Story = {
  args: {
    updates: [],
    settings: { sound: false, vibration: false },
  },
};
