// Token-efficient response formatting for our in-repo MCP servers
// (`tools/mcp/*`). The shared standard and rationale live in
// `.agents/skills/create/references/mcp-response-format.md`; this module is the
// single implementation every server migration (epic LS-8018) imports via the
// `@legacy-sports/mcp-format` path alias so the format is applied identically
// and never re-coded per server.
//
// The three levers, in priority order:
//   1. FIELD SELECTION (`pick` / `pickFields`) — drop fields agents never read.
//      This is the first-order win; a column removed costs zero tokens in every
//      row and every call.
//   2. BLOB TRUNCATION (`truncate`) — cap long free-text/diff/log values so a
//      single row can't blow the budget.
//   3. FORMAT (`markdownTable` vs `minifiedJson`) — second-order. Flat, uniform
//      record arrays become a Markdown table (column headers written once
//      instead of repeating JSON keys per row); everything else (single
//      objects, nested or heterogeneous data) stays minified JSON.

/** A flat record whose values render to a single table cell. */
export type FlatRecord = Record<string, unknown>;

/**
 * Serialize any value as minified JSON — no pretty-print indentation or
 * newlines. The correct default for single objects, few scalars, and deeply
 * nested or heterogeneous data, where a Markdown table doesn't apply and
 * pretty-printing only spends tokens on structural whitespace.
 *
 * Mirrors `JSON.stringify(value)` semantics: `undefined`, functions, and
 * symbols are dropped from objects (and become `null` in arrays), so the output
 * is always valid JSON.
 */
export function minifiedJson(value: unknown): string {
  return JSON.stringify(value) ?? 'null';
}

/**
 * Return a new object containing only `keys`, in the order given. Keys absent
 * from `source` are skipped (not emitted as `undefined`), so the output carries
 * no empty placeholders. The first-order token lever — prune to the fields
 * agents actually consume before choosing a format.
 */
export function pick<T extends FlatRecord, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

/** Apply {@link pick} across an array of records. */
export function pickFields<T extends FlatRecord, K extends keyof T>(
  rows: readonly T[],
  keys: readonly K[],
): Pick<T, K>[] {
  return rows.map((row) => pick(row, keys));
}

export interface TruncateOptions {
  /** Marker appended when truncation occurs. Default `'…'`. */
  ellipsis?: string;
  /**
   * Append `+{omitted}` after the ellipsis so an agent can see how much was cut
   * (e.g. a 5000-char log shown as `…+4987`). Default `false`.
   */
  showOmitted?: boolean;
}

/**
 * Truncate a string to at most `maxLength` characters (counting the ellipsis),
 * for capping long free-text blobs — diffs, logs, bodies — that would otherwise
 * dominate a response. Non-strings are returned unchanged; strings already
 * within the limit are returned as-is (no ellipsis).
 *
 * `maxLength` is a hard ceiling on the returned length: with `showOmitted` the
 * `+{omitted}` suffix is included in that budget, so the result never exceeds
 * `maxLength` regardless of options.
 */
export function truncate(
  value: string,
  maxLength: number,
  options: TruncateOptions = {},
): string {
  if (typeof value !== 'string' || value.length <= maxLength) return value;
  const ellipsis = options.ellipsis ?? '…';
  // Degenerate budgets: not enough room for even the marker — hard-cut.
  if (maxLength <= ellipsis.length)
    return value.slice(0, Math.max(0, maxLength));

  if (options.showOmitted) {
    // Reserve room for the marker + the `+{omitted}` count, solving for the
    // kept length whose suffix still fits inside `maxLength`. The omitted count
    // depends on the kept length, which depends on the suffix width — so we
    // settle it iteratively (at most a couple of passes as digits shrink).
    let kept = maxLength - ellipsis.length;
    for (;;) {
      const suffix = `${ellipsis}+${value.length - kept}`;
      const nextKept = maxLength - suffix.length;
      if (nextKept === kept || nextKept < 0) {
        const finalKept = Math.max(0, nextKept);
        return `${value.slice(0, finalKept)}${ellipsis}+${
          value.length - finalKept
        }`;
      }
      kept = nextKept;
    }
  }
  return `${value.slice(0, maxLength - ellipsis.length)}${ellipsis}`;
}

export interface MarkdownTableOptions<T extends FlatRecord> {
  /**
   * Columns to render, in order. Defaults to the union of keys across all rows,
   * in first-seen order. Pass this to both fix column order and prune fields in
   * one step (it doubles as a {@link pickFields} selector).
   */
  columns?: readonly (keyof T)[];
  /**
   * Header label per column. Defaults to the column key. Use to rename a verbose
   * key to a shorter header (header is written once, so the saving is small —
   * prefer it for clarity, not compression).
   */
  headers?: Partial<Record<keyof T, string>>;
  /**
   * Pad cells with spaces so columns visually align. Default `false`: alignment
   * whitespace is pure token cost an agent doesn't need. Enable only for
   * human-facing output.
   */
  pad?: boolean;
}

/** Render a single cell value: minified JSON for objects, `''` for nullish. */
function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  // Objects, arrays, and anything else (symbols/functions → minifiedJson's
  // 'null') fall back to minified JSON — a signal the shape isn't flat.
  return minifiedJson(value);
}

/**
 * Escape a value for a GitHub-Flavored-Markdown table cell: pipes would start a
 * new column and newlines would break the row, so both are neutralized. Tables
 * are for *flat* records — a value needing heavy escaping is a signal the shape
 * is wrong for a table and should be minified JSON instead.
 */
function escapeCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

/**
 * Format an array of flat records as a compact GitHub-Flavored-Markdown table:
 * column headers are written once, then one line per row — the biggest token
 * win for flat, uniform lists (PR lists, check runs, search results, run
 * lists). Returns `''` for an empty array (no header-only noise); the caller
 * decides how to signal "no results".
 *
 * Compact by default — cells joined by `|` with no padding or outer pipes,
 * which is valid GFM and spends no tokens on alignment. Prune with `columns`
 * and {@link truncate} long cells *before* calling; this only handles layout.
 *
 * Not for nested or heterogeneous data — object cells degrade to minified JSON,
 * which is a hint to use {@link minifiedJson} for the whole response instead.
 */
export function markdownTable<T extends FlatRecord>(
  rows: readonly T[],
  options: MarkdownTableOptions<T> = {},
): string {
  if (rows.length === 0) return '';

  const columns = options.columns ?? deriveColumns(rows);
  if (columns.length === 0) return '';

  const headerLabels = columns.map((col) =>
    escapeCell(String(options.headers?.[col] ?? String(col))),
  );
  const dataRows = rows.map((row) =>
    columns.map((col) => escapeCell(renderCell(row[col]))),
  );

  if (!options.pad) {
    const sep = columns.map(() => '---');
    return [headerLabels, sep, ...dataRows]
      .map((cells) => cells.join('|'))
      .join('\n');
  }

  // Padded (human-facing) mode: size each column to its widest cell.
  const widths = columns.map((_, i) =>
    Math.max(headerLabels[i].length, ...dataRows.map((r) => r[i].length)),
  );
  const padCells = (cells: string[]): string =>
    `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  const sepRow = `| ${widths.map((w) => '-'.repeat(Math.max(3, w))).join(' | ')} |`;
  return [padCells(headerLabels), sepRow, ...dataRows.map(padCells)].join('\n');
}

/** Union of keys across all rows, in first-seen order. */
function deriveColumns<T extends FlatRecord>(rows: readonly T[]): (keyof T)[] {
  const seen = new Set<keyof T>();
  for (const row of rows) {
    for (const key of Object.keys(row) as (keyof T)[]) seen.add(key);
  }
  return [...seen];
}
