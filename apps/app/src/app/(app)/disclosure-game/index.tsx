import React from 'react';
import { DisclosureGame } from '@legacy-sports/shared-components';

/**
 * Mobile Progressive Disclosure Game Screen (LS-2113)
 *
 * Wraps the shared DisclosureGame component for mobile navigation.
 * Route: /disclosure-game (Expo Router file-based)
 */
export default function DisclosureGameScreen() {
  return <DisclosureGame />;
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
