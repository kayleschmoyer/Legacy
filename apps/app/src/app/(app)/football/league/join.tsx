import { Redirect } from 'expo-router';

export default function FootballJoinLeagueRedirect() {
  return <Redirect href="/league/join" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
