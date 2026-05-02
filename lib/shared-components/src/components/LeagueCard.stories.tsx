import type { Meta, StoryObj } from '@storybook/react';
import { XStack } from 'tamagui';
import { LeagueCard } from './LeagueCard';

const meta: Meta<typeof LeagueCard> = {
  title: 'Components/LeagueCard',
  component: LeagueCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const M = (...names: string[]) => names.map((n) => ({ name: n }));

export const Active: Story = {
  args: {
    name: 'Cooperstown Society',
    meta: '12 teams · Week 14/22',
    status: { label: 'Active', variant: 'active' },
    members: M('Wee Willie', 'Babe R', 'Cy Young', 'Ty Cobb', 'Honus W'),
    footer: 'Next matchup · Sat 1:05 PM',
  },
};

export const DraftLive: Story = {
  args: {
    name: 'Brooklyn Bridegrooms',
    meta: '10 teams · Round 4 of 22',
    status: { label: 'Draft Live', variant: 'draftLive' },
    members: M('Jackie R', 'Pee Wee', 'Duke S', 'Roy C'),
    footer: 'On the clock · 0:42',
  },
};

export const PreDraft: Story = {
  args: {
    name: 'Dead Ball Dynasty',
    meta: '8 teams · Pre-draft',
    status: { label: 'Pre-Draft', variant: 'preDraft' },
    members: M('Christy M', 'Honus W', 'Walter J'),
    footer: 'Draft: Fri Apr 12 · 8:00 PM',
  },
};

export const Premium: Story = {
  args: {
    name: 'Negro Leagues Stars',
    meta: '12 teams · Champions division',
    status: { label: 'Coming Soon', variant: 'comingSoon' },
    members: M('Satchel P', 'Josh G', 'Cool Papa', 'Buck L'),
    premium: true,
    footer: 'Premium league · 2025 season',
  },
};

export const Grid: Story = {
  render: () => (
    <XStack gap="$3" flexWrap="wrap" maxWidth={760}>
      <LeagueCard
        name="Cooperstown Society"
        meta="12 teams · Week 14/22"
        status={{ label: 'Active', variant: 'active' }}
        members={M('A', 'B', 'C', 'D')}
      />
      <LeagueCard
        name="Brooklyn Bridegrooms"
        meta="10 teams · Round 4"
        status={{ label: 'Draft Live', variant: 'draftLive' }}
        members={M('A', 'B', 'C', 'D', 'E', 'F')}
      />
    </XStack>
  ),
};
