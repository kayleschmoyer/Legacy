/**
 * Regression coverage for LS-8064:
 * The header and sidebar draft clocks must format identically. Both now route
 * through formatPickClock, so a slow-mode (>= 1h limit) clock shows an hours
 * group instead of overflowing the minutes field.
 */
import { formatPickClock } from './pickClock';

describe('formatPickClock', () => {
  describe('fast mode (pick limit < 1 hour)', () => {
    it('formats as M:SS', () => {
      expect(formatPickClock(90, 120)).toBe('1:30');
      expect(formatPickClock(5, 90)).toBe('0:05');
    });

    it('lets minutes exceed 59 when under the slow-mode threshold', () => {
      // 1h05m with a 50-min limit stays in M:SS form
      expect(formatPickClock(3905, 3000)).toBe('65:05');
    });
  });

  describe('slow mode (pick limit >= 1 hour)', () => {
    it('adds an hours group so multi-hour windows read correctly', () => {
      // 2h 02m 05s remaining on a 4-hour clock
      expect(formatPickClock(7325, 14400)).toBe('2:02:05');
    });

    it('rolls multi-day windows into the hours field', () => {
      // 26h 00m 00s remaining on a 24-hour-plus clock
      expect(formatPickClock(93600, 86400)).toBe('26:00:00');
    });

    it('pads minutes and seconds to two digits', () => {
      expect(formatPickClock(3661, 3600)).toBe('1:01:01');
    });
  });
});
