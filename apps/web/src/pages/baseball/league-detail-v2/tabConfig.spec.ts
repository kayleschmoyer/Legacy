import { leagueTabTitle, WEB_LEAGUE_TABS } from './tabConfig';

describe('leagueTabTitle (LS-10711)', () => {
  it('names the active tab and the league', () => {
    expect(leagueTabTitle('standings', 'QA Test Sluggers')).toBe(
      'Standings – QA Test Sluggers',
    );
    expect(leagueTabTitle('commish', 'QA Test Sluggers')).toBe(
      'Commissioner – QA Test Sluggers',
    );
  });

  it('gives every tab a distinct title', () => {
    const titles = WEB_LEAGUE_TABS.map((t) => leagueTabTitle(t.id, 'QA'));
    expect(new Set(titles).size).toBe(WEB_LEAGUE_TABS.length);
  });

  it('never includes the brand (PageMeta appends it)', () => {
    for (const t of WEB_LEAGUE_TABS) {
      expect(leagueTabTitle(t.id, 'QA')).not.toContain('Legacy Sports');
    }
  });

  it('falls back to "League" when the name is missing', () => {
    expect(leagueTabTitle('overview', null)).toBe('Overview – League');
  });
});
