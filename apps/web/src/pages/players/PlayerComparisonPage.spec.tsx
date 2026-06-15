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

// UpgradeModal — stubbed to expose open state and feature props for assertions.
jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: ({
    open,
    featureName,
    featureDescription,
    onOpenChange,
  }: {
    open: boolean;
    featureName?: string;
    featureDescription?: string;
    onOpenChange?: (v: boolean) => void;
  }) =>
    open ? (
      <div
        data-testid="upgrade-modal"
        data-feature-name={featureName}
        data-feature-description={featureDescription}
        onClick={() => onOpenChange?.(false)}
      />
    ) : null,
}));

const EXPECTED_FEATURE_DESCRIPTION =
  'Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns.';

// Shared PlayerComparison — stubbed; exposes onSignIn and onUpgrade callbacks
// via buttons so the wrapper's navigation/modal wiring can be asserted.
jest.mock('@legacy-sports/shared-components', () => ({
  PLAYER_COMPARISON_FEATURE_DESCRIPTION:
    'Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns.',
  PlayerComparison: ({
    isAuthenticated,
    onSignIn,
    onUpgrade,
  }: {
    isAuthenticated?: boolean;
    onSignIn?: () => void;
    onUpgrade?: () => void;
  }) => (
    <div data-testid="shared-player-comparison">
      {isAuthenticated === false ? (
        <button type="button" onClick={onSignIn}>
          Get Started Free
        </button>
      ) : (
        <>
          <span>comparison tool</span>
          {onUpgrade ? (
            <button type="button" onClick={onUpgrade}>
              Upgrade
            </button>
          ) : null}
        </>
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

  it('renders the shared comparison without a blur gate when authenticated', () => {
    render(<PlayerComparisonPage />);
    expect(screen.getByTestId('shared-player-comparison')).toBeTruthy();
    expect(screen.getByText('comparison tool')).toBeTruthy();
    expect(mockUseHasEntitlement).toHaveBeenCalledWith(
      ENTITLEMENTS.player_comparison,
    );
  });

  it('does not render the UpgradeModal by default for premium users', () => {
    render(<PlayerComparisonPage />);
    expect(screen.queryByTestId('upgrade-modal')).toBeNull();
  });

  it('does not pass onUpgrade to PlayerComparison for premium users', () => {
    render(<PlayerComparisonPage />);
    // No "Upgrade" button rendered by the stub when onUpgrade is undefined.
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  it('passes onUpgrade to PlayerComparison for free users (AC1)', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    render(<PlayerComparisonPage />);
    expect(screen.getByText('Upgrade')).toBeTruthy();
  });

  it('opens the UpgradeModal when the inline Upgrade CTA is triggered (AC1)', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    render(<PlayerComparisonPage />);
    expect(screen.queryByTestId('upgrade-modal')).toBeNull();
    fireEvent.click(screen.getByText('Upgrade'));
    expect(screen.getByTestId('upgrade-modal')).toBeTruthy();
  });

  it('passes "Player Comparison" as featureName to UpgradeModal (AC1)', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    render(<PlayerComparisonPage />);
    fireEvent.click(screen.getByText('Upgrade'));
    const modal = screen.getByTestId('upgrade-modal');
    expect(modal.dataset.featureName).toBe('Player Comparison');
  });

  it('passes the canonical feature description to UpgradeModal (AC1)', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    render(<PlayerComparisonPage />);
    fireEvent.click(screen.getByText('Upgrade'));
    const modal = screen.getByTestId('upgrade-modal');
    expect(modal.dataset.featureDescription).toBe(EXPECTED_FEATURE_DESCRIPTION);
  });

  it('does not render UpgradeModal for free users until triggered', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    render(<PlayerComparisonPage />);
    // No blur/overlay on initial render — EmptyState is visible (LS-7012).
    expect(screen.queryByTestId('upgrade-modal')).toBeNull();
    expect(screen.getByTestId('shared-player-comparison')).toBeTruthy();
  });

  it('shows the sign-in prompt (no upgrade modal) for unauthenticated visitors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<PlayerComparisonPage />);
    expect(screen.queryByTestId('upgrade-modal')).toBeNull();
    expect(screen.getByText('Get Started Free')).toBeTruthy();
  });

  it('wires onSignIn to navigate home for unauthenticated visitors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<PlayerComparisonPage />);
    fireEvent.click(screen.getByText('Get Started Free'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
