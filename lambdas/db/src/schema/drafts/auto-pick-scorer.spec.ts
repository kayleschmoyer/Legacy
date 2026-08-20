import { formatBenchPickReason } from './auto-pick-scorer';

/**
 * LS-9476 — the bench announcement must never quote a projection the system
 * does not hold. The football candidate pool selects
 * COALESCE(p.projected_fantasy_points, 0), and that column is unset for every
 * football player, so this branch is what football drafts actually hit.
 */
describe('formatBenchPickReason (LS-9476)', () => {
  it('quotes the figure when a projection was served', () => {
    expect(
      formatBenchPickReason({ fpg: 18.25, slotsCoverable: 3, totalSlots: 5 }),
    ).toBe(
      'Best available (bench) — 18.3 projected matchup pts, starts in 3/5 slots',
    );
  });

  it('quotes no figure when no projection was served', () => {
    const reason = formatBenchPickReason({
      fpg: 0,
      slotsCoverable: 2,
      totalSlots: 4,
    });

    expect(reason).toBe(
      'Best available (bench) — starts in 2/4 slots (no projection available)',
    );
    // The claim itself must be absent, not merely zero-valued.
    expect(reason).not.toContain('projected matchup pts');
    expect(reason).not.toContain('0.0');
  });

  it('still reports slot coverage when no projection was served', () => {
    // Versatility is the one thing genuinely known in that case, so it must
    // survive the rewording rather than being dropped with the number.
    expect(
      formatBenchPickReason({ fpg: 0, slotsCoverable: 1, totalSlots: 7 }),
    ).toContain('starts in 1/7 slots');
  });

  it('treats a negative fpg as unserved rather than quoting it', () => {
    const reason = formatBenchPickReason({
      fpg: -3,
      slotsCoverable: 1,
      totalSlots: 2,
    });

    expect(reason).not.toContain('-3');
    expect(reason).toContain('no projection available');
  });
});
