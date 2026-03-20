import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import {
  SearchBar as DraftSearchBar,
  SearchAndSortBar,
  SearchWithSuggestions,
  SortSelector,
} from './SearchComponents';
import { ConditionalProviders } from '../../ConditionalProviders';

const sampleSuggestions = [
  { id: '1', text: 'Mike Trout', subtitle: 'CF - LAA', type: 'player' },
  { id: '2', text: 'Shohei Ohtani', subtitle: 'DH - LAD', type: 'player' },
  { id: '3', text: 'Mookie Betts', subtitle: 'RF - LAD', type: 'player' },
  { id: '4', text: 'Aaron Judge', subtitle: 'RF - NYY', type: 'player' },
];

const sampleSortOptions = [
  { key: 'name', label: 'Name' },
  { key: 'avg', label: 'AVG', direction: 'desc' as const },
  { key: 'hr', label: 'HR', direction: 'desc' as const },
  { key: 'rbi', label: 'RBI', direction: 'desc' as const },
];

// --- DraftSearchBar ---
// NOTE: This file intentionally groups stories for DraftSearchBar, SortSelector,
// SearchWithSuggestions, and SearchAndSortBar under a single CSF meta. These
// components are tightly coupled search primitives exported from the same module
// and are easier to discover together in Storybook's sidebar.

const searchBarMeta: Meta<typeof DraftSearchBar> = {
  title: 'Features/Draft/SearchComponents/DraftSearchBar',
  component: DraftSearchBar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Search input with variants (default, compact, prominent), optional search icon, clear button, and auto-focus.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ConditionalProviders>
        <div style={{ minWidth: '400px' }}>
          <Story />
        </div>
      </ConditionalProviders>
    ),
  ],
};

export default searchBarMeta;
type SearchBarStory = StoryObj<typeof searchBarMeta>;

export const Default: SearchBarStory = {
  args: {
    value: '',
    onChangeText: fn(),
    placeholder: 'Search players...',
  },
};

export const WithValue: SearchBarStory = {
  args: {
    value: 'Mike Trout',
    onChangeText: fn(),
  },
};

export const Compact: SearchBarStory = {
  args: {
    value: '',
    onChangeText: fn(),
    variant: 'compact',
    placeholder: 'Quick search...',
  },
};

export const Prominent: SearchBarStory = {
  args: {
    value: '',
    onChangeText: fn(),
    variant: 'prominent',
    placeholder: 'Search the draft board...',
  },
};

export const WithClearButton: SearchBarStory = {
  args: {
    value: 'Aaron Judge',
    onChangeText: fn(),
    showClearButton: true,
  },
};

// --- SortSelector ---

export const SortSelectorChips: StoryObj<typeof SortSelector> = {
  render: () => (
    <SortSelector
      options={sampleSortOptions}
      selectedSort="hr"
      onSortChange={fn()}
      variant="chips"
      label="Sort by"
    />
  ),
};

export const SortSelectorTabs: StoryObj<typeof SortSelector> = {
  render: () => (
    <SortSelector
      options={sampleSortOptions}
      selectedSort="avg"
      onSortChange={fn()}
      variant="tabs"
    />
  ),
};

// --- SearchWithSuggestions ---

export const WithSuggestions: StoryObj<typeof SearchWithSuggestions> = {
  render: () => (
    <SearchWithSuggestions
      value="Mi"
      onChangeText={fn()}
      suggestions={sampleSuggestions}
      onSuggestionPress={fn()}
      showSuggestions={true}
      maxSuggestions={4}
      placeholder="Search players..."
    />
  ),
};

// --- SearchAndSortBar ---

export const CombinedSearchAndSort: StoryObj<typeof SearchAndSortBar> = {
  render: () => (
    <SearchAndSortBar
      searchValue=""
      onSearchChange={fn()}
      sortOptions={sampleSortOptions}
      selectedSort="hr"
      onSortChange={fn()}
      onFilterPress={fn()}
      showFilterButton={true}
      placeholder="Search draft players..."
    />
  ),
};
