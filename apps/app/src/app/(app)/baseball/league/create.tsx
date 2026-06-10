import { Redirect } from 'expo-router';

export default function BaseballCreateLeagueRedirect() {
  return <Redirect href="/league/create" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
