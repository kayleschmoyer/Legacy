import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Sport-scoped entry to the shared Join League screen.
 *
 * Forwards both the sport (the screen has no in-form selector — LS-8812 AC2)
 * and any `?inviteCode=` deep-link parameter, which the previous bare
 * `<Redirect href="/league/join" />` silently dropped (AC3).
 */
export default function BaseballJoinLeagueRedirect() {
  const { inviteCode } = useLocalSearchParams<{ inviteCode?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/league/join',
        params: {
          sport: 'baseball',
          ...(inviteCode ? { inviteCode } : {}),
        },
      }}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
