/**
 * Unit tests for MlbStatsApiProvider (LS-3800).
 *
 * Covers: status normalisation so "In Progress" maps to "Live"
 * (the root cause of the game ticker not reporting live data).
 */

import { mapMlbStatus } from './mlb-statsapi';

describe('mapMlbStatus', () => {
  it('maps "In Progress" → "Live"', () => {
    expect(mapMlbStatus('In Progress')).toBe('Live');
  });

  it('maps "Manager Challenge" → "Live"', () => {
    expect(mapMlbStatus('Manager Challenge')).toBe('Live');
  });

  it('maps "Final" → "Final"', () => {
    expect(mapMlbStatus('Final')).toBe('Final');
  });

  it('maps "Game Over" → "Final"', () => {
    expect(mapMlbStatus('Game Over')).toBe('Final');
  });

  it('maps "Completed Early" → "Final"', () => {
    expect(mapMlbStatus('Completed Early')).toBe('Final');
  });

  it('maps "Postponed" → "Postponed"', () => {
    expect(mapMlbStatus('Postponed')).toBe('Postponed');
  });

  it('maps "Cancelled" → "Postponed"', () => {
    expect(mapMlbStatus('Cancelled')).toBe('Postponed');
  });

  it('maps "Suspended" → "Suspended"', () => {
    expect(mapMlbStatus('Suspended')).toBe('Suspended');
  });

  it.each(['Scheduled', 'Pre-Game', 'Warmup', 'Delayed', 'Delayed: Rain'])(
    'maps "%s" → "Preview"',
    (state) => {
      expect(mapMlbStatus(state)).toBe('Preview');
    },
  );

  it('maps undefined → "Preview"', () => {
    expect(mapMlbStatus(undefined)).toBe('Preview');
  });
});
