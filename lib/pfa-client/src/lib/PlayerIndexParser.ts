import { LOGGER } from '@legacy-sports/logging';
import { parseHtml } from './HtmlParser';
import type { PfaLeague, PfaPlayerIndexEntry } from './types';

// /nflplayers-<a..z>.html, /aflplayers-<a..z>.html, /aafcplayers-<a..z>.html
const PLAYER_INDEX_URL_REGEX = /\/(nfl|afl|aafc)players-([a-z])\.html$/i;

export function parseLeagueAndLetterFromUrl(
  url: string,
): { league: PfaLeague; letter: string } | null {
  const match = url.match(PLAYER_INDEX_URL_REGEX);
  if (!match) return null;
  return {
    league: match[1].toLowerCase() as PfaLeague,
    letter: match[2].toLowerCase(),
  };
}

// PFA player links: /players/<letter>/<id>.html — id shape e.g. "mont00800".
const PFA_PLAYER_ID_REGEX = /\/players\/[a-z]\/([a-z0-9]+)\.html$/i;

/**
 * Parses one PFA player-index page (name + college + pfa_id) into crosswalk
 * source rows. The index is a flat list of entries; each entry's structure
 * is inferred from LS-9948's description ("name + college + id") as a table
 * row or list item containing a player-page anchor followed by a college
 * name — this has not been validated against live PFA HTML because network
 * egress to profootballarchives.com is blocked in this environment (see
 * package README). Validate against a captured real page before relying on
 * this for the full 78-page crawl in the crosswalk-resolver ticket.
 */
export function parsePlayerIndexPage(
  html: string,
  sourceUrl: string,
): PfaPlayerIndexEntry[] {
  const urlInfo = parseLeagueAndLetterFromUrl(sourceUrl);
  if (!urlInfo) {
    throw new Error(`Could not parse a PFA player-index URL: ${sourceUrl}`);
  }

  const root = parseHtml(html);
  const entries: PfaPlayerIndexEntry[] = [];

  // Each row is expected to be a table row or list item: an anchor to the
  // player page, followed by a college name in a sibling cell/text node.
  const rows = [
    ...root.getElementsByTagName('tr'),
    ...root.getElementsByTagName('li'),
  ];

  for (const row of rows) {
    const anchor = row.getElementsByTagName('a')[0];
    if (!anchor) continue;

    const href = anchor.getAttribute('href') ?? '';
    const match = href.match(PFA_PLAYER_ID_REGEX);
    if (!match) continue;

    const pfaId = match[1];
    const name = anchor.text.trim();

    // Text after the name is treated as the college — trailing punctuation
    // and whitespace stripped, empty string normalized to null.
    const fullText = row.text.trim();
    const afterName = fullText.startsWith(name)
      ? fullText.slice(name.length).trim()
      : '';
    const college = afterName.replace(/^[-,\s]+/, '').trim() || null;

    entries.push({ pfaId, name, college, league: urlInfo.league });
  }

  if (entries.length === 0) {
    LOGGER.warn(
      `PFA player index ${sourceUrl}: parsed zero entries — page structure may not match the expected row/anchor shape`,
    );
  }

  return entries;
}
