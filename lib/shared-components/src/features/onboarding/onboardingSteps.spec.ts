import { ONBOARDING_STEPS, type OnboardingBlock } from './onboardingSteps';

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
    ).toEqual(['/baseball/league/create', null, '/baseball']);
  });
});
