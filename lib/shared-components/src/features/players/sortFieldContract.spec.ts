import {
  CAREER_BATTING_SORT_FIELDS,
  CAREER_PITCHING_SORT_FIELDS,
} from '@legacy-sports/utils';
import { COLUMN_TO_SORT_FIELD_MAP } from './PlayerStatsDataGrid';
import {
  isValidPitchingSortField,
  PITCHING_COLUMN_TO_SORT_FIELD_MAP,
} from './PitchingStatsDataGrid';

/**
 * Runtime half of the sort-field contract (LS-10690): every sort field a grid
 * column maps to must be in the shared CAREER_*_SORT_FIELDS list, whose
 * entries db-client's StatisticsService.spec proves have explicit ORDER BY
 * cases. The map types enforce this at compile time; this keeps it enforced
 * even if a map is widened to `Record<string, string>`.
 */
describe('stats grid sort maps stay within the server sort-field contract', () => {
  const pitchingContract = new Set<string>(CAREER_PITCHING_SORT_FIELDS);
  const battingContract = new Set<string>(CAREER_BATTING_SORT_FIELDS);

  it.each(Object.entries(PITCHING_COLUMN_TO_SORT_FIELD_MAP))(
    'pitching column "%s" → "%s" is a contract field',
    (_column, field) => {
      expect(pitchingContract.has(field)).toBe(true);
    },
  );

  it.each(Object.entries(COLUMN_TO_SORT_FIELD_MAP))(
    'batting column "%s" → "%s" is a contract field',
    (_column, field) => {
      expect(battingContract.has(field)).toBe(true);
    },
  );

  it('maps the IP / WHIP / K/9 / Player columns to the fields fixed in LS-10690', () => {
    expect(PITCHING_COLUMN_TO_SORT_FIELD_MAP).toMatchObject({
      inningsPitched: 'outsRecorded',
      whip: 'whip',
      strikeoutsPerNine: 'strikeoutsPerNine',
      playerName: 'lastName',
    });
  });

  it('allow-lists only real pitching sort fields', () => {
    expect(isValidPitchingSortField('whip')).toBe(true);
    expect(isValidPitchingSortField('outsRecorded')).toBe(true);
    expect(isValidPitchingSortField('homeRuns; DROP TABLE')).toBe(false);
    expect(isValidPitchingSortField('inningsPitched')).toBe(false);
  });
});
