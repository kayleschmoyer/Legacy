import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayerStatsRoute } from './PlayerStatsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockFootballEnabled = true;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureValue: () => mockFootballEnabled,
}));

jest.mock('@legacy-sports/shared-components/players', () => ({
  PlayerStatsPage: () => null,
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => true,
  useHasEntitlement: () => true,
}));

jest.mock('../../components/PlayerDetailModal', () => ({
  PlayerDetailModal: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerIdByBrefIdQuery: () => ({ data: null, loading: false }),
  useGetUserLeaguesQuery: () => ({ data: null, loading: false }),
  Sport: { Baseball: 'Baseball', Football: 'Football' },
}));

jest.mock('../../hooks/useLeagueRosteredPlayerIds', () => ({
  useLeagueRosteredPlayerIds: () => ({ playerIds: new Set(), loading: false }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerStatsRoute redirect', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSearchParams = new URLSearchParams();
    mockFootballEnabled = true;
  });

  it('redirects to /football/players when sport=nfl', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    render(<PlayerStatsRoute />);
    expect(mockNavigate).toHaveBeenCalledWith('/football/players', {
      replace: true,
    });
  });

  it('does not redirect when sport=mlb', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    render(<PlayerStatsRoute />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when sport param is absent', () => {
    render(<PlayerStatsRoute />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('PlayerStatsRoute sport switcher', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
  });

  it('renders MLB and NFL sport controls when football is enabled', () => {
    render(<PlayerStatsRoute />);
    expect(
      screen.getByRole('button', { name: /view mlb statistics/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /switch to nfl statistics/i }),
    ).toBeInTheDocument();
  });

  it('navigates to /football/players when the NFL control is clicked', () => {
    render(<PlayerStatsRoute />);
    fireEvent.click(
      screen.getByRole('button', { name: /switch to nfl statistics/i }),
    );
    // Deliberate navigation pushes (no { replace: true }) so Back works.
    expect(mockNavigate).toHaveBeenCalledWith('/football/players');
  });

  it('hides the sport switcher when football is disabled', () => {
    mockFootballEnabled = false;
    render(<PlayerStatsRoute />);
    expect(
      screen.queryByRole('button', { name: /switch to nfl statistics/i }),
    ).not.toBeInTheDocument();
  });
});
