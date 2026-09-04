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

jest.mock('../UpgradeModal', () => ({
  UpgradeModal: ({
    open,
    featureName,
  }: {
    open: boolean;
    featureName: string;
  }) => (open ? <div>Upgrade Modal: {featureName}</div> : null),
}));

const mockUseIsPremiumStatus = jest.fn(() => ({
  isPremium: false,
  isLoading: false,
}));
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: () => mockUseIsPremiumStatus(),
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
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
  // Needed only because StepRosterSettings' `requireActual` below pulls in
  // the full shared-components `leagues` barrel (which includes OnThisDayFeed,
  // a `styled()` consumer never actually rendered in this test).
  styled: () => () => null,
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
    settings: { name: string; numTeams: number; draftOrder: string };
    onChange: (s: {
      name: string;
      numTeams: number;
      draftOrder: string;
    }) => void;
  }) => (
    <div>
      <span>League Settings</span>
      <input
        placeholder="Enter league name"
        value={settings.name}
        onChange={(e) => onChange({ ...settings, name: e.target.value })}
      />
    </div>
  ),
}));

jest.mock('./wizard/StepPremiumOptions', () => ({
  StepPremiumOptions: ({
    options,
    onChange,
    isPremium,
  }: {
    options: {
      selectionMethod: string;
      auctionBudget: number;
      auctionMinBid: number;
    };
    onChange: (o: {
      selectionMethod: string;
      auctionBudget: number;
      auctionMinBid: number;
    }) => void;
    isPremium: boolean;
  }) => (
    <div>
      <span>Premium Options</span>
      <button
        type="button"
        onClick={() => onChange({ ...options, selectionMethod: 'auction' })}
        disabled={!isPremium}
      >
        Select Auction
      </button>
      <input
        placeholder="Auction Budget"
        value={options.auctionBudget}
        onChange={(e) =>
          onChange({ ...options, auctionBudget: Number(e.target.value) })
        }
      />
      <input
        placeholder="Minimum Bid"
        value={options.auctionMinBid}
        onChange={(e) =>
          onChange({ ...options, auctionMinBid: Number(e.target.value) })
        }
      />
    </div>
  ),
}));

jest.mock('./wizard/StepRosterSettings', () => ({
  // Real DST_ROSTER_DEFAULTS/IDP_ROSTER_DEFAULTS are consumed by
  // CreateLeagueWizard's reducer to seed state.rosterSlots — only the
  // presentational component itself is stubbed here.
  ...jest.requireActual<typeof import('./wizard/StepRosterSettings')>(
    './wizard/StepRosterSettings',
  ),
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
    onScoringFormatChange,
  }: {
    defensiveFormat: string;
    onChange: (format: 'dst' | 'idp') => void;
    scoringFormat: string;
    onScoringFormatChange: (format: 'standard' | 'half_ppr' | 'ppr') => void;
  }) => (
    <div>
      <span>Defensive Format</span>
      <button type="button" onClick={() => onChange('idp')}>
        Individual Defensive Players (IDP)
      </button>
      <button type="button" onClick={() => onChange('dst')}>
        Team D/ST
      </button>
      <button type="button" onClick={() => onScoringFormatChange('standard')}>
        Standard
      </button>
      <button type="button" onClick={() => onScoringFormatChange('half_ppr')}>
        Half-PPR
      </button>
    </div>
  ),
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
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
  mockUseIsPremiumStatus.mockReturnValue({
    isPremium: false,
    isLoading: false,
  });
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

  it('advances to premium options step when name is filled in', () => {
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Test League');
    advance();
    expect(screen.getByText('Premium Options')).toBeInTheDocument();
  });

  it('advances past premium options step to confirmation', () => {
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Test League');
    advance();
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

  it('calls the mutation on confirmation for baseball, including default premium fields', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    expect(mockCreateLeague).toHaveBeenCalledTimes(1);
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.sport).toBe('baseball');
    expect(input.leagueName).toBe('My League');
    expect(input.selectionMethod).toBe('standard');
    expect(input.draftOrder).toBe('snake');
    expect(input.waiverType).toBe('standard');
    expect(input.eraFilter).toBe('all');
    expect(input.salaryCapEnabled).toBe(false);
  });

  it('navigates to league page on successful creation', async () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-42' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
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
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    await waitFor(() =>
      expect(screen.getByText('Network error')).toBeInTheDocument(),
    );
  });

  it('sends the chosen auction budget and minimum bid on submit', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Auction League');
    advance();
    fireEvent.click(screen.getByText('Select Auction'));
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

  it('omits auction fields for a standard selection', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My Standard League');
    advance();
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

  it('shows football-specific Roster Settings step after premium options', () => {
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance();
    fillLeagueName('My Football League');
    advance();
    expect(screen.getByText('Premium Options')).toBeInTheDocument();
    advance();
    expect(screen.getByText('Roster Settings')).toBeInTheDocument();
  });

  function reachDefensiveStepWithCustomizedRoster() {
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance();
    fillLeagueName('My Football League');
    advance();
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

  it('does not let a non-premium user select Auction selection method', () => {
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
    const auctionButton = screen.getByText('Select Auction');
    expect(auctionButton).toBeDisabled();
  });

  it('sends rosterSlots (excluding bench) alongside maxRosterSize for football (LS-6145)', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-7' } } },
    });
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance(); // sport -> settings
    fillLeagueName('My Football League');
    advance(); // settings -> premium
    advance(); // premium -> roster
    advance(); // roster -> defensive
    advance(); // defensive -> confirm
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });

    expect(mockCreateLeague).toHaveBeenCalledTimes(1);
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.sport).toBe('football');
    // Default DST roster: QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DST:1, BN:6 = 15.
    expect(input.maxRosterSize).toBe(15);
    expect(input.rosterSlots).toEqual(
      expect.arrayContaining([
        { positionType: 'QB', count: 1 },
        { positionType: 'RB', count: 2 },
        { positionType: 'WR', count: 2 },
        { positionType: 'TE', count: 1 },
        { positionType: 'FLEX', count: 1 },
        { positionType: 'K', count: 1 },
        { positionType: 'DST', count: 1 },
      ]),
    );
    expect(input.rosterSlots).toHaveLength(7);
    expect(
      input.rosterSlots.some(
        (slot: { positionType: string }) => slot.positionType === 'BN',
      ),
    ).toBe(false);
  });

  it('defaults scoringFormat to ppr for a wizard-created football league (LS-6152)', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-8' } } },
    });
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance(); // sport -> settings
    fillLeagueName('My Football League');
    advance(); // settings -> premium
    advance(); // premium -> roster
    advance(); // roster -> defensive
    advance(); // defensive -> confirm
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });

    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.scoringFormat).toBe('ppr');
  });

  it('sends the chosen scoring format for a wizard-created football league (LS-6152)', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-9' } } },
    });
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance(); // sport -> settings
    fillLeagueName('My Football League');
    advance(); // settings -> premium
    advance(); // premium -> roster
    advance(); // roster -> defensive
    fireEvent.click(screen.getByText('Standard'));
    advance(); // defensive -> confirm
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });

    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.scoringFormat).toBe('standard');
  });

  it('omits scoringFormat for baseball leagues', () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 'league-1' } } },
    });
    render(<CreateLeagueWizard />);
    advance();
    fillLeagueName('My League');
    advance();
    advance();
    act(() => {
      fireEvent.click(screen.getByText('Create League'));
    });
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.scoringFormat).toBeUndefined();
  });
});
