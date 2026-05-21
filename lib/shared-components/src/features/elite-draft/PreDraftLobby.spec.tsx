import React from 'react';
import { PreDraftLobby } from './PreDraftLobby';
import { render } from '../../test-utils';

jest.mock('./styles', () => ({ CSS: '' }));

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    league: { name: 'Test League', draftStatus: 'pre_draft' },
    sport: 'baseball' as const,
    leagueTeams: [],
    myTeamId: null,
    isOwner: false,
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
