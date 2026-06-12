import { LOGGER } from '@legacy-sports/logging';

import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageId,
  messages,
} from './messages';

/**
 * Resolve a localized string by message ID (LS-7958).
 *
 * Lookup order: the requested locale, then the default locale, then the raw
 * `id` so the UI still renders *something* rather than crashing. A genuinely
 * missing definition logs the same diagnostic the runtime emitted before this
 * catalog existed, so future gaps surface in logs instead of silently shipping
 * empty strings.
 */
export function formatMessage(
  id: string,
  locale: string = DEFAULT_LOCALE,
): string {
  const requested = messages[locale as Locale];
  const value =
    requested?.[id as MessageId] ?? messages[DEFAULT_LOCALE][id as MessageId];

  if (value === undefined) {
    LOGGER.warn(
      `Requested message ${id} does not have a value in the requested locale ${locale} nor the default locale ${DEFAULT_LOCALE}`,
    );
    return id;
  }

  return value;
}

export { DEFAULT_LOCALE, messages } from './messages';
export type { Locale, MessageId } from './messages';
