/**
 * Hook that announces page title to screen readers on route change.
 * Uses the global polite announcer so navigation doesn't disrupt the user
 * but still conveys the new page context.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { announcePolite } from '../utils/a11y';

/**
 * Map of route patterns to human-readable page titles.
 * More specific patterns should come first.
 */
const ROUTE_TITLES: Array<{
  pattern: RegExp;
  title: string | ((match: RegExpMatchArray) => string);
}> = [
  { pattern: /^\/baseball\/league\/\d+\/draft$/, title: 'Live Draft' },
  { pattern: /^\/baseball\/mock-draft$/, title: 'Mock Draft' },
  { pattern: /^\/baseball\/league\/create$/, title: 'Create League' },
  { pattern: /^\/baseball\/league\/join/, title: 'Join League' },
  { pattern: /^\/baseball\/league\/\d+/, title: 'League Details' },
  { pattern: /^\/baseball/, title: 'Baseball' },
  { pattern: /^\/football/, title: 'Football' },
  { pattern: /^\/players\/compare/, title: 'Player Comparison' },
  { pattern: /^\/players\/stats/, title: 'Player Stats' },
  { pattern: /^\/players\/(\d+)/, title: 'Player Details' },
  { pattern: /^\/players/, title: 'Players' },
  { pattern: /^\/about/, title: 'About' },
  { pattern: /^\/help/, title: 'Help' },
  { pattern: /^\/management/, title: 'Management' },
  { pattern: /^\/profile/, title: 'Profile Settings' },
  { pattern: /^\/preferences/, title: 'Preferences' },
  { pattern: /^\/admin/, title: 'Admin' },
  { pattern: /^\/$/, title: 'Home' },
];

function getPageTitle(pathname: string): string {
  for (const route of ROUTE_TITLES) {
    const match = pathname.match(route.pattern);
    if (match) {
      return typeof route.title === 'function'
        ? route.title(match)
        : route.title;
    }
  }
  return 'Page';
}

/**
 * Announce the current page title to screen readers on every route change.
 * Place this in your root App component alongside usePageTracking.
 */
export function useRouteAnnouncer(): void {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Don't announce on initial render — the page title is already visible
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const title = getPageTitle(location.pathname);
    announcePolite(`Navigated to ${title}`);
  }, [location.pathname]);
}
