import { isDraftPaused, isDraftRoomReachable } from './draftStatus';

describe('isDraftRoomReachable', () => {
  it.each(['in-progress', 'drafting', 'paused'])(
    'returns true for %s',
    (status) => {
      expect(isDraftRoomReachable(status)).toBe(true);
    },
  );

  it.each(['not-started', 'queued', 'completed', 'pre-draft'])(
    'returns false for %s',
    (status) => {
      expect(isDraftRoomReachable(status)).toBe(false);
    },
  );

  it('returns false for null/undefined', () => {
    expect(isDraftRoomReachable(null)).toBe(false);
    expect(isDraftRoomReachable(undefined)).toBe(false);
  });
});

describe('isDraftPaused', () => {
  it('returns true only for paused', () => {
    expect(isDraftPaused('paused')).toBe(true);
  });

  it.each([
    'in-progress',
    'drafting',
    'not-started',
    'completed',
    null,
    undefined,
  ])('returns false for %s', (status) => {
    expect(isDraftPaused(status)).toBe(false);
  });
});
