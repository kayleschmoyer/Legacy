import { getPickQuality, hasDraftStarted } from './draftUtils';

describe('getPickQuality', () => {
  it('returns null when the player has no ADP', () => {
    expect(getPickQuality(12, null)).toBeNull();
    expect(getPickQuality(12, undefined)).toBeNull();
  });

  it('returns "Great Pick!" when picked well before ADP', () => {
    expect(getPickQuality(10, 30)).toEqual({
      tier: 'great',
      label: 'Great Pick!',
      variant: 'success',
    });
  });

  it('returns "Good Value" when picked moderately before ADP', () => {
    expect(getPickQuality(20, 30)).toEqual({
      tier: 'good',
      label: 'Good Value',
      variant: 'info',
    });
  });

  it('returns "Reach" when picked well after ADP', () => {
    expect(getPickQuality(30, 10)).toEqual({
      tier: 'reached',
      label: 'Reach',
      variant: 'warning',
    });
  });

  it('returns null when the pick lands close to ADP', () => {
    expect(getPickQuality(12, 15)).toBeNull();
    expect(getPickQuality(15, 12)).toBeNull();
  });
});

describe('hasDraftStarted (LS-10811)', () => {
  it('is false for a scheduled or not-yet-loaded draft', () => {
    expect(hasDraftStarted('not-started')).toBe(false);
    expect(hasDraftStarted('queued')).toBe(false);
    expect(hasDraftStarted(null)).toBe(false);
    expect(hasDraftStarted(undefined)).toBe(false);
  });

  it('is true once the draft is running, paused or done', () => {
    expect(hasDraftStarted('in-progress')).toBe(true);
    expect(hasDraftStarted('paused')).toBe(true);
    expect(hasDraftStarted('completed')).toBe(true);
  });
});
