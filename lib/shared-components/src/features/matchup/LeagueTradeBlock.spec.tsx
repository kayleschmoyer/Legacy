import React from 'react';
import {
  useGetLeagueTradeBlockQuery,
  useSetTradeBlockMutation,
} from '@legacy-sports/graphql';
import { LeagueTradeBlock } from './LeagueTradeBlock';
import { act, fireEvent, render, waitFor } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

// The default tamagui mock in jest-setup.js strips onPress without binding to
// onClick, making it impossible to drive press handlers in tests. Provide a
// minimal local mock that maps onPress -> onClick and onChangeText -> onChange.
jest.mock('tamagui', () => {
  const Box = ({
    children,
    onPress,
  }: {
    children?: unknown;
    onPress?: () => void;
  }) => <div onClick={onPress}>{children as React.ReactNode | undefined}</div>;
  return {
    Card: Box,
    Separator: () => <hr />,
    Spinner: () => <div data-spinner />,
    Text: ({
      children,
      onPress,
      role,
    }: {
      children?: unknown;
      onPress?: () => void;
      role?: string;
    }) => (
      <span onClick={onPress} role={role}>
        {children as React.ReactNode | undefined}
      </span>
    ),
    XStack: Box,
    YStack: Box,
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children?: unknown;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onPress} disabled={disabled}>
        {children as React.ReactNode | undefined}
      </button>
    ),
    Input: ({
      onChangeText,
      value,
      placeholder,
    }: {
      onChangeText?: (v: string) => void;
      value?: string;
      placeholder?: string;
    }) => (
      <input
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChangeText?.(e.target.value)}
      />
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

const mockSetTradeBlock = jest.fn();

const mockPlayers = [
  {
    id: 1,
    teamId: 1,
    playerId: 10,
    player: { firstName: 'Mike', lastName: 'Trout' },
  },
  {
    id: 2,
    teamId: 2,
    playerId: 20,
    player: { firstName: 'Shohei', lastName: 'Ohtani' },
  },
  {
    id: 3,
    teamId: 1,
    playerId: 30,
    player: { firstName: 'Mookie', lastName: 'Betts' },
  },
];

function setupMock(
  overrides: Partial<ReturnType<typeof useGetLeagueTradeBlockQuery>> = {},
) {
  jest.mocked(useGetLeagueTradeBlockQuery).mockReturnValue({
    data: { leagueTradeBlock: mockPlayers },
    loading: false,
    error: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useGetLeagueTradeBlockQuery>);

  jest
    .mocked(useSetTradeBlockMutation)
    .mockReturnValue([
      mockSetTradeBlock,
      { loading: false },
    ] as unknown as ReturnType<typeof useSetTradeBlockMutation>);
}

describe('LeagueTradeBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Trade Block header', () => {
    setupMock();
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('Trade Block')).toBeTruthy();
  });

  it('renders player names', () => {
    setupMock();
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('Mike Trout')).toBeTruthy();
    expect(getByText('Shohei Ohtani')).toBeTruthy();
    expect(getByText('Mookie Betts')).toBeTruthy();
  });

  it('shows the count badge', () => {
    setupMock();
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('3 available')).toBeTruthy();
  });

  it('shows Remove button for own-team players', () => {
    setupMock();
    const { getAllByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    // Mike Trout (teamId=1) and Mookie Betts (teamId=1) are own-team
    const removeButtons = getAllByText('Remove');
    expect(removeButtons).toHaveLength(2);
  });

  it('shows AVAILABLE badge for other-team players', () => {
    setupMock();
    const { getAllByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    // Shohei Ohtani (teamId=2) is other-team
    const availableBadges = getAllByText('AVAILABLE');
    expect(availableBadges).toHaveLength(1);
  });

  it('shows empty state when no players on trade block', () => {
    setupMock({ data: { leagueTradeBlock: [] } });
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('No players on the trade block')).toBeTruthy();
  });

  it('shows error state', () => {
    setupMock({
      data: undefined,
      error: new Error('Network error') as unknown as ReturnType<
        typeof useGetLeagueTradeBlockQuery
      >['error'],
    });
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('Failed to load trade block.')).toBeTruthy();
  });

  it('shows loading spinner', () => {
    setupMock({ data: undefined, loading: true });
    const { getByText, container } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    // Header still renders during loading
    expect(getByText('Trade Block')).toBeTruthy();
    // No player names should appear
    expect(container.innerHTML).not.toContain('Mike Trout');
  });

  it('shows AVAILABLE for all players when userTeamId is null', () => {
    setupMock();
    const { getAllByText, queryAllByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={null} />,
    );
    expect(getAllByText('AVAILABLE')).toHaveLength(3);
    expect(queryAllByText('Remove')).toHaveLength(0);
  });

  describe('asking price display', () => {
    it('shows "Asking: price" label when player has askingPrice set', () => {
      const playersWithPrice = [
        {
          id: 1,
          teamId: 2,
          playerId: 10,
          askingPrice: '$50M',
          player: { firstName: 'Mike', lastName: 'Trout' },
        },
      ];
      jest.mocked(useGetLeagueTradeBlockQuery).mockReturnValue({
        data: { leagueTradeBlock: playersWithPrice },
        loading: false,
        error: undefined,
      } as unknown as ReturnType<typeof useGetLeagueTradeBlockQuery>);
      jest
        .mocked(useSetTradeBlockMutation)
        .mockReturnValue([
          mockSetTradeBlock,
          { loading: false },
        ] as unknown as ReturnType<typeof useSetTradeBlockMutation>);

      const { getByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      expect(getByText('Asking: $50M')).toBeTruthy();
    });

    it('shows "Edit Price" button label for own-team player with existing asking price', () => {
      const playersWithPrice = [
        {
          id: 1,
          teamId: 1,
          playerId: 10,
          askingPrice: '$50M',
          player: { firstName: 'Mike', lastName: 'Trout' },
        },
      ];
      jest.mocked(useGetLeagueTradeBlockQuery).mockReturnValue({
        data: { leagueTradeBlock: playersWithPrice },
        loading: false,
        error: undefined,
      } as unknown as ReturnType<typeof useGetLeagueTradeBlockQuery>);
      jest
        .mocked(useSetTradeBlockMutation)
        .mockReturnValue([
          mockSetTradeBlock,
          { loading: false },
        ] as unknown as ReturnType<typeof useSetTradeBlockMutation>);

      const { getByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={1} />,
      );
      expect(getByText('Edit Price')).toBeTruthy();
    });
  });

  describe('expandable list', () => {
    const manyPlayers = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      teamId: 2,
      playerId: i + 1,
      player: { firstName: `Player${i + 1}`, lastName: 'Name' },
    }));

    function setupManyPlayers() {
      jest.mocked(useGetLeagueTradeBlockQuery).mockReturnValue({
        data: { leagueTradeBlock: manyPlayers },
        loading: false,
        error: undefined,
      } as unknown as ReturnType<typeof useGetLeagueTradeBlockQuery>);
      jest
        .mocked(useSetTradeBlockMutation)
        .mockReturnValue([
          mockSetTradeBlock,
          { loading: false },
        ] as unknown as ReturnType<typeof useSetTradeBlockMutation>);
    }

    it('shows only the first 5 players when there are more than 5', () => {
      setupManyPlayers();
      const { getByText, queryByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      expect(getByText('Player5 Name')).toBeTruthy();
      expect(queryByText('Player6 Name')).toBeFalsy();
    });

    it('shows "Show N more" button when there are more than 5 players', () => {
      setupManyPlayers();
      const { getByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      expect(getByText('Show 3 more')).toBeTruthy();
    });

    it('reveals remaining players after clicking "Show N more"', () => {
      setupManyPlayers();
      const { getByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      act(() => {
        fireEvent.click(getByText('Show 3 more'));
      });
      expect(getByText('Player6 Name')).toBeTruthy();
      expect(getByText('Player8 Name')).toBeTruthy();
    });

    it('shows "Show fewer" toggle after expanding', () => {
      setupManyPlayers();
      const { getByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      act(() => {
        fireEvent.click(getByText('Show 3 more'));
      });
      expect(getByText('Show fewer')).toBeTruthy();
    });

    it('collapses back to 5 players after clicking "Show fewer"', () => {
      setupManyPlayers();
      const { getByText, queryByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      act(() => {
        fireEvent.click(getByText('Show 3 more'));
      });
      act(() => {
        fireEvent.click(getByText('Show fewer'));
      });
      expect(queryByText('Player6 Name')).toBeFalsy();
      expect(getByText('Player5 Name')).toBeTruthy();
    });

    it('does not show expand button when 5 or fewer players are on the trade block', () => {
      setupMock();
      const { queryByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={null} />,
      );
      expect(queryByText(/Show \d+ more/)).toBeFalsy();
    });
  });

  describe('remove from trade block', () => {
    it('calls setTradeBlock with onTradeBlock: false when Remove is pressed', async () => {
      setupMock();
      mockSetTradeBlock.mockResolvedValueOnce({ data: {} });

      const { getAllByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={1} />,
      );

      act(() => {
        fireEvent.click(getAllByText('Remove')[0]);
      });

      await waitFor(() => {
        expect(mockSetTradeBlock).toHaveBeenCalledWith({
          variables: { teamMemberId: 1, onTradeBlock: false },
        });
      });
    });
  });

  describe('mutation error state accessibility', () => {
    it('renders mutation error with role="alert" for screen reader accessibility', async () => {
      setupMock();
      mockSetTradeBlock.mockRejectedValueOnce(new Error('Server error'));

      const { getAllByText, findByRole } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={1} />,
      );

      act(() => {
        fireEvent.click(getAllByText('Remove')[0]);
      });

      expect(await findByRole('alert')).toBeTruthy();
    });
  });

  describe('mutation error handling', () => {
    it('keeps edit UI open and shows error when save mutation rejects', async () => {
      setupMock();
      mockSetTradeBlock.mockRejectedValueOnce(new Error('Network down'));

      const { getAllByText, getByText, getByPlaceholderText, queryByText } =
        render(<LeagueTradeBlock leagueId={1} userTeamId={1} />);

      // Click first own-team "Set Price" to open editor
      act(() => {
        fireEvent.click(getAllByText('Set Price')[0]);
      });
      act(() => {
        fireEvent.change(getByPlaceholderText('Asking price'), {
          target: { value: '$50M' },
        });
      });

      act(() => {
        fireEvent.click(getByText('Save'));
      });

      await waitFor(() => {
        expect(queryByText(/Failed to update asking price/)).toBeTruthy();
      });
      // Editor remains open (input still rendered) — UI state was NOT reset on failure
      expect(getByPlaceholderText('Asking price')).toBeTruthy();
    });

    it('resets edit UI on successful save', async () => {
      setupMock();
      mockSetTradeBlock.mockResolvedValueOnce({ data: {} });

      const {
        getAllByText,
        getByText,
        getByPlaceholderText,
        queryByPlaceholderText,
        queryByText,
      } = render(<LeagueTradeBlock leagueId={1} userTeamId={1} />);

      act(() => {
        fireEvent.click(getAllByText('Set Price')[0]);
      });
      act(() => {
        fireEvent.change(getByPlaceholderText('Asking price'), {
          target: { value: '$50M' },
        });
      });

      act(() => {
        fireEvent.click(getByText('Save'));
      });

      await waitFor(() => {
        expect(queryByPlaceholderText('Asking price')).toBeFalsy();
      });
      expect(queryByText(/Failed to update asking price/)).toBeFalsy();
    });

    it('shows error when Remove mutation rejects', async () => {
      setupMock();
      mockSetTradeBlock.mockRejectedValueOnce(new Error('Server exploded'));

      const { getAllByText, queryByText } = render(
        <LeagueTradeBlock leagueId={1} userTeamId={1} />,
      );

      act(() => {
        fireEvent.click(getAllByText('Remove')[0]);
      });

      await waitFor(() => {
        expect(
          queryByText(/Failed to remove player from trade block/),
        ).toBeTruthy();
      });
    });
  });
});
