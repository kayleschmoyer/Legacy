/**
 * Region check for the analytics consent banner (LS-10764).
 *
 * Product decision: EU/EEA/UK/CH visitors must opt in to analytics; everyone
 * else keeps analytics on by default. There is no server-side geo lookup for
 * the static web app, so the region comes from the browser's IANA time zone.
 * That runs synchronously before first paint, so there is no "region pending"
 * state and no banner flash.
 *
 * Every ambiguity resolves toward requiring consent:
 * - all `Europe/*` zones count, even non-EU ones (e.g. Europe/Istanbul);
 * - UTC/GMT/`Etc/*` and an unreadable zone count, because privacy-hardened
 *   browsers (Tor, Firefox resistFingerprinting) report UTC.
 */

/** Non-`Europe/*` zones inside the EU/EEA/UK/CH (islands, outermost regions). */
const CONSENT_REQUIRED_ZONES = new Set([
  'Africa/Ceuta',
  'America/Cayenne',
  'America/Guadeloupe',
  'America/Marigot',
  'America/Martinique',
  'America/St_Barthelemy',
  'Arctic/Longyearbyen',
  'Asia/Famagusta',
  'Asia/Nicosia',
  'Atlantic/Azores',
  'Atlantic/Canary',
  'Atlantic/Faeroe',
  'Atlantic/Faroe',
  'Atlantic/Madeira',
  'Atlantic/Reykjavik',
  'Indian/Mayotte',
  'Indian/Reunion',
  // Legacy aliases some browsers still report.
  'CET',
  'EET',
  'Eire',
  'GB',
  'GB-Eire',
  'Iceland',
  'MET',
  'Poland',
  'Portugal',
  'WET',
]);

/** Zones that carry no location signal; treated as "unknown". */
const LOCATION_LESS_ZONES = new Set(['UTC', 'GMT', 'UCT', 'Universal', 'Zulu']);

function readTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when analytics must stay off until the visitor opts in.
 * @param timeZone - IANA zone; defaults to the browser's own.
 */
export function isConsentRequiredRegion(
  timeZone: string | undefined = readTimeZone(),
): boolean {
  if (!timeZone) return true;
  if (LOCATION_LESS_ZONES.has(timeZone) || timeZone.startsWith('Etc/')) {
    return true;
  }
  return timeZone.startsWith('Europe/') || CONSENT_REQUIRED_ZONES.has(timeZone);
}
