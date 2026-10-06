import { renderHook } from '@testing-library/react';
import { useFetchDraftPlayer } from './useFetchDraftPlayer';

const mockQuery = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockQuery }),
}));

describe('useFetchDraftPlayer (LS-10627)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('maps the queried player to an AvailableDraftPlayer', async () => {
    mockQuery.mockResolvedValue({
      data: {
        player: {
          id: 555,
          firstName: 'Bobby',
          lastName: 'Witt Jr.',
          eligiblePositions: ['SS'],
          mlbPlayerId: 677951,
          club: 'KC',
        },
      },
    });
    const { result } = renderHook(() => useFetchDraftPlayer());

    await expect(result.current(555)).resolves.toEqual({
      id: 555,
      firstName: 'Bobby',
      lastName: 'Witt Jr.',
      brefId: '',
      eligiblePositions: ['SS'],
      club: 'KC',
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { playerId: 555 } }),
    );
  });

  it('resolves null when the player does not exist', async () => {
    mockQuery.mockResolvedValue({ data: { player: null } });
    const { result } = renderHook(() => useFetchDraftPlayer());

    await expect(result.current(1)).resolves.toBeNull();
  });
});
