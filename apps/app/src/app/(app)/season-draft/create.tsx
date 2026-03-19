import React from 'react';
import { useRouter } from 'expo-router';
import { SeasonDraftGameCreate } from '@legacy-sports/shared-components';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';

/**
 * Mobile Season Draft Game Create
 *
 * Form for creating a new season draft game. Wraps the shared
 * SeasonDraftGameCreate component which handles game configuration,
 * user search, and game creation mutation.
 */
export default function SeasonDraftGameCreateScreen() {
  const router = useRouter();
  const userInfo = useAuthorizedUserInfo();

  return (
    <SeasonDraftGameCreate
      currentUserId={userInfo.id}
      currentUserName={userInfo.username ?? userInfo.email ?? 'You'}
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
