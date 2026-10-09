import { evictStaleUsernames } from './username-cache';

describe('evictStaleUsernames', () => {
  it('evicts username only on LeagueMember entities for the given user', () => {
    const evict = jest.fn().mockReturnValue(true);
    const gc = jest.fn().mockReturnValue([]);
    const cache = {
      extract: () => ({
        'LeagueMember:{"leagueId":1,"userId":7}': {
          userId: 7,
          username: 'old',
        },
        'LeagueMember:{"leagueId":1,"userId":8}': { userId: 8, username: 'x' },
        'User:7': { id: 7, username: 'new' },
        ROOT_QUERY: {},
      }),
      evict,
      gc,
    };

    evictStaleUsernames(cache, 7);

    expect(evict).toHaveBeenCalledTimes(1);
    expect(evict).toHaveBeenCalledWith({
      id: 'LeagueMember:{"leagueId":1,"userId":7}',
      fieldName: 'username',
    });
    expect(gc).toHaveBeenCalled();
  });
});
