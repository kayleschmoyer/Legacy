import { Redirect, useLocalSearchParams } from 'expo-router';

export default function BaseballCreateLeagueRedirect() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const href = name
    ? (`/league/create?name=${name}` as never)
    : '/league/create';
  return <Redirect href={href} />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
