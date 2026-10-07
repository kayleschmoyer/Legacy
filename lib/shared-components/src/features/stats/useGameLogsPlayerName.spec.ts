import { renderHook } from '@testing-library/react';
import { useGameLogsPlayerName } from './useGameLogsPlayerName';

const mockQuery = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerIdByBrefIdQuery: (opts: unknown) => mockQuery(opts) as unknown,
}));

describe('useGameLogsPlayerName (LS-10661)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns undefined and skips the query without a bref id', () => {
    mockQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useGameLogsPlayerName(undefined));
    expect(result.current).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('returns an empty string while the lookup is in flight', () => {
    mockQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useGameLogsPlayerName('fosteru01'));
    expect(result.current).toBe('');
  });

  it('returns the resolved full name', () => {
    mockQuery.mockReturnValue({
      data: {
        playerByBrefId: { id: 1, firstName: 'Rube', lastName: 'Foster' },
      },
    });
    const { result } = renderHook(() => useGameLogsPlayerName('FosterU01'));
    expect(result.current).toBe('Rube Foster');
    expect(mockQuery).toHaveBeenCalledWith({
      variables: { brefId: 'fosteru01' },
      skip: false,
    });
  });
});
