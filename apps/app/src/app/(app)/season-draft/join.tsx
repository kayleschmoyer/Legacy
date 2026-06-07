import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { SeasonDraftJoin } from '@legacy-sports/shared-components';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';

/**
 * Mobile Season Draft Join (by invite code)
 *
 * Invite-link landing screen. Wraps the shared `SeasonDraftJoin` component
 * (web-canonical, see LS-7790) and supplies native navigation. The invite
 * code arrives as the `inviteCode` query param — either typed directly into
 * `/season-draft/join?inviteCode=<code>` or rewritten from the web-style
 * deep-link path `/games/season-draft/join/<code>` by `app/+native-intent.ts`.
 *
 * On a successful join, navigates to the live game screen.
 */
export default function SeasonDraftJoinScreen(): React.JSX.Element {
  const params = useLocalSearchParams();
  const router = useRouter();
  const userInfo = useAuthorizedUserInfo();

  // expo-router types search params loosely (`any`); narrow defensively so a
  // missing or array-shaped param can never leak into the GraphQL query.
  const rawInviteCode: unknown = params.inviteCode;
  const code =
    typeof rawInviteCode === 'string'
      ? rawInviteCode
      : Array.isArray(rawInviteCode) && typeof rawInviteCode[0] === 'string'
        ? rawInviteCode[0]
        : undefined;

  if (!code) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
        <Text color="$brandSeamRedLight">Invalid invite link.</Text>
      </YStack>
    );
  }

  return (
    <SeasonDraftJoin
      inviteCode={code}
      viewerName={userInfo.username ?? userInfo.email ?? undefined}
      onJoined={(gameId) =>
        router.replace({
          pathname: '/season-draft/[gameId]',
          params: { gameId: String(gameId) },
        })
      }
      onCancel={() => router.back()}
      onBrowseGames={() => router.replace({ pathname: '/season-draft' })}
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
