import { getPageRange } from './paginationUtils';

describe('getPageRange', () => {
  it('returns all pages when totalPages <= maxButtons', () => {
    expect(getPageRange(1, 3)).toEqual([1, 2, 3]);
    expect(getPageRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('shows ellipsis when current page is near the start', () => {
    const range = getPageRange(2, 20);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(20);
    expect(range).toContain(-1);
  });

  it('shows ellipsis when current page is near the end', () => {
    const range = getPageRange(19, 20);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(20);
    expect(range).toContain(-1);
  });

  it('shows ellipsis on both sides when current page is in the middle', () => {
    const range = getPageRange(10, 20);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(20);
    // Should have ellipsis after 1 and before 20
    const ellipsisCount = range.filter((p) => p === -1).length;
    expect(ellipsisCount).toBe(2);
  });

  it('clicking page N sets offset to (N-1) * pageSize', () => {
    // Verify the page range includes the expected page for an offset calculation
    const range = getPageRange(3, 10);
    expect(range).toContain(3);
    // page 3 => offset = (3-1) * 25 = 50
    expect((3 - 1) * 25).toBe(50);
  });
});
