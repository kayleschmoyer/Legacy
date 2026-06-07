import React from 'react';
import { useRouter } from 'expo-router';
import { HomeScreen } from '@legacy-sports/shared-components';

/**
 * The Home tab renders the shared, cross-platform `HomeScreen` component from
 * `lib/shared-components` rather than re-implementing the UI here — UI is shared
 * across web and native and adapts by viewport. This is the interim home; the
 * full shared home/dashboard (unified with the web `/` route) is tracked in
 * LS-7791, under the shared-components-first principle (LS-7790).
 */
export default function HomeTab() {
  const router = useRouter();

  return (
    <HomeScreen
      onSportPress={(sportKey) =>
        router.push(`/${sportKey}` as Parameters<typeof router.push>[0])
      }
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
