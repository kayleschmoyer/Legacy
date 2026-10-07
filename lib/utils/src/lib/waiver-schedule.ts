/**
 * Waiver processing schedule — single source of truth for the user-facing
 * copy describing when pending waiver claims are processed (LS-10687).
 *
 * The EventBridge rule `process_waiver_claims` in
 * `terraform/main/eventbridge.tf` fires once a day at 07:00 UTC
 * (`cron(0 7 * * ? *)`). In US Eastern time that is 2am during standard time
 * and 3am during daylight time, so the copy is rendered for the given date
 * and labelled "ET" rather than a fixed "EST"/"EDT".
 */

/** UTC hour of the daily waiver-processing EventBridge rule. Keep in sync with terraform. */
export const WAIVER_PROCESSING_UTC_HOUR = 7;

/**
 * Eastern-time hour of the waiver run on `now`'s UTC date, e.g. "3am ET"
 * in October (EDT) or "2am ET" in January (EST).
 */
export function formatWaiverProcessingTimeEt(now: Date = new Date()): string {
  const run = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      WAIVER_PROCESSING_UTC_HOUR,
    ),
  );
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(run),
  );
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${hour < 12 ? 'am' : 'pm'} ET`;
}

/** Schedule phrase shared by every waiver surface, e.g. "processed daily at 3am ET". */
export function waiverProcessingScheduleCopy(now: Date = new Date()): string {
  return `processed daily at ${formatWaiverProcessingTimeEt(now)}`;
}
