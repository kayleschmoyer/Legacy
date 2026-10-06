import React from 'react';
import { Redirect } from 'expo-router';

/**
 * The authenticated `(app)` group lands on the tab navigator. The old flat
 * drawer (and the sport-picker that used to live here) was removed in favor of
 * the five-tab shell — the sport-picker content now lives in the Home tab
 * (`(tabs)/(home)/home.tsx`). This route stays as a redirect so existing entry points
 * that target `/` after login/logout (`router.replace('/')`) continue to land
 * users on the tab bar without each call site needing to know the tab path.
 */
export default function AppIndex() {
  return <Redirect href="/home" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
