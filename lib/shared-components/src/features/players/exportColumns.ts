/**
 * Export column model for the player-stats download (LS-10731).
 *
 * The export used to serialize a hard-coded header list (Name…OPS) that ignored
 * the grid's column set, so FPTS, FPTS/G and oWAR shown in the table never
 * reached the file. Each grid now derives its export columns from the same
 * column config + visibility resolver it renders with, so the file always
 * matches the visible table. This module holds the grid-agnostic pieces.
 */

/** A single exported cell — numbers stay numeric so spreadsheets can sort them. */
export type ExportCellValue = string | number;

/** One exported column: the header written to the file and a row → cell getter. */
export interface ExportColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly value: (row: Row) => ExportCellValue;
}

/**
 * Maximum rows exported per table (product decision on LS-10731). Matches the
 * server's premium `careerBattingStats` page cap (MAX_CAREER_BATTING_LIMIT), so
 * a premium export of up to this many hitters is a single request.
 */
export const EXPORT_ROW_CAP = 5_000;

/** Grid placeholders for a missing value — exported as an empty cell instead. */
const EMPTY_PLACEHOLDERS: ReadonlySet<string> = new Set(['—', '-', '']);
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Convert a grid display string into an export cell: placeholders become empty
 * cells and plain numeric strings become numbers. Anything else (e.g. `.300`
 * batting averages, position lists) is kept verbatim so the file reads the same
 * as the table.
 */
export function toExportCell(display: string): ExportCellValue {
  if (EMPTY_PLACEHOLDERS.has(display)) return '';
  return NUMERIC_PATTERN.test(display) ? Number(display) : display;
}
