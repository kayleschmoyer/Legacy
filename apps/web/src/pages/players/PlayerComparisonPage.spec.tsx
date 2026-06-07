import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayerComparisonPage } from './PlayerComparisonPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

interface AuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
}
const mockUseAuth = jest.fn(
  (): AuthResult => ({ isAuthenticated: true, isLoading: false }),
);
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (): AuthResult => mockUseAuth(),
}));

const mockUseIsPremium = jest.fn(() => true);
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockUseIsPremium(),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

// PremiumGate — passthrough so the gated child renders for the authed path.
jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="premium-gate">{children}</div>
  ),
}));

// Shared PlayerComparison — stubbed; exposes the onSignIn callback via a button
// so the wrapper's navigation wiring can be asserted in isolation.
jest.mock('@legacy-sports/shared-components', () => ({
  PLAYER_COMPARISON_FEATURE_DESCRIPTION: 'feature description',
  PlayerComparison: ({
    isAuthenticated,
    onSignIn,
  }: {
    isAuthenticated?: boolean;
    onSignIn?: () => void;
  }) => (
    <div data-testid="shared-player-comparison">
      {isAuthenticated === false ? (
        <button type="button" onClick={onSignIn}>
          Get Started Free
        </button>
      ) : (
        <span>comparison tool</span>
      )}
    </div>
  ),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerComparisonPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseIsPremium.mockReturnValue(true);
  });

  it('renders the shared comparison behind the premium gate when authenticated', () => {
    render(<PlayerComparisonPage />);
    expect(screen.getByTestId('premium-gate')).toBeTruthy();
    expect(screen.getByTestId('shared-player-comparison')).toBeTruthy();
    expect(screen.getByText('comparison tool')).toBeTruthy();
  });

  it('shows the sign-in prompt (no premium gate) for unauthenticated visitors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<PlayerComparisonPage />);
    expect(screen.queryByTestId('premium-gate')).toBeNull();
    expect(screen.getByText('Get Started Free')).toBeTruthy();
  });

  it('wires onSignIn to navigate home for unauthenticated visitors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<PlayerComparisonPage />);
    fireEvent.click(screen.getByText('Get Started Free'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
