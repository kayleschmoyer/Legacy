/**
 * Normalises a caught `unknown` into an `Error` so it can be handed to
 * `LOGGER` as an Error instance (which keeps the stack trace for Rollbar)
 * instead of being stringified.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
