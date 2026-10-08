import {
  ONBOARDING_SAMPLE_GAME_SLOTS,
  ONBOARDING_SAMPLE_SEASON,
  ONBOARDING_SAMPLE_WEEK_LABEL,
  ONBOARDING_STEPS,
  type OnboardingBlock,
} from './onboardingSteps';

describe('ONBOARDING_STEPS', () => {
  it('keeps the six tutorial steps in order', () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      'welcome',
      'season-assignment',
      'game-selection',
      'scoring',
      'sample-matchup',
      'get-started',
    ]);
  });

  it('has unique ids and non-empty titles/blocks', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ONBOARDING_STEPS.forEach((s) => {
      expect(s.title).not.toBe('');
      expect(s.blocks.length).toBeGreaterThan(0);
    });
  });

  it('keeps web copy for titles', () => {
    expect(ONBOARDING_STEPS[0].title).toBe('Welcome to Legacy Sports');
    expect(ONBOARDING_STEPS[5].title).toBe("You're Ready to Play!");
  });

  it('exposes the web-only illustrations as slots', () => {
    const slots = ONBOARDING_STEPS.flatMap((s) => s.blocks)
      .filter(
        (b): b is Extract<OnboardingBlock, { type: 'slot' }> =>
          b.type === 'slot',
      )
      .map((b) => b.slot);
    expect(slots).toEqual(['game-slots-example', 'sample-matchup-card']);
  });

  it('ends with the quick-start checklist linking to league routes', () => {
    const checklist = ONBOARDING_STEPS[5].blocks.find(
      (b) => b.type === 'checklist',
    );
    expect(
      checklist?.type === 'checklist' && checklist.items.map((i) => i.link),
    ).toEqual(['/baseball/league/create', null, '/baseball', '/pricing']);
  });

  describe('copy (LS-10774)', () => {
    const step = (id: string) => ONBOARDING_STEPS.find((s) => s.id === id);

    it('starts the Game Selection step with a capital letter', () => {
      const first = step('game-selection')?.blocks[0];
      const lead = first?.type === 'paragraph' ? first.inlines[0] : undefined;
      const leadText =
        lead?.type === 'tooltip' ? lead.term : (lead?.text ?? '');
      expect(leadText).toBe('Game selection');
    });

    it('labels the earned-run row ER and uses US spelling', () => {
      const blocks = step('scoring')?.blocks ?? [];
      const table = blocks.find((b) => b.type === 'scoring-table');
      expect(
        table?.type === 'scoring-table' && table.rows.map((r) => r.stat),
      ).toContain('Earned Run Allowed (ER)');
      expect(JSON.stringify(blocks)).not.toMatch(/customise/);
      expect(JSON.stringify(blocks)).toMatch(/customize scoring weights/);
    });

    it('spans the sample week label across every sample game date', () => {
      const day = (date: string) => date.replace(/^Aug (\d+),.*$/, '$1');
      const first = day(ONBOARDING_SAMPLE_GAME_SLOTS[0].date);
      const last = day(
        ONBOARDING_SAMPLE_GAME_SLOTS[ONBOARDING_SAMPLE_GAME_SLOTS.length - 1]
          .date,
      );
      expect(ONBOARDING_SAMPLE_WEEK_LABEL).toBe(
        `Week 7 · Aug ${first}–${last}, ${ONBOARDING_SAMPLE_SEASON}`,
      );
      expect(ONBOARDING_SAMPLE_WEEK_LABEL).toBe('Week 7 · Aug 5–14, 2019');
    });
  });
});
