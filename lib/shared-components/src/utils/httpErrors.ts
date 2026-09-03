/**
 * True for an HTTP 4xx status — a routine, expected client rejection (wrong
 * password, unknown resource, bad request, …) as opposed to a 5xx or network
 * failure. Callers use this to log client rejections at `warn` instead of
 * `error` so they don't get reported to Rollbar as application errors
 * (LS-9751).
 */
export function isClientRejection(status: number | undefined): boolean {
  return typeof status === 'number' && status >= 400 && status < 500;
}
