import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ENTITLEMENTS } from '@legacy-sports/utils';
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

const mockUseHasEntitlement = jest.fn((_key: string) => true);
jest.mock('../../hooks/useIsPremium', () => ({
  useHasEntitlement: (key: string) => mockUseHasEntitlement(key),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

// PremiumGate — passthrough so the gated child renders for the authed path.
// Props are forwarded as data attributes so tests can assert on them without
// importing the real component (which has Stripe/router deps).
jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({
    children,
    featureName,
    featureDescription,
  }: {
    children: React.ReactNode;
    featureName?: string;
    featureDescription?: string;
  }) => (
    <div
      data-testid="premium-gate"
      data-feature-name={featureName}
      data-feature-description={featureDescription}
    >
      {children}
    </div>
  ),
}));

const EXPECTED_FEATURE_DESCRIPTION =
  'Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns.';

// Shared PlayerComparison — stubbed; exposes the onSignIn callback via a button
// so the wrapper's navigation wiring can be asserted in isolation.
jest.mock('@legacy-sports/shared-components', () => ({
  PLAYER_COMPARISON_FEATURE_DESCRIPTION:
    'Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns.',
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
    mockUseHasEntitlement.mockReturnValue(true);
  });

  it('renders the shared comparison behind the premium gate when authenticated', () => {
    render(<PlayerComparisonPage />);
    expect(screen.getByTestId('premium-gate')).toBeTruthy();
    expect(screen.getByTestId('shared-player-comparison')).toBeTruthy();
    expect(screen.getByText('comparison tool')).toBeTruthy();
    // The gate must be keyed to the player-comparison entitlement.
    expect(mockUseHasEntitlement).toHaveBeenCalledWith(
      ENTITLEMENTS.player_comparison,
    );
  });

  it('passes "Player Comparison" as featureName to PremiumGate (AC1)', () => {
    render(<PlayerComparisonPage />);
    const gate = screen.getByTestId('premium-gate');
    expect(gate.dataset.featureName).toBe('Player Comparison');
  });

  it('passes the canonical feature description to PremiumGate (AC1)', () => {
    render(<PlayerComparisonPage />);
    const gate = screen.getByTestId('premium-gate');
    expect(gate.dataset.featureDescription).toBe(EXPECTED_FEATURE_DESCRIPTION);
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
