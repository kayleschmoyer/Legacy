import React from 'react';
import { TwentyQuestionsGame } from '@legacy-sports/shared-components';

/**
 * Mobile Twenty Questions Game Screen (LS-7730)
 *
 * Wraps the shared TwentyQuestionsGame component for mobile navigation.
 * Route: /games/twenty-questions (Expo Router file-based)
 */
export default function TwentyQuestionsScreen() {
  return <TwentyQuestionsGame />;
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
