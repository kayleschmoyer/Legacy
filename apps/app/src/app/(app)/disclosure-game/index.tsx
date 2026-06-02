import React from 'react';
import { useRouter } from 'expo-router';
import { DisclosureGame } from '@legacy-sports/shared-components';

/**
 * Mobile Progressive Disclosure Game Screen (LS-2113)
 *
 * Wraps the shared DisclosureGame component for mobile navigation.
 * Route: /disclosure-game (Expo Router file-based)
 */
export default function DisclosureGameScreen() {
  const router = useRouter();

  return <DisclosureGame onBack={() => router.back()} />;
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
