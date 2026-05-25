/**
 * Tests for sport-aware notification copy utility (LS-4770).
 *
 * Acceptance criteria:
 *   - Football matchup-recap notification uses football stat language
 *   - Baseball matchup-recap notification is visually unchanged
 *   - Tests cover: weekly recap, lineup-set reminder, trade proposal,
 *     waiver claim, draft pick — for both sports
 *   - No baseball stat abbreviations appear in football notifications
 *     and vice versa
 */

import { getNotificationCopy } from './notification-copy';

const FOOTBALL_STAT_ABBREVS = ['TD', 'YDS', 'INT', 'REC'];
const BASEBALL_STAT_ABBREVS = ['HR', 'RBI', 'AVG', 'ERA', 'K', 'SB'];

// ── Event types required by acceptance criteria ───────────────────────────────

const COVERED_EVENT_TYPES = [
  'matchup_recap',
  'score_alert',
  'lineup_reminder',
  'trade_proposed',
  'trade_accepted',
  'trade_rejected',
  'waiver_claimed',
  'draft_pick_made',
  'draft_completed',
] as const;

// ── Baseball tests ────────────────────────────────────────────────────────────

describe('getNotificationCopy — baseball', () => {
  for (const eventType of COVERED_EVENT_TYPES) {
    describe(`eventType: ${eventType}`, () => {
      it('returns Fantasy Baseball as the sport label', () => {
        const copy = getNotificationCopy(eventType, 'baseball');
        expect(copy.sportLabel).toBe('Fantasy Baseball');
      });

      it('returns a baseball-specific footer', () => {
        const copy = getNotificationCopy(eventType, 'baseball');
        expect(copy.footerText).toContain('Baseball');
        expect(copy.footerText).not.toContain('Football');
      });

      it('includes baseball stat abbreviations', () => {
        const copy = getNotificationCopy(eventType, 'baseball');
        for (const abbrev of BASEBALL_STAT_ABBREVS) {
          expect(copy.statAbbreviations).toContain(abbrev);
        }
      });

      it('does not include football stat abbreviations', () => {
        const copy = getNotificationCopy(eventType, 'baseball');
        for (const abbrev of FOOTBALL_STAT_ABBREVS) {
          expect(copy.statAbbreviations).not.toContain(abbrev);
        }
      });
    });
  }
});

// ── Football tests ────────────────────────────────────────────────────────────

describe('getNotificationCopy — football', () => {
  for (const eventType of COVERED_EVENT_TYPES) {
    describe(`eventType: ${eventType}`, () => {
      it('returns Fantasy Football as the sport label', () => {
        const copy = getNotificationCopy(eventType, 'football');
        expect(copy.sportLabel).toBe('Fantasy Football');
      });

      it('returns a football-specific footer', () => {
        const copy = getNotificationCopy(eventType, 'football');
        expect(copy.footerText).toContain('Football');
        expect(copy.footerText).not.toContain('Baseball');
      });

      it('includes football stat abbreviations', () => {
        const copy = getNotificationCopy(eventType, 'football');
        for (const abbrev of FOOTBALL_STAT_ABBREVS) {
          expect(copy.statAbbreviations).toContain(abbrev);
        }
      });

      it('does not include baseball stat abbreviations', () => {
        const copy = getNotificationCopy(eventType, 'football');
        for (const abbrev of BASEBALL_STAT_ABBREVS) {
          expect(copy.statAbbreviations).not.toContain(abbrev);
        }
      });
    });
  }
});

// ── Matchup-recap specific (acceptance criteria focus) ────────────────────────

describe('getNotificationCopy — matchup_recap sport label', () => {
  it('football recap uses football stat language', () => {
    const copy = getNotificationCopy('matchup_recap', 'football');
    expect(copy.sportLabel).toBe('Fantasy Football');
    expect(copy.statAbbreviations).toContain('TD');
    expect(copy.statAbbreviations).not.toContain('HR');
  });

  it('baseball recap is visually unchanged (sport label stays Fantasy Baseball)', () => {
    const copy = getNotificationCopy('matchup_recap', 'baseball');
    expect(copy.sportLabel).toBe('Fantasy Baseball');
    expect(copy.statAbbreviations).toContain('HR');
    expect(copy.statAbbreviations).not.toContain('TD');
  });
});

// ── Default / back-compat (null or undefined sport) ───────────────────────────

describe('getNotificationCopy — default sport', () => {
  it('defaults to baseball when sport is null', () => {
    const copy = getNotificationCopy('matchup_recap', null);
    expect(copy.sportLabel).toBe('Fantasy Baseball');
  });

  it('defaults to baseball when sport is undefined', () => {
    const copy = getNotificationCopy('matchup_recap', undefined);
    expect(copy.sportLabel).toBe('Fantasy Baseball');
  });

  it('null sport includes baseball stat abbreviations', () => {
    const copy = getNotificationCopy('draft_pick_made', null);
    expect(copy.statAbbreviations).toContain('HR');
    expect(copy.statAbbreviations).not.toContain('TD');
  });
});
