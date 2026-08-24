import { MatchupStatus } from '@legacy-sports/graphql';
import { formatMatchupTimeInfo } from './matchupTimeInfo';

describe('formatMatchupTimeInfo', () => {
  it('returns a Kickoff label for scheduled matchups with a startTime', () => {
    const result = formatMatchupTimeInfo(
      MatchupStatus.Scheduled,
      '2026-09-07T17:00:00.000Z',
      null,
    );
    expect(result).toMatch(/^Kickoff /);
  });

  it('returns an Ends label for in-progress matchups with an endTime', () => {
    const result = formatMatchupTimeInfo(
      MatchupStatus.InProgress,
      null,
      '2026-09-08T01:00:00.000Z',
    );
    expect(result).toMatch(/^Ends /);
  });

  it('returns null for completed matchups', () => {
    expect(
      formatMatchupTimeInfo(
        MatchupStatus.Completed,
        '2026-09-07T17:00:00.000Z',
        '2026-09-08T01:00:00.000Z',
      ),
    ).toBeNull();
  });

  it('returns null for cancelled matchups', () => {
    expect(
      formatMatchupTimeInfo(
        MatchupStatus.Cancelled,
        '2026-09-07T17:00:00.000Z',
        '2026-09-08T01:00:00.000Z',
      ),
    ).toBeNull();
  });

  it('returns null when scheduled but startTime is missing', () => {
    expect(
      formatMatchupTimeInfo(MatchupStatus.Scheduled, null, null),
    ).toBeNull();
  });

  it('returns null when in progress but endTime is missing', () => {
    expect(
      formatMatchupTimeInfo(MatchupStatus.InProgress, null, null),
    ).toBeNull();
  });

  it('returns null when status is null or undefined', () => {
    expect(
      formatMatchupTimeInfo(null, '2026-09-07T17:00:00.000Z', null),
    ).toBeNull();
    expect(
      formatMatchupTimeInfo(undefined, null, '2026-09-08T01:00:00.000Z'),
    ).toBeNull();
  });

  it('returns null for an invalid timestamp', () => {
    expect(
      formatMatchupTimeInfo(MatchupStatus.Scheduled, 'not-a-date', null),
    ).toBeNull();
  });
});
