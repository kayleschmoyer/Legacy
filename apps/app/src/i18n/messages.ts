/**
 * Mobile app message catalog (LS-7958).
 *
 * The Share / "Invite Friends" flow looks up its user-facing copy by stable
 * message ID. Before this catalog existed the lookups fell through and the app
 * logged, for each ID:
 *
 *   Requested message <id> does not have a value in the requested locale en-US
 *   nor the default locale en-US
 *
 * leaving users with empty/fallback strings. The IDs below are the design-system
 * message IDs from that capture; their values were reconstructed from the Invite
 * Friends modal's existing copy (the app's only Share screen).
 *
 * To extend: add new locales as sibling keys of `en-US`, and new strings as
 * additional entries keyed by their stable message ID.
 */

/** The app's default (and currently only) locale. */
export const DEFAULT_LOCALE = 'en-US';

export type Locale = typeof DEFAULT_LOCALE;

/** Stable message IDs requested by the Share / Invite Friends flow. */
export type MessageId = '2F5EsD' | 'PA8TUT' | '0uDEd6' | 'y2oJvM';

export const messages: Record<Locale, Record<MessageId, string>> = {
  'en-US': {
    // Invite Friends modal heading.
    '2F5EsD': 'Invite Friends',
    // Prompt shown above the list of leagues to share.
    PA8TUT: 'Choose a league to share an invite link',
    // Empty state shown when the user has no leagues to invite anyone to.
    '0uDEd6':
      'Create or join a league first, then share an invite link so friends can join you.',
    // Dismiss button.
    y2oJvM: 'Close',
  },
};
