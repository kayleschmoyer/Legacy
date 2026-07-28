import React from 'react';
import { PreDraftLobby } from './PreDraftLobby';
import { render } from '../../test-utils';

jest.mock('./styles', () => ({ CSS: '' }));
jest.mock('./DraftSlotTradePanel', () => ({
  DraftSlotTradePanel: () => <div data-testid="mock-trade-panel" />,
}));

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
