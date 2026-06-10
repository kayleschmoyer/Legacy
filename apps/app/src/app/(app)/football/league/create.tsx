import { Redirect } from 'expo-router';

export default function FootballCreateLeagueRedirect() {
  return <Redirect href="/league/create" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
