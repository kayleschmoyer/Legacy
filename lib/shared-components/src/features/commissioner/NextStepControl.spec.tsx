/**
 * Regression guard for LS-7972: the Start Draft confirmation dialog must
 * display the correct draft-type description. When draftMode is 'live', the
 * dialog should say "live draft"; when 'automated', it should say "automated
 * draft". Previously it always said "random draft" regardless of the setting.
 */
import React from 'react';
import { NextStepControl } from './NextStepControl';
import { fireEvent, render, screen, waitFor } from '../../test-utils';

// Capture the draftMode the test wants to inject
let mockDraftMode = 'automated';
const mockAutoAdvanceMatchups = jest.fn();
let mockMatchups: Array<{ weekNumber: number; gamesPerMatchup: number }> = [];

jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: { Completed: 'COMPLETED' },
  StatsLoadingStatus: {
    NotStarted: 'NOT_STARTED',
    Queued: 'QUEUED',
    Loading: 'LOADING',
    Completed: 'COMPLETED',
  },
  useAutoAdvanceMatchupsMutation: () => [
    mockAutoAdvanceMatchups,
    { loading: false },
  ],
  useAutoSelectGamesMutation: () => [jest.fn(), { loading: false }],
  useGetLeagueDraftQuery: () => ({
    data: {
      getLeagueDraft: {
        draftMode: mockDraftMode,
        draftOrder: [],
        draftType: 'snake',
      },
    },
    loading: false,
  }),
  useGetMatchupsForLeagueQuery: () => ({
    data: { getMatchupsForLeague: mockMatchups },
    loading: false,
  }),
  useInitializeDraftMutation: () => [jest.fn(), { loading: false }],
  useRenewLeagueMutation: () => [jest.fn(), { loading: false }],
}));

type Children = { children?: React.ReactNode };
type ButtonProps = Children & {
  onPress?: () => void;
  disabled?: boolean;
  'data-testid'?: string;
};
type DialogProps = Children & {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
};

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({ children, onPress, disabled, ...rest }: ButtonProps) => (
    <button type="button" onClick={onPress} disabled={!!disabled} {...rest}>
      {children}
    </button>
  );
  const Spinner = () => <span>spinner</span>;

  const DialogRoot = ({ children, open }: DialogProps) =>
    open ? <div role="dialog">{children}</div> : null;
  const Dialog = Object.assign(DialogRoot, {
    Portal: PassThrough,
    Overlay: () => null,
    Content: PassThrough,
    Title: ({ children }: Children) => <h2>{children}</h2>,
    Description: ({ children }: Children) => <p>{children}</p>,
    Close: PassThrough,
  });

  return {
    createTokens: (tokens: unknown) => tokens,
    Button,
    Card: PassThrough,
    Dialog,
    Label: PassThrough,
    RadioGroup: Object.assign(PassThrough, {
      Item: PassThrough,
      Indicator: () => null,
    }),
    Spinner,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('../../utils/colors', () => ({
  BRAND_GOLD_LIGHT: '#f5c842',
  BRAND_NAVY: '#1a2a4a',
  BRAND_NAVY_DARK: '#0f1b30',
  BRAND_NAVY_LIGHT: '#2a3d6a',
  withAlpha: (color: string) => color,
}));

const defaultProps = {
  leagueId: 1,
  gamesPerMatchup: 1,
  draftStatus: null,
};

describe('NextStepControl — Start Draft dialog message (LS-7972)', () => {
  it('shows automated draft message when draftMode is automated', () => {
    mockDraftMode = 'automated';
    render(<NextStepControl {...defaultProps} />);

    fireEvent.click(screen.getByTestId('start-draft-button'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/automated draft/i)).toBeInTheDocument();
    expect(screen.queryByText(/random draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/live draft/i)).not.toBeInTheDocument();
  });

  it('shows live draft message when draftMode is live', () => {
    mockDraftMode = 'live';
    render(<NextStepControl {...defaultProps} />);

    fireEvent.click(screen.getByTestId('start-draft-button'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/live draft/i)).toBeInTheDocument();
    expect(screen.queryByText(/random draft/i)).not.toBeInTheDocument();
  });
});

describe('NextStepControl — paused draft guard (LS-8840)', () => {
  it('routes to the draft board instead of re-initializing a paused live draft', () => {
    mockDraftMode = 'live';
    render(<NextStepControl {...defaultProps} draftStatus="paused" />);

    // initializeDraft's "Start Draft" button must not be offered while paused —
    // the server rejects initializeDraft unless draftStatus is 'not-started'.
    expect(screen.queryByTestId('start-draft-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('go-to-draft-board')).toBeInTheDocument();
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });

  it('does not throw when the Start Draft button is clicked for a non-live paused draft state', () => {
    mockDraftMode = 'automated';
    render(<NextStepControl {...defaultProps} draftStatus="paused" />);

    // Automated drafts never reach 'paused' server-side, but the button must
    // still be disabled defensively rather than calling initializeDraft.
    expect(screen.getByTestId('start-draft-button')).toBeDisabled();
  });
});

/**
 * Regression guard for LS-8849, layered on top of the LS-8840 guard above:
 * clicking through to the draft board while paused must call
 * onNavigateToDraftBoard (never initializeDraft), and the disabled button
 * for a paused non-live draft should read distinctly from the generic
 * "Draft In Progress..." label.
 */
describe('NextStepControl — paused draft status (LS-8849)', () => {
  it('calls onNavigateToDraftBoard, never initializeDraft, when clicked while paused', () => {
    mockDraftMode = 'live';
    const onNavigateToDraftBoard = jest.fn();
    render(
      <NextStepControl
        {...defaultProps}
        draftStatus="paused"
        onNavigateToDraftBoard={onNavigateToDraftBoard}
      />,
    );

    fireEvent.click(screen.getByTestId('go-to-draft-board'));

    expect(onNavigateToDraftBoard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables the button and shows "Draft Paused" when the draft is paused and not live', () => {
    mockDraftMode = 'automated';
    render(<NextStepControl {...defaultProps} draftStatus="paused" />);

    const button = screen.getByTestId('start-draft-button');
    expect(button).toBeDisabled();
    expect(screen.getByText('Draft Paused')).toBeInTheDocument();
  });
});

describe('NextStepControl — advance reports why nothing happened (LS-10804)', () => {
  const playoffMatchup = {
    id: 42,
    weekNumber: 2,
    status: 'IN_PROGRESS',
    selectedGamesCount: 1,
  } as unknown as React.ComponentProps<
    typeof NextStepControl
  >['currentMatchup'];

  beforeEach(() => {
    mockDraftMode = 'automated';
    mockMatchups = [{ weekNumber: 2, gamesPerMatchup: 1 }];
    mockAutoAdvanceMatchups.mockReset();
  });

  afterEach(() => {
    mockMatchups = [];
  });

  function confirmAdvance(
    onError: jest.Mock<void, [Error]> | jest.Mock,
    onSuccess: jest.Mock,
  ) {
    render(
      <NextStepControl
        {...defaultProps}
        draftStatus="completed"
        totalMatchups={1}
        currentMatchup={playoffMatchup}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByTestId('start-draft-button'));
    fireEvent.click(screen.getByTestId('confirm-next-step'));
  }

  it('surfaces the backend reason via onError instead of reporting success', async () => {
    const reason =
      'Playoff week 2 is already underway. Advancing to the next playoff round is not supported yet.';
    mockAutoAdvanceMatchups.mockResolvedValue({
      data: { autoAdvanceMatchups: { errors: [], skipReason: reason } },
    });
    const onError = jest.fn<void, [Error]>();
    const onSuccess = jest.fn();

    confirmAdvance(onError, onSuccess);

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0].message).toBe(reason);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('reports success when the advance returns no skip reason', async () => {
    mockAutoAdvanceMatchups.mockResolvedValue({
      data: { autoAdvanceMatchups: { errors: [], skipReason: null } },
    });
    const onError = jest.fn();
    const onSuccess = jest.fn();

    confirmAdvance(onError, onSuccess);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('advance'));
    expect(onError).not.toHaveBeenCalled();
  });
});
