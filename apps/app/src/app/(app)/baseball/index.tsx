import { Redirect } from 'expo-router';

/**
 * `/baseball` — a redirect into the Home tab, not a screen (LS-8823).
 *
 * The baseball home used to render here as well as inline inside
 * `(tabs)/(home)/home.tsx`, so anything that navigated to `/baseball` (the Create
 * League and mock-draft cancel handlers, the sport switcher) dropped the user
 * on a second, tab-bar-less copy of a screen they were already looking at. The
 * screen now has exactly one mount point — `screens/BaseballHomeScreen`, hosted
 * by the Home tab so scroll position survives (LS-5814) — and this route only
 * forwards to it.
 *
 * The path is kept rather than deleted because it is a live universal-link
 * target: `app.json` verifies every path on `legacy-fantasy.com`, and the web
 * app really does serve `/baseball` (`apps/web` `app.tsx`), so shared links
 * would otherwise open the app on the unmatched-route screen. `?sport=` tells
 * the Home tab which sport to open — see `(tabs)/(home)/home.tsx`.
 *
 * In-app callers must not route here; they belong on `/home` (or
 * `closeToHomeTab` for a cancel/close action).
 */
export default function BaseballHomeRedirect() {
  return <Redirect href="/home?sport=baseball" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
