import { computeRosterLockTime } from './PublicDbClient';

// LS-6368 (FMD-043): the scheduled→in_progress lock is driven by an absolute
// UTC instant (matchup.startTime), so it's already timezone-correct — a 1pm
// ET kickoff locks at the same instant no matter what timezone the caller
// expresses `matchupStartTime` in. These tests pin that down, and cover the
// rosterLockTiming variants used by both `isRosterLocked` and the new
// `Matchup.lockTime` GraphQL resolver.
describe('computeRosterLockTime', () => {
  const kickoffUtc = '2026-09-14T17:00:00.000Z'; // 1pm ET
  const kickoffWithOffset = '2026-09-14T13:00:00.000-04:00'; // same instant

  it('returns the matchup start time for "matchup_start"', () => {
    const result = computeRosterLockTime(kickoffUtc, 'matchup_start', null);
    expect(result).toEqual(new Date(kickoffUtc));
  });

  it('defaults to the matchup start time when rosterLockTiming is unrecognized', () => {
    const result = computeRosterLockTime(kickoffUtc, 'some_future_value', null);
    expect(result).toEqual(new Date(kickoffUtc));
  });

  it('is timezone-agnostic: a UTC timestamp and an equivalent offset timestamp compute the same lock time', () => {
    const utcResult = computeRosterLockTime(kickoffUtc, 'matchup_start', null);
    const offsetResult = computeRosterLockTime(
      kickoffWithOffset,
      'matchup_start',
      null,
    );
    expect(utcResult).toEqual(offsetResult);
  });

  it('subtracts 24 hours for "day_before"', () => {
    const result = computeRosterLockTime(kickoffUtc, 'day_before', null);
    expect(result).toEqual(new Date('2026-09-13T17:00:00.000Z'));
  });

  it('subtracts 7 days for "week_before"', () => {
    const result = computeRosterLockTime(kickoffUtc, 'week_before', null);
    expect(result).toEqual(new Date('2026-09-07T17:00:00.000Z'));
  });

  it('subtracts lockHoursBeforeMatchup for "custom" when configured', () => {
    const result = computeRosterLockTime(kickoffUtc, 'custom', {
      lockHoursBeforeMatchup: 3,
    });
    expect(result).toEqual(new Date('2026-09-14T14:00:00.000Z'));
  });

  it('falls back to matchup start for "custom" without lockHoursBeforeMatchup', () => {
    const result = computeRosterLockTime(kickoffUtc, 'custom', {});
    expect(result).toEqual(new Date(kickoffUtc));
  });

  it('prefers an explicit customLockTime over rosterLockTiming entirely', () => {
    const result = computeRosterLockTime(kickoffUtc, 'day_before', {
      customLockTime: '2026-09-10T00:00:00.000Z',
    });
    expect(result).toEqual(new Date('2026-09-10T00:00:00.000Z'));
  });

  it('returns null when there is no matchup start time and no custom lock time', () => {
    expect(computeRosterLockTime(null, 'matchup_start', null)).toBeNull();
    expect(computeRosterLockTime(undefined, 'matchup_start', null)).toBeNull();
  });

  it('honors an explicit customLockTime even with no matchup start time', () => {
    const result = computeRosterLockTime(null, 'matchup_start', {
      customLockTime: '2026-09-10T00:00:00.000Z',
    });
    expect(result).toEqual(new Date('2026-09-10T00:00:00.000Z'));
  });

  it('returns null instead of an Invalid Date for a malformed matchup start time', () => {
    expect(
      computeRosterLockTime('not-a-real-timestamp', 'matchup_start', null),
    ).toBeNull();
  });

  it('returns null instead of an Invalid Date for a malformed customLockTime', () => {
    expect(
      computeRosterLockTime(kickoffUtc, 'day_before', {
        customLockTime: 'not-a-real-timestamp',
      }),
    ).toBeNull();
  });
});
