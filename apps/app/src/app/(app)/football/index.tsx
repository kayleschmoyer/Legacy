import { Redirect } from 'expo-router';

/**
 * `/football` — a redirect into the Home tab, not a screen. Mirrors
 * `(app)/baseball/index.tsx`; see that file for why the path is kept as a
 * redirect rather than deleted outright (LS-8823).
 */
export default function FootballHomeRedirect() {
  return <Redirect href="/home?sport=football" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
