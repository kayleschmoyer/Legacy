import {
  assignTierFromValue,
  bucketValue,
  OBFUSCATION_CONFIG,
  orderFactsByDifficulty,
  shuffle,
  TIER_NUMERIC_ORDER,
  TIER_SEQUENCE,
} from './DifficultyOrdering';
import type { OrderableFact } from './DifficultyOrdering';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function makeFact(
  id: number,
  difficultyTier: OrderableFact['difficultyTier'],
  category: OrderableFact['category'] = 'career_stat',
  sortOrder = 0,
): OrderableFact {
  return { id, difficultyTier, category, sortOrder };
}

// ──────────────────────────────────────────────────────────────
// TIER_SEQUENCE
// ──────────────────────────────────────────────────────────────

describe('TIER_SEQUENCE', () => {
  it('contains all three tiers in order: vague → moderate → identifying', () => {
    expect(TIER_SEQUENCE).toEqual(['vague', 'moderate', 'identifying']);
  });

  it('has vague as the first element', () => {
    expect(TIER_SEQUENCE[0]).toBe('vague');
  });

  it('has identifying as the last element', () => {
    expect(TIER_SEQUENCE[TIER_SEQUENCE.length - 1]).toBe('identifying');
  });
});

// ──────────────────────────────────────────────────────────────
// TIER_NUMERIC_ORDER
// ──────────────────────────────────────────────────────────────

describe('TIER_NUMERIC_ORDER', () => {
  it('orders tiers: vague < moderate < identifying', () => {
    expect(TIER_NUMERIC_ORDER.vague).toBeLessThan(TIER_NUMERIC_ORDER.moderate);
    expect(TIER_NUMERIC_ORDER.moderate).toBeLessThan(
      TIER_NUMERIC_ORDER.identifying,
    );
  });
});

// ──────────────────────────────────────────────────────────────
// bucketValue
// ──────────────────────────────────────────────────────────────

describe('bucketValue', () => {
  it('buckets 52.3 into "between 50 and 60" with size 10', () => {
    expect(bucketValue(10, 52.3)).toBe('between 50 and 60');
  });

  it('buckets 523 into "between 500 and 600" with size 100', () => {
    expect(bucketValue(100, 523)).toBe('between 500 and 600');
  });

  it('handles exact bucket boundary (value = lo)', () => {
    expect(bucketValue(10, 50)).toBe('between 50 and 60');
  });

  it('handles value of 0', () => {
    expect(bucketValue(10, 0)).toBe('between 0 and 10');
  });

  it('throws when bucketSize is 0', () => {
    expect(() => bucketValue(0, 42)).toThrow('bucketSize must be positive');
  });

  it('throws when bucketSize is negative', () => {
    expect(() => bucketValue(-5, 42)).toThrow('bucketSize must be positive');
  });

  it('returns string matching "between N and M" pattern', () => {
    const result = bucketValue(25, 75);
    expect(result).toMatch(/^between \d+ and \d+$/);
  });
});

// ──────────────────────────────────────────────────────────────
// assignTierFromValue
// ──────────────────────────────────────────────────────────────

describe('assignTierFromValue', () => {
  describe('career_stat', () => {
    it('assigns identifying for value >= 400', () => {
      expect(assignTierFromValue('career_stat', 400)).toBe('identifying');
      expect(assignTierFromValue('career_stat', 762)).toBe('identifying');
    });

    it('assigns moderate for value >= 200 and < 400', () => {
      expect(assignTierFromValue('career_stat', 200)).toBe('moderate');
      expect(assignTierFromValue('career_stat', 399)).toBe('moderate');
    });

    it('assigns vague for value < 200', () => {
      expect(assignTierFromValue('career_stat', 0)).toBe('vague');
      expect(assignTierFromValue('career_stat', 199)).toBe('vague');
    });
  });

  describe('award', () => {
    it('assigns identifying for 2+ awards', () => {
      expect(assignTierFromValue('award', 2)).toBe('identifying');
      expect(assignTierFromValue('award', 7)).toBe('identifying');
    });

    it('assigns moderate for exactly 1 award', () => {
      expect(assignTierFromValue('award', 1)).toBe('moderate');
    });

    it('assigns vague for 0 awards', () => {
      expect(assignTierFromValue('award', 0)).toBe('vague');
    });
  });

  describe('unknown category', () => {
    it('returns vague when no rule is found', () => {
      // 'transaction' has no OBFUSCATION_CONFIG entry
      expect(assignTierFromValue('transaction', 9999)).toBe('vague');
    });
  });
});

// ──────────────────────────────────────────────────────────────
// OBFUSCATION_CONFIG
// ──────────────────────────────────────────────────────────────

describe('OBFUSCATION_CONFIG', () => {
  const categoriesWithConfig = [
    'career_stat',
    'season_stat',
    'award',
    'achievement',
    'team_history',
  ] as const;

  it.each(categoriesWithConfig)('has a rule for %s', (category) => {
    expect(OBFUSCATION_CONFIG[category]).toBeDefined();
  });

  it.each(categoriesWithConfig)(
    '%s rule ends with a vague tier (null minValue)',
    (category) => {
      const rule = OBFUSCATION_CONFIG[category];
      expect(rule).toBeDefined();
      if (!rule) return;
      const lastTier = rule.tiers[rule.tiers.length - 1];
      expect(lastTier.minValue).toBeNull();
      expect(lastTier.tier).toBe('vague');
    },
  );

  it.each(categoriesWithConfig)(
    '%s rule has tiers in descending minValue order (most specific first)',
    (category) => {
      const rule = OBFUSCATION_CONFIG[category];
      expect(rule).toBeDefined();
      if (!rule) return;
      const nonNullTiers = rule.tiers.filter(
        (t): t is typeof t & { minValue: number } => t.minValue !== null,
      );
      for (let i = 1; i < nonNullTiers.length; i++) {
        expect(nonNullTiers[i - 1].minValue).toBeGreaterThan(
          nonNullTiers[i].minValue,
        );
      }
    },
  );
});

// ──────────────────────────────────────────────────────────────
// shuffle
// ──────────────────────────────────────────────────────────────

describe('shuffle', () => {
  it('returns all original elements (no drops or additions)', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect(result.sort((a, b) => a - b)).toEqual(
      [...input].sort((a, b) => a - b),
    );
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it('returns a new array reference', () => {
    const input = [1, 2, 3];
    const result = shuffle(input);
    expect(result).not.toBe(input);
  });

  it('returns an empty array when given an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it('produces different orderings for different random sequences (deterministic)', () => {
    const input = [1, 2, 3, 4, 5];
    const originalRandom = Math.random;
    try {
      const sequence1 = [0, 0, 0, 0];
      let index1 = 0;
      Math.random = () => {
        const value = sequence1[index1];
        index1 += 1;
        return value ?? 0;
      };
      const first = shuffle(input);
      const sequence2 = [0.9, 0.9, 0.9, 0.9];
      let index2 = 0;
      Math.random = () => {
        const value = sequence2[index2];
        index2 += 1;
        return value ?? 0.9;
      };
      const second = shuffle(input);
      expect(first).not.toEqual(second);
    } finally {
      Math.random = originalRandom;
    }
  });
});

// ──────────────────────────────────────────────────────────────
// orderFactsByDifficulty
// ──────────────────────────────────────────────────────────────

describe('orderFactsByDifficulty', () => {
  it('returns empty array for empty input', () => {
    expect(orderFactsByDifficulty([])).toEqual([]);
  });

  it('result[0] is vague when vague facts exist', () => {
    const facts = [
      makeFact(1, 'identifying'),
      makeFact(2, 'vague'),
      makeFact(3, 'moderate'),
    ];
    const result = orderFactsByDifficulty(facts);
    expect(result[0].difficultyTier).toBe('vague');
  });

  it('result[last] is identifying when identifying facts exist', () => {
    const facts = [
      makeFact(1, 'identifying'),
      makeFact(2, 'vague'),
      makeFact(3, 'moderate'),
    ];
    const result = orderFactsByDifficulty(facts);
    expect(result[result.length - 1].difficultyTier).toBe('identifying');
  });

  it('preserves all input facts (no drops)', () => {
    const facts = [
      makeFact(1, 'identifying'),
      makeFact(2, 'vague'),
      makeFact(3, 'moderate'),
      makeFact(4, 'vague'),
      makeFact(5, 'identifying'),
    ];
    const result = orderFactsByDifficulty(facts);
    expect(result).toHaveLength(facts.length);
    const ids = result.map((f) => f.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('groups tiers in order: all vague before moderate before identifying', () => {
    const facts = [
      makeFact(1, 'identifying'),
      makeFact(2, 'vague'),
      makeFact(3, 'moderate'),
      makeFact(4, 'vague'),
      makeFact(5, 'moderate'),
      makeFact(6, 'identifying'),
    ];
    const result = orderFactsByDifficulty(facts);

    let seenModerate = false;
    let seenIdentifying = false;

    for (const fact of result) {
      if (fact.difficultyTier === 'moderate') seenModerate = true;
      if (fact.difficultyTier === 'identifying') seenIdentifying = true;

      if (fact.difficultyTier === 'vague') {
        expect(seenModerate).toBe(false);
        expect(seenIdentifying).toBe(false);
      }
      if (fact.difficultyTier === 'moderate') {
        expect(seenIdentifying).toBe(false);
      }
    }
  });

  it('handles a pool with only one tier', () => {
    const facts = [
      makeFact(1, 'moderate'),
      makeFact(2, 'moderate'),
      makeFact(3, 'moderate'),
    ];
    const result = orderFactsByDifficulty(facts);
    expect(result).toHaveLength(3);
    for (const f of result) {
      expect(f.difficultyTier).toBe('moderate');
    }
  });

  it('handles a pool with only identifying facts', () => {
    const facts = [makeFact(1, 'identifying'), makeFact(2, 'identifying')];
    const result = orderFactsByDifficulty(facts);
    expect(result).toHaveLength(2);
    expect(result[result.length - 1].difficultyTier).toBe('identifying');
  });

  it('does not mutate the input array', () => {
    const facts = [
      makeFact(1, 'identifying'),
      makeFact(2, 'vague'),
      makeFact(3, 'moderate'),
    ];
    const copy = [...facts];
    orderFactsByDifficulty(facts);
    expect(facts).toEqual(copy);
  });

  it('returns a new array reference', () => {
    const facts = [makeFact(1, 'vague')];
    expect(orderFactsByDifficulty(facts)).not.toBe(facts);
  });
});
