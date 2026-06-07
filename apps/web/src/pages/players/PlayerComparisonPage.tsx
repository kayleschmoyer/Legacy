import { useNavigate } from 'react-router-dom';
import {
  PLAYER_COMPARISON_FEATURE_DESCRIPTION as FEATURE_DESCRIPTION,
  PlayerComparison,
} from '@legacy-sports/shared-components';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { PageMeta } from '../../components/PageMeta';

/**
 * Player Comparison page. The comparison UI is the canonical, cross-platform
 * `PlayerComparison` feature in shared-components (LS-7804); this page wires it
 * to web auth, premium gating, navigation, and document metadata.
 */
export function PlayerComparisonPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isPremium = useIsPremium();

  // Unauthenticated visitors see the shared sign-in prompt (no premium gate).
  if (!authLoading && !isAuthenticated) {
    return (
      <>
        <PageMeta title="Player Comparison" description={FEATURE_DESCRIPTION} />
        <PlayerComparison
          isPremium={isPremium}
          isAuthenticated={false}
          authLoading={authLoading}
          onSignIn={() => navigate('/')}
        />
      </>
    );
  }

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName="Player Comparison"
      featureDescription={FEATURE_DESCRIPTION}
    >
      <PageMeta title="Player Comparison" description={FEATURE_DESCRIPTION} />
      <PlayerComparison isPremium={isPremium} />
    </PremiumGate>
  );
}
