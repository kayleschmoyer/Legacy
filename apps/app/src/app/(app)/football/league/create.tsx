import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Football entry point for Create League. Mirrors the baseball wrapper: the
 * unified wizard reads the sport from `?sport=` rather than an in-form
 * selector (LS-8809).
 */
export default function FootballCreateLeagueRedirect() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const href = name
    ? (`/league/create?sport=football&name=${name}` as never)
    : ('/league/create?sport=football' as never);
  return <Redirect href={href} />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
