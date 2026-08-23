import { getPickQuality } from './draftUtils';

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
