import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PLAYER_COMPARISON_FEATURE_DESCRIPTION as FEATURE_DESCRIPTION,
  PlayerComparison,
} from '@legacy-sports/shared-components/players';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import { PageMeta } from '../../components/PageMeta';

/**
 * Player Comparison page. The comparison UI is the canonical, cross-platform
 * `PlayerComparison` feature in shared-components (LS-7804); this page wires it
 * to web auth, premium gating, navigation, and document metadata.
 *
 * Free users see the full page (EmptyState, OnePlayerNudge, and the inline
 * PremiumBanner) without a blur overlay so the onboarding pitch is legible
 * (LS-7012). The UpgradeModal is wired to the inline banner's Upgrade CTA.
 */
export function PlayerComparisonPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isPremium = useHasEntitlement(ENTITLEMENTS.player_comparison);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
    <>
      <PageMeta title="Player Comparison" description={FEATURE_DESCRIPTION} />
      <PlayerComparison
        isPremium={isPremium}
        onUpgrade={isPremium ? undefined : () => setShowUpgradeModal(true)}
      />
      {!isPremium && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          featureName="Player Comparison"
          featureDescription={FEATURE_DESCRIPTION}
        />
      )}
    </>
  );
}
