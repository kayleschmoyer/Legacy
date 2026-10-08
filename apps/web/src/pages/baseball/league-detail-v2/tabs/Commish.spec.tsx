/**
 * Tests for CommishTab football-awareness (LS-4152, LS-9042).
 *
 * Covers:
 *   1. Baseball league: "Draft Settings" accordion button is present.
 *   2. Football league: "Draft Settings" renders with sport="football" (LS-10694).
 *   3. Football league: opening "Scoring Rules" renders the football scoring editor.
 *   4. Football league: IDP vs DST is passed through to the scoring editor.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { CommishTab } from './Commish';

// --- router ----------------------------------------------------------------
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

// --- auth ------------------------------------------------------------------
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 42 } }),
  useStepUpGate: () => ({
    isPrompting: false,
    requireStepUp: (action: () => void) => action(),
    onVerified: jest.fn(),
    onDismiss: jest.fn(),
  }),
}));
jest.mock('../../../../components/StepUpModal', () => ({
  StepUpModal: () => <div data-testid="step-up-modal" />,
}));

// --- hooks -----------------------------------------------------------------
jest.mock('../../../../hooks/useMatchup', () => ({
  useMatchupsForLeague: () => ({ matchups: [], refetch: jest.fn() }),
  useCurrentWeek: () => ({ currentWeek: 1, refetch: jest.fn() }),
}));
jest.mock('../../../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: () => undefined,
}));
// LS-5205: premium status drives the PremiumGate around the playoff format
// (6-team / 8-team) and salary cap inside LeagueSettingsControl. Mock it so the
// tab can assert the prop is wired through without the full auth/query stack.
let mockIsPremium = false;
jest.mock('../../../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockIsPremium,
}));
jest.mock('../../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({
    profile: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// --- generated enums + queries ---------------------------------------------
let mockAuditLogsResult: { data: any; loading: boolean; error: any } = {
  data: undefined,
  loading: false,
  error: undefined,
};
jest.mock('@legacy-sports/graphql', () => ({
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetCommissionerAuditLogsQuery: () => mockAuditLogsResult,
}));

// --- heavy sub-components --------------------------------------------------
jest.mock('../../../../features/commissioner', () => ({
  NextStepControl: () => <div data-testid="next-step-control" />,
  WaiverProcessControl: () => <div data-testid="waiver-process-control" />,
}));
jest.mock(
  '../../../../features/baseball/CommissionerAnnouncementsPanel',
  () => ({
    CommissionerAnnouncementsPanel: () => (
      <div data-testid="announcements-panel" />
    ),
  }),
);
jest.mock('../../../../components/commissioner/DraftSettingsControl', () => ({
  DraftSettingsControl: (props: any) => (
    <div
      data-testid="draft-settings-control"
      data-ispremium={String(props.isPremium)}
      data-sport={props.sport}
    />
  ),
}));
jest.mock('../../../../components/commissioner/LeagueSettingsControl', () => ({
  LeagueSettingsControl: (props: any) => (
    <div
      data-testid="league-settings-control"
      data-ispremium={String(props.isPremium)}
    />
  ),
}));
jest.mock('../../../../components/commissioner/LeagueDuesControl', () => ({
  LeagueDuesControl: () => <div data-testid="league-dues-control" />,
}));
jest.mock(
  '../../../../components/commissioner/LeagueDuesStatusDashboard',
  () => ({
    LeagueDuesStatusDashboard: () => (
      <div data-testid="dues-status-dashboard" />
    ),
  }),
);
jest.mock('@legacy-sports/shared-components/commissioner', () => ({
  SeasonAwardsControl: (props: any) => (
    <div data-testid="season-awards-control" data-sport={props.sport} />
  ),
}));
jest.mock('../../../../features/baseball/LeagueScoringEditor', () => ({
  LeagueScoringEditor: () => <div data-testid="league-scoring-editor" />,
}));
jest.mock('../../../../components/leagues/ScoringSettingsEditor', () => ({
  ScoringSettingsEditor: (props: any) => (
    <div
      data-testid="football-scoring-editor"
      data-sport={props.sport}
      data-defensive-format={props.defensiveFormat}
    />
  ),
}));
jest.mock('../../../../features/commissioner/DeleteLeagueControl', () => ({
  DeleteLeagueControl: () => <div data-testid="delete-league-control" />,
}));

// ---------------------------------------------------------------------------

const baseLeague = {
  id: 1,
  name: 'Test League',
  sport: 'baseball',
  draftStatus: 'not-started',
  defensiveFormat: null,
  gamesPerMatchup: 5,
  pitcherStartsPerMatchup: 2,
  minCareerGames: 50,
  minCareerSeasons: 3,
  totalMatchups: 10,
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
  salaryCapEnabled: false,
  salaryCap: null,
  playerPool: 'all',
  eraFilter: 'all',
  baseballHofOnly: false,
  customEraStartYear: null,
  customEraEndYear: null,
  frozenAt: null,
  seasonNumber: 2024,
} as any;

const renderCommish = (leagueOverrides: Record<string, unknown> = {}) =>
  render(
    <CommishTab
      league={{ ...baseLeague, ...leagueOverrides }}
      teams={[]}
      onSettingsSuccess={jest.fn()}
      onSettingsError={jest.fn()}
    />,
  );

describe('CommishTab — football-awareness', () => {
  it('shows "Draft Settings" accordion for a baseball league', () => {
    renderCommish({ sport: 'baseball' });
    expect(screen.getByText('Draft Settings')).toBeInTheDocument();
  });

  it('shows "Draft Settings" for a football league, wired with sport="football" (LS-10694)', () => {
    renderCommish({ sport: 'football' });
    fireEvent.click(screen.getByText('Draft Settings'));
    expect(screen.getByTestId('draft-settings-control')).toHaveAttribute(
      'data-sport',
      'football',
    );
  });

  it('wires sport="baseball" into DraftSettingsControl for a baseball league', () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('Draft Settings'));
    expect(screen.getByTestId('draft-settings-control')).toHaveAttribute(
      'data-sport',
      'baseball',
    );
  });

  it('passes sport="football" to SeasonAwardsControl for a football league (LS-10694)', () => {
    renderCommish({ sport: 'football' });
    fireEvent.click(screen.getByText('Season Awards'));
    expect(screen.getByTestId('season-awards-control')).toHaveAttribute(
      'data-sport',
      'football',
    );
  });

  it('"Scoring Rules" accordion has no "Coming Soon" badge for a football league (LS-9042)', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'dst' });
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  });

  it('"Scoring Rules" accordion is not disabled for a football league — click expands it (LS-9042)', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'dst' });
    const scoringButton = screen.getByText('Scoring Rules').closest('button');
    expect(scoringButton).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByText('Scoring Rules'));
    expect(screen.getByTestId('football-scoring-editor')).toBeInTheDocument();
  });

  it('"Scoring Rules" accordion has no "Coming Soon" badge for a baseball league (LS-5916)', () => {
    renderCommish({ sport: 'baseball' });
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  });

  it('shows the football scoring editor wired to leagueId/profile/loading/error/draftStatus when "Scoring Rules" is opened for a DST football league (LS-9042)', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'dst' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    const editor = screen.getByTestId('football-scoring-editor');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('data-sport', 'football');
    expect(editor).toHaveAttribute('data-defensive-format', 'dst');
    // The baseball LeagueScoringEditor must NOT be rendered
    expect(
      screen.queryByTestId('league-scoring-editor'),
    ).not.toBeInTheDocument();
  });

  it('shows the football scoring editor for IDP leagues too (LS-9042)', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'idp' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    const editor = screen.getByTestId('football-scoring-editor');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('data-defensive-format', 'idp');
  });

  it('shows the baseball scoring editor when "Scoring Rules" is opened for a baseball league', () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    expect(screen.getByTestId('league-scoring-editor')).toBeInTheDocument();
    expect(
      screen.queryByTestId('football-scoring-editor'),
    ).not.toBeInTheDocument();
  });
});

describe('CommishTab — premium gating (LS-5205)', () => {
  afterEach(() => {
    mockIsPremium = false;
  });

  it('wires isPremium=false into LeagueSettingsControl for free commissioners so the playoff-format PremiumGate stays locked', () => {
    mockIsPremium = false;
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('League Settings'));
    expect(screen.getByTestId('league-settings-control')).toHaveAttribute(
      'data-ispremium',
      'false',
    );
  });

  it('wires isPremium=true into LeagueSettingsControl for premium commissioners so all playoff formats unlock', () => {
    mockIsPremium = true;
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('League Settings'));
    expect(screen.getByTestId('league-settings-control')).toHaveAttribute(
      'data-ispremium',
      'true',
    );
  });
});

describe('CommishTab — Danger Zone reveal gate (LS-5914)', () => {
  it('does not render DeleteLeagueControl immediately when Danger Zone accordion opens', () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByTestId('danger-zone-toggle'));
    expect(
      screen.queryByTestId('delete-league-control'),
    ).not.toBeInTheDocument();
  });

  it('shows a reveal button inside the Danger Zone accordion', () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByTestId('danger-zone-toggle'));
    expect(screen.getByTestId('danger-zone-reveal')).toBeInTheDocument();
  });

  it('renders DeleteLeagueControl only after clicking reveal', () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByTestId('danger-zone-toggle'));
    fireEvent.click(screen.getByTestId('danger-zone-reveal'));
    expect(screen.getByTestId('delete-league-control')).toBeInTheDocument();
  });

  it('hides DeleteLeagueControl again when accordion is closed and reopened', () => {
    renderCommish({ sport: 'baseball' });
    // open + reveal
    fireEvent.click(screen.getByTestId('danger-zone-toggle'));
    fireEvent.click(screen.getByTestId('danger-zone-reveal'));
    expect(screen.getByTestId('delete-league-control')).toBeInTheDocument();
    // close
    fireEvent.click(screen.getByTestId('danger-zone-toggle'));
    // reopen — should show reveal button again, not the control
    fireEvent.click(screen.getByTestId('danger-zone-toggle'));
    expect(
      screen.queryByTestId('delete-league-control'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('danger-zone-reveal')).toBeInTheDocument();
  });
});

describe('CommishTab — DraftSettingsControl premium wiring (LS-5017)', () => {
  afterEach(() => {
    mockIsPremium = false;
  });

  it('wires isPremium=false into DraftSettingsControl for free commissioners so auction draft stays locked', () => {
    mockIsPremium = false;
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('Draft Settings'));
    expect(screen.getByTestId('draft-settings-control')).toHaveAttribute(
      'data-ispremium',
      'false',
    );
  });

  it('wires isPremium=true into DraftSettingsControl for premium commissioners so auction draft unlocks', () => {
    mockIsPremium = true;
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('Draft Settings'));
    expect(screen.getByTestId('draft-settings-control')).toHaveAttribute(
      'data-ispremium',
      'true',
    );
  });
});

describe('CommishTab — AuditLogPanel (LS-5921)', () => {
  afterEach(() => {
    mockAuditLogsResult = { data: undefined, loading: false, error: undefined };
  });

  const openAuditLog = () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('Audit Log'));
  };

  it('renders "Audit Log" accordion section', () => {
    renderCommish({ sport: 'baseball' });
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('shows loading state when query is in flight and no data yet', () => {
    mockAuditLogsResult = { data: undefined, loading: true, error: undefined };
    openAuditLog();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows error message when query fails', () => {
    mockAuditLogsResult = {
      data: undefined,
      loading: false,
      error: new Error('network error'),
    };
    openAuditLog();
    expect(screen.getByText('Failed to load audit log.')).toBeInTheDocument();
  });

  it('shows empty-state message when there are no audit log entries', () => {
    mockAuditLogsResult = {
      data: { commissionerAuditLogs: [] },
      loading: false,
      error: undefined,
    };
    openAuditLog();
    expect(
      screen.getByText('No commissioner actions recorded yet.'),
    ).toBeInTheDocument();
  });

  it('renders audit log entries with action label and reason', () => {
    mockAuditLogsResult = {
      data: {
        commissionerAuditLogs: [
          {
            id: 1,
            action: 'force_add',
            reason: 'Test reason',
            createdAt: '2024-01-15T12:00:00Z',
          },
        ],
      },
      loading: false,
      error: undefined,
    };
    openAuditLog();
    expect(screen.getByText('Force Add')).toBeInTheDocument();
    expect(screen.getByText('Reason: Test reason')).toBeInTheDocument();
  });

  it('renders human-readable labels for settings, scoring, dues and waiver actions (LS-10736)', () => {
    const actions: Array<[string, string]> = [
      ['update_league_settings', 'Update League Settings'],
      ['update_draft_settings', 'Update Draft Settings'],
      ['update_scoring', 'Update Scoring Rules'],
      ['update_scoring_position_bonuses', 'Update Position Bonuses'],
      ['update_dues_settings', 'Update League Dues'],
      ['mark_member_paid', 'Mark Dues Paid'],
      ['mark_member_unpaid', 'Mark Dues Unpaid'],
      ['process_waivers', 'Process Waivers'],
    ];
    mockAuditLogsResult = {
      data: {
        commissionerAuditLogs: actions.map(([action], i) => ({
          id: i + 1,
          action,
          reason: null,
          createdAt: '2024-01-15T12:00:00Z',
        })),
      },
      loading: false,
      error: undefined,
    };
    openAuditLog();
    for (const [, label] of actions) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows "Load more" button when returned entries equal the page size', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      action: 'force_drop',
      reason: null,
      createdAt: '2024-01-15T12:00:00Z',
    }));
    mockAuditLogsResult = {
      data: { commissionerAuditLogs: entries },
      loading: false,
      error: undefined,
    };
    openAuditLog();
    expect(screen.getByText('Load more')).toBeInTheDocument();
  });

  it('hides "Load more" button when fewer entries than page size are returned', () => {
    mockAuditLogsResult = {
      data: {
        commissionerAuditLogs: [
          {
            id: 1,
            action: 'force_add',
            reason: null,
            createdAt: '2024-01-15T12:00:00Z',
          },
        ],
      },
      loading: false,
      error: undefined,
    };
    openAuditLog();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });
});
