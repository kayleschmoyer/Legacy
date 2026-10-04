import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Legacy mock-draft join screen (LS-9181) — now the universal /join route
 * (LS-10078), which previews any invite code before joining.
 */
export default function BaseballMockDraftJoinRedirect() {
  const { inviteCode } = useLocalSearchParams<{ inviteCode?: string }>();
  return (
    <Redirect
      href={
        inviteCode
          ? { pathname: '/join/[code]', params: { code: inviteCode } }
          : '/join'
      }
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
