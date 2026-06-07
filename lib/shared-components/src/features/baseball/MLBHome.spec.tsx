import React from 'react';
import { MLBHome, type MLBHomeLeague } from './MLBHome';
import { fireEvent, render, screen } from '../../test-utils';

type Children = { children?: React.ReactNode };
type PressProps = Children & { onPress?: () => void; disabled?: boolean };
type ButtonProps = PressProps & {
  ['aria-label']?: string;
  accessibilityLabel?: string;
};
type InputProps = {
  value?: string;
  onChangeText?: (next: string) => void;
  placeholder?: string;
  ['aria-label']?: string;
};

// The create dialog is exercised by its own spec; here we only assert MLBHome
// opens it and forwards the submit handler.
jest.mock('./CreateLeagueDialog', () => ({
  CreateLeagueDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (input: unknown) => Promise<void>;
  }) =>
    open ? (
      <div data-testid="mock-create-dialog">
        <button
          type="button"
          onClick={() => void onSubmit({ leagueName: 'X' })}
        >
          dialog-submit
        </button>
      </div>
    ) : null,
}));

jest.mock('tamagui', () => {
  const Box = ({ children, onPress }: PressProps) => (
    <div onClick={onPress}>{children}</div>
  );
  const Button = ({
    children,
    onPress,
    disabled,
    'aria-label': ariaLabel,
    accessibilityLabel,
  }: ButtonProps) => (
    <button
      type="button"
      onClick={onPress}
      disabled={!!disabled}
      aria-label={ariaLabel ?? accessibilityLabel}
    >
      {children}
    </button>
  );
  const Heading = ({ children }: Children) => <h2>{children}</h2>;
  const Text = ({ children, onPress }: PressProps) => (
    <span onClick={onPress}>{children}</span>
  );
  const Input = ({
    value,
    onChangeText,
    placeholder,
    'aria-label': ariaLabel,
  }: InputProps) => (
    <input
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  return {
    ScrollView: Box,
    YStack: Box,
    XStack: Box,
    Button,
    H1: Heading,
    H2: Heading,
    H3: Heading,
    Paragraph: ({ children }: Children) => <p>{children}</p>,
    Text,
    Input,
    Separator: () => <hr />,
    Spinner: () => <div role="status" />,
  };
});

const LEAGUES: MLBHomeLeague[] = [
  {
    id: 1,
    name: 'Saturday Sluggers',
    draftStatus: 'in-progress',
    maxRosterSize: 25,
  },
  {
    id: 2,
    name: 'Sunday Stars',
    draftStatus: 'completed',
    currentWeekNumber: 4,
  },
];

const baseProps = {
  onCreateLeague: jest.fn().mockResolvedValue(undefined),
  onJoinLeague: jest.fn(),
  onViewLeague: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MLBHome', () => {
  it('shows the full hero and empty state when the user has no leagues', () => {
    render(<MLBHome {...baseProps} leagues={[]} />);
    expect(screen.getByText(/Season Hub/)).toBeInTheDocument();
    expect(screen.getByText('No leagues yet')).toBeInTheDocument();
    expect(screen.queryByText('+ Create')).not.toBeInTheDocument();
  });

  it('shows the compact hero and league list when the user has leagues', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.getByText('+ Create')).toBeInTheDocument();
    expect(screen.queryByText(/Season Hub/)).not.toBeInTheDocument();
    expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
    expect(screen.getByText('Sunday Stars')).toBeInTheDocument();
  });

  it('renders draft-status badges from each league', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Week 4')).toBeInTheDocument();
  });

  it('filters the league list via search', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    fireEvent.change(screen.getByPlaceholderText(/Search leagues/i), {
      target: { value: 'Saturday' },
    });
    expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
    expect(screen.queryByText('Sunday Stars')).not.toBeInTheDocument();
  });

  it('shows the error notice (not the empty state) when error is set', () => {
    render(<MLBHome {...baseProps} leagues={[]} error />);
    expect(
      screen.getByText(/Could not load your leagues/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('No leagues yet')).not.toBeInTheDocument();
  });

  it('shows only a spinner while loading', () => {
    render(<MLBHome {...baseProps} leagues={[]} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Create League')).not.toBeInTheDocument();
  });

  it('opens the create dialog when Create League is pressed', () => {
    render(<MLBHome {...baseProps} leagues={[]} />);
    expect(screen.queryByTestId('mock-create-dialog')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create a new baseball league',
      }),
    );
    expect(screen.getByTestId('mock-create-dialog')).toBeInTheDocument();
  });

  it('invokes onViewLeague when a league View button is pressed', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    fireEvent.click(
      screen.getAllByRole('button', { name: /View Saturday/ })[0],
    );
    expect(baseProps.onViewLeague).toHaveBeenCalledWith(1);
  });

  it('renders the league-cap indicator and disables Create at the cap', () => {
    const onUpgrade = jest.fn();
    render(
      <MLBHome
        {...baseProps}
        leagues={LEAGUES}
        leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade }}
      />,
    );
    expect(screen.getByText('Your leagues: 3/3')).toBeInTheDocument();
    const createBtn = screen.getByRole('button', {
      name: 'Create a new baseball league',
    });
    expect(createBtn).toBeDisabled();
    fireEvent.click(screen.getByText('— Upgrade to add more'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('renders an Invite Friends action only when onInviteFriends is provided', () => {
    const { rerender } = render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.queryByText('Invite Friends')).not.toBeInTheDocument();
    rerender(
      <MLBHome {...baseProps} leagues={LEAGUES} onInviteFriends={jest.fn()} />,
    );
    expect(screen.getByText('Invite Friends')).toBeInTheDocument();
  });

  it('renders the sign-in notice when unauthenticated', () => {
    render(
      <MLBHome
        {...baseProps}
        leagues={[]}
        isAuthenticated={false}
        onSignIn={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/Sign in to manage your fantasy baseball leagues/i),
    ).toBeInTheDocument();
  });
});
