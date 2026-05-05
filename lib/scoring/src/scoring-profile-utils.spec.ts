import {
  collectProfileStats,
  createInitialErrors,
  createInitialValues,
  formatMultiplier,
  isStatDirty,
  isStatOverridden,
  parseInput,
  type ProfileStat,
  validateStat,
  valuesToUpdates,
} from './scoring-profile-utils';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeStat(overrides: Partial<ProfileStat> = {}): ProfileStat {
  return {
    id: 1,
    group: 'batting',
    displayName: 'Home Runs',
    description: null,
    multiplier: 4,
    defaultMultiplier: 4,
    enforcePositive: false,
    enforceNegative: false,
    minMultiplier: null,
    maxMultiplier: null,
    ...overrides,
  };
}

// ── parseInput ────────────────────────────────────────────────────────────────

describe('parseInput', () => {
  it('returns null for empty string', () => {
    expect(parseInput('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseInput('   ')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseInput(undefined)).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parseInput('abc')).toBeNull();
  });

  it('returns null for Infinity string', () => {
    expect(parseInput('Infinity')).toBeNull();
  });

  it('parses integer strings', () => {
    expect(parseInput('4')).toBe(4);
  });

  it('parses decimal strings', () => {
    expect(parseInput('1.5')).toBe(1.5);
  });

  it('parses negative strings', () => {
    expect(parseInput('-2')).toBe(-2);
  });

  it('trims leading/trailing whitespace before parsing', () => {
    expect(parseInput('  3.5  ')).toBe(3.5);
  });
});

// ── validateStat ──────────────────────────────────────────────────────────────

describe('validateStat', () => {
  it('returns error for empty string — blank field must not be silently saved', () => {
    const stat = makeStat();
    expect(validateStat(stat, '')).toBe('Enter a number to apply an override');
  });

  it('returns error for undefined value', () => {
    const stat = makeStat();
    expect(validateStat(stat, undefined)).toBe(
      'Enter a number to apply an override',
    );
  });

  it('returns null for a valid positive value', () => {
    const stat = makeStat();
    expect(validateStat(stat, '5')).toBeNull();
  });

  it('returns error when enforcePositive and value is zero', () => {
    const stat = makeStat({ enforcePositive: true });
    expect(validateStat(stat, '0')).toBe('Value must be greater than zero');
  });

  it('returns error when enforcePositive and value is negative', () => {
    const stat = makeStat({ enforcePositive: true });
    expect(validateStat(stat, '-1')).toBe('Value must be greater than zero');
  });

  it('returns null when enforcePositive and value is positive', () => {
    const stat = makeStat({ enforcePositive: true });
    expect(validateStat(stat, '0.1')).toBeNull();
  });

  it('returns error when enforceNegative and value is zero', () => {
    const stat = makeStat({ enforceNegative: true });
    expect(validateStat(stat, '0')).toBe('Value must be less than zero');
  });

  it('returns error when enforceNegative and value is positive', () => {
    const stat = makeStat({ enforceNegative: true });
    expect(validateStat(stat, '1')).toBe('Value must be less than zero');
  });

  it('returns null when enforceNegative and value is negative', () => {
    const stat = makeStat({ enforceNegative: true });
    expect(validateStat(stat, '-1')).toBeNull();
  });

  it('returns error when value is below minMultiplier', () => {
    const stat = makeStat({ minMultiplier: 1 });
    expect(validateStat(stat, '0.5')).toBe('Must be >= 1');
  });

  it('does not enforce min when defaultMultiplier itself is below min', () => {
    const stat = makeStat({ defaultMultiplier: 0.5, minMultiplier: 1 });
    expect(validateStat(stat, '0.5')).toBeNull();
  });

  it('returns error when value is above maxMultiplier', () => {
    const stat = makeStat({ maxMultiplier: 10 });
    expect(validateStat(stat, '11')).toBe('Must be <= 10');
  });

  it('does not enforce max when defaultMultiplier itself is above max', () => {
    const stat = makeStat({ defaultMultiplier: 15, maxMultiplier: 10 });
    expect(validateStat(stat, '15')).toBeNull();
  });
});

// ── valuesToUpdates ───────────────────────────────────────────────────────────

describe('valuesToUpdates', () => {
  it('silently excludes stats whose form value is blank', () => {
    // This documents the behavior that makes the pre-save validation guard in
    // handleSave necessary: blank fields are dropped without any error signal.
    const stat = makeStat({ id: 1, multiplier: 4 });
    const result = valuesToUpdates([stat], { 1: '' });
    expect(result).toHaveLength(0);
  });

  it('excludes stats whose value is unchanged', () => {
    const stat = makeStat({ id: 1, multiplier: 4 });
    const result = valuesToUpdates([stat], { 1: '4' });
    expect(result).toHaveLength(0);
  });

  it('includes stats whose value differs from the baseline multiplier', () => {
    const stat = makeStat({ id: 1, multiplier: 4 });
    const result = valuesToUpdates([stat], { 1: '5' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ statDefinitionId: 1, multiplier: 5 });
  });

  it('rounds the multiplier to 4 decimal places', () => {
    const stat = makeStat({ id: 1, multiplier: 0 });
    const result = valuesToUpdates([stat], { 1: '1.23456789' });
    expect(result[0]?.multiplier).toBe(1.2346);
  });

  it('handles multiple stats independently', () => {
    const stat1 = makeStat({ id: 1, multiplier: 1 });
    const stat2 = makeStat({ id: 2, multiplier: 4 });
    const result = valuesToUpdates(
      [stat1, stat2],
      { 1: '', 2: '5' }, // stat1 blank (dropped), stat2 dirty (included)
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.statDefinitionId).toBe(2);
  });
});

// ── formatMultiplier ──────────────────────────────────────────────────────────

describe('formatMultiplier', () => {
  it('returns empty string for non-finite values (NaN, Infinity)', () => {
    expect(formatMultiplier(NaN)).toBe('');
    expect(formatMultiplier(Infinity)).toBe('');
  });

  it('formats integers without decimal places', () => {
    expect(formatMultiplier(4)).toBe('4');
  });

  it('strips trailing zeros from decimals', () => {
    expect(formatMultiplier(1.5)).toBe('1.5');
    expect(formatMultiplier(1.25)).toBe('1.25');
  });
});

// ── createInitialValues ───────────────────────────────────────────────────────

describe('createInitialValues', () => {
  it('initializes each stat to its formatted multiplier', () => {
    const stats = [makeStat({ id: 1, multiplier: 4 })];
    expect(createInitialValues(stats)).toEqual({ 1: '4' });
  });

  it('initializes blank string when multiplier is NaN (server data gap)', () => {
    const stats = [makeStat({ id: 1, multiplier: NaN })];
    const values = createInitialValues(stats);
    // This blank initial value is one source of the silent-drop bug:
    // the field renders empty and validateStat is never called for it
    // until the user touches it or handleSave runs a full validation pass.
    expect(values[1]).toBe('');
  });
});

// ── createInitialErrors ───────────────────────────────────────────────────────

describe('createInitialErrors', () => {
  it('initialises all errors to null (untouched fields have no errors)', () => {
    const stats = [makeStat({ id: 1 }), makeStat({ id: 2 })];
    expect(createInitialErrors(stats)).toEqual({ 1: null, 2: null });
  });
});

// ── collectProfileStats ───────────────────────────────────────────────────────

describe('collectProfileStats', () => {
  it('returns empty array for null profile', () => {
    expect(collectProfileStats(null)).toEqual([]);
  });

  it('skips raw entries missing a definition', () => {
    expect(collectProfileStats({ stats: [null] })).toEqual([]);
  });

  it('skips definitions missing id or statGroup', () => {
    const profile = {
      stats: [
        { multiplier: 1, definition: { id: null, statGroup: 'batting' } },
      ],
    };
    expect(collectProfileStats(profile)).toEqual([]);
  });

  it('normalises a valid raw stat', () => {
    const profile = {
      stats: [
        {
          multiplier: 5,
          defaultMultiplier: 4,
          definition: {
            id: 1,
            statGroup: 'batting',
            displayName: 'HR',
            description: 'Home runs',
            defaultMultiplier: 4,
            enforcePositive: true,
            enforceNegative: false,
            minMultiplier: null,
            maxMultiplier: null,
          },
        },
      ],
    };
    const [stat] = collectProfileStats(profile);
    expect(stat).toMatchObject({
      id: 1,
      group: 'batting',
      displayName: 'HR',
      multiplier: 5,
      defaultMultiplier: 4,
      enforcePositive: true,
    });
  });
});

// ── isStatOverridden / isStatDirty ────────────────────────────────────────────

describe('isStatOverridden', () => {
  it('returns false when multiplier equals default', () => {
    expect(
      isStatOverridden(makeStat({ multiplier: 4, defaultMultiplier: 4 })),
    ).toBe(false);
  });

  it('returns true when multiplier differs from default', () => {
    expect(
      isStatOverridden(makeStat({ multiplier: 5, defaultMultiplier: 4 })),
    ).toBe(true);
  });
});

describe('isStatDirty', () => {
  it('returns false for blank form value', () => {
    // Blank fields are treated as not dirty — they cannot be compared against
    // the stat multiplier because parseInput returns null for empty strings.
    expect(isStatDirty(makeStat({ multiplier: 4 }), '')).toBe(false);
  });

  it('returns false when form value matches the stat multiplier', () => {
    expect(isStatDirty(makeStat({ multiplier: 4 }), '4')).toBe(false);
  });

  it('returns true when form value differs from the stat multiplier', () => {
    expect(isStatDirty(makeStat({ multiplier: 4 }), '5')).toBe(true);
  });
});
