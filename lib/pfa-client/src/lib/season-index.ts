import { parseHtml } from './HtmlParser';
import { PFA_BASE_URL } from './crawl-player-index';
import type { PfaLeague } from './types';

/**
 * A single box-score reference discovered on a season index page
 * (`/<season>nfl-boxscores.html`), verified against live HTML (LS-9995).
 */
export interface PfaSeasonGameRef {
  url: string;
  gameIdentifier: string;
  season: number;
  /**
   * True once the index page has crossed a postseason divider row (e.g.
   * "League Championship", "Wild Card", "Divisional Playoff" — the exact
   * label varies by era, so any bold, spanning divider row is treated as
   * the boundary rather than matching specific text). PFA's season index
   * includes playoff games; season aggregates elsewhere are regular-season
   * only, so the ingest command must filter these out (LS-9948 AC).
   */
  postseason: boolean;
}

export function buildSeasonIndexUrl(
  season: number,
  league: PfaLeague = 'nfl',
  baseUrl: string = PFA_BASE_URL,
): string {
  return `${baseUrl}/${season}${league}-boxscores.html`;
}

// /nflboxscores1/1960nfl001.html or /nflboxscores2/1990nfl229.html — the
// containing folder's trailing digit varies by era (1960 uses
// "nflboxscores1", 1990/1998 use "nflboxscores2" — not a fixed decade
// boundary, so it's matched generically) and is independent of league;
// only the filename encodes league (verified live, LS-9995).
const BOX_SCORE_LINK_REGEX =
  /\/nflboxscores\d+\/(\d{4})(?:nfl|afl|aafc)\d+\.html$/;

/**
 * Parses a season index page into its box-score references, in the page's
 * own (chronological) order, with postseason games flagged rather than
 * dropped so the caller decides how to handle them.
 *
 * A divider row — a `<td>`/`<th>` with a `colspan` attribute and no
 * box-score link of its own — marks the start of the postseason; every
 * later ref is flagged `postseason: true`. Walks every `<tr>` in document
 * order rather than assuming a single containing table, since that's more
 * robust to markup variation across the site's ~39 seasons of pages.
 */
export function parseSeasonIndexPage(
  html: string,
  season: number,
): PfaSeasonGameRef[] {
  const root = parseHtml(html);
  const refs: PfaSeasonGameRef[] = [];
  let postseason = false;

  for (const row of root.getElementsByTagName('tr')) {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];
    if (cells.length === 0) continue;

    const isDivider = cells.some((c) => c.getAttribute('colspan'));
    const link = row
      .getElementsByTagName('a')
      .find((a) => BOX_SCORE_LINK_REGEX.test(a.getAttribute('href') ?? ''));

    if (!link) {
      if (isDivider) postseason = true;
      continue;
    }

    const href = link.getAttribute('href') ?? '';
    const match = href.match(BOX_SCORE_LINK_REGEX);
    if (!match) continue;

    refs.push({
      url: href.startsWith('http') ? href : `${PFA_BASE_URL}${href}`,
      gameIdentifier: href
        .slice(href.lastIndexOf('/') + 1)
        .replace(/\.html$/, ''),
      season,
      postseason,
    });
  }

  return refs;
}
