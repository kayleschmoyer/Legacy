import React from 'react';
import { useRouter } from 'expo-router';
import { TwentyQuestionsGame } from '@legacy-sports/shared-components';

/**
 * Mobile Twenty Questions Game Screen (LS-7730)
 *
 * Wraps the shared TwentyQuestionsGame component for mobile navigation.
 * Route: /games/twenty-questions (Expo Router file-based)
 */
export default function TwentyQuestionsScreen() {
  const router = useRouter();

  return <TwentyQuestionsGame onBack={() => router.back()} />;
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
