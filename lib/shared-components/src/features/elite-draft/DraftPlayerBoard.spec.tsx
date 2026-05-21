import React from 'react';
import { DraftPlayerBoard } from './DraftPlayerBoard';
import type { DraftPlayer } from './types';
import { render } from '../../test-utils';

// Stub the no-op detail modal + DraftGrid imports already inline-stubbed.
jest.mock('./DraftGrid', () => ({
  DraftGrid: () => <div data-testid="draft-grid" />,
}));
jest.mock('./PlayerCard', () => ({
  PlayerCard: () => <div data-testid="player-card" />,
}));

const basePlayer = (): DraftPlayer => ({
  id: 1,
  name: 'Test Hitter',
  position: '1B',
  avg: 0.305,
  hr: 30,
  rbi: 90,
  runs: 80,
  sb: 5,
  games: 150,
  hits: 170,
  obp: 0.4,
  slg: 0.55,
});

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    viewMode: 'table' as const,
    sport: 'baseball' as const,
    selectedPosition: 'ALL',
    searchTerm: '',
    availablePlayersLoading: false,
    commPickMode: false,
    isOwner: false,
    isMyPick: false,
    pickLoading: false,
    myTeamId: 1,
    draftId: 42,
    filteredPlayers: [basePlayer()],
    myTeam: [],
    positionCounts: {},
    watchlist: [],
    queuedPlayerIds: new Set<number>(),
    autoPickTeamIds: new Set<string>(),
    boardOrderedTeams: [],
    pickHistory: [],
    currentPickInfo: null,
    statsLookup: new Map<number, DraftPlayer>(),
    leagueTeamsLength: 4,
    hasMorePlayers: false,
    loadingMore: false,
    onlineTeamIds: new Set<string>(),
    onSetSearchTerm: jest.fn(),
    onSetSelectedPosition: jest.fn(),
    onSetViewMode: jest.fn(),
    onSetWatchlist: jest.fn(),
    onDraftPlayer: jest.fn(),
    onCommissionerPick: jest.fn(),
    onToggleQueue: jest.fn(),
    onLoadMore: jest.fn(),
    ...overrides,
  };
}

describe('DraftPlayerBoard — sport-aware stat headers (LS-4662)', () => {
  it('renders baseball stat headers (AVG/HR/RBI/SB/WAR) by default', () => {
    const { getByText, queryByText } = render(
      <DraftPlayerBoard {...makeProps()} />,
    );
    expect(getByText('AVG')).toBeTruthy();
    expect(getByText('HR')).toBeTruthy();
    expect(getByText('RBI')).toBeTruthy();
    expect(getByText('SB')).toBeTruthy();
    expect(getByText('WAR')).toBeTruthy();
    expect(queryByText('PASS YDS')).toBeNull();
  });

  it('renders football stat headers (PASS YDS/RUSH YDS/REC/TD/FG) when sport=football', () => {
    const { getByText, queryByText } = render(
      <DraftPlayerBoard {...makeProps({ sport: 'football' })} />,
    );
    expect(getByText('PASS YDS')).toBeTruthy();
    expect(getByText('RUSH YDS')).toBeTruthy();
    expect(getByText('REC')).toBeTruthy();
    expect(getByText('TD')).toBeTruthy();
    expect(getByText('FG')).toBeTruthy();
    expect(queryByText('AVG')).toBeNull();
    expect(queryByText('WAR')).toBeNull();
  });
});
