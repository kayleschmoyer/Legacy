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
        'https://www.profootballarchives.com/aflplayers.html',
      ),
    ).toEqual({ league: 'afl', letter: null });
    expect(
      parseLeagueAndLetterFromUrl(
        'https://www.profootballarchives.com/aafcplayers.html',
      ),
    ).toEqual({ league: 'aafc', letter: null });
  });

  it('returns null for a non-index URL', () => {
    expect(
      parseLeagueAndLetterFromUrl(
        'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html',
      ),
    ).toBeNull();
  });
});

// Fixture is a real captured page (2026-09-17, live egress — see LS-9995),
// not synthetic — replaces the earlier hand-built version this package
// shipped with before egress was available (see the package README).
describe('parsePlayerIndexPage', () => {
  const html = fixture('player-index-m.html');
  const url = 'https://www.profootballarchives.com/nflplayers-m.html';
  const entries = parsePlayerIndexPage(html, url);

  it('parses a large number of real entries, none malformed', () => {
    expect(entries.length).toBeGreaterThan(1000);
    for (const entry of entries) {
      expect(entry.pfaId).toMatch(/^[a-z0-9]+$/);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.league).toBe('nfl');
    }
  });

  it('extracts (pfaId, name, college) for a known entry', () => {
    expect(entries).toContainEqual({
      pfaId: 'mont00800',
      name: 'Joe Montana',
      college: 'Notre Dame',
      league: 'nfl',
    });
  });

  it('keeps a multi-school college value intact rather than truncating at the first delimiter', () => {
    expect(entries).toContainEqual({
      pfaId: 'maar00200',
      name: 'J.D. Maarleveld',
      college: 'Notre Dame; Maryland',
      league: 'nfl',
    });
  });

  // Rows excerpted from the live single-page /aflplayers.html (2026-10-09),
  // including its stray unclosed <tr> after the header row.
  it('parses the single-page AFL index with league afl', () => {
    const aflHtml =
      '<div class="stats"><table><tr><th style="text-align:left">Player</th><th style="text-align:left">College</th></tr><tr>' +
      '<tr><td style="text-align:left"><a href="/players/a/abel00250.html">Bud Abell</a></td><td style="text-align:left">Missouri</td></tr>' +
      '<tr><td style="text-align:left"><a href="/players/a/adam06600.html">Ken Adamson</a></td><td style="text-align:left">Notre Dame</td></tr>' +
      '</table></div>';
    expect(
      parsePlayerIndexPage(
        aflHtml,
        'https://www.profootballarchives.com/aflplayers.html',
      ),
    ).toEqual([
      {
        pfaId: 'abel00250',
        name: 'Bud Abell',
        college: 'Missouri',
        league: 'afl',
      },
      {
        pfaId: 'adam06600',
        name: 'Ken Adamson',
        college: 'Notre Dame',
        league: 'afl',
      },
    ]);
  });

  it('throws for a URL that is not a player-index page', () => {
    expect(() =>
      parsePlayerIndexPage('<html></html>', 'https://example.com/nope'),
    ).toThrow();
  });
});
