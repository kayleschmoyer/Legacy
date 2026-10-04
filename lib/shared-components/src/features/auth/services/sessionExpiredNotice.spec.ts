import {
  consumeSessionExpiredNotice,
  markSessionExpiredNotice,
} from './sessionExpiredNotice';

describe('sessionExpiredNotice', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns false when no notice is armed', () => {
    expect(consumeSessionExpiredNotice()).toBe(false);
  });

  it('returns true once after the notice is armed, then false', () => {
    markSessionExpiredNotice();
    expect(consumeSessionExpiredNotice()).toBe(true);
    expect(consumeSessionExpiredNotice()).toBe(false);
  });
});
