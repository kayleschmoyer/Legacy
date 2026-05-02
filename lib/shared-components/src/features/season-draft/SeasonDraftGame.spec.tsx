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

// Override the global react-native mock so TouchableOpacity maps onPress to
// onClick (the global setup uses a bare string 'button' which drops onPress).
jest.mock('react-native', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    Platform: {
      OS: 'web',
      select: (obj: Record<string, unknown>) =>
        obj.web ?? obj.default ?? obj.ios,
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 1024, height: 768 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      flatten: (style: unknown) => style,
      compose: (
        ...styles: Record<string, unknown>[]
      ): Record<string, unknown> =>
        Object.assign({}, ...styles) as Record<string, unknown>,
    },
    Touchable: { Mixin: {} },
    processColor: jest.fn((color: unknown) => color),
    View: 'div',
    Text: 'span',
    TouchableOpacity: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
    }) => mockReact.createElement('button', { onClick: onPress }, children),
    ScrollView: 'div',
    ActivityIndicator: 'div',
    TextInput: 'input',
    FlatList: 'div',
    Alert: { alert: jest.fn() },
  };
});

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
    error: undefined,
    refetch: mockRefetch,
    startPolling: jest.fn(),
    stopPolling: jest.fn(),
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

  // ── polling behaviour ───────────────────────────────────────────────────

  describe('conditional polling', () => {
    const mockStartPolling = jest.fn();
    const mockStopPolling = jest.fn();

    beforeEach(() => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: { seasonDraftGame: mockGameState },
        loading: false,
        error: undefined,
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);
    });

    it('starts polling for active (drafting) games', () => {
      render(<SeasonDraftGame gameId={1} currentUserId={1} />);
      expect(mockStartPolling).toHaveBeenCalledWith(5000);
    });

    it('stops polling for completed games', () => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: {
          seasonDraftGame: { ...mockGameState, status: 'completed' as const },
        },
        loading: false,
        error: undefined,
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      render(<SeasonDraftGame gameId={1} currentUserId={1} />);
      expect(mockStopPolling).toHaveBeenCalled();
      expect(mockStartPolling).not.toHaveBeenCalled();
    });

    it('stops polling for cancelled games', () => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: {
          seasonDraftGame: { ...mockGameState, status: 'cancelled' as const },
        },
        loading: false,
        error: undefined,
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      render(<SeasonDraftGame gameId={1} currentUserId={1} />);
      expect(mockStopPolling).toHaveBeenCalled();
      expect(mockStartPolling).not.toHaveBeenCalled();
    });

    it('stops polling when query errors', () => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: { seasonDraftGame: mockGameState },
        loading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      render(<SeasonDraftGame gameId={1} currentUserId={1} />);
      expect(mockStopPolling).toHaveBeenCalled();
      expect(mockStartPolling).not.toHaveBeenCalled();
    });

    it('stops polling when game is not found', () => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: { seasonDraftGame: null },
        loading: false,
        error: undefined,
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      render(<SeasonDraftGame gameId={999} currentUserId={1} />);
      expect(mockStopPolling).toHaveBeenCalled();
      expect(mockStartPolling).not.toHaveBeenCalled();
    });

    // Regression test for LS-3786: page flickered every 5 seconds because
    // the loading spinner was shown during background poll refetches.
    it('does not show the loading spinner during a background poll (loading:true with existing data)', () => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: { seasonDraftGame: mockGameState },
        loading: true, // Apollo sets loading:true during poll network request
        error: undefined,
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      const { queryByText } = render(
        <SeasonDraftGame gameId={1} currentUserId={1} />,
      );

      // Game content should still be visible — no full-page spinner
      expect(queryByText('Loading game…')).toBeNull();
      expect(queryByText('Test Draft')).toBeTruthy();
    });

    it('shows the loading spinner on initial load (loading:true with no data)', () => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
        refetch: mockRefetch,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      const { getByText } = render(
        <SeasonDraftGame gameId={1} currentUserId={1} />,
      );

      expect(getByText('Loading game…')).toBeTruthy();
    });
  });

  // ── most_teams mode ─────────────────────────────────────────────────────

  describe('most_teams mode', () => {
    const mostTeamsGameState = {
      ...mockGameState,
      gameMode: 'most_teams' as const,
      statKey: 'teams_played',
      players: [
        {
          id: 1,
          userId: 1,
          playerName: 'Player One',
          draftOrder: 1,
          totalScore: 0,
          roster: [
            { id: 10, position: 'C', slotNumber: 0, isFilled: false },
            { id: 11, position: '1B', slotNumber: 0, isFilled: false },
          ],
        },
      ],
    };

    const mockSearchPlayers = jest.fn();

    beforeEach(() => {
      jest.mocked(useGetSeasonDraftGameQuery).mockReturnValue({
        data: { seasonDraftGame: mostTeamsGameState },
        loading: false,
        error: undefined,
        refetch: mockRefetch,
        startPolling: jest.fn(),
        stopPolling: jest.fn(),
      } as unknown as ReturnType<typeof useGetSeasonDraftGameQuery>);

      // Provide a search result so the player suggestion list renders
      mockSearchPlayers.mockReturnValue(undefined);
      jest.mocked(useSearchPlayersForDraftLazyQuery).mockReturnValue([
        mockSearchPlayers,
        {
          data: {
            players: [
              {
                id: 99,
                firstName: 'Babe',
                lastName: 'Ruth',
                statsLastFetchedAt: '2024-01-01',
              },
            ],
          },
        },
      ] as unknown as ReturnType<typeof useSearchPlayersForDraftLazyQuery>);
    });

    it('renders the Most Teams mode label and hides the team/season picker after player selection', () => {
      const mockFetchPlayerOptions = jest.fn();
      jest
        .mocked(useGetSeasonDraftGamePlayerOptionsLazyQuery)
        .mockReturnValue([
          mockFetchPlayerOptions,
          { data: null },
        ] as unknown as ReturnType<
          typeof useGetSeasonDraftGamePlayerOptionsLazyQuery
        >);

      const { getByText, getAllByText, queryByText } = render(
        <SeasonDraftGame gameId={1} currentUserId={1} />,
      );

      // Mode label should show "Most Teams"
      expect(getByText('Most Teams')).toBeTruthy();

      // Stat key chip should show the short "TM" label for most_teams mode.
      // Multiple TMs appear (header chip + scoreboard column).
      expect(getAllByText('TM').length).toBeGreaterThan(0);

      // Click the player suggestion to select a player. The
      // TouchableOpacity (mocked as <button onClick={onPress}>) wraps the
      // player name, so we walk up to the <button> ancestor.
      const babeRuthText = getByText('Babe Ruth');
      const touchable =
        babeRuthText.closest('button') ?? babeRuthText.parentElement;
      expect(touchable).not.toBeNull();
      fireEvent.click(touchable as HTMLElement);

      // In most_teams mode, fetchPlayerOptions is skipped entirely.
      expect(mockFetchPlayerOptions).not.toHaveBeenCalled();

      // After selecting a player, team/season picker should still NOT be
      // present in most_teams mode (the picker is gated on
      // `selectedPlayer && !isMostTeamsMode`)
      expect(queryByText('Choose a Team')).toBeNull();
      expect(queryByText('Choose a Season')).toBeNull();
    });

    it('enables Confirm Pick without selectedOption in most_teams mode', async () => {
      const mockFetchPlayerOptions = jest.fn();
      jest
        .mocked(useGetSeasonDraftGamePlayerOptionsLazyQuery)
        .mockReturnValue([
          mockFetchPlayerOptions,
          { data: null },
        ] as unknown as ReturnType<
          typeof useGetSeasonDraftGamePlayerOptionsLazyQuery
        >);

      const { getByText, getAllByText } = render(
        <SeasonDraftGame gameId={1} currentUserId={1} />,
      );

      // The drafting UI should render (it's the current user's turn). The
      // header on-the-clock card AND the pick panel badge both say
      // "Your Turn", so use getAllByText to confirm at least one renders.
      expect(getAllByText('Your Turn').length).toBeGreaterThan(0);
      expect(getByText('Make your pick.')).toBeTruthy();

      // Click the player suggestion to select a player.
      const babeRuthText = getByText('Babe Ruth');
      const touchable =
        babeRuthText.closest('button') ?? babeRuthText.parentElement;
      expect(touchable).not.toBeNull();
      fireEvent.click(touchable as HTMLElement);

      // In most_teams mode, fetchPlayerOptions is skipped entirely.
      expect(mockFetchPlayerOptions).not.toHaveBeenCalled();

      // Select a roster slot (position) — multiple elements show "C"
      // (the slot button and the roster label), so pick the first one
      // which is the interactive button in the draft interface.
      const cElements = getAllByText('C');
      fireEvent.click(cElements[0]);

      // In most_teams mode, with a player and slot selected but no
      // selectedOption, the Confirm Pick button should be enabled.
      // The disabled condition is:
      //   !selectedPlayer || !selectedSlotId || (!isMostTeamsMode && !selectedOption) || submitting
      // Since isMostTeamsMode is true, !selectedOption is not checked.
      // Press the button and verify the mutation is called (proving it's enabled)
      mockMakePickMutation.mockResolvedValue({});
      fireEvent.click(getByText(/^Confirm Pick/));

      await waitFor(() => {
        expect(mockMakePickMutation).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({
              gameId: 1,
              season: 0,
              position: 'C',
            }) as unknown,
          }) as unknown,
        );
      });
    });
  });
});
