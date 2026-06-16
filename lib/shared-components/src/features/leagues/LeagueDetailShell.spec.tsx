import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  getDraftStatusChipDef,
  type HeroLeague,
  LeagueDetailShell,
  type LeagueDetailShellProps,
  type LeagueTabDef,
} from './LeagueDetailShell';
import { render } from '../../test-utils';

// `Settings` (commish tab) and `Roster` (member tab) are chosen for clarity.
const TABS: readonly LeagueTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'roster', label: 'Roster', memberOnly: true },
  { id: 'trades', label: 'Trades' },
  { id: 'commish', label: 'Settings', commishOnly: true },
];

const baseLeague: HeroLeague = {
  name: 'Dead Ball Dynasty',
  scoringLabel: 'Standard',
  draftStatus: 'completed',
  currentWeek: 14,
  totalMatchups: 22,
  teamCount: 12,
  inviteCode: 'ABC123',
};

function renderShell(overrides: Partial<LeagueDetailShellProps> = {}) {
  const props: LeagueDetailShellProps = {
    sport: 'baseball',
    league: baseLeague,
    role: 'commish',
    onRoleChange: jest.fn(),
    season: '2025',
    onSeasonChange: jest.fn(),
    seasons: [{ value: '2025', label: 'Season 2025 · Active' }],
    isCommissioner: true,
    isMember: true,
    tabs: TABS,
    activeTab: 'overview',
    onTabChange: jest.fn(),
    onBack: jest.fn(),
    onInvite: jest.fn(),
    ...overrides,
  };
  return render(<LeagueDetailShell {...props} />);
}

describe('LeagueDetailShell', () => {
  it('renders the league name in the hero', () => {
    const { getAllByText } = renderShell();
    expect(getAllByText('Dead Ball Dynasty').length).toBeGreaterThan(0);
  });

  it('maps a completed draft to "Season Active"', () => {
    const { getByText } = renderShell();
    expect(getByText('Season Active')).toBeTruthy();
  });

  // The `live` chip animates (Animated.Value), which the jsdom react-native
  // mock stubs out — so the in-progress/drafting mapping is asserted on the
  // pure helper rather than by rendering.
  it('maps draft statuses to the right chip tone + label', () => {
    expect(getDraftStatusChipDef('in-progress')).toEqual({
      tone: 'live',
      label: 'Drafting · Live',
    });
    expect(getDraftStatusChipDef('drafting')).toEqual({
      tone: 'live',
      label: 'Drafting · Live',
    });
    expect(getDraftStatusChipDef('queued')).toEqual({
      tone: 'soon',
      label: 'Draft Queued',
    });
    expect(getDraftStatusChipDef('not-started')).toEqual({
      tone: 'pre',
      label: 'Pre-Draft',
    });
    expect(getDraftStatusChipDef('completed')).toEqual({
      tone: 'active',
      label: 'Season Active',
    });
    expect(getDraftStatusChipDef(null)).toBeNull();
    expect(getDraftStatusChipDef('weird')).toEqual({
      tone: 'fin',
      label: 'weird',
    });
  });

  it('renders no draft chip when the status is absent', () => {
    const { queryByText } = renderShell({
      league: { ...baseLeague, draftStatus: null },
    });
    expect(queryByText('Season Active')).toBeNull();
    expect(queryByText('Drafting · Live')).toBeNull();
  });

  it('gates the commissioner-only tab when viewing as a member', () => {
    const { queryByText } = renderShell({ role: 'member' });
    expect(queryByText('Settings')).toBeNull();
  });

  it('hides member-only and commish-only tabs for a pure spectator', () => {
    const { queryByText } = renderShell({
      isCommissioner: false,
      isMember: false,
      role: 'spectator',
    });
    expect(queryByText('Roster')).toBeNull();
    expect(queryByText('Settings')).toBeNull();
  });

  it('fires onTabChange when a tab is pressed', () => {
    const onTabChange = jest.fn();
    const { getByText } = renderShell({ onTabChange });
    fireEvent.click(getByText('Trades'));
    expect(onTabChange).toHaveBeenCalledWith('trades');
  });

  it('fires onBack from the hero back link', () => {
    const onBack = jest.fn();
    const { getByText } = renderShell({ onBack });
    fireEvent.click(getByText('Leagues'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('fires onInvite from the hero invite action', () => {
    const onInvite = jest.fn();
    const { getByRole } = renderShell({ onInvite });
    fireEvent.click(getByRole('button', { name: 'Invite' }));
    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it('copies the invite code to the clipboard when the code is pressed', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { getByRole, findByText } = renderShell();
    fireEvent.click(
      getByRole('button', { name: 'Copy league invite code ABC123' }),
    );

    expect(writeText).toHaveBeenCalledWith('ABC123');
    // Confirmation feedback appears after the async clipboard write resolves.
    expect(await findByText('Copied')).toBeTruthy();
  });

  it('does not throw when the clipboard API is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });

    const { getByRole, queryByText } = renderShell();
    expect(() =>
      fireEvent.click(
        getByRole('button', { name: 'Copy league invite code ABC123' }),
      ),
    ).not.toThrow();
    expect(queryByText('Copied')).toBeNull();
  });

  it('renders the pending-trade badge on the trades tab', () => {
    const { getByText } = renderShell({ pendingTradeCount: 3 });
    expect(getByText('3')).toBeTruthy();
  });

  it('renders an Analytics action when a handler is provided', () => {
    const onAnalytics = jest.fn();
    const { getByText } = renderShell({ onAnalytics });
    fireEvent.click(getByText('Analytics'));
    expect(onAnalytics).toHaveBeenCalledTimes(1);
  });
});
