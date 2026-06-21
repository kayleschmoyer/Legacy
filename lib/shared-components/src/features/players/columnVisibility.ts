/**
 * Column visibility helpers for the Player Stats page (LS-7105 / PST-001).
 *
 * The stats grids historically exposed only a binary `statsFormat`
 * (`standard` = high-priority columns, `expanded` = all). This module adds a
 * per-column show/hide model layered on top of that preset:
 *
 * - When no explicit selection exists (`visibleColumns === undefined`), the
 *   grids fall back to the `statsFormat` preset — byte-identical to the prior
 *   behaviour.
 * - Once the user toggles a column, the selection is materialized from the
 *   preset baseline (the "merge with statsFormat preset on load" requirement)
 *   and persisted by the host to the URL (`cols=`) and localStorage.
 *
 * The functions here are intentionally pure and grid-agnostic (callers pass the
 * column metadata in) so the picker logic can be unit-tested without mounting
 * the Tamagui shell, and so this module never imports the grids — avoiding a
 * circular dependency, since the grids import {@link resolveVisibleColumns}.
 */

export type StatsFormat = 'standard' | 'expanded';
export type ColumnPriority = 'high' | 'medium' | 'low';

/** Minimal shape needed to resolve preset visibility for a grid column. */
export interface ColumnLike {
  readonly key: string;
  readonly priority: ColumnPriority;
}

/** A single toggle entry rendered in the column-picker UI. */
export interface ToggleableColumn {
  readonly key: string;
  readonly label: string;
}

/** A grid's columns paired with the always-visible name column key. */
export interface ColumnGroup<T extends ColumnLike = ColumnLike> {
  readonly columns: readonly (T & { readonly label?: string })[];
  readonly nameKey: string;
}

/**
 * Sentinel serialized into the `cols` param / storage when the user has
 * explicitly hidden *every* toggleable column. An empty selection is a valid
 * choice (only the always-visible name column shows), so it must be
 * distinguishable from "no selection at all" (absent param ⇒ preset default).
 */
export const NO_COLUMNS_SENTINEL = 'none';

/**
 * Whether a column is shown by the `statsFormat` preset when there is no
 * explicit per-column selection. Mirrors the prior grid logic exactly:
 * `standard` shows only high-priority columns; `expanded` shows all.
 */
export function isPresetVisible(
  priority: ColumnPriority,
  statsFormat: StatsFormat,
): boolean {
  return statsFormat === 'expanded' || priority === 'high';
}

/**
 * Resolve which columns a grid should render.
 *
 * - The `alwaysVisibleKey` (the player-name column) is always kept.
 * - When `visibleColumns` is provided, keep columns whose key is included.
 * - Otherwise fall back to the `statsFormat` preset.
 */
export function resolveVisibleColumns<T extends ColumnLike>(
  columns: readonly T[],
  statsFormat: StatsFormat,
  visibleColumns: readonly string[] | undefined,
  alwaysVisibleKey: string,
): readonly T[] {
  if (visibleColumns) {
    const allow = new Set(visibleColumns);
    return columns.filter(
      (c) => c.key === alwaysVisibleKey || allow.has(c.key),
    );
  }
  return columns.filter(
    (c) =>
      c.key === alwaysVisibleKey || isPresetVisible(c.priority, statsFormat),
  );
}

/**
 * Build the de-duplicated list of toggleable columns for the picker (name
 * columns excluded). When two grids share a stat key (e.g. `strikeouts`), the
 * first occurrence's label wins and the key appears once — a single toggle
 * controls it across both grids.
 */
export function buildToggleableColumns(
  groups: ReadonlyArray<ColumnGroup<ColumnLike & { readonly label: string }>>,
): ToggleableColumn[] {
  const seen = new Set<string>();
  const out: ToggleableColumn[] = [];
  for (const group of groups) {
    for (const col of group.columns) {
      if (col.key === group.nameKey || seen.has(col.key)) continue;
      seen.add(col.key);
      out.push({ key: col.key, label: col.label });
    }
  }
  return out;
}

/**
 * Keys shown by the `statsFormat` preset across all groups (name columns
 * excluded), de-duplicated. "Any-grid" semantics: a shared key is included if
 * the preset would show it in *at least one* grid it belongs to — so seeding an
 * explicit selection from the preset never hides a column that was visible by
 * default in some grid.
 */
export function presetVisibleKeys(
  groups: ReadonlyArray<ColumnGroup>,
  statsFormat: StatsFormat,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const col of group.columns) {
      if (col.key === group.nameKey || seen.has(col.key)) continue;
      if (isPresetVisible(col.priority, statsFormat)) {
        seen.add(col.key);
        out.push(col.key);
      }
    }
  }
  return out;
}

/**
 * Toggle a single column key within the current selection. When there is no
 * explicit selection yet (`current === null`), the selection is first
 * materialized from `presetKeys` (the preset baseline) so the result reflects
 * exactly what is on screen plus/minus the toggled key.
 */
export function toggleColumnKey(
  current: readonly string[] | null,
  key: string,
  presetKeys: readonly string[],
): string[] {
  const base = current ?? [...presetKeys];
  return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
}

/**
 * Serialize a selection for the `cols` URL param / storage. `null` (no
 * selection) returns `null` so callers omit the key entirely; an explicit empty
 * selection returns the {@link NO_COLUMNS_SENTINEL}.
 */
export function serializeVisibleColumns(
  cols: readonly string[] | null,
): string | null {
  if (cols === null) return null;
  if (cols.length === 0) return NO_COLUMNS_SENTINEL;
  return cols.join(',');
}

/**
 * Parse a serialized `cols` value back into a selection, dropping any key not in
 * `validKeys` (defends against hand-edited URLs / stale storage). Returns:
 * - `null` for an absent/empty value (⇒ preset default), or when every token
 *   was invalid;
 * - `[]` for the explicit {@link NO_COLUMNS_SENTINEL};
 * - the de-duplicated, validated key list otherwise.
 */
export function parseVisibleColumns(
  raw: string | null | undefined,
  validKeys: readonly string[],
): string[] | null {
  if (raw == null || raw === '') return null;
  if (raw === NO_COLUMNS_SENTINEL) return [];
  const valid = new Set(validKeys);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(',')) {
    const key = token.trim();
    if (key.length === 0 || !valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.length > 0 ? out : null;
}
