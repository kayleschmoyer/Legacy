import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { YStack } from 'tamagui';
import { SearchBar } from './SearchBar';

const meta: Meta<typeof SearchBar> = {
  title: 'Components/SearchBar',
  component: SearchBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <YStack maxWidth={680} padding="$4">
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: '',
    onChangeText: fn(),
    placeholder: 'Search players, teams, eras…',
  },
};

export const FocusedWithFilter: Story = {
  args: {
    value: 'ruth',
    onChangeText: fn(),
    filterCount: 2,
    onFilterPress: fn(),
  },
};

export const WithFilterChips: Story = {
  args: {
    value: '',
    onChangeText: fn(),
    chips: [
      { id: 'pitchers', label: 'Pitchers ×', active: true, onPress: fn() },
      { id: '1920s', label: '1920s ×', active: true, onPress: fn() },
      { id: 'era', label: '+ Era', onPress: fn() },
      { id: 'team', label: '+ Team', onPress: fn() },
      { id: 'reset', label: 'Reset', onPress: fn() },
    ],
  },
};

export const WithResults: Story = {
  args: {
    value: 'ruth',
    onChangeText: fn(),
    results: [
      {
        id: '1',
        initials: 'BR',
        name: 'Babe Ruth',
        meta: '1927 · NYY · 60 HR',
        onPress: fn(),
      },
      {
        id: '2',
        initials: 'CR',
        name: 'Charlie Ruth',
        meta: '1893 · LOU · 12 W',
        onPress: fn(),
      },
    ],
    seeAllLabel: 'See all 12 results',
    onSeeAll: fn(),
  },
};

export const AllStates: Story = {
  render: () => (
    <YStack gap={32} maxWidth={680}>
      <YStack gap={6}>
        <SearchBar
          value=""
          onChangeText={fn()}
          placeholder="Search players, teams, eras…"
        />
      </YStack>

      <YStack gap={6}>
        <SearchBar
          value="ruth"
          onChangeText={fn()}
          filterCount={2}
          onFilterPress={fn()}
        />
      </YStack>

      <YStack gap={6}>
        <SearchBar
          value=""
          onChangeText={fn()}
          chips={[
            {
              id: 'pitchers',
              label: 'Pitchers ×',
              active: true,
              onPress: fn(),
            },
            { id: '1920s', label: '1920s ×', active: true, onPress: fn() },
            { id: 'era', label: '+ Era', onPress: fn() },
            { id: 'team', label: '+ Team', onPress: fn() },
            { id: 'reset', label: 'Reset', onPress: fn() },
          ]}
        />
      </YStack>

      <YStack gap={6}>
        <SearchBar
          value="ruth"
          onChangeText={fn()}
          results={[
            {
              id: '1',
              initials: 'BR',
              name: 'Babe Ruth',
              meta: '1927 · NYY · 60 HR',
              onPress: fn(),
            },
            {
              id: '2',
              initials: 'CR',
              name: 'Charlie Ruth',
              meta: '1893 · LOU · 12 W',
              onPress: fn(),
            },
          ]}
          seeAllLabel="See all 12 results"
          onSeeAll={fn()}
        />
      </YStack>
    </YStack>
  ),
};
