import htmlParser, { HTMLElement } from 'node-html-parser';

/**
 * PFA stat tables carry no stable id/data-stat attributes (unlike PFR) and
 * table position is NOT stable across eras (LS-9948: "Tables 6-12 are the
 * stat tables; indices are not stable, so select by the ALL-CAPS header
 * cell, not position").
 *
 * Verified against live HTML (2026-09-17, real egress — see LS-9995): each
 * stat table's first `<tr>` IS its header row, and the category label is
 * simply that row's FIRST cell (e.g. `<tr><th>RUSHING</th><th>ATT</th>...`)
 * — there is no separate caption row or `<caption>` element on the real
 * site. The package's earlier "lone header cell spanning the first row"
 * guess (written before egress was available) was wrong; this replaces it.
 * A `<caption>` element is still accepted too, in case a differently
 * rendered page uses one.
 */
export function findStatTable(
  root: HTMLElement,
  categoryLabel: string,
): HTMLElement | null {
  const wantLabel = categoryLabel.trim().toUpperCase();

  for (const table of root.getElementsByTagName('table')) {
    const caption = table.getElementsByTagName('caption')[0];
    if (caption && caption.text.trim().toUpperCase() === wantLabel) {
      return table;
    }

    const firstRow = table.getElementsByTagName('tr')[0];
    if (!firstRow) continue;

    const firstRowCells = [
      ...firstRow.getElementsByTagName('th'),
      ...firstRow.getElementsByTagName('td'),
    ];
    if (
      firstRowCells.length > 0 &&
      firstRowCells[0].text.trim().toUpperCase() === wantLabel
    ) {
      return table;
    }
  }

  return null;
}

/**
 * Finds a table whose header row (first `<tr>`) contains `label` in ANY
 * cell, not just the first — for tables like PFA's scoring-plays table
 * (`Qtr|Team|Scoring Plays|<AWAY>|<HOME>`), where the category name is
 * embedded mid-row rather than leading it.
 */
export function findTableByAnyHeaderCell(
  root: HTMLElement,
  label: string,
): HTMLElement | null {
  const wantLabel = label.trim().toUpperCase();

  for (const table of root.getElementsByTagName('table')) {
    const firstRow = table.getElementsByTagName('tr')[0];
    if (!firstRow) continue;
    const cells = [
      ...firstRow.getElementsByTagName('th'),
      ...firstRow.getElementsByTagName('td'),
    ];
    if (cells.some((c) => c.text.trim().toUpperCase() === wantLabel)) {
      return table;
    }
  }

  return null;
}

function getHeaderCells(table: HTMLElement, captionPresent: boolean): string[] {
  const rows = table.getElementsByTagName('tr');
  const headerRow = rows[captionPresent ? 1 : 0];
  if (!headerRow) return [];
  return [
    ...headerRow.getElementsByTagName('th'),
    ...headerRow.getElementsByTagName('td'),
  ].map((c) => c.text.trim().toUpperCase());
}

/**
 * True only when the category label appears as its own standalone row (a
 * `<caption>` element, or a lone single-cell `<tr>`) ABOVE the real header
 * row. On the real site this is never true for the RUSHING/PASSING/etc.
 * tables (the label is embedded in the header row itself — see
 * {@link findStatTable}'s doc comment) but is kept for any page shape that
 * does render a separate caption row, so `parseStatTable` doesn't
 * mis-parse it as a data row.
 */
function tableHasCaptionRow(
  table: HTMLElement,
  categoryLabel: string,
): boolean {
  const caption = table.getElementsByTagName('caption')[0];
  if (caption) return caption.text.trim().toUpperCase() === categoryLabel;

  const rows = table.getElementsByTagName('tr');
  const firstRow = rows[0];
  if (!firstRow) return false;
  const cells = [
    ...firstRow.getElementsByTagName('th'),
    ...firstRow.getElementsByTagName('td'),
  ];
  if (
    cells.length !== 1 ||
    cells[0].text.trim().toUpperCase() !== categoryLabel
  ) {
    return false;
  }
  // A lone single-cell row is only a real "caption row" if a distinct
  // header row (more than one cell) follows it — otherwise it's just a
  // one-column table and rows.slice(1) would be right, not rows.slice(2).
  const nextRow = rows[1];
  if (!nextRow) return false;
  const nextCells = [
    ...nextRow.getElementsByTagName('th'),
    ...nextRow.getElementsByTagName('td'),
  ];
  return nextCells.length > 1;
}

export interface RowMismatch {
  rowIndex: number;
  expectedCells: number;
  actualCells: number;
  rawText: string;
}

/**
 * Parses every data row of a stat table into T via `parser`, given the
 * table's own header cells (in document order) for column-index lookups.
 *
 * Row cell-count is validated against the header on every row — a mismatch
 * is reported via `onMismatch` rather than silently misaligning columns.
 * This guards against the exact bug documented on LS-9948 comment 20612:
 * pre-1970 punt/kickoff-return tables carry an FC header with no data behind
 * it in some feeds, and dropping the blank cell shifts every later column.
 */
export function parseStatTable<T>(
  table: HTMLElement,
  categoryLabel: string,
  parser: (
    cellTexts: string[],
    header: string[],
    cells: HTMLElement[],
  ) => T | null,
  onMismatch?: (mismatch: RowMismatch) => void,
): T[] {
  const captionPresent = tableHasCaptionRow(table, categoryLabel);
  const header = getHeaderCells(table, captionPresent);
  const rows = table.getElementsByTagName('tr');
  const dataRows = rows.slice(captionPresent ? 2 : 1);

  const results: T[] = [];

  dataRows.forEach((row, index) => {
    const cells = [
      ...row.getElementsByTagName('th'),
      ...row.getElementsByTagName('td'),
    ];
    const cellTexts = cells.map((c) => c.text.trim());

    if (cellTexts.length !== header.length) {
      onMismatch?.({
        rowIndex: index,
        expectedCells: header.length,
        actualCells: cellTexts.length,
        rawText: row.text.trim(),
      });
      return;
    }

    const record = parser(cellTexts, header, cells);
    if (record !== null) {
      results.push(record);
    }
  });

  return results;
}

/**
 * Reads a column's raw text by header label (case-insensitive), given the
 * row's cell texts and the table's header. Returns null for an empty cell —
 * callers decide whether that's a real gap (e.g. pre-1970 FC) or an error.
 */
export function cellByHeader(
  cells: string[],
  header: string[],
  label: string,
): string | null {
  const idx = header.indexOf(label.trim().toUpperCase());
  if (idx === -1 || idx >= cells.length) return null;
  const text = cells[idx].trim();
  return text === '' ? null : text;
}

// LG values carry a trailing "t" for touchdowns (e.g. "57t") — must be
// stripped before parsing as a number (LS-9948 parser gotcha).
const TRAILING_TD_MARKER = /t$/i;

export function parseLongGain(raw: string | null): {
  lng: number | null;
  lngTd: boolean;
} {
  if (raw === null) return { lng: null, lngTd: false };
  const lngTd = TRAILING_TD_MARKER.test(raw);
  const numeric = lngTd ? raw.replace(TRAILING_TD_MARKER, '') : raw;
  const n = parseInt(numeric, 10);
  return { lng: isNaN(n) ? null : n, lngTd };
}

export function parseIntColumn(
  cells: string[],
  header: string[],
  label: string,
): number | null {
  const text = cellByHeader(cells, header, label);
  if (text === null) return null;
  const n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

export function parseFloatColumn(
  cells: string[],
  header: string[],
  label: string,
): number | null {
  const text = cellByHeader(cells, header, label);
  if (text === null) return null;
  const n = parseFloat(text);
  return isNaN(n) ? null : n;
}

export function parseHtml(html: string): HTMLElement {
  return htmlParser(html);
}

// PFA player links: /players/<letter>/<id>.html — id shape e.g. "mont00800".
const PFA_PLAYER_ID_REGEX = /\/players\/[a-z]\/([a-z0-9]+)\.html$/i;

export function parsePfaPlayerLink(
  cell: HTMLElement | undefined,
): { pfaId: string; name: string } | null {
  const anchor = cell?.getElementsByTagName('a')[0];
  if (!anchor) return null;
  const href = anchor.getAttribute('href') ?? '';
  const match = href.match(PFA_PLAYER_ID_REGEX);
  if (!match) return null;
  return { pfaId: match[1], name: anchor.text.trim() };
}
