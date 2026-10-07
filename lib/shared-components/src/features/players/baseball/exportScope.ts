/**
 * Row-scope wording for the MLB player-stats export (LS-10731). The export
 * covers every filtered row up to a per-table cap, and the UI must say how many
 * rows a download will contain — and say so plainly when the cap cuts it short.
 */

export interface ExportScopeInput {
  readonly viewMode: 'combined' | 'hitters' | 'pitchers';
  /** Server-side filtered hitter total, or null while it is still loading. */
  readonly battingTotal: number | null;
  /** Server-side filtered pitcher total, or null while it is still loading. */
  readonly pitchingTotal: number | null;
  /** Rows exported per table at most. */
  readonly cap: number;
  /** A client-side availability filter will narrow the exported rows further. */
  readonly availabilityActive: boolean;
}

function describeTable(total: number, cap: number, noun: string): string {
  return total > cap
    ? `first ${cap.toLocaleString()} of ${total.toLocaleString()} ${noun}`
    : `all ${total.toLocaleString()} ${noun}`;
}

/**
 * e.g. "Export includes all 1,096 hitters" or "Export includes first 5,000 of
 * 12,345 hitters + all 312 pitchers (5,000-row cap per table)". Returns null
 * until every table in the view has reported its total.
 */
export function describeExportScope(input: ExportScopeInput): string | null {
  const { viewMode, battingTotal, pitchingTotal, cap, availabilityActive } =
    input;
  const parts: string[] = [];
  if (viewMode !== 'pitchers') {
    if (battingTotal === null) return null;
    parts.push(describeTable(battingTotal, cap, 'hitters'));
  }
  if (viewMode !== 'hitters') {
    if (pitchingTotal === null) return null;
    parts.push(describeTable(pitchingTotal, cap, 'pitchers'));
  }
  const capped =
    (viewMode !== 'pitchers' && (battingTotal ?? 0) > cap) ||
    (viewMode !== 'hitters' && (pitchingTotal ?? 0) > cap);
  let label = `Export includes ${parts.join(' + ')}`;
  if (capped) label += ` (${cap.toLocaleString()}-row cap per table)`;
  if (availabilityActive) label += ', narrowed by your availability filter';
  return label;
}

/**
 * Apply the grids' client-side availability filter to fetched export rows, so
 * the file contains the same players the grid would show.
 */
export function filterByAvailability<Row>(
  rows: readonly Row[],
  getPlayerId: (row: Row) => number | null | undefined,
  availability: 'all' | 'free_agents' | 'rostered' | undefined,
  rosteredPlayerIds: ReadonlySet<number> | undefined,
): readonly Row[] {
  if (!availability || availability === 'all' || !rosteredPlayerIds) {
    return rows;
  }
  const wantRostered = availability === 'rostered';
  return rows.filter(
    (row) => rosteredPlayerIds.has(getPlayerId(row) ?? -1) === wantRostered,
  );
}
