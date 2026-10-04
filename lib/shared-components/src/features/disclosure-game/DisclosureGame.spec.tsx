/**
 * Tests for DisclosureGame (Who Am I?) — LS-8130.
 *
 * Focused on the player-search race condition: Apollo Client v4 rejects a lazy
 * query's promise with an AbortError when a newer keystroke supersedes an
 * in-flight call. The component must swallow that race silently — the visible
 * "Could not search players" error should fire only for real failures.
 */

import React from 'react';
import {
  useActiveDisclosureGameLazyQuery,
  useGiveUpDisclosureGameMutation,
  useNextClueMutation,
  useSearchPlayersForDisclosureLazyQuery,
  useStartDisclosureGameMutation,
  useSubmitGuessMutation,
} from '@legacy-sports/graphql';
import {
  buildDisclosureScoringTable,
  DISCLOSURE_MIN_CLUES,
} from '@legacy-sports/utils';
import { DisclosureGame } from './DisclosureGame';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

type Children = { children?: React.ReactNode };
type BaseProps = Children & { testID?: string };

jest.mock('tamagui', () => {
  const View = ({
    children,
    testID,
    onPress,
  }: BaseProps & { onPress?: () => void }) => (
    <div data-testid={testID} onClick={onPress ? () => onPress() : undefined}>
      {children}
    </div>
  );
  const Text = ({ children, testID }: BaseProps) => (
    <span data-testid={testID}>{children}</span>
  );
  const Button = ({
    children,
    onPress,
    disabled,
    testID,
  }: BaseProps & { onPress?: () => void; disabled?: boolean }) => (
    <button
      type="button"
      onClick={() => onPress?.()}
      disabled={!!disabled}
      data-testid={testID}
    >
      {children}
    </button>
  );
  const Input = ({
    value,
    onChangeText,
    testID,
    placeholder,
  }: {
    value?: string;
    onChangeText?: (text: string) => void;
    testID?: string;
    placeholder?: string;
  }) => (
    <input
      data-testid={testID}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    Button,
    H1: Text,
    Input,
    Paragraph: Text,
    ScrollView: View,
    Text,
    XStack: View,
    YStack: View,
  };
});

jest.mock('../season-draft/primitives', () => {
  const View = ({
    children,
    testID,
  }: {
    children?: React.ReactNode;
    testID?: string;
  }) => <div data-testid={testID}>{children}</div>;
  return { Circle: View, Stack: View };
});

const mockSearchPlayers = jest.fn();
const mockStartGame = jest.fn();
const mockNextClue = jest.fn();
const mockSubmitGuess = jest.fn();
const mockGiveUp = jest.fn();
const mockFetchActive = jest.fn();

function setupHooks() {
  jest
    .mocked(useActiveDisclosureGameLazyQuery)
    .mockReturnValue([
      mockFetchActive,
      { data: undefined, loading: false },
    ] as unknown as ReturnType<typeof useActiveDisclosureGameLazyQuery>);
  jest
    .mocked(useStartDisclosureGameMutation)
    .mockReturnValue([
      mockStartGame,
      { loading: false },
    ] as unknown as ReturnType<typeof useStartDisclosureGameMutation>);
  jest
    .mocked(useNextClueMutation)
    .mockReturnValue([
      mockNextClue,
      { loading: false },
    ] as unknown as ReturnType<typeof useNextClueMutation>);
  jest
    .mocked(useSubmitGuessMutation)
    .mockReturnValue([
      mockSubmitGuess,
      { loading: false },
    ] as unknown as ReturnType<typeof useSubmitGuessMutation>);
  jest
    .mocked(useGiveUpDisclosureGameMutation)
    .mockReturnValue([mockGiveUp, { loading: false }] as unknown as ReturnType<
      typeof useGiveUpDisclosureGameMutation
    >);
  jest
    .mocked(useSearchPlayersForDisclosureLazyQuery)
    .mockReturnValue([
      mockSearchPlayers,
      { data: undefined, loading: false },
    ] as unknown as ReturnType<typeof useSearchPlayersForDisclosureLazyQuery>);
}

async function startGameAndRevealClue() {
  mockFetchActive.mockResolvedValue({ data: { activeDisclosureGame: null } });
  mockStartGame.mockResolvedValue({
    data: { startDisclosureGame: { sessionId: 1, totalClues: 5 } },
  });
  mockNextClue.mockResolvedValue({
    data: {
      nextClue: {
        clueText: 'A clue',
        difficultyTier: 'vague',
        clueIndex: 1,
        isLastClue: false,
      },
    },
  });

  render(<DisclosureGame />);
  await waitFor(() => expect(mockFetchActive).toHaveBeenCalled());

  fireEvent.click(screen.getByTestId('start-game-button'));
  await waitFor(() =>
    expect(screen.getByTestId('disclosure-game-playing')).toBeTruthy(),
  );

  fireEvent.click(screen.getByTestId('next-clue-button'));
  await waitFor(() => expect(screen.getByTestId('clue-1')).toBeTruthy());
}

describe('DisclosureGame — intro copy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHooks();
  });

  it('describes the variable clue count (5+) instead of a fixed count (LS-10434)', async () => {
    mockFetchActive.mockResolvedValue({ data: { activeDisclosureGame: null } });

    render(<DisclosureGame />);
    await waitFor(() => expect(mockFetchActive).toHaveBeenCalled());

    const idle = screen.getByTestId('disclosure-game-idle').textContent;
    expect(idle).toMatch(new RegExp(`${DISCLOSURE_MIN_CLUES}\\+ clues`));
    expect(idle).not.toMatch(/(Five|Seven) clues/);
  });
});

describe('DisclosureGame — scoring table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHooks();
  });

  it("renders the server's scoring curve for the round's clue count (LS-10434)", async () => {
    await startGameAndRevealClue();

    const playing = screen.getByTestId('disclosure-game-playing').textContent;
    for (const row of buildDisclosureScoringTable(5)) {
      expect(playing).toContain(row.label);
      expect(playing).toContain(row.value);
    }
    expect(playing).toContain('1,000 pts');
    expect(playing).not.toContain('6–7 clues');
  });
});

describe('DisclosureGame — player search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHooks();
  });

  it('swallows an Apollo AbortError silently (rapid typing race) without flashing the error banner', async () => {
    await startGameAndRevealClue();

    // Apollo Client v4 rejects with an AbortError when a newer reobserve
    // supersedes an in-flight one. Reproduce that exact shape.
    const abortError = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    mockSearchPlayers.mockRejectedValueOnce(abortError);

    fireEvent.change(screen.getByTestId('guess-input'), {
      target: { value: 'Ba' },
    });
    // Let the rejected lazy-query promise settle through React's microtask queue.
    await act(() => Promise.resolve());

    expect(screen.queryByTestId('error-message')).toBeNull();
    expect(screen.queryByTestId('player-suggestions')).toBeNull();
  });

  it('scopes the search to baseball and renders the returned suggestions (LS-10439)', async () => {
    await startGameAndRevealClue();

    mockSearchPlayers.mockResolvedValueOnce({
      data: {
        searchPlayers: [{ id: 28724, firstName: 'Babe', lastName: 'Ruth' }],
      },
    });

    fireEvent.change(screen.getByTestId('guess-input'), {
      target: { value: 'Ruth' },
    });

    await waitFor(() =>
      expect(screen.getByTestId('suggestion-28724')).toBeTruthy(),
    );
    expect(mockSearchPlayers).toHaveBeenCalledWith({
      variables: { searchTerm: 'Ruth', limit: 8, sport: 'baseball' },
    });
    expect(screen.getByTestId('submit-guess-button')).toHaveProperty(
      'disabled',
      true,
    );

    fireEvent.click(screen.getByTestId('suggestion-28724'));

    expect(screen.getByTestId('submit-guess-button')).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('shows an inline empty-state when the search matches no players', async () => {
    await startGameAndRevealClue();

    mockSearchPlayers.mockResolvedValueOnce({ data: { searchPlayers: [] } });

    fireEvent.change(screen.getByTestId('guess-input'), {
      target: { value: 'Zzzz' },
    });

    await waitFor(() =>
      expect(screen.getByTestId('player-search-empty')).toBeTruthy(),
    );
    expect(screen.queryByTestId('player-suggestions')).toBeNull();
  });

  it('shows the error banner when searchPlayers rejects with a real failure', async () => {
    await startGameAndRevealClue();

    mockSearchPlayers.mockRejectedValueOnce(new Error('Network down'));

    fireEvent.change(screen.getByTestId('guess-input'), {
      target: { value: 'Ba' },
    });
    // Let the rejected lazy-query promise settle through React's microtask queue.
    await act(() => Promise.resolve());

    await waitFor(() => {
      expect(screen.getByTestId('error-message').textContent).toMatch(
        /Could not search players/i,
      );
    });
    // Also surfaced inline next to the input — the top banner can be scrolled
    // out of view on short viewports (LS-10439).
    expect(screen.getByTestId('player-search-error')).toBeTruthy();
  });
});
