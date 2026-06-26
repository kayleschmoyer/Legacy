import {
  type AppliedFilters,
  battingPlayerTypeForViewMode,
  battingSortFilter,
  buildShareUrl,
  clampPageSizeForViewMode,
  type ClearFiltersSetters,
  createClearFiltersHandler,
  createDebouncedCommit,
  DEFAULT_BATTING_SORT_BY,
  DEFAULT_BATTING_SORT_DIR,
  enforceSearchMinLength,
  hasPendingFilterChanges,
  pageSizeOptionsForViewMode,
  parseSliderValue,
  SLIDER_COMMIT_DEBOUNCE_MS,
  sliderFillPct,
  stepValue,
} from './PlayerStatsPage';

// Unit tests for the EmptyCard "Clear all filters" reset path introduced in
// LS-4613. The handler is extracted to a pure factory so the reset semantics
// can be verified without mounting the full Tamagui shell.

const ERA_MAX_OFF = 5;
const HR_MAX = 800;
const RBI_MAX = 2500;
const AVG_MAX = 0.43;
const WINS_MAX = 550;
const SO_MAX = 6000;

function makeSetters(): {
  setters: ClearFiltersSetters;
  calls: Record<keyof ClearFiltersSetters, unknown[]>;
} {
  const calls: Record<keyof ClearFiltersSetters, unknown[]> = {
    setSearch: [],
    setPosition: [],
    setTeam: [],
    setMinHR: [],
    setMaxHR: [],
    setMinRBI: [],
    setMaxRBI: [],
    setMinAVG: [],
    setMaxAVG: [],
    setMinERA: [],
    setMaxERA: [],
    setMinWins: [],
    setMaxWins: [],
    setMinSO: [],
    setMaxSO: [],
  };
  const setters: ClearFiltersSetters = {
    setSearch: (v) => calls.setSearch.push(v),
    setPosition: (v) => calls.setPosition.push(v),
    setTeam: (v) => calls.setTeam.push(v),
    setMinHR: (v) => calls.setMinHR.push(v),
    setMaxHR: (v) => calls.setMaxHR.push(v),
    setMinRBI: (v) => calls.setMinRBI.push(v),
    setMaxRBI: (v) => calls.setMaxRBI.push(v),
    setMinAVG: (v) => calls.setMinAVG.push(v),
    setMaxAVG: (v) => calls.setMaxAVG.push(v),
    setMinERA: (v) => calls.setMinERA.push(v),
    setMaxERA: (v) => calls.setMaxERA.push(v),
    setMinWins: (v) => calls.setMinWins.push(v),
    setMaxWins: (v) => calls.setMaxWins.push(v),
    setMinSO: (v) => calls.setMinSO.push(v),
    setMaxSO: (v) => calls.setMaxSO.push(v),
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
    expect(calls.setMaxHR).toEqual([HR_MAX]);
    expect(calls.setMinRBI).toEqual([0]);
    expect(calls.setMaxRBI).toEqual([RBI_MAX]);
    expect(calls.setMinAVG).toEqual([0]);
    expect(calls.setMaxAVG).toEqual([AVG_MAX]);
    expect(calls.setMinERA).toEqual([0]);
    expect(calls.setMaxERA).toEqual([ERA_MAX_OFF]);
    expect(calls.setMinWins).toEqual([0]);
    expect(calls.setMaxWins).toEqual([WINS_MAX]);
    expect(calls.setMinSO).toEqual([0]);
    expect(calls.setMaxSO).toEqual([SO_MAX]);
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
      setMaxHR: () => order.push('setMaxHR'),
      setMinRBI: () => order.push('setMinRBI'),
      setMaxRBI: () => order.push('setMaxRBI'),
      setMinAVG: () => order.push('setMinAVG'),
      setMaxAVG: () => order.push('setMaxAVG'),
      setMinERA: () => order.push('setMinERA'),
      setMaxERA: () => order.push('setMaxERA'),
      setMinWins: () => order.push('setMinWins'),
      setMaxWins: () => order.push('setMaxWins'),
      setMinSO: () => order.push('setMinSO'),
      setMaxSO: () => order.push('setMaxSO'),
    };
    const applyFilters = jest.fn(() => order.push('applyFilters'));
    const onClearFilters = jest.fn(() => order.push('onClearFilters'));

    createClearFiltersHandler(setters, applyFilters, onClearFilters)();

    expect(order).toEqual([
      'setSearch',
      'setPosition',
      'setTeam',
      'setMinHR',
      'setMaxHR',
      'setMinRBI',
      'setMaxRBI',
      'setMinAVG',
      'setMaxAVG',
      'setMinERA',
      'setMaxERA',
      'setMinWins',
      'setMaxWins',
      'setMinSO',
      'setMaxSO',
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

// Sliders auto-apply on commit, and onKeyUp fires once per arrow-key press, so
// holding an arrow used to fire applyFilters (grid remount + GraphQL refetch)
// per keystroke (LS-7128 / PST-062). createDebouncedCommit coalesces the
// keyboard burst into a single commit; flush/cancel cover the terminal-event
// (blur / mouse release) paths.
describe('createDebouncedCommit (LS-7128)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('coalesces a burst of triggers (held arrow key) into a single commit', () => {
    const commit = jest.fn();
    const { trigger } = createDebouncedCommit(commit, 250);

    // 10 rapid onKeyUp events, each well within the debounce window. Before the
    // fix this path committed once per keystroke; now nothing fires mid-burst.
    for (let i = 0; i < 10; i++) {
      trigger();
      jest.advanceTimersByTime(20);
    }
    expect(commit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('commits once the delay elapses with no further triggers', () => {
    const commit = jest.fn();
    const { trigger } = createDebouncedCommit(commit, 250);

    trigger();
    jest.advanceTimersByTime(249);
    expect(commit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('flush fires a pending commit immediately and cancels the scheduled one', () => {
    const commit = jest.fn();
    const { trigger, flush } = createDebouncedCommit(commit, 250);

    trigger();
    flush();
    expect(commit).toHaveBeenCalledTimes(1);

    // The originally scheduled timer must not fire a second commit.
    jest.advanceTimersByTime(250);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('flush is a no-op when no commit is pending', () => {
    const commit = jest.fn();
    const { flush } = createDebouncedCommit(commit, 250);

    flush();
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel drops a pending commit without firing it', () => {
    const commit = jest.fn();
    const { trigger, cancel } = createDebouncedCommit(commit, 250);

    trigger();
    cancel();
    jest.advanceTimersByTime(250);
    expect(commit).not.toHaveBeenCalled();
  });

  it('defaults to the 250ms slider debounce window', () => {
    expect(SLIDER_COMMIT_DEBOUNCE_MS).toBe(250);

    const commit = jest.fn();
    const { trigger } = createDebouncedCommit(commit);

    trigger();
    jest.advanceTimersByTime(SLIDER_COMMIT_DEBOUNCE_MS - 1);
    expect(commit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

// The Hitters tab must exclude pitchers from the batting grid (LS-7145). The
// view-mode→playerType mapping drives the batting query filter; only 'hitters'
// constrains it, so Combined keeps every batter and Pitchers relies on the
// separate pitcher-only grid.
// hasPendingFilterChanges drives the toolbar's Apply button (LS-7126). LS-7126
// unified every toolbar control on a single draft model: nothing applies on
// change anymore — Position/Team/Rows used to bypass the draft/applied split and
// apply instantly while search/sliders stayed in draft. The Apply button is the
// explicit commit, enabled only when the draft snapshot diverges from the
// applied snapshot.
describe('hasPendingFilterChanges (LS-7126)', () => {
  const base: AppliedFilters = {
    search: '',
    position: 'All Positions',
    team: 'All Teams',
    pageSize: 25,
    minHR: 0,
    maxHR: HR_MAX,
    minRBI: 0,
    maxRBI: RBI_MAX,
    minAVG: 0,
    maxAVG: AVG_MAX,
    minERA: 0,
    maxERA: ERA_MAX_OFF,
    minWins: 0,
    maxWins: WINS_MAX,
    minSO: 0,
    maxSO: SO_MAX,
  };

  it('returns false when the draft equals the applied snapshot', () => {
    expect(hasPendingFilterChanges(base, { ...base })).toBe(false);
  });

  it('detects a pending search edit (the bug: typed name left unapplied)', () => {
    expect(hasPendingFilterChanges({ ...base, search: 'ruth' }, base)).toBe(
      true,
    );
  });

  it('detects a pending position change (now drafted, not instant)', () => {
    expect(hasPendingFilterChanges({ ...base, position: 'SP' }, base)).toBe(
      true,
    );
  });

  it('detects a pending team change (now drafted, not instant)', () => {
    expect(hasPendingFilterChanges({ ...base, team: 'NYY' }, base)).toBe(true);
  });

  it('detects a pending rows-per-page change (now drafted, not instant)', () => {
    expect(hasPendingFilterChanges({ ...base, pageSize: 50 }, base)).toBe(true);
  });

  it('detects pending advanced slider edits (all stat range fields)', () => {
    expect(hasPendingFilterChanges({ ...base, minHR: 500 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxHR: 400 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minRBI: 100 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxRBI: 1000 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minAVG: 0.3 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxAVG: 0.3 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minERA: 1.5 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxERA: 3 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minWins: 100 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxWins: 300 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minSO: 1000 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxSO: 3000 }, base)).toBe(true);
  });

  it('detects pending new range slider edits (LS-5598)', () => {
    expect(hasPendingFilterChanges({ ...base, maxHR: 600 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minRBI: 500 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxRBI: 1000 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxAVG: 0.35 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minERA: 1.5 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minWins: 100 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxWins: 300 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, minSO: 1000 }, base)).toBe(true);
    expect(hasPendingFilterChanges({ ...base, maxSO: 4000 }, base)).toBe(true);
  });

  it('returns true when several controls have pending edits at once', () => {
    expect(
      hasPendingFilterChanges(
        { ...base, search: 'judge', position: 'OF', pageSize: 100 },
        base,
      ),
    ).toBe(true);
  });
});

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
  const APPLIED_DEFAULTS: AppliedFilters = {
    search: '',
    position: 'All Positions',
    team: 'All Teams',
    pageSize: 25,
    minHR: 0,
    maxHR: HR_MAX,
    minRBI: 0,
    maxRBI: RBI_MAX,
    minAVG: 0,
    maxAVG: AVG_MAX,
    minERA: 0,
    maxERA: ERA_MAX_OFF,
    minWins: 0,
    maxWins: WINS_MAX,
    minSO: 0,
    maxSO: SO_MAX,
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
    const applied = { ...APPLIED_DEFAULTS, maxERA: ERA_MAX_OFF };
    expect(buildShareUrl('combined', applied)).not.toContain('maxERA');
  });

  it('serializes new range params when active (LS-5598)', () => {
    const applied = {
      ...APPLIED_DEFAULTS,
      maxHR: 600,
      minRBI: 500,
      maxRBI: 2000,
      maxAVG: 0.35,
      minERA: 1.5,
      minWins: 100,
      maxWins: 400,
      minSO: 1000,
      maxSO: 5000,
    };
    const url = buildShareUrl('combined', applied);
    expect(url).toContain('maxHomeRuns=600');
    expect(url).toContain('minRBI=500');
    expect(url).toContain('maxRBI=2000');
    expect(url).toContain('maxBattingAvg=0.350');
    expect(url).toContain('minERA=1.50');
    expect(url).toContain('minWins=100');
    expect(url).toContain('maxWins=400');
    expect(url).toContain('minStrikeouts=1000');
    expect(url).toContain('maxStrikeouts=5000');
  });

  it('omits new range params when at their off-sentinels (LS-5598)', () => {
    const url = buildShareUrl('combined', APPLIED_DEFAULTS);
    expect(url).not.toContain('maxHomeRuns');
    expect(url).not.toContain('minRBI');
    expect(url).not.toContain('maxRBI');
    expect(url).not.toContain('maxBattingAvg');
    expect(url).not.toContain('minERA');
    expect(url).not.toContain('minWins');
    expect(url).not.toContain('maxWins');
    expect(url).not.toContain('minStrikeouts');
    expect(url).not.toContain('maxStrikeouts');
  });
});

// PST-030 / LS-7117: 'combined' view renders both the batting and pitching grids
// at once with no virtualization, so a pageSize of 100 paints 200 rows in one
// layout. The 100-row option is withheld in combined view and any carried-over or
// deep-linked pageSize=100 is clamped to 50; single-grid modes keep the full set.
describe('pageSizeOptionsForViewMode (LS-7117)', () => {
  it('withholds the 100-row option in combined view', () => {
    expect(pageSizeOptionsForViewMode('combined')).toEqual([10, 25, 50]);
  });

  it('keeps the full option set for the single-grid Hitters view', () => {
    expect(pageSizeOptionsForViewMode('hitters')).toEqual([10, 25, 50, 100]);
  });

  it('keeps the full option set for the single-grid Pitchers view', () => {
    expect(pageSizeOptionsForViewMode('pitchers')).toEqual([10, 25, 50, 100]);
  });

  it('returns a fresh array so callers cannot mutate the shared option list', () => {
    const first = pageSizeOptionsForViewMode('hitters');
    first.push(250);
    expect(pageSizeOptionsForViewMode('hitters')).toEqual([10, 25, 50, 100]);
  });

  // PST-032 / LS-7119: premium users see 250/500 in single-grid modes
  it('adds 250/500 for premium in single-grid Hitters view', () => {
    expect(pageSizeOptionsForViewMode('hitters', true)).toEqual([
      10, 25, 50, 100, 250, 500,
    ]);
  });

  it('adds 250/500 for premium in single-grid Pitchers view', () => {
    expect(pageSizeOptionsForViewMode('pitchers', true)).toEqual([
      10, 25, 50, 100, 250, 500,
    ]);
  });

  it('withholds 250/500 even for premium in combined view', () => {
    expect(pageSizeOptionsForViewMode('combined', true)).toEqual([10, 25, 50]);
  });
});

describe('clampPageSizeForViewMode (LS-7117)', () => {
  it('clamps a pageSize above the cap down to 50 in combined view', () => {
    expect(clampPageSizeForViewMode(100, 'combined')).toBe(50);
  });

  it('leaves pageSizes at or below the cap unchanged in combined view', () => {
    expect(clampPageSizeForViewMode(50, 'combined')).toBe(50);
    expect(clampPageSizeForViewMode(25, 'combined')).toBe(25);
    expect(clampPageSizeForViewMode(10, 'combined')).toBe(10);
  });

  it('passes 100 through unchanged for the single-grid views', () => {
    expect(clampPageSizeForViewMode(100, 'hitters')).toBe(100);
    expect(clampPageSizeForViewMode(100, 'pitchers')).toBe(100);
  });
});

// battingSortFilter decides whether the batting sort is persisted to the URL
// (LS-7115 / PST-022). Default sort is omitted so default links stay clean; any
// other sort is included so a shared link restores the user's chosen sort.
describe('battingSortFilter (LS-7115)', () => {
  it('omits the sort when it matches the default (clean default URLs)', () => {
    expect(
      battingSortFilter(DEFAULT_BATTING_SORT_BY, DEFAULT_BATTING_SORT_DIR),
    ).toEqual({});
  });

  it('includes a non-default sort field', () => {
    expect(battingSortFilter('battingAverage', 'desc')).toEqual({
      sortBy: 'battingAverage',
      sortDir: 'desc',
    });
  });

  it('includes the default field when the direction is non-default', () => {
    // homeRuns asc differs from the homeRuns/desc default, so it must persist.
    expect(battingSortFilter('homeRuns', 'asc')).toEqual({
      sortBy: 'homeRuns',
      sortDir: 'asc',
    });
  });
});

// sliderFillPct drives the slider fill width / `--pct` CSS variable for both the
// web range input (StatSlider) and the native −/+ stepper track (NativeRangeStepper).
// It must never emit NaN/Infinity, which render as the invalid CSS length 'NaN%'
// (silently dropped by Chrome, treated as 0% by Firefox) — see PST-080 (LS-7134).
describe('sliderFillPct (LS-7134)', () => {
  it('computes the fill percentage for a value within range', () => {
    expect(sliderFillPct(5, 0, 10)).toBe(50);
    expect(sliderFillPct(0, 0, 75)).toBe(0);
    expect(sliderFillPct(75, 0, 75)).toBe(100);
  });

  it('returns 0 instead of NaN when max === min (degenerate range)', () => {
    expect(sliderFillPct(5, 5, 5)).toBe(0);
    expect(Number.isNaN(sliderFillPct(5, 5, 5))).toBe(false);
  });

  it('returns 0 instead of Infinity when value is outside a zero-width range', () => {
    // (value - min) is non-zero while (max - min) is zero → naive division is Infinity.
    const result = sliderFillPct(10, 5, 5);
    expect(result).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('returns 0 when max < min (inverted range)', () => {
    expect(sliderFillPct(5, 10, 2)).toBe(0);
  });

  it('clamps the result to the [0, 100] range', () => {
    expect(sliderFillPct(-5, 0, 10)).toBe(0);
    expect(sliderFillPct(20, 0, 10)).toBe(100);
  });
});
