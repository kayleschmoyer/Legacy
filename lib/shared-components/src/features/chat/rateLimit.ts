// Rate-limit handling for league chat sends, shared by web
// (apps/web/src/hooks/useLeagueChat.ts) and mobile
// (apps/app/src/features/leagues/hooks/useLeagueChat.ts).
//
// sendLeagueMessage allows 5 sends per 10s per user per league and rejects
// the rest with RateLimitedError (extensions.code `RATE_LIMITED`). That is
// the limit working as designed, so clients show a short non-blocking notice
// instead of a generic failure, and do not report it as an error
// (LS-10468 / LS-10469).

import { CombinedGraphQLErrors } from '@apollo/client';

/** Inline notice shown when a chat send is throttled by the server. */
export const CHAT_RATE_LIMITED_MESSAGE =
  "You're sending messages too fast — try again in a few seconds.";

/** True when the error is the server's RateLimitedError (`RATE_LIMITED`). */
export function isRateLimitedError(error: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) => (e.extensions?.['code'] as string | undefined) === 'RATE_LIMITED',
    )
  );
}
