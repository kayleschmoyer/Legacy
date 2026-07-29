import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Baseball entry point for Create League. The unified wizard has no in-form
 * sport selector (LS-8809), so the sport has to arrive from the route — this
 * wrapper forwards it as `?sport=baseball`. `sport` is listed first so a name
 * containing an unencoded `&` can only truncate the name, never the sport.
 */
export default function BaseballCreateLeagueRedirect() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const href = name
    ? (`/league/create?sport=baseball&name=${name}` as never)
    : ('/league/create?sport=baseball' as never);
  return <Redirect href={href} />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
