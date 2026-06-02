/**
 * Tests for CommishTab football-awareness (LS-4152).
 *
 * Covers:
 *   1. Baseball league: "Draft Settings" accordion button is present.
 *   2. Football league: "Draft Settings" accordion button is absent.
 *   3. Football league: opening "Scoring Rules" shows the football placeholder.
 *   4. Football league: IDP vs DST distinction is reflected in scoring placeholder.
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

// --- generated enums -------------------------------------------------------
jest.mock('../../../../api/db/graphql.generated', () => ({
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  Sport: { Baseball: 'baseball', Football: 'football' },
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
  DraftSettingsControl: () => <div data-testid="draft-settings-control" />,
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
jest.mock('../../../../components/commissioner/SeasonAwardsControl', () => ({
  SeasonAwardsControl: () => <div data-testid="season-awards-control" />,
}));
jest.mock('../../../../features/baseball/LeagueScoringEditor', () => ({
  LeagueScoringEditor: () => <div data-testid="league-scoring-editor" />,
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

  it('hides "Draft Settings" accordion for a football league', () => {
    renderCommish({ sport: 'football' });
    expect(screen.queryByText('Draft Settings')).not.toBeInTheDocument();
  });

  it('shows football scoring placeholder when "Scoring Rules" is opened for a football league', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'dst' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    expect(screen.getByText('Football Scoring Editor')).toBeInTheDocument();
    // The baseball LeagueScoringEditor must NOT be rendered
    expect(
      screen.queryByTestId('league-scoring-editor'),
    ).not.toBeInTheDocument();
  });

  it('shows "DST" in scoring placeholder when defensiveFormat is dst', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'dst' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    expect(screen.getByText(/DST/)).toBeInTheDocument();
  });

  it('shows "IDP" in scoring placeholder when defensiveFormat is idp', () => {
    renderCommish({ sport: 'football', defensiveFormat: 'idp' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    expect(screen.getByText(/IDP/)).toBeInTheDocument();
  });

  it('shows the baseball scoring editor when "Scoring Rules" is opened for a baseball league', () => {
    renderCommish({ sport: 'baseball' });
    fireEvent.click(screen.getByText('Scoring Rules'));
    expect(screen.getByTestId('league-scoring-editor')).toBeInTheDocument();
    expect(
      screen.queryByText('Football Scoring Editor'),
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
