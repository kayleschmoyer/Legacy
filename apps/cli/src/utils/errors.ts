/**
 * Helpers for normalizing values caught in a `catch` block.
 *
 * `apps/cli/tsconfig.app.json` sets `strict: false`, so TypeScript infers a bare
 * `catch (error)` binding as `any` rather than `unknown`. Passing that straight
 * into `LOGGER.*` (whose `LogArgs` is a closed union) trips
 * `@typescript-eslint/no-unsafe-argument`, and `String(error)` on a non-narrowed
 * value trips `@typescript-eslint/no-base-to-string`. Normalize through these
 * helpers instead.
 *
 * `toError` is preferred when handing the value to `LOGGER`: the logger's
 * serializer special-cases `instanceof Error` to extract the stack trace, so a
 * normalized `Error` keeps the diagnostics a raw pass-through would have given.
 */

/** Extract a human-readable message from an unknown thrown value. */
export function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? 'Unknown error';
  } catch {
    // Circular references and BigInt values make JSON.stringify throw.
    return 'Unknown error';
  }
}

/** Normalize an unknown thrown value into an `Error`, preserving stacks. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(errorMessage(value));
}
