import {
  compactStatFor,
  GAME_TEMPLATES,
  type MinigameId,
  STAT_PLACEHOLDER,
  statFor,
  UNLIMITED_STAT,
} from './MinigamesHub.shared';

const NO_STATS = {
  activeGamesCount: null,
  bestScore: null,
  tokens: null,
  mockDraftsRemaining: null,
};

describe('GAME_TEMPLATES', () => {
  it('gives every game its own icon kind (LS-8800)', () => {
    const kinds = GAME_TEMPLATES.map((t) => t.iconKind);

    expect(kinds).toEqual(['draft', 'stats', 'quiz', 'mockDraft']);
    expect(new Set(kinds).size).toBe(GAME_TEMPLATES.length);
  });

  it('keeps the accent mapping the Game Room icon boxes read from', () => {
    expect(GAME_TEMPLATES.map((t) => [t.id, t.accent])).toEqual([
      ['season-draft', 'navy'],
      ['disclosure', 'seam'],
      ['twenty-questions', 'navy'],
      ['mock-draft', 'navy'],
    ]);
  });
});

describe('statFor', () => {
  // The two existing hubs render these labels; the Game Room redesign added
  // compactStatFor alongside rather than changing them.
  it('returns the long-form labels unchanged', () => {
    const args = { activeGamesCount: 2, bestScore: 7, mockDraftsRemaining: 1 };

    expect(statFor('season-draft', args)).toEqual({
      label: 'Games Active',
      value: '2',
    });
    expect(statFor('disclosure', args)).toEqual({
      label: 'Your Best',
      value: '7',
    });
    expect(statFor('twenty-questions', args)).toEqual({
      label: 'Questions',
      value: '20',
    });
    expect(statFor('mock-draft', args)).toEqual({
      label: 'Drafts Left',
      value: '1',
    });
  });

  it('shows ∞ instead of a count for unlimited mock drafts (LS-10463)', () => {
    expect(
      statFor('mock-draft', {
        activeGamesCount: null,
        bestScore: null,
        mockDraftsRemaining: null,
        mockDraftsUnlimited: true,
      }),
    ).toEqual({ label: 'Drafts Left', value: UNLIMITED_STAT });
  });
});

describe('compactStatFor', () => {
  it('returns the Active / Best / Tokens / Left chips with their tones', () => {
    const args = {
      activeGamesCount: 2,
      bestScore: 7,
      tokens: 40,
      mockDraftsRemaining: 1,
    };

    expect(compactStatFor('season-draft', args)).toEqual({
      label: 'Active',
      value: '2',
      tone: 'gold',
    });
    expect(compactStatFor('disclosure', args)).toEqual({
      label: 'Best',
      value: '7',
      tone: 'gold',
    });
    expect(compactStatFor('twenty-questions', args)).toEqual({
      label: 'Tokens',
      value: '40',
      tone: 'neutral',
    });
    expect(compactStatFor('mock-draft', args)).toEqual({
      label: 'Left',
      value: '1',
      tone: 'neutral',
    });
  });

  it('falls back to the placeholder for every unavailable value', () => {
    for (const template of GAME_TEMPLATES) {
      expect(compactStatFor(template.id, NO_STATS).value).toBe(
        STAT_PLACEHOLDER,
      );
    }
  });

  it('distinguishes a real zero from an unknown value', () => {
    expect(
      compactStatFor('season-draft', { ...NO_STATS, activeGamesCount: 0 })
        .value,
    ).toBe('0');
  });

  it('shows ∞ instead of a count for unlimited mock drafts (LS-10463)', () => {
    expect(
      compactStatFor('mock-draft', {
        ...NO_STATS,
        mockDraftsUnlimited: true,
      }),
    ).toEqual({ label: 'Left', value: UNLIMITED_STAT, tone: 'neutral' });
  });

  it('covers every game in the catalog', () => {
    const ids: MinigameId[] = GAME_TEMPLATES.map((t) => t.id);

    for (const id of ids) {
      expect(compactStatFor(id, NO_STATS).label).not.toBe('');
    }
  });
});
