import htmlParser, { HTMLElement } from 'node-html-parser';

/**
 * PFA stat tables carry no stable id/data-stat attributes (unlike PFR) and
 * table position is NOT stable across eras (LS-9948: "Tables 6-12 are the
 * stat tables; indices are not stable, so select by the ALL-CAPS header
 * cell, not position"). Each stat table is preceded by a caption cell whose
 * trimmed, upper-cased text names the category (e.g. "RUSHING", "PASSING").
 * We accept either a <caption> element or a lone header cell spanning the
 * table's first row, since PFA's markup for this has not been validated
 * against live HTML in this environment (network egress to
 * profootballarchives.com is blocked here — see package README).
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
      firstRowCells.length === 1 &&
      firstRowCells[0].text.trim().toUpperCase() === wantLabel
    ) {
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

function tableHasCaptionRow(
  table: HTMLElement,
  categoryLabel: string,
): boolean {
  const caption = table.getElementsByTagName('caption')[0];
  if (caption) return caption.text.trim().toUpperCase() === categoryLabel;

  const firstRow = table.getElementsByTagName('tr')[0];
  if (!firstRow) return false;
  const cells = [
    ...firstRow.getElementsByTagName('th'),
    ...firstRow.getElementsByTagName('td'),
  ];
  return (
    cells.length === 1 && cells[0].text.trim().toUpperCase() === categoryLabel
  );
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
