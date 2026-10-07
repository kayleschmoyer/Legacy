import {
  formatWaiverProcessingTimeEt,
  waiverProcessingScheduleCopy,
} from './waiver-schedule';

describe('formatWaiverProcessingTimeEt', () => {
  it('renders 3am ET during daylight time', () => {
    expect(formatWaiverProcessingTimeEt(new Date('2026-10-06T12:00:00Z'))).toBe(
      '3am ET',
    );
  });

  it('renders 2am ET during standard time', () => {
    expect(formatWaiverProcessingTimeEt(new Date('2026-01-15T12:00:00Z'))).toBe(
      '2am ET',
    );
  });

  it('never uses an EST/EDT label', () => {
    for (const iso of ['2026-03-01T00:00:00Z', '2026-07-04T23:59:00Z']) {
      expect(formatWaiverProcessingTimeEt(new Date(iso))).not.toMatch(
        /\bE[SD]T\b/,
      );
    }
  });
});

describe('waiverProcessingScheduleCopy', () => {
  it('describes a daily schedule', () => {
    expect(waiverProcessingScheduleCopy(new Date('2026-10-06T12:00:00Z'))).toBe(
      'processed daily at 3am ET',
    );
  });
});
