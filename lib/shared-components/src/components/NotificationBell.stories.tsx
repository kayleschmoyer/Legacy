import type { Meta, StoryObj } from '@storybook/react';
import { NotificationBell } from './NotificationBell';

const meta: Meta<typeof NotificationBell> = {
  title: 'Components/NotificationBell',
  component: NotificationBell,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithUnread: Story = {
  args: {
    items: [
      {
        id: '1',
        title: 'You are on the clock',
        body: 'Pick 4.07 — 1:42 remaining',
        time: 'now',
        unread: true,
      },
      {
        id: '2',
        title: 'Trade offer accepted',
        body: 'Babe Ruth → Brooklyn for Cy Young',
        time: '12m',
        unread: true,
      },
      {
        id: '3',
        title: 'Matchup score updated',
        body: 'NYY 87.4 — BOS 102.6 (Top 7th)',
        time: '1h',
      },
      { id: '4', title: 'Weekly recap is ready', time: 'Mon' },
    ],
  },
};

export const Empty: Story = {
  args: { items: [] },
};
