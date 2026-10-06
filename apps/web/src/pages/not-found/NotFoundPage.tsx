import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { EmptyState } from '@legacy-sports/shared-components';
import { PageMeta } from '../../components/PageMeta';
import { FONT_BODY } from '../../constants/typography';
import { BRAND_GOLD, TEXT_ON_GOLD } from '../../constants/colors';

/**
 * Sport-less league URLs (`/league/14109`, `/league/14109/standings`) predate
 * the per-sport route prefixes and are still reachable from old bookmarks and
 * shared links. League ids were baseball-only when that shape existed, so they
 * map onto the baseball league routes (LS-10749, folded into LS-10704).
 */
const LEGACY_LEAGUE_PATH = /^\/league\/(\d+)(\/.*)?$/;

/** Friendly fallback for any URL that matches no route (LS-10704). */
export function NotFoundPage() {
  return (
    <>
      <PageMeta title="Page not found" />
      <EmptyState
        title="Page not found"
        description="We couldn't find the page you were looking for. It may have moved, or the link may be wrong."
        action={
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: BRAND_GOLD,
              color: TEXT_ON_GOLD,
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 14,
              borderRadius: 9999,
              padding: '12px 20px',
              minHeight: 44,
              boxSizing: 'border-box',
              textDecoration: 'none',
            }}
          >
            Go to home
          </Link>
        }
      />
    </>
  );
}

/**
 * Catch-all route element: redirects legacy sport-less league URLs to their
 * baseball equivalents and renders {@link NotFoundPage} for everything else.
 * Registered as the last `<Route path="*">` so it never shadows a real route.
 */
export function CatchAllRoute() {
  const { pathname, search, hash } = useLocation();
  const legacyLeague = LEGACY_LEAGUE_PATH.exec(pathname);
  if (legacyLeague) {
    const [, leagueId, rest = ''] = legacyLeague;
    return (
      <Navigate
        to={`/baseball/league/${leagueId}${rest}${search}${hash}`}
        replace
      />
    );
  }
  return <NotFoundPage />;
}
