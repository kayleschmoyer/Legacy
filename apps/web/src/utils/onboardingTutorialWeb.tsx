import React from 'react';
import { Link } from 'react-router-dom';
import type {
  OnboardingLinkRenderProps,
  OnboardingTutorialAnalytics,
} from '@legacy-sports/shared-components/ui';
import {
  trackOnboardingCompleted,
  trackOnboardingSkipped,
  trackOnboardingStarted,
  trackOnboardingStepViewed,
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
