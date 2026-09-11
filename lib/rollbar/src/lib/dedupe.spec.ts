/**
 * Tests for the shared client-side de-duplication used by every Rollbar
 * platform implementation (LS-8343, extracted for LS-8764).
 */

import { DEFAULT_DEDUPE_WINDOW_MS, RollbarDeduper } from './dedupe';

describe('RollbarDeduper', () => {
  it('reports the first occurrence but suppresses identical items within the window', () => {
    const deduper = new RollbarDeduper();

    const first = deduper.apply('error boom', 1_000);
    const second = deduper.apply('error boom', 1_010);
    const third = deduper.apply('error boom', 1_020);

    expect(first).toEqual({ report: true, suppressed: 0 });
    expect(second).toEqual({ report: false, suppressed: 0 });
    expect(third).toEqual({ report: false, suppressed: 0 });
  });

  it('reports again once the window elapses and attaches the suppressed count', () => {
    const deduper = new RollbarDeduper();

    expect(deduper.apply('flood', 0)).toEqual({ report: true, suppressed: 0 });
    expect(deduper.apply('flood', 100)).toEqual({
      report: false,
      suppressed: 0,
    });
    expect(deduper.apply('flood', 200)).toEqual({
      report: false,
      suppressed: 0,
    });

    const afterWindow = deduper.apply('flood', DEFAULT_DEDUPE_WINDOW_MS + 200);
    expect(afterWindow).toEqual({ report: true, suppressed: 2 });
  });

  it('tracks distinct fingerprints independently', () => {
    const deduper = new RollbarDeduper();

    expect(deduper.apply('alpha', 0).report).toBe(true);
    expect(deduper.apply('beta', 0).report).toBe(true);
    expect(deduper.apply('alpha', 10).report).toBe(false);
    expect(deduper.apply('beta', 10).report).toBe(false);
  });

  it('reports every occurrence when de-duplication is disabled (window 0)', () => {
    const deduper = new RollbarDeduper(0);

    expect(deduper.apply('same', 0)).toEqual({ report: true, suppressed: 0 });
    expect(deduper.apply('same', 1)).toEqual({ report: true, suppressed: 0 });
    expect(deduper.apply('same', 2)).toEqual({ report: true, suppressed: 0 });
  });

  it('configure() applies a new window and clears prior state', () => {
    const deduper = new RollbarDeduper();

    expect(deduper.apply('same', 0)).toEqual({ report: true, suppressed: 0 });
    expect(deduper.apply('same', 10)).toEqual({
      report: false,
      suppressed: 0,
    });

    deduper.configure(0);

    // Previously-suppressed state is cleared and dedup is off: every call reports.
    expect(deduper.apply('same', 20)).toEqual({ report: true, suppressed: 0 });
    expect(deduper.apply('same', 30)).toEqual({ report: true, suppressed: 0 });
  });

  it('evicts the oldest fingerprint once the tracked-fingerprint cap is exceeded', () => {
    const deduper = new RollbarDeduper();

    // Fill past the internal cap (500) with distinct fingerprints, oldest first.
    for (let i = 0; i < 501; i++) {
      deduper.apply(`fp-${i}`, i);
    }

    // fp-0 was the oldest window and should have been evicted, so it reports
    // again immediately instead of being suppressed.
    expect(deduper.apply('fp-0', 501)).toEqual({ report: true, suppressed: 0 });
  });
});
