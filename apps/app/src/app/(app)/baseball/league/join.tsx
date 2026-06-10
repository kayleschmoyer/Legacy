import { Redirect } from 'expo-router';

export default function BaseballJoinLeagueRedirect() {
  return <Redirect href="/league/join" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
