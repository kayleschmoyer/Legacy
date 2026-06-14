import React from 'react';
import { render } from '@testing-library/react';
import { PlayerStatsRoute } from './PlayerStatsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
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

jest.mock('../../api/db/graphql.generated', () => ({
  useGetPlayerIdByBrefIdQuery: () => ({ data: null, loading: false }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerStatsRoute redirect', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSearchParams = new URLSearchParams();
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
