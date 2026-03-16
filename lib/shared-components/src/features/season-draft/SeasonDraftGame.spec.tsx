import React from 'react';
import { SeasonDraftGame } from './SeasonDraftGame';
import {
  useCancelSeasonDraftGameMutation,
  useGetSeasonDraftGamePlayerOptionsLazyQuery,
  useGetSeasonDraftGameQuery,
  useGetSeasonDraftGameStatValueLazyQuery,
  useMakeSeasonDraftPickMutation,
  useSearchPlayersForDraftLazyQuery,
  useStartSeasonDraftGameMutation,
  useTriggerSeasonDraftStatLoadingMutation,
} from '../../api/db/graphql.generated';
import { useWebSocket } from '../../hooks/useWebSocket';
import { fireEvent, render, waitFor } from '../../test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCancelMutation = jest.fn();
const mockStartMutation = jest.fn();
const mockMakePickMutation = jest.fn();
const mockTriggerStatMutation = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue({});

jest.mock('../../api/db/graphql.generated');
jest.mock('../../hooks/useWebSocket');

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGameState = {
  id: 1,
  name: 'Test Draft',
  status: 'drafting' as const,
  currentTurn: 1,
  createdBy: 1,
  statKey: 'HR',
  gameMode: 'season' as const,
  playerType: 'hitter' as const,
  players: [
    {
      id: 1,
      userId: 1,
      playerName: 'Player One',
      draftOrder: 1,
      totalScore: 0,
      roster: [],
    },
  ],
  picks: [],
};

function setupDefaultMocks() {
  jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
    data: { seasonDraftGame: mockGameState },
    loading: false,
    refetch: mockRefetch,
  } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);
  jest
    .mocked(useCancelSeasonDraftGameMutation)
    .mockReturnValue([mockCancelMutation] as unknown as ReturnType<
      typeof useCancelSeasonDraftGameMutation
    >);
  jest
    .mocked(useMakeSeasonDraftPickMutation)
    .mockReturnValue([mockMakePickMutation] as unknown as ReturnType<
      typeof useMakeSeasonDraftPickMutation
    >);
  jest
    .mocked(useTriggerSeasonDraftStatLoadingMutation)
    .mockReturnValue([mockTriggerStatMutation] as unknown as ReturnType<
      typeof useTriggerSeasonDraftStatLoadingMutation
    >);
  jest
    .mocked(useStartSeasonDraftGameMutation)
    .mockReturnValue([mockStartMutation] as unknown as ReturnType<
      typeof useStartSeasonDraftGameMutation
    >);
  jest
    .mocked(useSearchPlayersForDraftLazyQuery)
    .mockReturnValue([jest.fn(), { data: null }] as unknown as ReturnType<
      typeof useSearchPlayersForDraftLazyQuery
    >);
  jest
    .mocked(useGetSeasonDraftGameStatValueLazyQuery)
    .mockReturnValue([jest.fn(), { data: null }] as unknown as ReturnType<
      typeof useGetSeasonDraftGameStatValueLazyQuery
    >);
  jest
    .mocked(useGetSeasonDraftGamePlayerOptionsLazyQuery)
    .mockReturnValue([jest.fn(), { data: null }] as unknown as ReturnType<
      typeof useGetSeasonDraftGamePlayerOptionsLazyQuery
    >);
  jest
    .mocked(useWebSocket)
    .mockReturnValue(undefined as unknown as ReturnType<typeof useWebSocket>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SeasonDraftGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('opens the cancel confirmation dialog when Cancel Game is clicked', async () => {
    const { getByText, queryByText } = render(
      <SeasonDraftGame gameId={1} currentUserId={1} />,
    );

    // Dialog should not be visible initially
    expect(queryByText(/Are you sure you want to cancel this game/)).toBeNull();

    // Click Cancel Game button
    fireEvent.click(getByText('Cancel Game'));

    // Dialog should now be visible
    await waitFor(() => {
      expect(
        getByText(/Are you sure you want to cancel this game/),
      ).toBeTruthy();
    });
  });

  it('calls onBack after confirming cancellation', async () => {
    const onBack = jest.fn();
    mockCancelMutation.mockResolvedValue({});

    const { getByText } = render(
      <SeasonDraftGame gameId={1} currentUserId={1} onBack={onBack} />,
    );

    fireEvent.click(getByText('Cancel Game'));

    await waitFor(() => getByText('Yes, Cancel Game'));
    fireEvent.click(getByText('Yes, Cancel Game'));

    await waitFor(() => {
      expect(mockCancelMutation).toHaveBeenCalledWith({
        variables: { gameId: 1 },
      });
      expect(onBack).toHaveBeenCalled();
    });
  });

  it('shows an inline error message when cancellation fails', async () => {
    mockCancelMutation.mockRejectedValue(new Error('Network error'));

    const { getByText, findByText } = render(
      <SeasonDraftGame gameId={1} currentUserId={1} />,
    );

    fireEvent.click(getByText('Cancel Game'));
    await waitFor(() => getByText('Yes, Cancel Game'));
    fireEvent.click(getByText('Yes, Cancel Game'));

    const errorMsg = await findByText('Failed to cancel game.');
    expect(errorMsg).toBeTruthy();
  });

  it('dismisses the inline error message when the dismiss button is pressed', async () => {
    mockCancelMutation.mockRejectedValue(new Error('Network error'));

    const { getByText, findByText, queryByText } = render(
      <SeasonDraftGame gameId={1} currentUserId={1} />,
    );

    fireEvent.click(getByText('Cancel Game'));
    await waitFor(() => getByText('Yes, Cancel Game'));
    fireEvent.click(getByText('Yes, Cancel Game'));

    await findByText('Failed to cancel game.');

    fireEvent.click(getByText('✕'));

    await waitFor(() => {
      expect(queryByText('Failed to cancel game.')).toBeNull();
    });
  });
});
