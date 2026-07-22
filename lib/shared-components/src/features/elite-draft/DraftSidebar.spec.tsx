import React from 'react';
import { DraftSidebar } from './DraftSidebar';
import { render, screen } from '../../test-utils';

jest.mock('./DraftIntelligence', () => ({
  DraftIntelligence: () => (
    <div data-testid="draft-intelligence">DraftIntelligence</div>
  ),
}));
jest.mock('./DraftQueuePanel', () => ({
  DraftQueuePanel: () => null,
}));
jest.mock('./CurrentPickPanel', () => ({
  CurrentPickPanel: () => null,
}));
jest.mock('./CircularTimer', () => ({
  CircularTimer: () => null,
}));
jest.mock('./BaseballCard', () => ({
  BaseballCard: () => null,
}));
jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const makeDiv =
    (tag = 'div') =>
    ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [k: string]: unknown;
    }) =>
      React.createElement(tag, rest, children);
  const makeButton = ({
    children,
    onPress,
    ...rest
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    [k: string]: unknown;
  }) => React.createElement('button', { ...rest, onClick: onPress }, children);
  return {
    Card: makeDiv('div'),
    YStack: makeDiv('div'),
    XStack: makeDiv('div'),
    Text: makeDiv('span'),
    Button: makeButton,
  };
});
jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => null,
}));
jest.mock('../../utils/colors', () => ({
  ...jest.requireActual<typeof import('../../utils/colors')>(
    '../../utils/colors',
  ),
  BRAND_NAVY_LIGHT: '#1A2A4A',
  withAlpha: (color: string, _alpha: number) => color,
}));

const baseProps = {
  draftPaused: false,
  currentPick: 1,
  round: 1,
  timeRemaining: 60,
  isMyPick: true,
  pickTimeLimitSeconds: 90,
  pickDeadline: null,
  isCommissioner: false,
  isOwner: false,
  isGeneralManager: true,
  draftId: 1,
  commPickMode: false,
  autoPickDisabled: false,
  pauseLoading: false,
  resumeLoading: false,
  commPickLoading: false,
  autoPickDisabledLoading: false,
  initDraftLoading: false,
  currentPickInfo: null,
  currentPickTeamId: null,
  currentPickLoadError: null,
  myTeamId: 1,
  onlineTeamIds: new Set<string>(),
  myTeam: [],
  myTeamPicks: [],
  positionCounts: {},
  pickHistory: [],
  statsLookup: new Map(),
  chatOpen: false,
  onPauseDraft: jest.fn(),
  onResumeDraft: jest.fn(),
  onToggleCommPickMode: jest.fn(),
  onToggleAutoPickDisabled: jest.fn(),
  onInitializeDraft: jest.fn(),
  onRefresh: jest.fn(),
  onToggleUserAutoPick: jest.fn(),
  isMyTeamAutoPick: false,
  toggleAutoPickLoading: false,
  onToggleChat: jest.fn(),
  onRetryCurrentPick: jest.fn(),
  onShowToast: jest.fn(),
  teamNameById: () => 'Team',
  onDraftPlayer: jest.fn(),
  onCommissionerPick: jest.fn(),
};

describe('DraftSidebar premium gating (LS-5022)', () => {
  it('shows DraftIntelligence for premium users when isMyPick', () => {
    render(<DraftSidebar {...baseProps} isPremium isMyPick />);
    expect(screen.getByTestId('draft-intelligence')).toBeTruthy();
  });

  it('hides DraftIntelligence for non-premium users when isMyPick', () => {
    render(<DraftSidebar {...baseProps} isPremium={false} isMyPick />);
    expect(screen.queryByTestId('draft-intelligence')).toBeNull();
  });

  it('shows locked gate message for non-premium users when isMyPick', () => {
    render(<DraftSidebar {...baseProps} isPremium={false} isMyPick />);
    expect(screen.getByText('Draft Recommendations')).toBeTruthy();
    expect(screen.getByText('Available with Premium leagues.')).toBeTruthy();
  });

  it('does not render PremiumGate when isMyPick is false', () => {
    render(<DraftSidebar {...baseProps} isPremium={false} isMyPick={false} />);
    expect(screen.queryByTestId('draft-intelligence')).toBeNull();
    expect(screen.queryByText('Draft Recommendations')).toBeNull();
  });
});
