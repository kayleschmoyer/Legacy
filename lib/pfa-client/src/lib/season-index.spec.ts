import { readFileSync } from 'fs';
import { join } from 'path';
import { buildSeasonIndexUrl, parseSeasonIndexPage } from './season-index';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
}

describe('buildSeasonIndexUrl', () => {
  it('builds the default nfl season index URL', () => {
    expect(buildSeasonIndexUrl(1960)).toBe(
      'https://www.profootballarchives.com/1960nfl-boxscores.html',
    );
  });

  it('builds an afl/aafc season index URL when given a league', () => {
    expect(buildSeasonIndexUrl(1967, 'afl')).toBe(
      'https://www.profootballarchives.com/1967afl-boxscores.html',
    );
  });
});

// Fixture is a real captured season-index page (2026-09-17, live egress —
// see LS-9995): the 1960 NFL season, 78 regular-season games plus one
// postseason game (the NFL Championship, STL... actually GB @ PHI).
describe('parseSeasonIndexPage', () => {
  const html = fixture('season-index-1960.html');
  const refs = parseSeasonIndexPage(html, 1960);

  it('parses every box-score link in chronological order', () => {
    expect(refs).toHaveLength(79);
    expect(refs[0]).toEqual({
      url: 'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html',
      gameIdentifier: '1960nfl001',
      season: 1960,
      postseason: false,
    });
  });

  it('flags games after the postseason divider row, and only those', () => {
    const postseasonRefs = refs.filter((r) => r.postseason);
    expect(postseasonRefs).toHaveLength(1);
    expect(postseasonRefs[0].gameIdentifier).toBe('1960nfl079');

    const regularSeasonRefs = refs.filter((r) => !r.postseason);
    expect(regularSeasonRefs).toHaveLength(78);
    expect(regularSeasonRefs[regularSeasonRefs.length - 1].gameIdentifier).toBe(
      '1960nfl078',
    );
  });

  it('returns an empty array for a page with no box-score links', () => {
    expect(parseSeasonIndexPage('<html><body></body></html>', 1960)).toEqual(
      [],
    );
  });
});
