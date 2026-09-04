/**
 * LS-9857 — the Draft Details panel renders the six settings rows, and the
 * draft rail composes it.
 */
import React from 'react';
import { DraftDetailsPanel } from './DraftDetailsPanel';
import { DraftRail } from './DraftRail';
import type { DraftDetailsSettings } from './draftDetails';
import { render, screen } from '../../test-utils';

jest.mock('./DraftIntelligence', () => ({
  DraftIntelligence: () => <div data-testid="intel" />,
}));
jest.mock('./DraftQueuePanel', () => ({
  DraftQueuePanel: () => <div data-testid="queue" />,
}));

const settings: DraftDetailsSettings = {
  sport: 'baseball',
  draftOrder: 'snake',
  maxRosterSize: 23,
  pickTimeLimitSeconds: 90,
  autoPickDisabled: false,
  eraFilter: 'all',
  minCareerGames: 500,
};

const railProps = {
  isPremium: false,
  isMyPick: false,
  commPickMode: false,
  controlAllTeams: false,
  isOwner: false,
  isGeneralManager: false,
  draftId: null,
  myTeamId: null,
  currentOverallPick: 0,
  currentPickInfo: {
    draftId: 1,
    teamId: 1,
    pickNumber: 1,
    overallPick: 1,
    round: 1,
    isComplete: false,
  },
  currentPickTeamId: 1,
  currentPickLoadError: null,
  onlineTeamIds: new Set<string>(),
  initDraftLoading: false,
  autoPickDisabled: false,
  myTeam: [],
  positionCounts: {} as Record<string, number>,
  pickHistory: [],
  statsLookup: new Map(),
  teamNameById: () => '',
  chatOpen: false,
  onShowToast: jest.fn(),
  onDraftPlayer: jest.fn(),
  onCommissionerPick: jest.fn(),
  onInitializeDraft: jest.fn(),
  onRetryCurrentPick: jest.fn(),
  onToggleChat: jest.fn(),
  onRefresh: jest.fn(),
};

describe('DraftDetailsPanel', () => {
  it('renders every label and value from the settings', () => {
    render(<DraftDetailsPanel settings={settings} />);

    expect(screen.getByTestId('draft-details-panel')).toBeInTheDocument();
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.getByText('Snake · 23 rounds')).toBeInTheDocument();
    expect(screen.getByText('Pick clock')).toBeInTheDocument();
    expect(screen.getByText('90 seconds')).toBeInTheDocument();
    expect(screen.getByText('Player pool')).toBeInTheDocument();
    expect(screen.getByText('All eras · 1871–present')).toBeInTheDocument();
    expect(screen.getByText('Min. career games')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Auto-pick')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Draft order')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('exposes each row to assistive tech as label + value', () => {
    render(<DraftDetailsPanel settings={settings} />);
    expect(screen.getByTestId('draft-detail-pick-clock')).toHaveAttribute(
      'aria-label',
      'Pick clock: 90 seconds',
    );
  });

  it('shows football values for a football league', () => {
    render(
      <DraftDetailsPanel
        settings={{
          ...settings,
          sport: 'football',
          maxRosterSize: 16,
          minCareerGames: 64,
        }}
      />,
    );
    expect(screen.getByText('Snake · 16 rounds')).toBeInTheDocument();
    expect(screen.getByText('All eras · 1920–present')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
  });
});

describe('DraftRail draft details', () => {
  it('renders the panel when settings are supplied', () => {
    render(<DraftRail {...railProps} draftDetails={settings} />);
    expect(screen.getByTestId('draft-details-panel')).toBeInTheDocument();
    expect(screen.getByText('Snake · 23 rounds')).toBeInTheDocument();
  });

  it('omits the panel when no settings are supplied', () => {
    render(<DraftRail {...railProps} />);
    expect(screen.queryByTestId('draft-details-panel')).toBeNull();
  });
});
