import { categorize } from '../../utils/notificationUtils';

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
