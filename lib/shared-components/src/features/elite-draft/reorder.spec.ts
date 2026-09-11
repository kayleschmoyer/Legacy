import { moveItem } from './reorder';

describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op when the index is unchanged', () => {
    const items = ['a', 'b', 'c'];
    const result = moveItem(items, 1, 1);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('is a no-op for an out-of-range index', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, -1, 1)).toEqual(items);
    expect(moveItem(items, 0, 5)).toEqual(items);
  });

  it('does not mutate the source array', () => {
    const items = ['a', 'b', 'c'];
    moveItem(items, 0, 2);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
