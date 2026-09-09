import { LOGGER } from '@legacy-sports/logging';
import {
  cellByHeader,
  findStatTable,
  parseHtml,
  parseStatTable,
} from './HtmlParser';
import type { PfaKickerGameLogRow } from './types';

// /gamelogs/<letter>/<pfaId>.html
const KICKER_GAMELOG_URL_REGEX = /\/gamelogs\/[a-z]\/([a-z0-9]+)\.html$/i;

export function parsePfaIdFromGameLogUrl(url: string): string | null {
  const match = url.match(KICKER_GAMELOG_URL_REGEX);
  return match ? match[1] : null;
}

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
 * all (LS-9948 comment 20612). Documented column order:
 * DATE|YEAR TEAM|AHN|OPP|SCORE|RES|TD|X1|X1A|X2|X2A|FG|FGA|SAF|PTS
 *
 * Verified against the Jan Stenerud (sten00200) example in that comment:
 * 9/24/1967 | A | MIA | 24-0 | W | TD=0 X1=3 X1A=3 X2=0 X2A=0 FG=1 FGA=4 SAF=0 PTS=6
 *
 * Column-order assumptions here have not been validated against live PFA
 * HTML — network egress to profootballarchives.com is blocked in this
 * environment (see package README). Validate against a captured real page
 * before this parser is used for the live kicker-pass crawl.
 */
export function parseKickerGameLog(html: string): PfaKickerGameLogRow[] {
  const root = parseHtml(html);
  const table = findStatTable(root, 'SCORING');
  if (!table) {
    LOGGER.warn('PFA kicker game log: no SCORING table found');
    return [];
  }

  return parseStatTable(table, 'SCORING', (cellTexts, header) => {
    const get = (label: string): string | null =>
      cellByHeader(cellTexts, header, label);

    const date = get('DATE');
    const team = get('YEAR TEAM') ?? get('TEAM');
    const opponent = get('OPP');
    const score = get('SCORE');

    if (!date || !team || !opponent || !score) return null;

    return {
      date,
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
    } satisfies PfaKickerGameLogRow;
  });
}
