/**
 * LS-9859 — the commissioner's Draft Pick Order panel inside the draft-room rail.
 *
 * Two things are under test:
 *  1. The role gate — only a commissioner of a non-mock draft sees the panel,
 *     mirroring the `showCommissionerBar` gate on pause/resume/comm-pick.
 *  2. The mid-draft decision — the rail only mounts for 'in-progress'/'paused'
 *     drafts, so the shared control renders its read-only locked list there.
 *     Reordering stays pre-draft; see the panel comment in DraftRail.tsx.
 *
 * The real shared DraftOrderControl is rendered (not a stub) so the gate is
 * proved against the actual control; only its data layer (useDraftOrder) is
 * mocked.
 */
import React from 'react';
import { DraftRail } from './DraftRail';
import { useDraftOrder } from '../commissioner/useDraftOrder';
import { render, screen } from '../../test-utils';

jest.mock('./DraftIntelligence', () => ({
  DraftIntelligence: () => <div data-testid="intel" />,
}));
jest.mock('./DraftQueuePanel', () => ({
  DraftQueuePanel: () => <div data-testid="queue" />,
}));
jest.mock('../commissioner/useDraftOrder', () => ({
  useDraftOrder: jest.fn(),
}));

const mockUseDraftOrder = jest.mocked(useDraftOrder);

const TEAMS = [
  { teamId: 1, teamName: 'Dinger Dynasty', draftOrder: 1 },
  { teamId: 2, teamName: 'Bronx Bombers', draftOrder: 2 },
];

function hookReturn(
  overrides: Partial<ReturnType<typeof useDraftOrder>> = {},
): ReturnType<typeof useDraftOrder> {
  return {
    draftId: 42,
    isOrderLocked: true,
    loading: false,
    localOrder: TEAMS,
    hasCustomOrder: false,
    settingOrder: false,
    randomizing: false,
    isBusy: false,
    moveTeam: jest.fn(),
    handleSaveOrder: jest.fn(),
    handleRandomize: jest.fn(),
    handleReset: jest.fn(),
    ...overrides,
  };
}

const railProps = {
  isPremium: true,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDraftOrder.mockReturnValue(hookReturn());
});

describe('DraftRail commissioner Draft Pick Order panel (LS-9859)', () => {
  it('renders the panel for a commissioner', () => {
    render(
      <DraftRail
        {...railProps}
        showCommissionerControls={true}
        leagueId={7}
        draftStatus="in-progress"
      />,
    );
    expect(screen.getByTestId('draft-order-rail-panel')).toBeInTheDocument();
    expect(screen.getByText('Draft Pick Order')).toBeInTheDocument();
    expect(screen.getByText('Dinger Dynasty')).toBeInTheDocument();
  });

  it('hides the panel from non-commissioners', () => {
    render(
      <DraftRail
        {...railProps}
        showCommissionerControls={false}
        leagueId={7}
        draftStatus="in-progress"
      />,
    );
    expect(screen.queryByTestId('draft-order-rail-panel')).toBeNull();
    expect(screen.queryByText('Draft Pick Order')).toBeNull();
  });

  it('hides the panel when no league id is available', () => {
    render(
      <DraftRail
        {...railProps}
        showCommissionerControls={true}
        leagueId={null}
        draftStatus="in-progress"
      />,
    );
    expect(screen.queryByTestId('draft-order-rail-panel')).toBeNull();
  });

  it('omits the panel by default (props unset)', () => {
    render(<DraftRail {...railProps} />);
    expect(screen.queryByTestId('draft-order-rail-panel')).toBeNull();
  });

  it('forwards leagueId and draftStatus to the shared control', () => {
    render(
      <DraftRail
        {...railProps}
        showCommissionerControls={true}
        leagueId={7}
        draftStatus="paused"
      />,
    );
    expect(mockUseDraftOrder).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 7, draftStatus: 'paused' }),
    );
  });

  it('renders read-only while the draft is live — no reorder affordances', () => {
    render(
      <DraftRail
        {...railProps}
        showCommissionerControls={true}
        leagueId={7}
        draftStatus="in-progress"
      />,
    );
    expect(
      screen.getByText(
        'The draft is underway — pick order can no longer be changed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Save Order')).toBeNull();
    expect(screen.queryByText('Randomize')).toBeNull();
    expect(
      screen.queryByLabelText('Drag to reorder Dinger Dynasty'),
    ).toBeNull();
  });
});
