import React from 'react';
import { PlayerStatsShell } from './shell/PlayerStatsShell';
import {
  type PlayerStatsPageProps,
  useBaseballController,
} from './baseball/baseballStatsConfig';

/**
 * Player Statistics Page (MLB).
 *
 * Thin binding of the baseball controller to the sport-agnostic
 * {@link PlayerStatsShell}. All baseball filter state, grids, sliders, column
 * visibility, and export/share live in {@link useBaseballController}; all
 * presentational chrome lives in the shared shell. The NFL stats browser renders
 * through the same shell via its own controller (LS-8442).
 *
 * Design: nostalgic, sporty, professional (see docs/design/brand.md).
 * Tables are the product; chrome is restrained so numbers read like a Sunday
 * paper box score.
 */
export function PlayerStatsPage(props: PlayerStatsPageProps) {
  const controller = useBaseballController(props);
  return (
    <PlayerStatsShell
      controller={controller}
      showHeader={props.showHeader ?? true}
      showActions={props.showActions ?? true}
    />
  );
}

// ── Public API re-exports ────────────────────────────────────────────────────
// Preserve the import surface that unit specs, the players feature barrel, and
// the apps/web route depend on. These symbols moved into the shell/ + baseball/
// modules during the sport-agnostic refactor (LS-8442) but are still imported
// from '@legacy-sports/shared-components/players' via this file.

export type {
  PlayerStatsPageProps,
  ExportFormat,
  PlayerStatsExportData,
} from './baseball/baseballStatsConfig';

export {
  battingPlayerTypeForViewMode,
  battingSortFilter,
  buildShareUrl,
  clampPageSizeForViewMode,
  createClearFiltersHandler,
  DEFAULT_BATTING_SORT_BY,
  DEFAULT_BATTING_SORT_DIR,
  enforceSearchMinLength,
  gridPageFilter,
  hasPendingFilterChanges,
  normalizeGridPage,
  normalizeViewMode,
  pageSizeOptionsForViewMode,
  pitchingSortFilter,
  STATS_COLUMN_GROUPS,
  STATS_TOGGLEABLE_COLUMN_KEYS,
} from './baseball/baseballStatsHelpers';
export type {
  AppliedFilters,
  ClearFiltersSetters,
} from './baseball/baseballStatsHelpers';

export {
  createDebouncedCommit,
  parseSliderValue,
  SLIDER_COMMIT_DEBOUNCE_MS,
  sliderFillPct,
  stepValue,
} from './shell/sliderUtils';
export type { DebouncedCommit } from './shell/sliderUtils';
