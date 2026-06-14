import { nextValue } from './FootballPlayerSort';

describe('nextValue', () => {
  it('activates a new field at asc when no field is active', () => {
    expect(nextValue({ dir: 'asc' }, 'name')).toEqual({
      field: 'name',
      dir: 'asc',
    });
  });

  it('activates a new field at asc when a different field is active', () => {
    expect(nextValue({ field: 'position', dir: 'desc' }, 'name')).toEqual({
      field: 'name',
      dir: 'asc',
    });
  });

  it('advances asc → desc when the same field is clicked', () => {
    expect(nextValue({ field: 'name', dir: 'asc' }, 'name')).toEqual({
      field: 'name',
      dir: 'desc',
    });
  });

  it('clears sort when desc field is clicked (desc → off)', () => {
    expect(nextValue({ field: 'name', dir: 'desc' }, 'name')).toEqual({
      field: undefined,
      dir: 'asc',
    });
  });

  it('works for all valid sort fields', () => {
    for (const field of ['name', 'position', 'team'] as const) {
      expect(nextValue({ dir: 'asc' }, field).field).toBe(field);
    }
  });
});
