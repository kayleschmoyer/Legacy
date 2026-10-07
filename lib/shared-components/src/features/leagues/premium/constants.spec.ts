import { ERAS_BY_SPORT } from './constants';
import {
  ERA_FILTERS_BY_SPORT,
  ERA_YEAR_RANGES_BY_SPORT,
} from '../../../config/sports';
import type { SportKind } from '../../../config/sports';
import { ERA_LABELS } from '../../home/homeSummaryFormatters';

const SPORTS: SportKind[] = ['baseball', 'football'];

function expectedYears(start: number, end: number): [string, string] {
  return [String(start), end === 9999 ? 'Now' : String(end)];
}

// LS-10689: the Create League wizard advertised Golden Age as 1920–1945 while
// the Commissioner screen and the backend draft-pool filter used 1920–1960.
// Every surface must show the canonical (enforced) range for each era id.
describe.each(SPORTS)('era year ranges agree across surfaces (%s)', (sport) => {
  const ranges = ERA_YEAR_RANGES_BY_SPORT[sport];
  const eraIds = Object.keys(ranges);

  it('create wizard lists every pre-defined era with its canonical years', () => {
    const wizardIds = ERAS_BY_SPORT[sport]
      .map((era) => era.id)
      .filter((id) => id !== 'all' && id !== 'custom');
    expect(wizardIds).toEqual(eraIds);

    for (const id of eraIds) {
      const [start, end] = expectedYears(ranges[id].start, ranges[id].end);
      const era = ERAS_BY_SPORT[sport].find((e) => e.id === id);
      expect(era?.years).toBe(`${start} – ${end}`);
    }
  });

  it('Commissioner era filter labels carry the canonical years', () => {
    for (const id of eraIds) {
      const { start, end } = ranges[id];
      const option = ERA_FILTERS_BY_SPORT[sport].find((o) => o.value === id);
      expect(option?.label).toContain(
        end === 9999 ? `(${start}+)` : `(${start}-${end})`,
      );
    }
  });

  it('home summary labels carry the canonical years', () => {
    for (const id of eraIds) {
      const [start, end] = expectedYears(ranges[id].start, ranges[id].end);
      expect(ERA_LABELS[id]).toMatch(new RegExp(` · ${start}–${end}$`));
    }
  });
});

describe('baseball era ranges match the backend filter (LS-10689)', () => {
  it('Golden Age is 1920–1960 everywhere', () => {
    expect(ERA_YEAR_RANGES_BY_SPORT.baseball.golden_age).toMatchObject({
      start: 1920,
      end: 1960,
    });
    expect(
      ERAS_BY_SPORT.baseball.find((e) => e.id === 'golden_age')?.years,
    ).toBe('1920 – 1960');
    expect(ERA_LABELS.golden_age).toBe('Golden Age · 1920–1960');
  });

  it('Dead Ball starts at 1871, matching the All Eras floor', () => {
    expect(
      ERAS_BY_SPORT.baseball.find((e) => e.id === 'dead_ball')?.years,
    ).toBe('1871 – 1919');
    expect(ERAS_BY_SPORT.baseball.find((e) => e.id === 'all')?.years).toBe(
      '1871 – Now',
    );
  });
});
