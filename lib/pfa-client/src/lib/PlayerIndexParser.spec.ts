import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseLeagueAndLetterFromUrl,
  parsePlayerIndexPage,
} from './PlayerIndexParser';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
}

describe('parseLeagueAndLetterFromUrl', () => {
  it('parses nfl/afl/aafc player-index URLs', () => {
    expect(
      parseLeagueAndLetterFromUrl(
        'https://www.profootballarchives.com/nflplayers-m.html',
      ),
    ).toEqual({ league: 'nfl', letter: 'm' });
    expect(
      parseLeagueAndLetterFromUrl(
        'https://www.profootballarchives.com/aflplayers-a.html',
      ),
    ).toEqual({ league: 'afl', letter: 'a' });
    expect(
      parseLeagueAndLetterFromUrl(
        'https://www.profootballarchives.com/aafcplayers-z.html',
      ),
    ).toEqual({ league: 'aafc', letter: 'z' });
  });

  it('returns null for a non-index URL', () => {
    expect(
      parseLeagueAndLetterFromUrl(
        'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html',
      ),
    ).toBeNull();
  });
});

describe('parsePlayerIndexPage', () => {
  const html = fixture('player-index-m.html');
  const url = 'https://www.profootballarchives.com/nflplayers-m.html';

  it('extracts (pfaId, name, college) for each entry', () => {
    const entries = parsePlayerIndexPage(html, url);
    expect(entries).toEqual([
      {
        pfaId: 'mont00800',
        name: 'Joe Montana',
        college: 'Notre Dame',
        league: 'nfl',
      },
      {
        pfaId: 'mars00900',
        name: 'Jim Marshall',
        college: 'Ohio State',
        league: 'nfl',
      },
    ]);
  });

  it('throws for a URL that is not a player-index page', () => {
    expect(() =>
      parsePlayerIndexPage('<html></html>', 'https://example.com/nope'),
    ).toThrow();
  });
});
