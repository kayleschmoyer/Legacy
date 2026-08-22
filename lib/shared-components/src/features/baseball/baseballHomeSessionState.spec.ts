import {
  readBaseballHomeSearch,
  readBaseballHomeShowArchived,
  writeBaseballHomeSearch,
  writeBaseballHomeShowArchived,
} from './baseballHomeSessionState';

const SEARCH_KEY = 'ls_baseball_home_search';
const SHOW_ARCHIVED_KEY = 'ls_baseball_home_show_archived';

beforeEach(() => {
  sessionStorage.clear();
});

describe('readBaseballHomeSearch / writeBaseballHomeSearch', () => {
  it('returns an empty string when nothing is stored', () => {
    expect(readBaseballHomeSearch()).toBe('');
  });

  it('round-trips a written value', () => {
    writeBaseballHomeSearch('Dynasty');
    expect(sessionStorage.getItem(SEARCH_KEY)).toBe('Dynasty');
    expect(readBaseballHomeSearch()).toBe('Dynasty');
  });

  it('removes the key entirely when written empty', () => {
    writeBaseballHomeSearch('Dynasty');
    writeBaseballHomeSearch('');
    expect(sessionStorage.getItem(SEARCH_KEY)).toBeNull();
    expect(readBaseballHomeSearch()).toBe('');
  });
});

describe('readBaseballHomeShowArchived / writeBaseballHomeShowArchived', () => {
  it('defaults to false when nothing is stored', () => {
    expect(readBaseballHomeShowArchived()).toBe(false);
  });

  it('round-trips true', () => {
    writeBaseballHomeShowArchived(true);
    expect(sessionStorage.getItem(SHOW_ARCHIVED_KEY)).toBe('1');
    expect(readBaseballHomeShowArchived()).toBe(true);
  });

  it('removes the key when written false', () => {
    writeBaseballHomeShowArchived(true);
    writeBaseballHomeShowArchived(false);
    expect(sessionStorage.getItem(SHOW_ARCHIVED_KEY)).toBeNull();
    expect(readBaseballHomeShowArchived()).toBe(false);
  });
});
