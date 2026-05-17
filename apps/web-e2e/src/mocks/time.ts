/**
 * Fixed clock for hermetic E2E mocks.
 *
 * Hermetic tests must not depend on wall-clock time. Mock factories that
 * embed a timestamp (`lastUpdated`, `pickedAt`, `timestamp`, "ago" relative
 * times, etc.) should anchor on `FIXED_NOW_*` constants so the produced
 * response is byte-identical across runs and across tests in the same
 * worker.
 *
 * Helpers like `agoIso(ms)` compute deterministic offsets from `FIXED_NOW`
 * without ever reading wall-clock time.
 */

/** Anchor: 2026-04-01T12:00:00Z — start of the in-app baseball season. */
export const FIXED_NOW_ISO = '2026-04-01T12:00:00.000Z';

/** Unix epoch ms for `FIXED_NOW_ISO`. */
export const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);

/** Unix epoch seconds for `FIXED_NOW_ISO`. */
export const FIXED_NOW_SEC = Math.floor(FIXED_NOW_MS / 1000);

/** ISO timestamp `offsetMs` milliseconds before `FIXED_NOW`. */
export function agoIso(offsetMs: number): string {
  return new Date(FIXED_NOW_MS - offsetMs).toISOString();
}

/** ISO timestamp `offsetMs` milliseconds after `FIXED_NOW`. */
export function fromNowIso(offsetMs: number): string {
  return new Date(FIXED_NOW_MS + offsetMs).toISOString();
}
