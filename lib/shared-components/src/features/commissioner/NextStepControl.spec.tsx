/**
 * Regression guard for LS-7972: the Start Draft confirmation dialog must
 * display the correct draft-type description. When draftMode is 'live', the
 * dialog should say "live draft"; when 'automated', it should say "automated
 * draft". Previously it always said "random draft" regardless of the setting.
 */
import React from 'react';
import { NextStepControl } from './NextStepControl';
import { fireEvent, render, screen } from '../../test-utils';

// Capture the draftMode the test wants to inject
let mockDraftMode = 'automated';

jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: { Completed: 'COMPLETED' },
  StatsLoadingStatus: {
    NotStarted: 'NOT_STARTED',
    Queued: 'QUEUED',
    Loading: 'LOADING',
    Completed: 'COMPLETED',
  },
  useAutoAdvanceMatchupsMutation: () => [jest.fn(), { loading: false }],
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
    data: { getMatchupsForLeague: [] },
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
