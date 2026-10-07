import React from 'react';
import { useMutation as apolloUseMutation } from '@apollo/client/react';
import { DraftQueueTab } from './DraftQueueTab';
import type { DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(() => [jest.fn(), { loading: false }]),
}));

jest.mock('@legacy-sports/graphql', () => ({
  ReorderDraftQueue: 'ReorderDraftQueue',
}));

const useMutationMock = apolloUseMutation as unknown as jest.Mock;

function makeEntry(
  playerId: number,
  firstName: string,
  lastName: string,
): {
  id: number;
  draftId: number;
  teamId: number;
  playerId: number;
  priority: number;
  player: { id: number; firstName: string; lastName: string };
} {
  return {
    id: playerId,
    draftId: 1,
    teamId: 1,
    playerId,
    priority: playerId,
    player: { id: playerId, firstName, lastName },
  };
}

const STATS_LOOKUP = new Map<number, DraftPlayer>();

beforeEach(() => {
  useMutationMock.mockReset();
  useMutationMock.mockReturnValue([jest.fn(), { loading: false }]);
});

describe('DraftQueueTab', () => {
  it('shows the empty-state card and a zero count when the queue is empty', () => {
    const { getByText } = render(
      <DraftQueueTab
        draftId={1}
        entries={[]}
        statsLookup={STATS_LOOKUP}
        sport="football"
        onRemove={jest.fn()}
      />,
    );

    expect(getByText('My Queue · 0')).toBeTruthy();
    expect(getByText(/Star players from the list/)).toBeTruthy();
  });

  it('keeps rendering through empty -> populated -> empty queue transitions (LS-10633)', () => {
    const props = {
      draftId: 1,
      statsLookup: STATS_LOOKUP,
      sport: 'football' as const,
      onRemove: jest.fn(),
    };
    const { getByTestId, queryByTestId, getByText, rerender } = render(
      <DraftQueueTab {...props} entries={[]} />,
    );
    expect(getByTestId('draft-queue-empty')).toBeTruthy();

    rerender(
      <DraftQueueTab
        {...props}
        entries={[makeEntry(1, 'Justin', 'Jefferson')]}
      />,
    );
    expect(queryByTestId('draft-queue-empty')).toBeNull();
    expect(getByText('Justin Jefferson')).toBeTruthy();

    rerender(<DraftQueueTab {...props} entries={[]} />);
    expect(getByTestId('draft-queue-empty')).toBeTruthy();
    expect(getByText('My Queue · 0')).toBeTruthy();
  });

  it('renders one row per queue entry with rank and name', () => {
    const entries = [
      makeEntry(1, 'Justin', 'Jefferson'),
      makeEntry(2, 'CeeDee', 'Lamb'),
    ];
    const { getByText } = render(
      <DraftQueueTab
        draftId={1}
        entries={entries}
        statsLookup={STATS_LOOKUP}
        sport="football"
        onRemove={jest.fn()}
      />,
    );

    expect(getByText('My Queue · 2')).toBeTruthy();
    expect(getByText('Justin Jefferson')).toBeTruthy();
    expect(getByText('CeeDee Lamb')).toBeTruthy();
  });

  it('disables the up-arrow on the first row and the down-arrow on the last row', () => {
    const entries = [
      makeEntry(1, 'Justin', 'Jefferson'),
      makeEntry(2, 'CeeDee', 'Lamb'),
    ];
    const { getByLabelText } = render(
      <DraftQueueTab
        draftId={1}
        entries={entries}
        statsLookup={STATS_LOOKUP}
        sport="football"
        onRemove={jest.fn()}
      />,
    );

    expect(
      getByLabelText('Move Justin Jefferson up').getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      getByLabelText('Move CeeDee Lamb down').getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('calls onRemove with the player id when the remove control is tapped', () => {
    const entries = [makeEntry(7, 'Justin', 'Jefferson')];
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <DraftQueueTab
        draftId={1}
        entries={entries}
        statsLookup={STATS_LOOKUP}
        sport="football"
        onRemove={onRemove}
      />,
    );

    fireEvent.click(getByLabelText('Remove Justin Jefferson from queue'));
    expect(onRemove).toHaveBeenCalledWith(7);
  });

  it('swaps adjacent entries and persists the new order via ReorderDraftQueue', () => {
    const reorderQueue = jest.fn().mockResolvedValue({});
    useMutationMock.mockReturnValue([reorderQueue, { loading: false }]);
    const entries = [
      makeEntry(1, 'Justin', 'Jefferson'),
      makeEntry(2, 'CeeDee', 'Lamb'),
    ];
    const { getByLabelText } = render(
      <DraftQueueTab
        draftId={1}
        entries={entries}
        statsLookup={STATS_LOOKUP}
        sport="football"
        onRemove={jest.fn()}
      />,
    );

    fireEvent.click(getByLabelText('Move CeeDee Lamb up'));

    expect(reorderQueue).toHaveBeenCalledWith({
      variables: { draftId: 1, playerIds: [2, 1] },
    });
  });
});
