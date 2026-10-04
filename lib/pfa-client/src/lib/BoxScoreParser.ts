import { LOGGER } from '@legacy-sports/logging';
import type { HTMLElement } from 'node-html-parser';
import {
  cellByHeader,
  findStatTable,
  findTableByAnyHeaderCell,
  parseHtml,
  parseIntColumn,
  parseLongGain,
  parsePfaPlayerLink,
  parseStatTable,
} from './HtmlParser';
import type {
  PfaBoxScore,
  PfaInterceptionsLine,
  PfaKickoffReturnLine,
  PfaPassingLine,
  PfaPlayerBoxScoreStats,
  PfaPuntingLine,
  PfaPuntReturnLine,
  PfaReceivingLine,
  PfaRushingLine,
  PfaScoringPlay,
} from './types';

// /nflboxscores1/1960nfl001.html -> "1960nfl001" (game id) and 1960 (season).
// The folder number varies by era (verified live: 1960 uses
// "nflboxscores1", 1990/1998 use "nflboxscores2" — not a fixed decade
// boundary, so the digit is matched generically rather than assumed).
const BOX_SCORE_URL_REGEX = /\/nflboxscores\d+\/(\d{4})nfl\d+\.html$/;

export function parseGameIdentifierFromUrl(
  url: string,
): { gameIdentifier: string; season: number } | null {
  const match = url.match(BOX_SCORE_URL_REGEX);
  if (!match) return null;
  const filename = url.slice(url.lastIndexOf('/') + 1).replace(/\.html$/, '');
  return { gameIdentifier: filename, season: parseInt(match[1], 10) };
}

function buildRushing(cells: string[], header: string[]): PfaRushingLine {
  const { lng, lngTd } = parseLongGain(cellByHeader(cells, header, 'LG'));
  return {
    att: parseIntColumn(cells, header, 'ATT'),
    yds: parseIntColumn(cells, header, 'YDS'),
    avg: parseFloatOrNull(cellByHeader(cells, header, 'AVG')),
    lng,
    lngTd,
    td: parseIntColumn(cells, header, 'TD'),
  };
}

function buildPassing(cells: string[], header: string[]): PfaPassingLine {
  const { lng, lngTd } = parseLongGain(cellByHeader(cells, header, 'LG'));
  return {
    att: parseIntColumn(cells, header, 'ATT'),
    com: parseIntColumn(cells, header, 'COM'),
    pct: parseFloatOrNull(cellByHeader(cells, header, 'PCT')),
    int: parseIntColumn(cells, header, 'INT'),
    yds: parseIntColumn(cells, header, 'YDS'),
    avg: parseFloatOrNull(cellByHeader(cells, header, 'AVG')),
    lng,
    lngTd,
    td: parseIntColumn(cells, header, 'TD'),
    ts: parseIntColumn(cells, header, 'TS'),
    yl: parseIntColumn(cells, header, 'YL'),
    rtg: parseFloatOrNull(cellByHeader(cells, header, 'RTG')),
  };
}

function buildReceiving(cells: string[], header: string[]): PfaReceivingLine {
  const { lng, lngTd } = parseLongGain(cellByHeader(cells, header, 'LG'));
  return {
    no: parseIntColumn(cells, header, 'NO'),
    yds: parseIntColumn(cells, header, 'YDS'),
    avg: parseFloatOrNull(cellByHeader(cells, header, 'AVG')),
    lng,
    lngTd,
    td: parseIntColumn(cells, header, 'TD'),
  };
}

function buildInterceptions(
  cells: string[],
  header: string[],
): PfaInterceptionsLine {
  const { lng, lngTd } = parseLongGain(cellByHeader(cells, header, 'LG'));
  return {
    no: parseIntColumn(cells, header, 'NO'),
    yds: parseIntColumn(cells, header, 'YDS'),
    avg: parseFloatOrNull(cellByHeader(cells, header, 'AVG')),
    lng,
    lngTd,
    td: parseIntColumn(cells, header, 'TD'),
  };
}

function buildPunting(cells: string[], header: string[]): PfaPuntingLine {
  const { lng, lngTd } = parseLongGain(cellByHeader(cells, header, 'LG'));
  return {
    no: parseIntColumn(cells, header, 'NO'),
    yds: parseIntColumn(cells, header, 'YDS'),
    avg: parseFloatOrNull(cellByHeader(cells, header, 'AVG')),
    lng,
    lngTd,
    bl: parseIntColumn(cells, header, 'BL'),
  };
}

// Shared by PUNT RETURNS and KICKOFF RETURNS — identical column shape
// (NO|FC|YDS|AVG|LG|TD). Pre-1970 tables may render an FC header with no
// data behind it; parseIntColumn returns null for an empty cell rather than
// dropping the column, which keeps every later column aligned.
function buildReturnLine(
  cells: string[],
  header: string[],
): PfaPuntReturnLine | PfaKickoffReturnLine {
  const { lng, lngTd } = parseLongGain(cellByHeader(cells, header, 'LG'));
  return {
    no: parseIntColumn(cells, header, 'NO'),
    fc: parseIntColumn(cells, header, 'FC'),
    yds: parseIntColumn(cells, header, 'YDS'),
    avg: parseFloatOrNull(cellByHeader(cells, header, 'AVG')),
    lng,
    lngTd,
    td: parseIntColumn(cells, header, 'TD'),
  };
}

function parseFloatOrNull(text: string | null): number | null {
  if (text === null) return null;
  const n = parseFloat(text);
  return isNaN(n) ? null : n;
}

type StatCategory =
  | 'rushing'
  | 'passing'
  | 'receiving'
  | 'interceptions'
  | 'punting'
  | 'puntReturns'
  | 'kickoffReturns';

const CATEGORY_SPECS: Record<
  StatCategory,
  { label: string; build: (cells: string[], header: string[]) => unknown }
> = {
  rushing: { label: 'RUSHING', build: buildRushing },
  passing: { label: 'PASSING', build: buildPassing },
  receiving: { label: 'RECEIVING', build: buildReceiving },
  interceptions: { label: 'INTERCEPTIONS', build: buildInterceptions },
  punting: { label: 'PUNTING', build: buildPunting },
  puntReturns: { label: 'PUNT RETURNS', build: buildReturnLine },
  kickoffReturns: { label: 'KICKOFF RETURNS', build: buildReturnLine },
};

// Assigns a parsed stat line to the correct property on `player`, one
// explicit branch per category so each cast is scoped to a single known
// property/type pair rather than a blanket Record<StatCategory, unknown>
// cast across all seven. `statLine` is `unknown` at the call site because
// CATEGORY_SPECS.build is typed generically across categories — this
// function is the single place that narrows it back per category.
function assignStatLine(
  player: PfaPlayerBoxScoreStats,
  category: StatCategory,
  statLine: unknown,
): void {
  switch (category) {
    case 'rushing':
      player.rushing = statLine as PfaRushingLine;
      return;
    case 'passing':
      player.passing = statLine as PfaPassingLine;
      return;
    case 'receiving':
      player.receiving = statLine as PfaReceivingLine;
      return;
    case 'interceptions':
      player.interceptions = statLine as PfaInterceptionsLine;
      return;
    case 'punting':
      player.punting = statLine as PfaPuntingLine;
      return;
    case 'puntReturns':
      player.puntReturns = statLine as PfaPuntReturnLine;
      return;
    case 'kickoffReturns':
      player.kickoffReturns = statLine as PfaKickoffReturnLine;
      return;
  }
}

/**
 * Parses a single PFA box-score page (e.g. /nflboxscores1/1960nfl001.html)
 * into per-player per-category stat lines, keyed by pfaId.
 *
 * gamefootball_kicking is intentionally NOT parsed here — kicking data does
 * not appear in box scores at all (0% across 4,942 crawled games, per
 * LS-9948 comment 20612); it lives only on the per-kicker game-log route
 * handled by KickerGameLogParser.
 *
 * gamefootball_defense_idp (solo_tkl/ast_tkl/sacks) is NOT parsed — this is
 * a confirmed permanent gap, not a parser omission (sacks were not an
 * official NFL statistic until 1982, tackles never were).
 */
export function parseBoxScore(html: string, sourceUrl: string): PfaBoxScore {
  const idInfo = parseGameIdentifierFromUrl(sourceUrl);
  if (!idInfo) {
    throw new Error(`Could not parse a PFA box-score URL: ${sourceUrl}`);
  }

  const root = parseHtml(html);
  const playersById = new Map<string, PfaPlayerBoxScoreStats>();

  function getOrCreatePlayer(
    pfaId: string,
    name: string,
  ): PfaPlayerBoxScoreStats {
    const existing = playersById.get(pfaId);
    if (existing) return existing;
    const created: PfaPlayerBoxScoreStats = {
      pfaId,
      name,
      rushing: null,
      passing: null,
      receiving: null,
      interceptions: null,
      punting: null,
      puntReturns: null,
      kickoffReturns: null,
    };
    playersById.set(pfaId, created);
    return created;
  }

  for (const [category, spec] of Object.entries(CATEGORY_SPECS) as [
    StatCategory,
    (typeof CATEGORY_SPECS)[StatCategory],
  ][]) {
    const table = findStatTable(root, spec.label);
    if (!table) continue;

    const rows = parseStatTable(
      table,
      spec.label,
      (cellTexts, header, cells) => {
        const link = parsePfaPlayerLink(cells[0]);
        if (!link) {
          LOGGER.warn(
            `PFA box score ${idInfo.gameIdentifier}: could not resolve a player link in ${spec.label} row`,
          );
          return null;
        }
        const statLine = spec.build(cellTexts, header);
        return { link, statLine };
      },
      (mismatch) => {
        LOGGER.warn(
          `PFA box score ${idInfo.gameIdentifier}: ${spec.label} row ${mismatch.rowIndex} has ${mismatch.actualCells} cells, expected ${mismatch.expectedCells} — skipped rather than risk column misalignment`,
          { rawText: mismatch.rawText },
        );
      },
    );

    for (const row of rows) {
      if (row === null) continue;
      const player = getOrCreatePlayer(row.link.pfaId, row.link.name);
      assignStatLine(player, category, row.statLine);
    }
  }

  return {
    gameIdentifier: idInfo.gameIdentifier,
    season: idInfo.season,
    players: Array.from(playersById.values()),
    scoringPlays: parseScoringPlays(root),
    quarterScores: parseQuarterScores(root),
  };
}

// Real PFA markup (verified against live HTML, 2026-09-17): the
// scoring-plays table's header row is `Qtr|Team|Scoring Plays|<AWAY>|<HOME>`
// — the label is embedded mid-row, not a leading caption, and there is no
// separate caption row above it. The play-description column's index
// varies by game (it's always 3rd, but derived from the header rather than
// hardcoded in case a future page shape adds/removes a column).
function parseScoringPlays(root: HTMLElement): PfaScoringPlay[] {
  const table = findTableByAnyHeaderCell(root, 'Scoring Plays');
  if (!table) return [];

  const rows = table.getElementsByTagName('tr');
  const header = [
    ...rows[0].getElementsByTagName('th'),
    ...rows[0].getElementsByTagName('td'),
  ].map((c) => c.text.trim().toUpperCase());
  const playColIdx = header.indexOf('SCORING PLAYS');
  if (playColIdx === -1) return [];

  const plays: PfaScoringPlay[] = [];
  for (const row of rows.slice(1)) {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];
    const text = cells[playColIdx]?.text.trim();
    if (!text) continue;
    const quarterText = cells[0]?.text.trim();
    const quarter = quarterText ? parseInt(quarterText, 10) : NaN;
    plays.push({
      quarter: isNaN(quarter) ? null : quarter,
      text,
    });
  }
  return plays;
}

/**
 * PFA player links embedded in a scoring-play's description cell, matched
 * against the kicking verbs PFA uses in that text — `<a ...>Name</a> kick`
 * for a made PAT (inside parens after the TD) and `<a ...>Name</a> NN FG`
 * (an optional yardage number) for a field goal. Verified against real
 * scoring-play HTML (LS-9995): e.g.
 * `<a href="/players/v/vill00800.html">Danny Villanueva</a> kick)` and
 * `<a href="/players/c/conr00200.html">Bobby Joe Conrad</a> 12 FG`.
 *
 * This is the ONLY route to identifying which players are kickers pre-1999
 * — box scores never render a kicking stat table (LS-9948 comment 20612) —
 * so this drives which players get the extra per-kicker game-log crawl
 * (`KickerGameLogParser`).
 */
const KICKER_MENTION_REGEX =
  /<a\s+href="\/players\/[a-z]\/([a-z0-9]+)\.html"[^>]*>[^<]*<\/a>(?:\s+\d+)?\s+(?:FG|kick)\b/gi;

export function extractKickerCandidates(html: string): string[] {
  const table = findTableByAnyHeaderCell(parseHtml(html), 'Scoring Plays');
  if (!table) return [];

  const rows = table.getElementsByTagName('tr');
  const header = [
    ...rows[0].getElementsByTagName('th'),
    ...rows[0].getElementsByTagName('td'),
  ].map((c) => c.text.trim().toUpperCase());
  const playColIdx = header.indexOf('SCORING PLAYS');
  if (playColIdx === -1) return [];

  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];
    const cell = cells[playColIdx];
    if (!cell) continue;
    for (const match of cell.innerHTML.matchAll(KICKER_MENTION_REGEX)) {
      seen.add(match[1]);
    }
  }
  return Array.from(seen);
}

// Real PFA markup: "Score By Quarters" (plural), header row combines the
// label with the quarter columns (`Score By Quarters|1st|2nd|3rd|4th|Final`)
// — same single-header-row shape as the main stat tables, no separate
// caption row. Data rows are visitor (away) then home, matching the season
// index's visitor-then-home column order.
function parseQuarterScores(root: HTMLElement): PfaBoxScore['quarterScores'] {
  const table = findStatTable(root, 'SCORE BY QUARTERS');
  if (!table) return null;

  const rows = table.getElementsByTagName('tr').slice(1);
  if (rows.length < 2) return null;

  const parseRow = (row: HTMLElement) =>
    [...row.getElementsByTagName('th'), ...row.getElementsByTagName('td')]
      .slice(1, -1) // drop the team-name cell and the trailing Final total
      .map((c) => parseInt(c.text.trim(), 10))
      .filter((n) => !isNaN(n));

  return {
    away: parseRow(rows[0]),
    home: parseRow(rows[1]),
  };
}
