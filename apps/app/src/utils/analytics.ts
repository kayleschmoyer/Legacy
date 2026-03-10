/**
 * Mobile analytics utility
 *
 * Mirrors the web analytics module interface. Currently logs events via LOGGER.
 * Wire to a real mobile analytics SDK (e.g. Firebase Analytics) when available.
 */

import { LOGGER } from '@legacy-sports/logging';

// Internal state — updated by setUserProperties(); available to all events
let _subscriptionTier: 'free' | 'premium' | undefined;
let _userId: string | undefined;

function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  LOGGER.info('[Analytics]', eventName, {
    subscription_tier: _subscriptionTier,
    user_id: _userId,
    ...params,
  });
}

export function setUserId(userId: string | number): void {
  _userId = String(userId);
  LOGGER.info('[Analytics] User ID set:', _userId);
}

export function setUserProperties(properties: {
  userId?: string | number;
  subscriptionTier?: 'free' | 'premium';
}): void {
  if (properties.subscriptionTier !== undefined) {
    _subscriptionTier = properties.subscriptionTier;
  }
  if (properties.userId !== undefined) {
    setUserId(properties.userId);
  }
  LOGGER.info('[Analytics] User properties set:', properties);
}

export function trackLogin(method: string): void {
  trackEvent('login', { method });
}

export function trackSignup(method: string): void {
  trackEvent('sign_up', { method });
}

export function trackPremiumFeatureClick(featureName: string): void {
  trackEvent('premium_feature_click', {
    feature_name: featureName,
    category: 'monetization',
  });
}

export function trackPremiumFeatureBlocked(featureName: string): void {
  trackEvent('premium_feature_blocked', {
    feature_name: featureName,
    category: 'monetization',
  });
}

export function trackSubscriptionStarted(tier: 'premium'): void {
  trackEvent('subscription_started', { tier, category: 'monetization' });
}

export function trackSubscriptionCancelled(tier: 'premium'): void {
  trackEvent('subscription_cancelled', { tier, category: 'monetization' });
}

export function trackSubscriptionRenewed(tier: 'premium'): void {
  trackEvent('subscription_renewed', { tier, category: 'monetization' });
}
