import { LOGGER } from '@legacy-sports/logging';

/**
 * Expo Router native deep-link rewriter (LS-7808).
 *
 * The web invite links are canonical and use the path shape
 * `/games/season-draft/join/<code>` (see `SeasonDraftGame.tsx` share URL and
 * `apps/web` route `/games/season-draft/join/:inviteCode`). The native app
 * exposes a flat route at `/season-draft/join` that reads the code from the
 * `inviteCode` query param, so an incoming web-style path does not map to a
 * file route on its own.
 *
 * `redirectSystemPath` runs for every inbound deep link — both the custom
 * scheme (`legacysports://...`) and universal/app links
 * (`https://legacy-fantasy.com/...`, declared in `app.json`). Here we rewrite
 * the season-draft invite path into the native route + query param so the
 * shared `SeasonDraftJoin` screen opens with the code pre-loaded. All other
 * paths pass through unchanged.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    // Split off any existing query/hash so we only match on the path portion.
    const [pathname] = path.split(/[?#]/);

    // Match `/games/season-draft/join/<code>` or `/season-draft/join/<code>`.
    const match = pathname.match(
      /(?:\/games)?\/season-draft\/join\/([^/]+)\/?$/,
    );
    if (match) {
      const inviteCode = decodeURIComponent(match[1]);
      return `/season-draft/join?inviteCode=${encodeURIComponent(inviteCode)}`;
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
