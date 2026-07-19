/**
 * Unit tests for the Player Comparison stat helpers (LS-7804). The comparison
 * UI is exercised end-to-end by apps/web-e2e/player-comparison.spec.ts; here we
 * verify the pure formatting/leader-detection logic that drives the "best"
 * highlighting and value rendering — the extract-and-test pattern used across
 * the players feature (see PlayersStatsTable.spec.tsx).
 */
import type { GetAllPlayerSeasonStatsQuery } from '@legacy-sports/graphql';
import { act, renderHook } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import {
  addPlayerToSlots,
  bestIndex,
  DEFAULT_SEASON_COUNT,
  fmt,
  fmtAvg,
  fmtCount,
  fmtEra,
  fmtScoreRow,
  isNarrowSeasonViewport,
  restorePlayerToSlot,
  SEASON_STACK_BREAKPOINT,
  type SeasonBattingRow,
  type SeasonPitchingRow,
  type SelectedPlayer,
  selectSeasonBattingRows,
  selectSeasonPitchingRows,
  SlotBadge,
  tiedIndices,
  visibleSeasonRows,
} from './PlayerComparison';
import { render } from '../../test-utils';

describe('fmt', () => {
  it('renders an em dash for nullish values', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
  });

  it('formats integers with thousands separators by default', () => {
    expect(fmt(1234567)).toBe('1,234,567');
    expect(fmt(0)).toBe('0');
  });

  it('honors a fixed decimal count when requested', () => {
    expect(fmt(2.5, 1)).toBe('2.5');
    expect(fmt(3, 2)).toBe('3.00');
  });
});

describe('fmtAvg', () => {
  it('renders an em dash for nullish values', () => {
    expect(fmtAvg(null)).toBe('—');
    expect(fmtAvg(undefined)).toBe('—');
  });

  it('drops the leading zero for sub-1.000 rate stats', () => {
    expect(fmtAvg(0.282)).toBe('.282');
    expect(fmtAvg(0.3)).toBe('.300');
  });

  it('formats values >= 1 as 3-decimal strings (no silent integer truncation)', () => {
    expect(fmtAvg(1)).toBe('1.000');
    expect(fmtAvg(1.012)).toBe('1.012');
  });
});

describe('fmtCount', () => {
  it('renders an em dash for nullish values (true absence of data)', () => {
    expect(fmtCount(null)).toBe('—');
    expect(fmtCount(undefined)).toBe('—');
  });

  it('renders "0" for a confirmed zero count — not a dash', () => {
    expect(fmtCount(0)).toBe('0');
  });

  it('renders positive integer counts as strings', () => {
    expect(fmtCount(3)).toBe('3');
    expect(fmtCount(14)).toBe('14');
  });
});

describe('fmtScoreRow', () => {
  it('uses 1 decimal place when any value is ≥ 1', () => {
    expect(fmtScoreRow([12.5, 8.3])).toEqual(['12.5', '8.3']);
  });

  it('uses 2 decimal places when all non-null values are < 1 — distinguishes micro-differences', () => {
    expect(fmtScoreRow([0.04, 0.0])).toEqual(['0.04', '0.00']);
  });

  it('renders "—" for null/undefined entries regardless of precision tier', () => {
    expect(fmtScoreRow([null, 0.5, undefined])).toEqual(['—', '0.50', '—']);
  });

  it('defaults to 1 decimal when all values are null (no non-null max to compare)', () => {
    // All nulls → all dashes; decimals choice is irrelevant but must not throw.
    expect(fmtScoreRow([null, null])).toEqual(['—', '—']);
  });

  it('uses 2 decimals when the mix of null and sub-1 values — null does not pollute max', () => {
    expect(fmtScoreRow([null, 0.04, 0.08])).toEqual(['—', '0.04', '0.08']);
  });

  it('uses 1 decimal when values span both sides of 1 (mixed precision not needed)', () => {
    expect(fmtScoreRow([0.04, 1.5])).toEqual(['0.0', '1.5']);
  });
});

describe('fmtEra', () => {
  it('renders an em dash for nullish values', () => {
    expect(fmtEra(null)).toBe('—');
    expect(fmtEra(undefined)).toBe('—');
  });

  it('treats a literal "0.00" ERA as zero, not absent data (LS-7037)', () => {
    expect(fmtEra('0.00')).toBe('0.00');
    expect(fmtEra('0')).toBe('0.00');
  });

  it('renders an em dash for empty / non-numeric strings (parseFloat → NaN)', () => {
    expect(fmtEra('')).toBe('—');
    expect(fmtEra('   ')).toBe('—');
    expect(fmtEra('N/A')).toBe('—');
  });

  it('formats numeric ERA strings to two decimal places', () => {
    expect(fmtEra('3.21')).toBe('3.21');
    expect(fmtEra('2.5')).toBe('2.50');
    expect(fmtEra('12.345')).toBe('12.35');
  });
});

describe('bestIndex', () => {
  it('returns null when no valid values are present', () => {
    expect(bestIndex([])).toBeNull();
    expect(bestIndex([null, undefined])).toBeNull();
  });

  it('returns the index of the sole valid value when only one player has data', () => {
    expect(bestIndex([5, null, undefined])).toBe(0);
    expect(bestIndex([null, 40, undefined])).toBe(1);
  });

  it('returns the index of the highest value by default', () => {
    expect(bestIndex([10, 25, 18])).toBe(1);
  });

  it('returns the index of the lowest value when lowerIsBetter', () => {
    expect(bestIndex([3.2, 2.9, 4.1], true)).toBe(1);
  });

  it('returns null on a tie (no single leader)', () => {
    expect(bestIndex([20, 20, 5])).toBeNull();
  });

  it('ignores nullish values when picking the leader', () => {
    expect(bestIndex([null, 40, 12, undefined])).toBe(1);
  });

  it('treats 0 as a valid value, not as absent data', () => {
    expect(bestIndex([0, 3, 1])).toBe(1);
    expect(bestIndex([0, 0])).toBeNull();
  });
});

describe('tiedIndices', () => {
  it('returns empty array when fewer than two valid values are present', () => {
    expect(tiedIndices([5, null, undefined])).toEqual([]);
    expect(tiedIndices([])).toEqual([]);
  });

  it('returns empty array when there is a unique leader', () => {
    expect(tiedIndices([10, 25, 18])).toEqual([]);
    expect(tiedIndices([3.2, 2.9, 4.1], true)).toEqual([]);
  });

  it('returns indices of all players tied for best', () => {
    expect(tiedIndices([50, 50, 10])).toEqual([0, 1]);
  });

  it('handles a 3-way tie', () => {
    expect(tiedIndices([20, 20, 20])).toEqual([0, 1, 2]);
  });

  it('handles ties when lowerIsBetter', () => {
    expect(tiedIndices([2.5, 2.5, 4.1], true)).toEqual([0, 1]);
  });

  it('ignores nullish values when detecting ties', () => {
    expect(tiedIndices([null, 40, 40, undefined])).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// addPlayerToSlots — LS-7024
// ---------------------------------------------------------------------------

function makePlayer(id: number): SelectedPlayer {
  return {
    id,
    name: `Player ${id}`,
    position: 'SP',
    summary: {},
  };
}

describe('addPlayerToSlots', () => {
  it('fills the first empty slot', () => {
    const prev = [null, null, null, null] as (SelectedPlayer | null)[];
    const result = addPlayerToSlots(prev, makePlayer(1));
    expect(result[0]).toMatchObject({ id: 1 });
    expect(result.slice(1)).toEqual([null, null, null]);
  });

  it('returns prev unchanged when the ID is already present — defensive dedupe guard', () => {
    const player = makePlayer(42);
    const prev = [player, null, null, null];
    const result = addPlayerToSlots(prev, makePlayer(42));
    expect(result).toBe(prev);
  });

  it('returns prev unchanged when all slots are filled', () => {
    const prev = [makePlayer(1), makePlayer(2), makePlayer(3), makePlayer(4)];
    const result = addPlayerToSlots(prev, makePlayer(5));
    expect(result).toBe(prev);
  });

  it('does not mutate the previous array', () => {
    const prev = [null, null, null, null] as (SelectedPlayer | null)[];
    addPlayerToSlots(prev, makePlayer(7));
    expect(prev[0]).toBeNull();
  });

  it('fills the next available slot when earlier slots are occupied', () => {
    const prev = [makePlayer(1), null, null, null];
    const result = addPlayerToSlots(prev, makePlayer(2));
    expect(result[0]).toMatchObject({ id: 1 });
    expect(result[1]).toMatchObject({ id: 2 });
  });
});

// ---------------------------------------------------------------------------
// restorePlayerToSlot — LS-7040 (undo a removed chip)
// ---------------------------------------------------------------------------

describe('restorePlayerToSlot', () => {
  it('restores the player to its original slot when that slot is empty', () => {
    const prev = [null, null, null, null] as (SelectedPlayer | null)[];
    const result = restorePlayerToSlot(prev, 2, makePlayer(9));
    expect(result[2]).toMatchObject({ id: 9 });
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[3]).toBeNull();
  });

  it('returns prev unchanged when the target slot is now occupied', () => {
    const prev = [null, makePlayer(5), null, null];
    const result = restorePlayerToSlot(prev, 1, makePlayer(9));
    expect(result).toBe(prev);
  });

  it('returns prev unchanged when the player ID is already present elsewhere', () => {
    const prev = [makePlayer(9), null, null, null];
    const result = restorePlayerToSlot(prev, 2, makePlayer(9));
    expect(result).toBe(prev);
  });

  it('returns prev unchanged for an out-of-range index', () => {
    const prev = [null, null, null, null] as (SelectedPlayer | null)[];
    expect(restorePlayerToSlot(prev, -1, makePlayer(9))).toBe(prev);
    expect(restorePlayerToSlot(prev, 4, makePlayer(9))).toBe(prev);
  });

  it('does not mutate the previous array', () => {
    const prev = [null, null, null, null] as (SelectedPlayer | null)[];
    restorePlayerToSlot(prev, 0, makePlayer(7));
    expect(prev[0]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Season breakdown row selectors — LS-7036
//
// The SeasonBattingBlock renders the batting table only when its batting rows
// are non-empty, the pitching table only when its pitching rows are non-empty,
// and the "No season data available." fallback only when BOTH are empty. The
// QA finding (PCM-041) flagged a data-integrity risk: a pitcher with 0 AB and
// >0 IP must see the pitching table — never the fallback. These tests lock the
// symmetric filter logic that drives those render guards in place.
// ---------------------------------------------------------------------------

function battingRow(
  season: number | null,
  atBats: number | null,
): SeasonBattingRow {
  return { season, atBats };
}

function pitchingRow(
  season: number | null,
  inningsPitched: number | null,
): SeasonPitchingRow {
  return { season, inningsPitched };
}

function seasonData(
  partial: Partial<GetAllPlayerSeasonStatsQuery>,
): GetAllPlayerSeasonStatsQuery {
  return partial;
}

describe('selectSeasonBattingRows', () => {
  it('returns an empty array when data is undefined', () => {
    expect(selectSeasonBattingRows(undefined)).toEqual([]);
  });

  it('returns an empty array when playerSeasonBatting is absent', () => {
    expect(selectSeasonBattingRows(seasonData({}))).toEqual([]);
  });

  it('excludes seasons with zero or nullish at-bats (a pitcher who never hit)', () => {
    const data = seasonData({
      playerSeasonBatting: [
        battingRow(2021, 0),
        battingRow(2022, null),
        battingRow(2023, 5),
      ],
    });
    const result = selectSeasonBattingRows(data);
    expect(result.map((r) => r.season)).toEqual([2023]);
  });

  it('excludes rows with a null season', () => {
    const data = seasonData({
      playerSeasonBatting: [battingRow(null, 100), battingRow(2023, 100)],
    });
    expect(selectSeasonBattingRows(data).map((r) => r.season)).toEqual([2023]);
  });

  it('sorts surviving seasons newest-first and caps at the 4 most recent', () => {
    const data = seasonData({
      playerSeasonBatting: [
        battingRow(2019, 400),
        battingRow(2023, 400),
        battingRow(2020, 400),
        battingRow(2022, 400),
        battingRow(2021, 400),
      ],
    });
    expect(selectSeasonBattingRows(data).map((r) => r.season)).toEqual([
      2023, 2022, 2021, 2020,
    ]);
  });

  it('does not mutate the source array (sorts a copy)', () => {
    const source = [battingRow(2019, 400), battingRow(2023, 400)];
    const data = seasonData({ playerSeasonBatting: source });
    selectSeasonBattingRows(data);
    expect(source.map((r) => r.season)).toEqual([2019, 2023]);
  });
});

describe('selectSeasonPitchingRows', () => {
  it('returns an empty array when data is undefined', () => {
    expect(selectSeasonPitchingRows(undefined)).toEqual([]);
  });

  it('returns an empty array when playerSeasonPitching is absent', () => {
    expect(selectSeasonPitchingRows(seasonData({}))).toEqual([]);
  });

  it('excludes seasons with zero or nullish innings pitched (a position player)', () => {
    const data = seasonData({
      playerSeasonPitching: [
        pitchingRow(2021, 0),
        pitchingRow(2022, null),
        pitchingRow(2023, 12.1),
      ],
    });
    expect(selectSeasonPitchingRows(data).map((r) => r.season)).toEqual([2023]);
  });

  it('sorts surviving seasons newest-first and caps at the 4 most recent', () => {
    const data = seasonData({
      playerSeasonPitching: [
        pitchingRow(2019, 180),
        pitchingRow(2023, 180),
        pitchingRow(2020, 180),
        pitchingRow(2022, 180),
        pitchingRow(2021, 180),
      ],
    });
    expect(selectSeasonPitchingRows(data).map((r) => r.season)).toEqual([
      2023, 2022, 2021, 2020,
    ]);
  });
});

describe('season breakdown render guards (PCM-041 regression)', () => {
  // Mirrors the JSX guards in SeasonBattingBlock: batting renders when its rows
  // are non-empty, pitching when its rows are non-empty, fallback only when both
  // are empty.
  function guards(data: GetAllPlayerSeasonStatsQuery | undefined) {
    const battingRows = selectSeasonBattingRows(data);
    const pitchingRows = selectSeasonPitchingRows(data);
    const showBatting = battingRows.length > 0;
    const showPitching = pitchingRows.length > 0;
    return {
      showBatting,
      showPitching,
      showFallback: !showBatting && !showPitching,
    };
  }

  it('a pitcher with 0 AB and >0 IP shows pitching only — never the fallback', () => {
    const data = seasonData({
      playerSeasonBatting: [battingRow(2022, 0), battingRow(2023, 0)],
      playerSeasonPitching: [pitchingRow(2022, 165), pitchingRow(2023, 178.2)],
    });
    expect(guards(data)).toEqual({
      showBatting: false,
      showPitching: true,
      showFallback: false,
    });
  });

  it('a position player with AB and no IP shows batting only — never the fallback', () => {
    const data = seasonData({
      playerSeasonBatting: [battingRow(2022, 500), battingRow(2023, 480)],
      playerSeasonPitching: [pitchingRow(2022, 0)],
    });
    expect(guards(data)).toEqual({
      showBatting: true,
      showPitching: false,
      showFallback: false,
    });
  });

  it('a two-way player shows both tables', () => {
    const data = seasonData({
      playerSeasonBatting: [battingRow(2023, 400)],
      playerSeasonPitching: [pitchingRow(2023, 130)],
    });
    expect(guards(data)).toEqual({
      showBatting: true,
      showPitching: true,
      showFallback: false,
    });
  });

  it('shows the fallback only when both batting and pitching are empty', () => {
    const data = seasonData({
      playerSeasonBatting: [battingRow(2023, 0)],
      playerSeasonPitching: [pitchingRow(2023, 0)],
    });
    expect(guards(data)).toEqual({
      showBatting: false,
      showPitching: false,
      showFallback: true,
    });
  });
});

// ---------------------------------------------------------------------------
// PlayerSearchInput debounce — LS-7020
// ---------------------------------------------------------------------------

function useDebounce(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

describe('PlayerSearchInput debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not update the debounced value before 300ms have elapsed', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebounce(v),
      {
        initialProps: { v: '' },
      },
    );
    rerender({ v: 'M' });
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(result.current).toBe('');
  });

  it('updates the debounced value after 300ms', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebounce(v),
      {
        initialProps: { v: '' },
      },
    );
    rerender({ v: 'Mi' });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('Mi');
  });

  it('cancels the pending update when the value changes before 300ms — prevents per-keystroke queries', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebounce(v),
      {
        initialProps: { v: '' },
      },
    );
    rerender({ v: 'M' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ v: 'Mi' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    // 200ms total — neither timer has fired yet
    expect(result.current).toBe('');
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // 300ms after the second keystroke — only the final value emitted
    expect(result.current).toBe('Mi');
  });
});

describe('isNarrowSeasonViewport', () => {
  it('stacks the season tables below the breakpoint (e.g. iPhone SE)', () => {
    expect(isNarrowSeasonViewport(375)).toBe(true);
    expect(isNarrowSeasonViewport(SEASON_STACK_BREAKPOINT - 1)).toBe(true);
  });

  it('keeps the table layout at or above the breakpoint', () => {
    expect(isNarrowSeasonViewport(SEASON_STACK_BREAKPOINT)).toBe(false);
    expect(isNarrowSeasonViewport(768)).toBe(false);
    expect(isNarrowSeasonViewport(1280)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SlotBadge — slot identity is conveyed by number, not color alone (PCM-044 /
// LS-7039). Color-blind users must be able to distinguish slots and map a chip
// to its comparison-table column without relying on the accent color. The badge
// is shared by the selected-player chip and the comparison-table column header.
// ---------------------------------------------------------------------------

describe('SlotBadge', () => {
  it('renders the 1-based slot number as visible text (index 0 → "1")', () => {
    const { getByText } = render(<SlotBadge index={0} />);
    // The digit is the non-color differentiator that replaces the bare dot.
    expect(getByText('1')).toBeTruthy();
  });

  it('numbers slots from the player index (index 2 → "3")', () => {
    const { getByText } = render(<SlotBadge index={2} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('exposes an accessible "Slot N" label so the marker is no longer unlabeled', () => {
    const { getByLabelText } = render(<SlotBadge index={3} />);
    expect(getByLabelText('Slot 4')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// visibleSeasonRows — LS-7034 (expand-all-seasons toggle)
// ---------------------------------------------------------------------------

describe('visibleSeasonRows', () => {
  const seasons = [2025, 2024, 2023, 2022, 2021, 2020];

  it('truncates to the default count when collapsed', () => {
    expect(visibleSeasonRows(seasons, false)).toEqual([2025, 2024, 2023, 2022]);
    expect(visibleSeasonRows(seasons, false)).toHaveLength(
      DEFAULT_SEASON_COUNT,
    );
  });

  it('returns every row when expanded', () => {
    expect(visibleSeasonRows(seasons, true)).toEqual(seasons);
  });

  it('returns all rows unchanged when there are fewer than the default count', () => {
    const few = [2025, 2024];
    expect(visibleSeasonRows(few, false)).toEqual(few);
    expect(visibleSeasonRows(few, true)).toEqual(few);
  });

  it('does not mutate the input array', () => {
    const input = [...seasons];
    visibleSeasonRows(input, false);
    expect(input).toEqual(seasons);
  });
});
