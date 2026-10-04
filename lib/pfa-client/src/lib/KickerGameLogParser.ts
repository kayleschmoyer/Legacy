import { LOGGER } from '@legacy-sports/logging';
import { cellByHeader, findStatTable, parseHtml } from './HtmlParser';
import type { PfaKickerGameLogRow } from './types';

// /gamelogs/<letter>/<pfaId>.html
const KICKER_GAMELOG_URL_REGEX = /\/gamelogs\/[a-z]\/([a-z0-9]+)\.html$/i;

export function parsePfaIdFromGameLogUrl(url: string): string | null {
  const match = url.match(KICKER_GAMELOG_URL_REGEX);
  return match ? match[1] : null;
}

// The DATE cell links to the box score, e.g.
// `<a href="/nflboxscores1/1967afl003.html">9/9/1967</a>`. The folder
// number varies by era (verified live: "nflboxscores1" for 1967,
// "nflboxscores2" for 1990/1998 — not a fixed boundary), so it's matched
// generically rather than assumed.
const GAME_LINK_REGEX = /\/nflboxscores\d+\/(\d{4})(?:nfl|afl|aafc)\d+\.html$/;

function parseIntOrNull(text: string | null): number | null {
  if (text === null || text === '') return null;
  const n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

function parseResult(text: string | null): 'W' | 'L' | 'T' | null {
  if (text === 'W' || text === 'L' || text === 'T') return text;
  return null;
}

function parseHomeAway(text: string | null): 'A' | 'H' | null {
  if (text === 'A' || text === 'H') return text;
  return null;
}

/**
 * Parses the SCORING table off a PFA per-kicker game-log page
 * (/gamelogs/<letter>/<pfaId>.html), the only route that carries per-game
 * FG/PAT attempts pre-1999 — box scores do not render a kicking table at
 * all (LS-9948 comment 20612).
 *
 * Verified against a real captured page (Jan Stenerud, sten00200, LS-9995):
 * the table is headed by THREE single-cell rows before the real column
 * header appears — `SCORING`, then a section marker (`REGULAR SEASON` or
 * `PLAYOFFS`), then `DATE|YEAR TEAM|AHN|OPP|SCORE|RES|TD|X1|X1A|X2|X2A|FG|FGA|SAF|PTS`
 * — repeated once per section on pages with both. Only `REGULAR SEASON`
 * rows are returned; PLAYOFFS rows are dropped here (mirrors the box-score
 * postseason filter — season aggregates elsewhere are regular-season only).
 *
 * `gameIdentifier`/`season` are read from the DATE cell's own link to the
 * box score, not parsed from the `YEAR TEAM` text — a direct, unambiguous
 * join to the same `gameIdentifier` box scores use, rather than a
 * date+team match that could collide.
 */
export function parseKickerGameLog(html: string): PfaKickerGameLogRow[] {
  const root = parseHtml(html);
  const table = findStatTable(root, 'SCORING');
  if (!table) {
    LOGGER.warn('PFA kicker game log: no SCORING table found');
    return [];
  }

  const rows = table.getElementsByTagName('tr');
  let section: 'regular' | 'playoffs' | null = null;
  let header: string[] = [];
  const results: PfaKickerGameLogRow[] = [];

  for (const row of rows) {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];
    if (cells.length === 0) continue;

    // Single-cell marker rows: "SCORING" (skip), "REGULAR SEASON" /
    // "PLAYOFFS" (set section), or the real column header (multi-cell).
    if (cells.length === 1) {
      const label = cells[0].text.trim().toUpperCase();
      if (label === 'REGULAR SEASON') section = 'regular';
      else if (label === 'PLAYOFFS' || label === 'POST SEASON') {
        section = 'playoffs';
      }
      continue;
    }

    const cellTexts = cells.map((c) => c.text.trim());
    if (cellTexts[0]?.toUpperCase() === 'DATE') {
      header = cellTexts.map((t) => t.toUpperCase());
      continue;
    }

    if (section !== 'regular' || header.length === 0) continue;
    if (cellTexts.length !== header.length) continue;

    const get = (label: string): string | null =>
      cellByHeader(cellTexts, header, label);

    const dateLink = cells[0]?.getElementsByTagName('a')[0];
    const gameHref = dateLink?.getAttribute('href') ?? '';
    const gameMatch = gameHref.match(GAME_LINK_REGEX);
    const date = get('DATE');
    // The YEAR TEAM cell renders BOTH a desktop and mobile variant as
    // sibling spans (`d-none d-md-inline` / `d-inline d-md-none`, a
    // Bootstrap responsive-visibility pattern) — `.text` concatenates both
    // regardless of which would actually be visible, so read the desktop
    // span specifically rather than the whole cell's text.
    const teamIdx = header.indexOf('YEAR TEAM');
    const teamCell = teamIdx === -1 ? undefined : cells[teamIdx];
    const teamSpan = teamCell
      ?.getElementsByTagName('span')
      .find((s) => (s.getAttribute('class') ?? '').includes('d-none'));
    const team = (teamSpan ?? teamCell)?.text.trim() || get('TEAM');
    const opponent = get('OPP');
    const score = get('SCORE');

    if (!date || !team || !opponent || !score || !gameMatch) continue;

    results.push({
      date,
      gameIdentifier: gameHref
        .slice(gameHref.lastIndexOf('/') + 1)
        .replace(/\.html$/, ''),
      season: parseInt(gameMatch[1], 10),
      team,
      homeAway: parseHomeAway(get('AHN')),
      opponent,
      score,
      result: parseResult(get('RES')),
      td: parseIntOrNull(get('TD')),
      xpMade: parseIntOrNull(get('X1')),
      xpAtt: parseIntOrNull(get('X1A')),
      twoPtMade: parseIntOrNull(get('X2')),
      twoPtAtt: parseIntOrNull(get('X2A')),
      fgMade: parseIntOrNull(get('FG')),
      fgAtt: parseIntOrNull(get('FGA')),
      safeties: parseIntOrNull(get('SAF')),
      points: parseIntOrNull(get('PTS')),
    } satisfies PfaKickerGameLogRow);
  }

  return results;
}
