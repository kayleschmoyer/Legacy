export * from './lib/allowed-positions';
export * from './lib/sport-defaults';
export {
  shuffleArray,
  cryptoRandomInt,
  cryptoRandomFloat,
  cleanDescription,
  extractPlayerNameFromDescription,
} from './lib/utils';
export * from './lib/ErrorHandling';
export * from './lib/help-content';
export * from './lib/league-utils';
export * from './lib/notification-copy';
export * from './lib/notification-types';
export * from './lib/scoring-math';
export * from './lib/season-constants';
// Node.js-only exports (DbCredentials, DbOptions, LambdaHelpers, version) are in '@legacy-sports/utils/node'

/**
 * Formats an ISO timestamp for draft scheduling display.
 * Returns a locale-aware string like "Apr 20, 8:00 PM".
 * Returns an empty string for null/undefined/invalid input.
 */
export function formatDraftDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }) +
    ', ' +
    d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  );
}
