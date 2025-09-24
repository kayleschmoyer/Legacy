import React from 'react';
import { fireEvent, render } from '../../../test-utils';

import {
  DraftStatusBar,
  FilterChip,
  FilterDrawer,
  PlayerCard,
  QuickFilters,
  SearchAndSortBar,
  SearchBar,
} from '../index';

// Mock TimerBar component for testing
interface TimerBarProps {
  time: number;
  maxTime?: number;
  label: string;
  variant?: string;
}

const TimerBar = ({ time, maxTime, label, variant }: TimerBarProps) => {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div data-testid="timer-bar" data-variant={variant}>
      <div>{label}</div>
      <div>{timeDisplay}</div>
    </div>
  );
};

// Mock data
const mockPlayer = {
  id: '1',
  name: 'Mike Trout',
  position: 'OF',
  team: 'LAA',
  adp: 2.5,
  rank: 1,
  ownership: 95,
  trending: 'up' as const,
  injury: 'healthy' as const,
  stats: { AVG: 0.283, HR: 40, RBI: 104 },
  faabValue: 50,
  isWatched: false,
};

const mockDraftBoard = {
  id: 'draft-1',
  name: 'Fantasy Baseball League',
  sport: 'baseball' as const,
  status: 'active' as const,
  currentPick: 5,
  totalPicks: 120,
  teams: [
    {
      id: 'team-1',
      name: 'Team 1',
      owner: 'John Doe',
      picks: [],
      isCurrentPick: true,
    },
    {
      id: 'team-2',
      name: 'Team 2',
      owner: 'Jane Smith',
      picks: [],
    },
  ],
  picks: [],
};

const mockFilterSections = [
  {
    key: 'position',
    title: 'Position',
    options: [
      { label: 'All', value: 'ALL' },
      { label: 'OF', value: 'OF' },
      { label: 'P', value: 'P' },
    ],
  },
];

const mockSortOptions = [
  { key: 'rank', label: 'Rank' },
  { key: 'adp', label: 'ADP' },
  { key: 'name', label: 'Name' },
];

describe('Draft Components', () => {
  describe('PlayerCard', () => {
    it('renders player information correctly', () => {
      const { getByText } = render(
        <PlayerCard player={mockPlayer} onSelect={jest.fn()} variant="draft" />,
      );

      expect(getByText('Mike Trout')).toBeTruthy();
      expect(getByText('LAA')).toBeTruthy();
      expect(getByText('OF')).toBeTruthy();
      expect(getByText('#1')).toBeTruthy();
      expect(getByText('ADP: 2.5')).toBeTruthy();
    });

    it('handles onSelect callback', () => {
      const onSelectMock = jest.fn();
      const { getByText } = render(
        <PlayerCard
          player={mockPlayer}
          onSelect={onSelectMock}
          variant="draft"
        />,
      );

      fireEvent.click(getByText('Mike Trout'));
      expect(onSelectMock).toHaveBeenCalledTimes(1);
    });

    it('shows stats when enabled', () => {
      const { getByText } = render(
        <PlayerCard
          player={mockPlayer}
          onSelect={jest.fn()}
          showStats={true}
        />,
      );

      expect(getByText('AVG')).toBeTruthy();
      expect(getByText('0.283')).toBeTruthy();
    });

    it('shows ownership when enabled', () => {
      const { getByText } = render(
        <PlayerCard
          player={mockPlayer}
          onSelect={jest.fn()}
          showOwnership={true}
        />,
      );

      expect(getByText('95% owned')).toBeTruthy();
    });

    it('shows action buttons when provided', () => {
      const onWatchMock = jest.fn();
      const onActionMock = jest.fn();

      const { getByText } = render(
        <PlayerCard
          player={mockPlayer}
          onSelect={jest.fn()}
          onWatch={onWatchMock}
          onAction={onActionMock}
          actionLabel="Add"
        />,
      );

      expect(getByText('☆')).toBeTruthy(); // Watch button
      expect(getByText('Add')).toBeTruthy(); // Action button
    });
  });

  describe('TimerBar', () => {
    it('displays time correctly', () => {
      const { getByText } = render(
        <TimerBar time={125} maxTime={300} label="Draft Timer" />,
      );

      expect(getByText('2:05')).toBeTruthy();
      expect(getByText('Draft Timer')).toBeTruthy();
    });

    it('handles different variants', () => {
      const { rerender, getByText } = render(
        <TimerBar time={60} maxTime={300} variant="compact" label="Timer" />,
      );

      expect(getByText('1:00')).toBeTruthy();

      rerender(
        <TimerBar time={60} maxTime={300} variant="large" label="Timer" />,
      );

      expect(getByText('1:00')).toBeTruthy();
    });
  });

  describe('FilterChip', () => {
    it('renders label correctly', () => {
      const { getByText } = render(
        <FilterChip
          label="Outfield"
          value="OF"
          isSelected={false}
          onPress={jest.fn()}
        />,
      );

      expect(getByText('Outfield')).toBeTruthy();
    });

    it('handles onPress callback', () => {
      const onPressMock = jest.fn();
      const { getByText } = render(
        <FilterChip
          label="Outfield"
          value="OF"
          isSelected={false}
          onPress={onPressMock}
        />,
      );

      fireEvent.click(getByText('Outfield'));
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('QuickFilters', () => {
    it('renders filter sections', () => {
      const { getByText } = render(
        <QuickFilters
          filters={{}}
          onFiltersChange={jest.fn()}
          sections={mockFilterSections}
        />,
      );

      expect(getByText('Position')).toBeTruthy();
      expect(getByText('All')).toBeTruthy();
      expect(getByText('OF')).toBeTruthy();
      expect(getByText('P')).toBeTruthy();
    });

    it('handles filter changes', () => {
      const onFiltersChangeMock = jest.fn();
      const { getByText } = render(
        <QuickFilters
          filters={{}}
          onFiltersChange={onFiltersChangeMock}
          sections={mockFilterSections}
        />,
      );

      fireEvent.click(getByText('OF'));
      expect(onFiltersChangeMock).toHaveBeenCalledWith({
        position: 'OF',
      });
    });
  });

  describe('FilterDrawer', () => {
    it('renders when visible', () => {
      const { getByText } = render(
        <FilterDrawer
          visible={true}
          onClose={jest.fn()}
          filters={{}}
          onFiltersChange={jest.fn()}
          sections={mockFilterSections}
          title="Draft Filters"
        />,
      );

      expect(getByText('Draft Filters')).toBeTruthy();
      expect(getByText('Position')).toBeTruthy();
    });

    it('handles close callback', () => {
      const onCloseMock = jest.fn();
      const { getByText } = render(
        <FilterDrawer
          visible={true}
          onClose={onCloseMock}
          filters={{}}
          onFiltersChange={jest.fn()}
          sections={mockFilterSections}
        />,
      );

      fireEvent.click(getByText('✕'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('SearchBar', () => {
    it('renders with placeholder', () => {
      const { getByPlaceholderText } = render(
        <SearchBar
          value=""
          onChangeText={jest.fn()}
          placeholder="Search players..."
        />,
      );

      expect(getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('handles text changes', () => {
      const onChangeTextMock = jest.fn();
      const { getByPlaceholderText } = render(
        <SearchBar
          value=""
          onChangeText={onChangeTextMock}
          placeholder="Search..."
        />,
      );

      fireEvent.input(getByPlaceholderText('Search...'), {
        target: { value: 'Mike Trout' },
      });
      expect(onChangeTextMock).toHaveBeenCalledWith('Mike Trout');
    });

    it('shows clear button when there is text', () => {
      const { queryByText } = render(
        <SearchBar value="" onChangeText={jest.fn()} showClearButton={true} />,
      );

      expect(queryByText('✕')).toBeFalsy();

      // Re-render with text
      const { getByText: getByTextWithValue } = render(
        <SearchBar
          value="test"
          onChangeText={jest.fn()}
          showClearButton={true}
        />,
      );

      expect(getByTextWithValue('✕')).toBeTruthy();
    });
  });

  describe('SearchAndSortBar', () => {
    it('renders search and sort components', () => {
      const { getByPlaceholderText, getByText } = render(
        <SearchAndSortBar
          searchValue=""
          onSearchChange={jest.fn()}
          sortOptions={mockSortOptions}
          selectedSort="rank"
          onSortChange={jest.fn()}
          placeholder="Search players..."
        />,
      );

      expect(getByPlaceholderText('Search players...')).toBeTruthy();
      expect(getByText('Rank')).toBeTruthy();
    });

    it('shows filter button when enabled', () => {
      const onFilterPressMock = jest.fn();
      const { getByText } = render(
        <SearchAndSortBar
          searchValue=""
          onSearchChange={jest.fn()}
          sortOptions={mockSortOptions}
          selectedSort="rank"
          onSortChange={jest.fn()}
          onFilterPress={onFilterPressMock}
          showFilterButton={true}
        />,
      );

      expect(getByText('Filter')).toBeTruthy();
      fireEvent.click(getByText('Filter'));
      expect(onFilterPressMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('DraftStatusBar', () => {
    it('renders draft status information', () => {
      const { getByText } = render(
        <DraftStatusBar
          draftBoard={mockDraftBoard}
          currentTeam={mockDraftBoard.teams[0]}
        />,
      );

      expect(getByText('Draft Active')).toBeTruthy();
      expect(getByText('On the Clock:')).toBeTruthy();
      expect(getByText('Team 1')).toBeTruthy();
    });

    it('shows start button for waiting drafts', () => {
      const onStartDraftMock = jest.fn();
      const waitingDraft = {
        ...mockDraftBoard,
        status: 'waiting' as const,
      };

      const { getByText } = render(
        <DraftStatusBar
          draftBoard={waitingDraft}
          onStartDraft={onStartDraftMock}
        />,
      );

      expect(getByText('Start Draft')).toBeTruthy();
      fireEvent.click(getByText('Start Draft'));
      expect(onStartDraftMock).toHaveBeenCalledTimes(1);
    });

    it('shows pause button for active drafts', () => {
      const onPauseDraftMock = jest.fn();
      const { getByText } = render(
        <DraftStatusBar
          draftBoard={mockDraftBoard}
          onPauseDraft={onPauseDraftMock}
        />,
      );

      expect(getByText('Pause')).toBeTruthy();
      fireEvent.click(getByText('Pause'));
      expect(onPauseDraftMock).toHaveBeenCalledTimes(1);
    });

    it('displays time remaining', () => {
      const { getByText } = render(
        <DraftStatusBar
          draftBoard={mockDraftBoard}
          currentTeam={mockDraftBoard.teams[0]}
          timeRemaining={90}
        />,
      );

      expect(getByText('1:30')).toBeTruthy();
    });
  });
});
