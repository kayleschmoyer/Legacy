import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { CreateLeagueWizard } from './CreateLeagueWizard';

const mockNavigate = jest.fn();
const mockCreateLeague = jest.fn();
const mockUseCreateLeagueAndTeamsMutation = jest.fn(() => [
  mockCreateLeague,
  { loading: false },
]);

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  GetUserLeagues: {},
  useCreateLeagueAndTeamsMutation: (...args: unknown[]) =>
    mockUseCreateLeagueAndTeamsMutation(...args),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('tamagui', () => ({
  ScrollView: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  YStack: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  XStack: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => <div onClick={onPress}>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronLeft: () => null,
}));

jest.mock('./wizard/StepSportSelect', () => ({
  StepSportSelect: ({
    sport: _sport,
    onChange,
  }: {
    sport: string;
    onChange: (s: string) => void;
  }) => (
    <div>
      <span>Choose Your Sport</span>
      <button type="button" onClick={() => onChange('BASEBALL')}>
        Baseball
      </button>
      <button type="button" onClick={() => onChange('FOOTBALL')}>
        Football
      </button>
    </div>
  ),
}));

jest.mock('./wizard/StepLeagueSettings', () => ({
  StepLeagueSettings: ({
    settings,
    onChange,
  }: {
    settings: {
      name: string;
      numTeams: number;
      draftType: string;
      auctionBudget: number;
      auctionMinBid: number;
    };
    onChange: (s: {
      name: string;
      numTeams: number;
      draftType: string;
      auctionBudget: number;
      auctionMinBid: number;
    }) => void;
  }) => (
    <div>
      <span>League Settings</span>
      <input
        placeholder="Enter league name"
        value={settings.name}
        onChange={(e) => onChange({ ...settings, name: e.target.value })}
      />
      <button
        type="button"
        onClick={() => onChange({ ...settings, draftType: 'auction' })}
      >
        Auction Draft
      </button>
      <input
        placeholder="Auction Budget"
        value={settings.auctionBudget}
        onChange={(e) =>
          onChange({ ...settings, auctionBudget: Number(e.target.value) })
        }
      />
      <input
        placeholder="Minimum Bid"
        value={settings.auctionMinBid}
        onChange={(e) =>
          onChange({ ...settings, auctionMinBid: Number(e.target.value) })
        }
      />
    </div>
  ),
}));

jest.mock('./wizard/StepRosterSettings', () => ({
  StepRosterSettings: ({
    rosterSlots,
    onChange,
  }: {
    rosterSlots: Record<string, number>;
    onChange: (slots: Record<string, number>) => void;
  }) => (
    <div>
      <span>Roster Settings</span>
      <button type="button" onClick={() => onChange({ ...rosterSlots, QB: 2 })}>
        Customize roster
      </button>
    </div>
  ),
}));

jest.mock('./wizard/StepDefensiveFormat', () => ({
  StepDefensiveFormat: ({
    onChange,
  }: {
    defensiveFormat: string;
    onChange: (format: 'dst' | 'idp') => void;
  }) => (
    <div>
      <span>Defensive Format</span>
      <button type="button" onClick={() => onChange('idp')}>
        Individual Defensive Players (IDP)
      </button>
      <button type="button" onClick={() => onChange('dst')}>
        Team D/ST
      </button>
    </div>
  ),
}));

jest.mock('@legacy-sports/shared-components', () => ({
  Dialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  }: {
    open?: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) =>
    open ? (
      <div role="alertdialog">
        <span>{title}</span>
        {description && <span>{description}</span>}
        <button type="button" onClick={onConfirm}>
          {confirmLabel ?? 'Confirm'}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelLabel ?? 'Cancel'}
        </button>
      </div>
    ) : null,
}));

jest.mock('./wizard/StepConfirmation', () => ({
  StepConfirmation: ({
    onSubmit,
    error,
    loading,
  }: {
    onSubmit: () => void;
    error: string | null;
    loading: boolean;
  }) => (
    <div>
      <span>Confirm Your League</span>
      {error && <span>{error}</span>}
      <button type="button" onClick={onSubmit} disabled={loading}>
        Create League
      </button>
    </div>
  ),
}));

function advance() {
  fireEvent.click(screen.getByText('Continue'));
}

function fillLeagueName(name: string) {
  const input = screen.getByPlaceholderText('Enter league name');
  fireEvent.change(input, { target: { value: name } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateLeague.mockResolvedValue({ data: null });
});

describe('CreateLeagueWizard', () => {
  it('renders sport selection on first step', () => {
    render(<CreateLeagueWizard />);
    expect(screen.getByText('Choose Your Sport')).toBeInTheDocument();
    expect(screen.getByText('Baseball')).toBeInTheDocument();
    expect(screen.getByText('Football')).toBeInTheDocument();
  });

  it('advances to league settings when Continue is pressed', () => {
    render(<CreateLeagueWizard />);
    advance();
    expect(screen.getByText('League Settings')).toBeInTheDocument();
  });

  it('shows validation error when name is empty on settings step', () => {
    render(<CreateLeagueWizard />);
    advance();
    advance();
    expect(screen.getByText('League name is required.')).toBeInTheDocument();
  });

  it('advances past settings step when name is filled in', () => {
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Test League');
    advance();
    expect(screen.getByText('Confirm Your League')).toBeInTheDocument();
  });

  it('goes back when Back is pressed', () => {
    render(<CreateLeagueWizard />);
    advance();
    const backs = screen.getAllByText('Back');
    fireEvent.click(backs[0]);
    expect(screen.getByText('Choose Your Sport')).toBeInTheDocument();
  });

  it('calls the mutation on confirmation for baseball', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    expect(mockCreateLeague).toHaveBeenCalledTimes(1);
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.sport).toBe('baseball');
    expect(input.leagueName).toBe('My League');
  });

  it('navigates to league page on successful creation', async () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-42' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/league-42'),
    );
  });

  it('shows error message when mutation throws', async () => {
    mockCreateLeague.mockRejectedValue(new Error('Network error'));
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    await waitFor(() =>
      expect(screen.getByText('Network error')).toBeInTheDocument(),
    );
  });

  it('sends the chosen auction budget and minimum bid on submit', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Auction League');
    fireEvent.click(screen.getByText('Auction Draft'));
    fireEvent.change(screen.getByPlaceholderText('Auction Budget'), {
      target: { value: '350' },
    });
    fireEvent.change(screen.getByPlaceholderText('Minimum Bid'), {
      target: { value: '10' },
    });
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.selectionMethod).toBe('auction');
    expect(input.auctionBudget).toBe(350);
    expect(input.auctionMinBid).toBe(10);
  });

  it('omits auction fields for a snake draft', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Snake League');
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.auctionBudget).toBeUndefined();
    expect(input.auctionMinBid).toBeUndefined();
  });

  it('refetches GetUserLeagues instead of manually writing a partial league into the cache (LS-6137)', () => {
    render(<CreateLeagueWizard />);
    const options = mockUseCreateLeagueAndTeamsMutation.mock.calls[0][0] as {
      update?: unknown;
      refetchQueries?: Array<{ query: unknown }>;
    };
    expect(options.update).toBeUndefined();
    expect(options.refetchQueries).toEqual([{ query: {} }]);
  });

  it('shows football-specific Roster Settings step', () => {
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance();
    fillLeagueName('My Football League');
    advance();
    expect(screen.getByText('Roster Settings')).toBeInTheDocument();
  });

  function reachDefensiveStepWithCustomizedRoster() {
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance();
    fillLeagueName('My Football League');
    advance();
    fireEvent.click(screen.getByText('Customize roster'));
    advance();
  }

  it('changes defensive format directly when roster has not been customized', () => {
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance();
    fillLeagueName('My Football League');
    advance();
    advance();
    fireEvent.click(screen.getByText('Individual Defensive Players (IDP)'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows a styled confirm dialog (not window.confirm) when changing defensive format with a customized roster', () => {
    reachDefensiveStepWithCustomizedRoster();
    fireEvent.click(screen.getByText('Individual Defensive Players (IDP)'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Changing defensive format will reset your roster configuration. Continue?',
      ),
    ).toBeInTheDocument();
  });

  it('applies the defensive format change when the dialog is confirmed', () => {
    reachDefensiveStepWithCustomizedRoster();
    fireEvent.click(screen.getByText('Individual Defensive Players (IDP)'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByText('Continue'),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('discards the defensive format change when the dialog is cancelled', () => {
    reachDefensiveStepWithCustomizedRoster();
    fireEvent.click(screen.getByText('Individual Defensive Players (IDP)'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByText('Cancel'),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
