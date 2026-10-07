import { describeExportScope, filterByAvailability } from './exportScope';
import { toExportCell } from '../exportColumns';

describe('describeExportScope (LS-10731)', () => {
  const base = {
    viewMode: 'hitters' as const,
    battingTotal: 1_096,
    pitchingTotal: null,
    cap: 5_000,
    availabilityActive: false,
  };

  it('states that every filtered row is exported', () => {
    expect(describeExportScope(base)).toBe('Export includes all 1,096 hitters');
  });

  it('covers both tables in combined view', () => {
    expect(
      describeExportScope({
        ...base,
        viewMode: 'combined',
        battingTotal: 25,
        pitchingTotal: 8,
      }),
    ).toBe('Export includes all 25 hitters + all 8 pitchers');
  });

  it('says plainly when the cap cuts the export short', () => {
    expect(
      describeExportScope({
        ...base,
        viewMode: 'combined',
        battingTotal: 12_345,
        pitchingTotal: 312,
      }),
    ).toBe(
      'Export includes first 5,000 of 12,345 hitters + all 312 pitchers (5,000-row cap per table)',
    );
  });

  it('mentions the client-side availability filter', () => {
    expect(describeExportScope({ ...base, availabilityActive: true })).toBe(
      'Export includes all 1,096 hitters, narrowed by your availability filter',
    );
  });

  it('returns null until each table in the view has a total', () => {
    expect(describeExportScope({ ...base, battingTotal: null })).toBeNull();
    expect(
      describeExportScope({
        ...base,
        viewMode: 'combined',
        pitchingTotal: null,
      }),
    ).toBeNull();
  });
});

describe('filterByAvailability (LS-10731)', () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const rostered = new Set([2]);
  const id = (r: { id: number }) => r.id;

  it('keeps every row for "all" or without roster data', () => {
    expect(filterByAvailability(rows, id, 'all', rostered)).toBe(rows);
    expect(filterByAvailability(rows, id, 'rostered', undefined)).toBe(rows);
  });

  it('applies the same split as the grids', () => {
    expect(filterByAvailability(rows, id, 'rostered', rostered)).toEqual([
      { id: 2 },
    ]);
    expect(filterByAvailability(rows, id, 'free_agents', rostered)).toEqual([
      { id: 1 },
      { id: 3 },
    ]);
  });
});

describe('toExportCell (LS-10731)', () => {
  it('turns grid placeholders into empty cells', () => {
    expect(toExportCell('—')).toBe('');
    expect(toExportCell('-')).toBe('');
  });

  it('keeps numbers numeric and formatted strings verbatim', () => {
    expect(toExportCell('320')).toBe(320);
    expect(toExportCell('6.2')).toBe(6.2);
    expect(toExportCell('.288')).toBe('.288');
    expect(toExportCell('SP, RP')).toBe('SP, RP');
  });
});
