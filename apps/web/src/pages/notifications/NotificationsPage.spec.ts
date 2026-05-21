import { categorize, dayKey, daySeparatorLabel } from './NotificationsPage';

describe('categorize', () => {
  it('maps draft-prefixed types to draft', () => {
    expect(categorize('draft_completed')).toBe('draft');
    expect(categorize('DRAFT_STARTED')).toBe('draft');
  });

  it('maps trade types to trade', () => {
    expect(categorize('trade_proposed')).toBe('trade');
  });

  it('maps ended/result/lost to result', () => {
    expect(categorize('matchup_ended')).toBe('result');
    expect(categorize('result_recorded')).toBe('result');
    expect(categorize('game_lost')).toBe('result');
  });

  it('maps matchup-flavoured types to matchup', () => {
    expect(categorize('matchup_started')).toBe('matchup');
    expect(categorize('MATCHUP_CLOSE_GAME')).toBe('matchup');
    expect(categorize('reminder_lineup')).toBe('matchup');
  });

  it('falls back to system for unknown / nullish', () => {
    expect(categorize(null)).toBe('system');
    expect(categorize(undefined)).toBe('system');
    expect(categorize('')).toBe('system');
    expect(categorize('subscription_updated')).toBe('system');
  });
});

describe('dayKey', () => {
  it('produces the same key for two ISO strings on the same local day', () => {
    const a = dayKey('2026-05-20T01:00:00');
    const b = dayKey('2026-05-20T23:30:00');
    expect(a).toBe(b);
  });

  it('produces different keys on adjacent local days', () => {
    const a = dayKey('2026-05-19T23:00:00');
    const b = dayKey('2026-05-20T01:00:00');
    expect(a).not.toBe(b);
  });
});

describe('daySeparatorLabel', () => {
  const realDate = Date;

  afterEach(() => {
    global.Date = realDate;
  });

  function freezeNow(iso: string) {
    const fixedNow = new realDate(iso).getTime();
    class FrozenDate extends realDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(fixedNow);
        } else {
          super(...args);
        }
      }
      static now() {
        return fixedNow;
      }
    }
    global.Date = FrozenDate as unknown as DateConstructor;
  }

  it('prefixes "Today" for the current local day', () => {
    freezeNow('2026-05-20T12:00:00');
    expect(daySeparatorLabel('2026-05-20T09:30:00')).toMatch(/^Today · /);
  });

  it('prefixes "Yesterday" for the previous local day', () => {
    freezeNow('2026-05-20T12:00:00');
    expect(daySeparatorLabel('2026-05-19T09:30:00')).toMatch(/^Yesterday · /);
  });

  it('returns the bare formatted date for older days', () => {
    freezeNow('2026-05-20T12:00:00');
    const label = daySeparatorLabel('2026-05-10T09:30:00');
    expect(label).not.toMatch(/^Today/);
    expect(label).not.toMatch(/^Yesterday/);
    // The Intl formatter is locale-dependent; we just assert a non-empty
    // label that includes the day-of-month so the format is recognizable.
    expect(label).toMatch(/10/);
  });
});
