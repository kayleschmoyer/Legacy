import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';
import { MatchupCard } from './MatchupCard';

const meta: Meta<typeof MatchupCard> = {
  title: 'Components/MatchupCard',
  component: MatchupCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  args: {
    status: 'live',
    week: 'WK 14',
    dateTime: 'Sun 1:05 PM',
    away: {
      name: 'Cooperstown Society',
      record: '8-4 · W3',
      score: 127.5,
    },
    home: {
      name: 'Brooklyn Bridegrooms',
      record: '5-7 · L1',
      score: 112.3,
    },
    footerLeft: '6 games remaining',
    footerRight: '15.2 pt lead',
  },
};

export const Final: Story = {
  args: {
    status: 'final',
    week: 'WK 13',
    dateTime: 'Apr 5',
    away: {
      name: 'Negro League Stars',
      record: '7-5',
      score: 98.1,
    },
    home: {
      name: 'Iron Horse',
      record: '6-6',
      score: 141.7,
    },
    footerLeft: 'Margin: 43.6',
    footerRight: 'W',
    footerRightSuccess: true,
  },
};

export const Pre: Story = {
  args: {
    status: 'pre',
    week: 'WK 15',
    dateTime: 'Sun 1:05 PM',
    away: {
      name: 'Dead Ball Dynasty',
      record: '9-3',
    },
    home: {
      name: 'Cooperstown',
      record: '8-4',
    },
    projection: 'PROJ 121.4 vs 118.6',
    footerLeft: 'Lineups lock 1:00 PM ET',
    footerRight: '52% win prob',
  },
};

export const Bye: Story = {
  args: {
    status: 'bye',
    week: 'WK 16',
    away: {
      name: 'Brooklyn Bridegrooms',
      record: '5-7',
    },
    home: { name: '' },
    noOpponent: true,
    footerLeft: 'Resumes Wk 17',
    footerRight: '—',
  },
};

export const Stack: Story = {
  render: () => (
    <YStack gap="$3" width={440}>
      <MatchupCard
        status="live"
        week="WK 14"
        dateTime="Sun 1:05 PM"
        away={{ name: 'Cooperstown Society', record: '8-4 · W3', score: 127.5 }}
        home={{
          name: 'Brooklyn Bridegrooms',
          record: '5-7 · L1',
          score: 112.3,
        }}
        footerLeft="6 games remaining"
        footerRight="15.2 pt lead"
      />
      <MatchupCard
        status="final"
        week="WK 13"
        dateTime="Apr 5"
        away={{ name: 'Negro League Stars', record: '7-5', score: 98.1 }}
        home={{ name: 'Iron Horse', record: '6-6', score: 141.7 }}
        footerLeft="Margin: 43.6"
        footerRight="W"
        footerRightSuccess
      />
      <MatchupCard
        status="pre"
        week="WK 15"
        dateTime="Sun 1:05 PM"
        away={{ name: 'Dead Ball Dynasty', record: '9-3' }}
        home={{ name: 'Cooperstown', record: '8-4' }}
        projection="PROJ 121.4 vs 118.6"
        footerLeft="Lineups lock 1:00 PM ET"
        footerRight="52% win prob"
      />
      <MatchupCard
        status="bye"
        week="WK 16"
        away={{ name: 'Brooklyn Bridegrooms', record: '5-7' }}
        home={{ name: '' }}
        noOpponent
        footerLeft="Resumes Wk 17"
        footerRight="—"
      />
    </YStack>
  ),
};
