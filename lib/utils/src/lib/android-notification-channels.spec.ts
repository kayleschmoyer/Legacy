import {
  ANDROID_NOTIFICATION_CHANNELS,
  getAndroidChannelId,
} from './android-notification-channels';

describe('getAndroidChannelId', () => {
  it.each([
    ['DRAFT_STARTED', 'drafts'],
    ['DRAFT_ON_THE_CLOCK', 'drafts'],
    ['DRAFT_INVITE', 'drafts'],
    ['draft_completed', 'drafts'],
    ['DRAFT_COMPLETED', 'drafts'],
    ['DRAFTCOMPLETED', 'drafts'],
    ['TRADE_OFFER', 'league-activity'],
    ['LINEUP_MODIFIED_BY_ADMIN', 'league-activity'],
    ['LEAGUE_MEMBER_JOINED', 'league-activity'],
    ['TD_ALERT', 'live-scoring'],
    ['TDALERT', 'live-scoring'],
    ['MATCHUP_CLOSE_GAME', 'live-scoring'],
    ['LEAGUE_CHAT_MENTION', 'chat'],
    ['trial_will_end', 'default'],
    ['subscription_updated', 'default'],
    ['matchup_started', 'default'],
    ['SOMETHING_UNKNOWN', 'default'],
    ['', 'default'],
  ])('maps %s -> %s', (type, expected) => {
    expect(getAndroidChannelId(type)).toBe(expected);
  });

  it('only returns ids present in the channel list', () => {
    const ids = ANDROID_NOTIFICATION_CHANNELS.map((c) => c.id);
    for (const type of ['DRAFT_STARTED', 'TRADE_OFFER', 'TDALERT', 'x']) {
      expect(ids).toContain(getAndroidChannelId(type));
    }
  });
});

describe('ANDROID_NOTIFICATION_CHANNELS', () => {
  it('has unique ids, a default fallback and at least two other buckets', () => {
    const ids = ANDROID_NOTIFICATION_CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('default');
    expect(ids.filter((id) => id !== 'default').length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
