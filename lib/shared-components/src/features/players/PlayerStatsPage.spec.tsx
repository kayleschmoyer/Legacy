import {
  battingPlayerTypeForViewMode,
  buildShareUrl,
  type ClearFiltersSetters,
  createClearFiltersHandler,
  enforceSearchMinLength,
  parseSliderValue,
  stepValue,
} from './PlayerStatsPage';

// Unit tests for the EmptyCard "Clear all filters" reset path introduced in
// LS-4613. The handler is extracted to a pure factory so the reset semantics
// can be verified without mounting the full Tamagui shell.

const ERA_MAX_OFF = 5;

function makeSetters(): {
  setters: ClearFiltersSetters;
  calls: Record<keyof ClearFiltersSetters, unknown[]>;
} {
  const calls: Record<keyof ClearFiltersSetters, unknown[]> = {
    setSearch: [],
    setPosition: [],
    setTeam: [],
    setMinHR: [],
    setMinAVG: [],
    setMaxERA: [],
  };
  const setters: ClearFiltersSetters = {
    setSearch: (v) => calls.setSearch.push(v),
    setPosition: (v) => calls.setPosition.push(v),
    setTeam: (v) => calls.setTeam.push(v),
    setMinHR: (v) => calls.setMinHR.push(v),
    setMinAVG: (v) => calls.setMinAVG.push(v),
    setMaxERA: (v) => calls.setMaxERA.push(v),
  };
  return { setters, calls };
}

describe('createClearFiltersHandler (LS-4613)', () => {
  it('resets every filter draft to its page default and commits the snapshot', () => {
    const { setters, calls } = makeSetters();
    const applyFilters = jest.fn();
    const onClearFilters = jest.fn();

    const handler = createClearFiltersHandler(
      setters,
      applyFilters,
      onClearFilters,
    );
    handler();

    expect(calls.setSearch).toEqual(['']);
    expect(calls.setPosition).toEqual(['All Positions']);
    expect(calls.setTeam).toEqual(['All Teams']);
    expect(calls.setMinHR).toEqual([0]);
    expect(calls.setMinAVG).toEqual([0]);
    expect(calls.setMaxERA).toEqual([ERA_MAX_OFF]);
    expect(applyFilters).toHaveBeenCalledTimes(1);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('commits via applyFilters after resetting setters, in that order', () => {
    const order: string[] = [];
    const setters: ClearFiltersSetters = {
      setSearch: () => order.push('setSearch'),
      setPosition: () => order.push('setPosition'),
      setTeam: () => order.push('setTeam'),
      setMinHR: () => order.push('setMinHR'),
      setMinAVG: () => order.push('setMinAVG'),
      setMaxERA: () => order.push('setMaxERA'),
    };
    const applyFilters = jest.fn(() => order.push('applyFilters'));
    const onClearFilters = jest.fn(() => order.push('onClearFilters'));

    createClearFiltersHandler(setters, applyFilters, onClearFilters)();

    expect(order).toEqual([
      'setSearch',
      'setPosition',
      'setTeam',
      'setMinHR',
      'setMinAVG',
      'setMaxERA',
      'applyFilters',
      'onClearFilters',
    ]);
  });

  it('still commits when no onClearFilters integrator callback is provided', () => {
    const { setters, calls } = makeSetters();
    const applyFilters = jest.fn();

    createClearFiltersHandler(setters, applyFilters)();

    expect(calls.setSearch).toEqual(['']);
    expect(calls.setMaxERA).toEqual([ERA_MAX_OFF]);
    expect(applyFilters).toHaveBeenCalledTimes(1);
  });

  it('rebinds the handler on each invocation so setter identity changes are honored', () => {
    const applyFilters = jest.fn();

    const first = makeSetters();
    createClearFiltersHandler(first.setters, applyFilters)();
    expect(first.calls.setSearch).toEqual(['']);

    const second = makeSetters();
    createClearFiltersHandler(second.setters, applyFilters)();
    expect(second.calls.setSearch).toEqual(['']);
    // The first setters must NOT be called by the second handler.
    expect(first.calls.setSearch).toEqual(['']);

    expect(applyFilters).toHaveBeenCalledTimes(2);
  });
});

// stepValue powers the native −/+ range stepper (LS-7806). It must snap to the
// step grid, clamp to range, and stay free of floating-point drift on
// fractional steps so the committed filter values match the web slider exactly.
describe('stepValue (LS-7806)', () => {
  it('increments by a whole step within range', () => {
    expect(stepValue(10, 1, 0, 75, 1)).toBe(11);
  });

  it('decrements by a whole step within range', () => {
    expect(stepValue(10, -1, 0, 75, 1)).toBe(9);
  });

  it('clamps to the maximum', () => {
    expect(stepValue(75, 1, 0, 75, 1)).toBe(75);
  });

  it('clamps to the minimum', () => {
    expect(stepValue(0, -1, 0, 75, 1)).toBe(0);
  });

  it('snaps fractional batting-average steps without floating drift', () => {
    // 0.005 increments are the classic float-drift case (0.1 + 0.2 !== 0.3).
    expect(stepValue(0.295, 0.005, 0, 0.43, 0.005)).toBe(0.3);
    expect(stepValue(0.3, -0.005, 0, 0.43, 0.005)).toBe(0.295);
  });

  it('snaps ERA steps and clamps to the off-sentinel maximum', () => {
    expect(stepValue(4.95, 0.05, 0.5, 5, 0.05)).toBe(5);
    expect(stepValue(0.5, -0.05, 0.5, 5, 0.05)).toBe(0.5);
  });

  // LS-7135: the Min HR slider spans the career home-run domain (0–800, step 5)
  // so users can dial in thresholds like "500+" or "700+" career HR from the UI.
  it('steps the HR slider by 5 within the career range', () => {
    expect(stepValue(695, 5, 0, 800, 5)).toBe(700);
    expect(stepValue(700, -5, 0, 800, 5)).toBe(695);
  });

  it('clamps the HR slider to the career maximum', () => {
    expect(stepValue(800, 5, 0, 800, 5)).toBe(800);
    expect(stepValue(0, -5, 0, 800, 5)).toBe(0);
  });

  it('snaps an off-grid HR value (e.g. a hand-typed URL of 762) onto the step grid', () => {
    expect(stepValue(762, 5, 0, 800, 5)).toBe(765);
    expect(stepValue(762, -5, 0, 800, 5)).toBe(755);
  });
});

// enforceSearchMinLength gates the committed search term so the documented
// "min 2 chars" placeholder is actually enforced — a single character must not
// fire the GraphQL query on submit (PST-061 / LS-7127).
describe('enforceSearchMinLength (LS-7127)', () => {
  it('drops a single-character search so it is treated as no search', () => {
    expect(enforceSearchMinLength('a')).toBe('');
  });

  it('drops an empty search', () => {
    expect(enforceSearchMinLength('')).toBe('');
  });

  it('drops a single character padded with whitespace (trim-aware)', () => {
    expect(enforceSearchMinLength('  a  ')).toBe('');
  });

  it('keeps a search that meets the two-character minimum', () => {
    expect(enforceSearchMinLength('ab')).toBe('ab');
  });

  it('keeps a longer search term unchanged', () => {
    expect(enforceSearchMinLength('trout')).toBe('trout');
  });

  it('preserves surrounding whitespace once the trimmed term meets the minimum', () => {
    // Only the length gate is applied here; the term itself is committed as-is so
    // existing query-build behavior (which coalesces empty strings) is unchanged.
    expect(enforceSearchMinLength('  ab  ')).toBe('  ab  ');
  });
});

// The Hitters tab must exclude pitchers from the batting grid (LS-7145). The
// view-mode→playerType mapping drives the batting query filter; only 'hitters'
// constrains it, so Combined keeps every batter and Pitchers relies on the
// separate pitcher-only grid.
describe('battingPlayerTypeForViewMode (LS-7145)', () => {
  it("returns 'hitter' for the Hitters tab so pitchers are filtered out", () => {
    expect(battingPlayerTypeForViewMode('hitters')).toBe('hitter');
  });

  it('returns undefined for Combined so the batting grid shows everyone', () => {
    expect(battingPlayerTypeForViewMode('combined')).toBeUndefined();
  });

  it('returns undefined for Pitchers (the batting grid is hidden there)', () => {
    expect(battingPlayerTypeForViewMode('pitchers')).toBeUndefined();
  });
});

// parseSliderValue guards the StatSlider onChange boundary (LS-7137 / PST-083).
// A corrupted range-input value (e.g. cleared via devtools) must never push NaN
// into filter state where it would propagate toward GraphQL. The guard returns
// null for any non-finite parse so callers ignore the change and keep the prior
// valid value.
describe('parseSliderValue (LS-7137)', () => {
  it('parses well-formed numeric strings', () => {
    expect(parseSliderValue('0')).toBe(0);
    expect(parseSliderValue('42')).toBe(42);
    expect(parseSliderValue('0.295')).toBe(0.295);
    expect(parseSliderValue('-3')).toBe(-3);
  });

  it('rejects NaN-producing input by returning null', () => {
    expect(parseSliderValue('not-a-number')).toBeNull();
    expect(parseSliderValue('abc')).toBeNull();
  });

  it('rejects ±Infinity by returning null', () => {
    expect(parseSliderValue('Infinity')).toBeNull();
    expect(parseSliderValue('-Infinity')).toBeNull();
  });
});

// buildShareUrl powers the header "Share" button (LS-7131 / PST-071). It must
// serialize the *applied* filter snapshot — what the grid is actually showing —
// so a shared link can never diverge from what the sender sees on screen. The
// previous implementation read the uncommitted toolbar draft, leaking
// typed-but-not-entered edits into the recipient's view.
describe('buildShareUrl (LS-7131)', () => {
  const APPLIED_DEFAULTS = {
    search: '',
    position: 'All Positions',
    team: 'All Teams',
    pageSize: 25,
    minHR: 0,
    minAVG: 0,
    maxERA: 5, // ERA_MAX_OFF — no upper bound applied
  };

  it('serializes only view + pageSize when no filters are applied', () => {
    expect(buildShareUrl('combined', APPLIED_DEFAULTS)).toBe(
      '/players/stats?view=combined&pageSize=25',
    );
  });

  it('regression: shares the applied snapshot, never the draft (PST-071)', () => {
    // Scenario from the ticket: the user previously applied an empty search
    // (grid shows everyone), then types "Ohtani" without pressing Enter. The
    // applied snapshot — what buildShareUrl receives — still has search="", so
    // the shared URL must NOT include the un-committed "Ohtani" term.
    const applied = { ...APPLIED_DEFAULTS, search: '' };
    expect(buildShareUrl('combined', applied)).toBe(
      '/players/stats?view=combined&pageSize=25',
    );
    expect(buildShareUrl('combined', applied)).not.toContain('Ohtani');
  });

  it('serializes a committed search term', () => {
    const applied = { ...APPLIED_DEFAULTS, search: 'Ohtani' };
    expect(buildShareUrl('hitters', applied)).toBe(
      '/players/stats?view=hitters&pageSize=25&search=Ohtani',
    );
  });

  it('omits position/team sentinels and serializes real selections', () => {
    const applied = { ...APPLIED_DEFAULTS, position: 'SP', team: 'NYY' };
    const url = buildShareUrl('pitchers', applied);
    expect(url).toContain('position=SP');
    expect(url).toContain('team=NYY');
  });

  it('serializes advanced ranges with their display precision', () => {
    const applied = {
      ...APPLIED_DEFAULTS,
      minHR: 500,
      minAVG: 0.3,
      maxERA: 3.25,
    };
    const url = buildShareUrl('combined', applied);
    expect(url).toContain('minHomeRuns=500');
    expect(url).toContain('minBattingAvg=0.300');
    expect(url).toContain('maxERA=3.25');
  });

  it('omits maxERA when it sits at the off-sentinel', () => {
    const applied = { ...APPLIED_DEFAULTS, maxERA: 5 };
    expect(buildShareUrl('combined', applied)).not.toContain('maxERA');
  });
});
