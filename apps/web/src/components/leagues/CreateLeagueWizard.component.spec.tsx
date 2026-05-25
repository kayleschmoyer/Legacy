import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CreateLeagueWizard } from './CreateLeagueWizard';

const mockNavigate = jest.fn();
const mockCreateLeague = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../api/db/graphql.generated', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  GetUserLeagues: {},
  useCreateLeagueAndTeamsMutation: () => [mockCreateLeague, { loading: false }],
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
    settings: { name: string; numTeams: number; draftType: string };
    onChange: (s: {
      name: string;
      numTeams: number;
      draftType: string;
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

jest.mock('./wizard/StepRosterSettings', () => ({
  StepRosterSettings: () => (
    <div>
      <span>Roster Settings</span>
    </div>
  ),
}));

jest.mock('./wizard/StepDefensiveFormat', () => ({
  StepDefensiveFormat: () => (
    <div>
      <span>Defensive Format</span>
    </div>
  ),
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

  it('shows football-specific Roster Settings step', () => {
    render(<CreateLeagueWizard />);
    fireEvent.click(screen.getByText('Football'));
    advance();
    fillLeagueName('My Football League');
    advance();
    expect(screen.getByText('Roster Settings')).toBeInTheDocument();
  });
});
