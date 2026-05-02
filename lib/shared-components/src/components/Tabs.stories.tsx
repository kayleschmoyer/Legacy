import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { Tabs } from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function UnderlineDemo(): React.JSX.Element {
  const [v, set] = useState('matchups');
  return (
    <YStack width={520} gap="$3">
      <Tabs
        value={v}
        onValueChange={set}
        items={[
          { value: 'matchups', label: 'Matchups', count: 6 },
          { value: 'standings', label: 'Standings' },
          { value: 'rosters', label: 'Rosters', count: 12 },
          { value: 'transactions', label: 'Transactions', count: 24 },
          { value: 'history', label: 'History', disabled: true },
        ]}
      />
      <Text fontFamily="$body" color="$textMuted">
        Active: {v}
      </Text>
    </YStack>
  );
}

function PillDemo(): React.JSX.Element {
  const [v, set] = useState('week');
  return (
    <Tabs
      variant="pill"
      value={v}
      onValueChange={set}
      items={[
        { value: 'week', label: 'Week' },
        { value: 'season', label: 'Season' },
        { value: 'allTime', label: 'All-Time' },
      ]}
    />
  );
}

export const Underline: Story = { render: () => <UnderlineDemo /> };
export const Pill: Story = { render: () => <PillDemo /> };
