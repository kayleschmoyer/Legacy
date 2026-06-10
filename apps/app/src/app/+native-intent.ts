import { LOGGER } from '@legacy-sports/logging';

/**
 * Expo Router native deep-link rewriter (LS-7808, LS-5681).
 *
 * The web invite links are canonical and use the path shape
 * `/games/season-draft/join/<code>` (see `SeasonDraftGame.tsx` share URL and
 * `apps/web` route `/games/season-draft/join/:inviteCode`). The native app
 * exposes a flat route at `/season-draft/join` that reads the code from the
 * `inviteCode` query param, so an incoming web-style path does not map to a
 * file route on its own.
 *
 * Trade deep links use the web path shape `/baseball/league/<id>/trades` (or
 * `/football/league/<id>/trades`). The native app has no nested tab route —
 * the league page reads `initialTab` from query params instead, so we rewrite
 * to the flat league route with `initialTab=trades`.
 *
 * `redirectSystemPath` runs for every inbound deep link — both the custom
 * scheme (`legacysports://...`) and universal/app links
 * (`https://legacy-fantasy.com/...`, declared in `app.json`). All other paths
 * pass through unchanged.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    // Split off any existing query/hash so we only match on the path portion.
    const [pathname, existingQuery] = path.split(/[?#]/);

    // Match `/games/season-draft/join/<code>` or `/season-draft/join/<code>`.
    const seasonDraftMatch = pathname.match(
      /(?:\/games)?\/season-draft\/join\/([^/]+)\/?$/,
    );
    if (seasonDraftMatch) {
      const inviteCode = decodeURIComponent(seasonDraftMatch[1]);
      return `/season-draft/join?inviteCode=${encodeURIComponent(inviteCode)}`;
    }

    // Match `/baseball/league/<id>/trades` or `/football/league/<id>/trades`.
    // Rewrites to the flat native league route with initialTab=trades so the
    // league page opens directly on the Trades tab (LS-5681).
    const tradeMatch = pathname.match(
      /^\/(baseball|football)\/league\/(\d+)\/trades\/?$/,
    );
    if (tradeMatch) {
      const sport = tradeMatch[1];
      const leagueId = tradeMatch[2];
      const base = `/${sport}/league/${leagueId}`;
      const query = existingQuery
        ? `${existingQuery}&initialTab=trades`
        : 'initialTab=trades';
      return `${base}?${query}`;
    }

    // Match `/trade-center` deep links — passes leagueId and tradeOfferId
    // through to the standalone TradeCenterPage (LS-7518).
    const tradeCenterMatch = pathname.match(/^\/trade-center\/?$/);
    if (tradeCenterMatch) {
      const query = existingQuery ? `?${existingQuery}` : '';
      return `/TradeCenterPage${query}`;
    }

    return path;
  } catch (error) {
    LOGGER.error(
      'Failed to resolve native deep link path',
      error instanceof Error ? error : new Error(String(error)),
    );
    return path;
  }
}
