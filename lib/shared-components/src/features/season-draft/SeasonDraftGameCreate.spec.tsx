import React from 'react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { SEASON_DRAFT_NAME_MAX_LENGTH } from '@legacy-sports/utils';
import { SeasonDraftGameCreate } from './SeasonDraftGameCreate';
import { fireEvent, render, screen, waitFor } from '../../test-utils';

const mockCreateGame = jest.fn();
const mockAlert = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'BASEBALL', Football: 'FOOTBALL' },
  useCreateSeasonDraftGameMutation: () => [mockCreateGame],
}));

jest.mock('react-native', () => ({
  Alert: {
    alert: (...args: unknown[]) => {
      mockAlert(...args);
    },
  },
  Platform: { OS: 'web', select: (obj: { web?: unknown }) => obj.web },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]) => {
      mockLoggerError(...args);
    },
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Local tamagui mock: the global one drops testID / numberOfLines /
// maxLength, which are exactly the props under test here (LS-10675).
type MockProps = {
  children?: React.ReactNode;
  testID?: string;
  numberOfLines?: number;
  onPress?: () => void;
  disabled?: boolean;
};

jest.mock('tamagui', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const passthrough =
    (tag: string) =>
    ({ children, testID, numberOfLines }: MockProps) =>
      mockReact.createElement(
        tag,
        { 'data-testid': testID, 'data-number-of-lines': numberOfLines },
        children,
      );
  return {
    Button: ({ children, onPress, disabled }: MockProps) => (
      <button onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
    H1: passthrough('h1'),
    Input: ({
      value,
      onChangeText,
      maxLength,
      testID,
    }: {
      value?: string;
      onChangeText?: (v: string) => void;
      maxLength?: number;
      testID?: string;
    }) => (
      <input
        data-testid={testID}
        value={value ?? ''}
        maxLength={maxLength}
        onChange={(e) => onChangeText?.(e.target.value)}
      />
    ),
    Paragraph: passthrough('p'),
    ScrollView: passthrough('div'),
    Spinner: () => <span>loading</span>,
    Text: passthrough('span'),
    XStack: passthrough('div'),
    YStack: passthrough('div'),
  };
});

const typeName = (value: string) =>
  fireEvent.change(screen.getByTestId('season-draft-name-input'), {
    target: { value },
  });

const createButton = () => screen.getByRole('button', { name: /create game/i });

describe('SeasonDraftGameCreate — game name limits (LS-10675)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('caps the Game Name input at the shared max length', () => {
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    expect(screen.getByTestId('season-draft-name-input')).toHaveAttribute(
      'maxLength',
      String(SEASON_DRAFT_NAME_MAX_LENGTH),
    );
  });

  it('shows a remaining-character counter that tracks the input', () => {
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    const counter = screen.getByTestId('season-draft-name-counter');
    expect(counter).toHaveTextContent(
      `${SEASON_DRAFT_NAME_MAX_LENGTH} characters left`,
    );

    typeName('A'.repeat(SEASON_DRAFT_NAME_MAX_LENGTH - 1));
    expect(counter).toHaveTextContent('1 character left');
  });

  it('clamps the Live Preview title instead of letting it wrap unbounded', () => {
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    typeName('W'.repeat(SEASON_DRAFT_NAME_MAX_LENGTH));
    const title = screen.getByTestId('season-draft-preview-title');
    expect(title).toHaveTextContent('W'.repeat(SEASON_DRAFT_NAME_MAX_LENGTH));
    expect(title).toHaveAttribute('data-number-of-lines', '2');
  });

  it('keeps Create disabled for a blank name', () => {
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    typeName('   ');
    expect(createButton()).toBeDisabled();
  });

  it('submits the trimmed name', async () => {
    mockCreateGame.mockResolvedValueOnce({
      data: { createSeasonDraftGame: 7 },
    });
    const onCreated = jest.fn();
    render(<SeasonDraftGameCreate onCreated={onCreated} />);
    typeName('  HR Challenge  ');
    fireEvent.click(createButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7));
    const [[{ variables }]] = mockCreateGame.mock.calls as [
      [{ variables: { name: string } }],
    ];
    expect(variables.name).toBe('HR Challenge');
  });

  it('shows a server BAD_USER_INPUT message without reporting it to Rollbar', async () => {
    mockCreateGame.mockRejectedValueOnce(
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Game name must be 60 characters or fewer.',
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      }),
    );
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    typeName('HR Challenge');
    fireEvent.click(createButton());

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(
        'Error',
        'Game name must be 60 characters or fewer.',
      ),
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});

describe('SeasonDraftGameCreate — Most Teams preview (LS-10497)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const previewStat = () => [
    screen.getByTestId('season-draft-preview-stat-label'),
    screen.getByTestId('season-draft-preview-stat-name'),
  ];

  it.each([
    ['Hitters', 'HR', 'Home Runs'],
    ['Pitchers', 'W', 'Wins'],
  ])('shows Teams instead of the %s stat in Most Teams mode', (pool, label) => {
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: pool }));
    expect(previewStat()[0]).toHaveTextContent(label);

    fireEvent.click(screen.getByRole('button', { name: 'Most Teams' }));
    const [stat, name] = previewStat();
    expect(stat).toHaveTextContent('TM');
    expect(name).toHaveTextContent('Teams');
  });

  it('submits statKey teams_played in Most Teams mode', async () => {
    mockCreateGame.mockResolvedValueOnce({
      data: { createSeasonDraftGame: 9 },
    });
    render(<SeasonDraftGameCreate onCreated={jest.fn()} />);
    typeName('Teams Race');
    fireEvent.click(screen.getByRole('button', { name: 'Most Teams' }));
    fireEvent.click(createButton());

    await waitFor(() => expect(mockCreateGame).toHaveBeenCalled());
    const [[{ variables }]] = mockCreateGame.mock.calls as [
      [{ variables: { statKey: string; gameMode: string } }],
    ];
    expect(variables.statKey).toBe('teams_played');
    expect(variables.gameMode).toBe('most_teams');
  });
});
