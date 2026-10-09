import React from 'react';
import { Link } from 'react-router-dom';
import type {
  OnboardingLinkRenderProps,
  OnboardingTutorialAnalytics,
  OnboardingUpsell,
} from '@legacy-sports/shared-components/ui';
import {
  trackOnboardingCompleted,
  trackOnboardingSkipped,
  trackOnboardingStarted,
  trackOnboardingStepViewed,
  trackOnboardingUpsellClicked,
  trackOnboardingUpsellDismissed,
  trackOnboardingUpsellShown,
} from './analytics';

/** Maps the shared tutorial's funnel hooks onto web analytics (LS-6903). */
export const onboardingTutorialAnalytics: OnboardingTutorialAnalytics = {
  onStarted: trackOnboardingStarted,
  onStepViewed: trackOnboardingStepViewed,
  onCompleted: trackOnboardingCompleted,
  onSkipped: trackOnboardingSkipped,
};

/** Renders the tutorial's final-step CTAs as react-router links. */
export function renderOnboardingLink({
  href,
  onPress,
  children,
}: OnboardingLinkRenderProps): React.ReactNode {
  return (
    <Link to={href} onClick={onPress} style={{ textDecoration: 'none' }}>
      {children}
    </Link>
  );
}

/**
 * Builds the end-of-onboarding Premium upsell (LS-6912). Hosts call this only
 * for confirmed non-premium users and pass the result as `upsell`.
 */
export function buildOnboardingUpsell(
  navigateTo: (path: string) => void,
): OnboardingUpsell {
  return {
    onShown: trackOnboardingUpsellShown,
    onDismiss: trackOnboardingUpsellDismissed,
    onUpgrade: () => {
      trackOnboardingUpsellClicked();
      navigateTo('/pricing');
    },
  };
}
