import React from 'react';
import { useRouter } from 'expo-router';
import { SeasonDraftGameCreate } from '@legacy-sports/shared-components';

/**
 * Mobile Season Draft Game Create
 *
 * Form for creating a new season draft game. Wraps the shared
 * SeasonDraftGameCreate component which handles game configuration
 * and creation mutation.
 */
export default function SeasonDraftGameCreateScreen() {
  const router = useRouter();

  return (
    <SeasonDraftGameCreate
      onCreated={(gameId) =>
        router.replace({
          pathname: '/season-draft/[gameId]',
          params: { gameId: String(gameId) },
        })
      }
      onCancel={() => router.back()}
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
