import React from 'react';
import { Platform } from 'react-native';
import { PreDraftLobby, resolveLobbyOverlayProps } from './PreDraftLobby';
import type { LeagueTeam } from './types';
import { render } from '../../test-utils';

jest.mock('./DraftSlotTradePanel', () => ({
  DraftSlotTradePanel: () => <div data-testid="mock-trade-panel" />,
}));

const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'Alpha Squad', leagueId: 42 },
  { id: '2', name: 'Beta Force', leagueId: 42 },
];

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    league: { name: 'Test League', draftStatus: 'pre_draft' },
    sport: 'baseball' as const,
    leagueId: 42,
    leagueTeams: [],
    myTeamId: null,
    isOwner: false,
    canManageOwnTeam: false,
    isCommissioner: false,
    onlineTeamIds: new Set<string>(),
    customDraftOrder: null,
    setCustomDraftOrder: jest.fn(),
    initError: null,
    initDraftLoading: false,
    onInitializeDraft: jest.fn(),
    ...overrides,
  };
}

describe('PreDraftLobby — sport-aware chrome (LS-4662)', () => {
  it('shows the baseball strapline by default', () => {
    const { getByText, queryByText } = render(
      <PreDraftLobby {...makeProps()} />,
    );
    expect(getByText('Dead Ball Dynasty')).toBeTruthy();
    expect(queryByText('Gridiron Dynasty')).toBeNull();
  });

  it('shows the football strapline when sport=football', () => {
    const { getByText, queryByText } = render(
      <PreDraftLobby {...makeProps({ sport: 'football' })} />,
    );
    expect(getByText('Gridiron Dynasty')).toBeTruthy();
    expect(queryByText('Dead Ball Dynasty')).toBeNull();
  });
});

describe('PreDraftLobby — draft slot trading visibility (LS-8677)', () => {
  it('renders the trade panel when allowDraftSlotTrading is true and the draft has not started', () => {
    const { getByTestId } = render(
      <PreDraftLobby
        {...makeProps({
          league: {
            name: 'Test League',
            draftStatus: 'not-started',
            allowDraftSlotTrading: true,
          },
        })}
      />,
    );
    expect(getByTestId('mock-trade-panel')).toBeTruthy();
  });

  it('hides the trade panel when allowDraftSlotTrading is false', () => {
    const { queryByTestId } = render(
      <PreDraftLobby
        {...makeProps({
          league: {
            name: 'Test League',
            draftStatus: 'not-started',
            allowDraftSlotTrading: false,
          },
        })}
      />,
    );
    expect(queryByTestId('mock-trade-panel')).toBeNull();
  });

  it('hides the trade panel once the draft is queued/live even if the flag is on', () => {
    const { queryByTestId } = render(
      <PreDraftLobby
        {...makeProps({
          league: {
            name: 'Test League',
            draftStatus: 'queued',
            allowDraftSlotTrading: true,
          },
        })}
      />,
    );
    expect(queryByTestId('mock-trade-panel')).toBeNull();
  });
});

describe('PreDraftLobby — draft order list (LS-9061)', () => {
  it('lists teams in default order and marks the current user', () => {
    const { getByText } = render(
      <PreDraftLobby {...makeProps({ leagueTeams: TEAMS, myTeamId: 1 })} />,
    );
    expect(getByText('Alpha Squad (You)')).toBeTruthy();
    expect(getByText('Beta Force')).toBeTruthy();
  });

  it('respects a custom draft order', () => {
    const { container } = render(
      <PreDraftLobby
        {...makeProps({ leagueTeams: TEAMS, customDraftOrder: ['2', '1'] })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('Beta Force')).toBeLessThan(
      text.indexOf('Alpha Squad'),
    );
  });

  it('reorders via the up/down arrows when the viewer is the owner', () => {
    const setCustomDraftOrder = jest.fn();
    const { getByLabelText } = render(
      <PreDraftLobby
        {...makeProps({
          leagueTeams: TEAMS,
          isOwner: true,
          setCustomDraftOrder,
        })}
      />,
    );
    getByLabelText('Move Beta Force up').click();
    expect(setCustomDraftOrder).toHaveBeenCalledWith(['2', '1']);
  });

  it('does not render reorder arrows for non-owners', () => {
    const { queryByLabelText } = render(
      <PreDraftLobby {...makeProps({ leagueTeams: TEAMS, isOwner: false })} />,
    );
    expect(queryByLabelText('Move Beta Force up')).toBeNull();
  });
});

describe('PreDraftLobby — commissioner start controls (LS-9061)', () => {
  it('shows Start Snake/Normal Draft for the owner once 2+ teams exist', () => {
    const onInitializeDraft = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <PreDraftLobby
        {...makeProps({
          leagueTeams: TEAMS,
          isOwner: true,
          onInitializeDraft,
        })}
      />,
    );
    getByText('Start Snake Draft').click();
    expect(onInitializeDraft).toHaveBeenCalledWith('snake');

    getByText('Start Normal Draft').click();
    expect(onInitializeDraft).toHaveBeenCalledWith('linear');
  });

  it('hides start controls for a non-owner', () => {
    const { queryByText } = render(
      <PreDraftLobby {...makeProps({ leagueTeams: TEAMS, isOwner: false })} />,
    );
    expect(queryByText('Start Snake Draft')).toBeNull();
    expect(queryByText(/notified when the commissioner starts/i)).toBeTruthy();
  });

  it('hides start controls with fewer than 2 teams even for the owner', () => {
    const { queryByText } = render(
      <PreDraftLobby
        {...makeProps({ leagueTeams: [TEAMS[0]], isOwner: true })}
      />,
    );
    expect(queryByText('Start Snake Draft')).toBeNull();
  });
});

describe('PreDraftLobby — init error state (LS-9061)', () => {
  it('surfaces the init error message', () => {
    const { getByText } = render(
      <PreDraftLobby
        {...makeProps({
          leagueTeams: TEAMS,
          isOwner: true,
          initError: 'Failed to start the draft.',
        })}
      />,
    );
    expect(getByText('Failed to start the draft.')).toBeTruthy();
  });
});

// LS-9392 regression: `position: 'fixed'` has no React Native equivalent —
// on native the value (plus unhonored right/bottom/left offsets) left this
// screen with no resolved size, rendering a blank page after "Continue to
// Draft Room" for a freshly-created shared mock draft (which lands here,
// draftStatus='not-started', before the live board takes over). Tamagui's
// Jest mock strips position/top/right/bottom/left/flex before they reach the
// DOM (same constraint the LS-8440 PlayerStatsPage native-render regression
// documents), so the platform branch is asserted directly against the pure
// `resolveLobbyOverlayProps` helper rather than through rendered output.
describe('PreDraftLobby — overlay positioning is platform-safe (LS-9392)', () => {
  it('never returns position "fixed" for a native platform', () => {
    expect(resolveLobbyOverlayProps('ios')).toEqual({ flex: 1 });
    expect(resolveLobbyOverlayProps('android')).toEqual({ flex: 1 });
  });

  it('keeps the existing fixed, below-nav positioning on web', () => {
    expect(resolveLobbyOverlayProps('web')).toEqual({
      position: 'fixed',
      top: 75,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it(`renders lobby content under the current platform (Platform.OS === "${Platform.OS}") without throwing`, () => {
    expect(() =>
      render(<PreDraftLobby {...makeProps({ leagueTeams: TEAMS })} />),
    ).not.toThrow();
  });
});
