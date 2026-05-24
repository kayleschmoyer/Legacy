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
        type: 'draft',
        title: 'Dead Ball Dynasty draft',
        body: [
          { bold: 'Dead Ball Dynasty' },
          ' draft starts in 1 hour. Round 1, pick #3.',
        ],
        time: 'just now',
        unread: true,
      },
      {
        id: '2',
        type: 'trade',
        title: 'Trade offer from Iron Horse',
        body: [
          'Trade offer from ',
          { bold: 'Iron Horse' },
          ': Lou Gehrig + 2nd pick for Babe Ruth.',
        ],
        time: '12 min',
        unread: true,
      },
      {
        id: '3',
        type: 'matchup',
        title: 'Matchup lead — Week 14',
        body: [
          'You took the lead in Week 14: ',
          { bold: '127.5' },
          ' vs 112.3',
        ],
        time: '2h',
        unread: true,
      },
      {
        id: '4',
        type: 'system',
        title: 'Trade deadline moved',
        body: 'Trade deadline moved to Friday Apr 19 at 8:00 PM ET.',
        time: 'yesterday',
      },
      {
        id: '5',
        type: 'trade',
        title: 'Trade accepted',
        body: [
          'Trade with ',
          { bold: 'Cooperstown' },
          ' accepted. Roster updated.',
        ],
        time: '2d',
      },
    ],
  },
};

export const CountBadge: Story = {
  args: {
    items: Array.from({ length: 101 }, (_, i) => ({
      id: String(i + 1),
      type: 'system' as const,
      title: `Notification ${i + 1}`,
      time: `${i + 1}m`,
      unread: true,
    })),
  },
};

export const Empty: Story = {
  args: { items: [] },
};
