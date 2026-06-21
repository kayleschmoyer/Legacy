import {
  buildToggleableColumns,
  type ColumnGroup,
  isPresetVisible,
  NO_COLUMNS_SENTINEL,
  parseVisibleColumns,
  presetVisibleKeys,
  resolveVisibleColumns,
  serializeVisibleColumns,
  toggleColumnKey,
} from './columnVisibility';

// Minimal column fixtures — `key`/`label`/`priority` are all the helpers need.
const battingCols = [
  { key: 'displayName', label: 'Player', priority: 'high' as const },
  { key: 'games', label: 'G', priority: 'medium' as const },
  { key: 'homeRuns', label: 'HR', priority: 'high' as const },
  { key: 'strikeouts', label: 'SO', priority: 'low' as const },
];

const pitchingCols = [
  { key: 'playerName', label: 'Player', priority: 'high' as const },
  { key: 'era', label: 'ERA', priority: 'high' as const },
  { key: 'strikeouts', label: 'K', priority: 'high' as const },
  { key: 'completeGames', label: 'CG', priority: 'low' as const },
];

const groups: ColumnGroup<{
  key: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}>[] = [
  { columns: battingCols, nameKey: 'displayName' },
  { columns: pitchingCols, nameKey: 'playerName' },
];

describe('isPresetVisible', () => {
  it('shows only high-priority columns under the standard preset', () => {
    expect(isPresetVisible('high', 'standard')).toBe(true);
    expect(isPresetVisible('medium', 'standard')).toBe(false);
    expect(isPresetVisible('low', 'standard')).toBe(false);
  });

  it('shows every column under the expanded preset', () => {
    expect(isPresetVisible('high', 'expanded')).toBe(true);
    expect(isPresetVisible('medium', 'expanded')).toBe(true);
    expect(isPresetVisible('low', 'expanded')).toBe(true);
  });
});

describe('resolveVisibleColumns', () => {
  it('falls back to the standard preset (high only) when no selection is given', () => {
    const out = resolveVisibleColumns(
      battingCols,
      'standard',
      undefined,
      'displayName',
    );
    expect(out.map((c) => c.key)).toEqual(['displayName', 'homeRuns']);
  });

  it('falls back to all columns under the expanded preset', () => {
    const out = resolveVisibleColumns(
      battingCols,
      'expanded',
      undefined,
      'displayName',
    );
    expect(out.map((c) => c.key)).toEqual([
      'displayName',
      'games',
      'homeRuns',
      'strikeouts',
    ]);
  });

  it('honors an explicit selection and overrides the preset', () => {
    const out = resolveVisibleColumns(
      battingCols,
      'standard',
      ['games'],
      'displayName',
    );
    // Name column is always kept; games is shown despite being medium-priority.
    expect(out.map((c) => c.key)).toEqual(['displayName', 'games']);
  });

  it('always keeps the name column even when the selection omits it', () => {
    const out = resolveVisibleColumns(
      battingCols,
      'expanded',
      [],
      'displayName',
    );
    expect(out.map((c) => c.key)).toEqual(['displayName']);
  });

  it('ignores selected keys that are not real columns of this grid', () => {
    const out = resolveVisibleColumns(
      battingCols,
      'standard',
      ['era', 'homeRuns'],
      'displayName',
    );
    // `era` belongs to pitching, not batting — silently ignored here.
    expect(out.map((c) => c.key)).toEqual(['displayName', 'homeRuns']);
  });
});

describe('buildToggleableColumns', () => {
  it('excludes name columns and de-duplicates shared keys (first label wins)', () => {
    const out = buildToggleableColumns(groups);
    expect(out).toEqual([
      { key: 'games', label: 'G' },
      { key: 'homeRuns', label: 'HR' },
      // `strikeouts` appears in both grids; the batting label ('SO') wins.
      { key: 'strikeouts', label: 'SO' },
      { key: 'era', label: 'ERA' },
      { key: 'completeGames', label: 'CG' },
    ]);
  });
});

describe('presetVisibleKeys', () => {
  it('returns high-priority keys across both grids under standard (any-grid)', () => {
    // Iterated batting-first, then pitching; strikeouts is low in batting but
    // high in pitching, so it is contributed once by the pitching group.
    expect(presetVisibleKeys(groups, 'standard')).toEqual([
      'homeRuns',
      'era',
      'strikeouts',
    ]);
  });

  it('returns every non-name key under expanded, de-duplicated', () => {
    expect(presetVisibleKeys(groups, 'expanded')).toEqual([
      'games',
      'homeRuns',
      'strikeouts',
      'era',
      'completeGames',
    ]);
  });
});

describe('toggleColumnKey', () => {
  const preset = ['homeRuns', 'strikeouts', 'era'];

  it('materializes from the preset and removes a visible key on first toggle', () => {
    // current === null → seed from preset, then drop the toggled key.
    expect(toggleColumnKey(null, 'homeRuns', preset)).toEqual([
      'strikeouts',
      'era',
    ]);
  });

  it('materializes from the preset and adds a hidden key on first toggle', () => {
    expect(toggleColumnKey(null, 'games', preset)).toEqual([
      'homeRuns',
      'strikeouts',
      'era',
      'games',
    ]);
  });

  it('toggles within an existing explicit selection without touching others', () => {
    expect(toggleColumnKey(['games', 'era'], 'era', preset)).toEqual(['games']);
    expect(toggleColumnKey(['games'], 'homeRuns', preset)).toEqual([
      'games',
      'homeRuns',
    ]);
  });

  it('supports emptying the selection entirely', () => {
    expect(toggleColumnKey(['games'], 'games', preset)).toEqual([]);
  });
});

describe('serializeVisibleColumns / parseVisibleColumns', () => {
  const valid = ['games', 'homeRuns', 'era', 'strikeouts'];

  it('serializes null to null (so the caller omits the key)', () => {
    expect(serializeVisibleColumns(null)).toBeNull();
  });

  it('serializes an explicit empty selection to the sentinel', () => {
    expect(serializeVisibleColumns([])).toBe(NO_COLUMNS_SENTINEL);
  });

  it('serializes a non-empty selection as a comma list', () => {
    expect(serializeVisibleColumns(['games', 'era'])).toBe('games,era');
  });

  it('parses an absent/empty value to null', () => {
    expect(parseVisibleColumns(null, valid)).toBeNull();
    expect(parseVisibleColumns(undefined, valid)).toBeNull();
    expect(parseVisibleColumns('', valid)).toBeNull();
  });

  it('parses the sentinel to an explicit empty selection', () => {
    expect(parseVisibleColumns(NO_COLUMNS_SENTINEL, valid)).toEqual([]);
  });

  it('drops unknown and duplicate keys while preserving order', () => {
    expect(
      parseVisibleColumns('games, bogus ,era,games,homeRuns', valid),
    ).toEqual(['games', 'era', 'homeRuns']);
  });

  it('returns null when every token is invalid', () => {
    expect(parseVisibleColumns('nope,bad', valid)).toBeNull();
  });

  it('round-trips an explicit selection through serialize → parse', () => {
    const cols = ['homeRuns', 'era'];
    const serialized = serializeVisibleColumns(cols);
    expect(serialized).not.toBeNull();
    expect(parseVisibleColumns(serialized, valid)).toEqual(cols);
  });

  it('round-trips the explicit empty selection (sentinel)', () => {
    const serialized = serializeVisibleColumns([]);
    expect(parseVisibleColumns(serialized, valid)).toEqual([]);
  });
});
