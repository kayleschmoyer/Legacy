import { act, renderHook } from '@testing-library/react';
import {
  USERNAME_AVAILABILITY_DEBOUNCE_MS,
  useUsernameAvailability,
} from './useUsernameAvailability';

jest.mock('@legacy-sports/graphql', () => ({
  useUsernameAvailableQuery: jest.fn(),
}));

const { useUsernameAvailableQuery } = jest.requireMock(
  '@legacy-sports/graphql',
) as unknown as { useUsernameAvailableQuery: jest.Mock };

describe('useUsernameAvailability (LS-7241)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useUsernameAvailableQuery.mockReset();
    useUsernameAvailableQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const settle = () =>
    act(() => {
      jest.advanceTimersByTime(USERNAME_AVAILABILITY_DEBOUNCE_MS);
    });

  it('is idle and skips the query when not editing', () => {
    const { result } = renderHook(() =>
      useUsernameAvailability('newname', 'oldname', false),
    );
    expect(result.current).toBe('idle');
    expect(useUsernameAvailableQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('is idle for the unchanged or an invalid name', () => {
    expect(
      renderHook(() => useUsernameAvailability(' oldname ', 'oldname', true))
        .result.current,
    ).toBe('idle');
    expect(
      renderHook(() => useUsernameAvailability('ab', 'oldname', true)).result
        .current,
    ).toBe('idle');
  });

  it('waits for the debounce before querying the trimmed name', () => {
    const { result } = renderHook(() =>
      useUsernameAvailability(' newname ', 'oldname', true),
    );
    expect(result.current).toBe('checking');
    expect(useUsernameAvailableQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: true }),
    );

    settle();

    expect(useUsernameAvailableQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: { username: 'newname' },
        skip: false,
        fetchPolicy: 'network-only',
      }),
    );
  });

  it('restarts the debounce on every keystroke', () => {
    const { rerender } = renderHook(
      ({ name }) => useUsernameAvailability(name, 'oldname', true),
      { initialProps: { name: 'newnam' } },
    );
    act(() => {
      jest.advanceTimersByTime(USERNAME_AVAILABILITY_DEBOUNCE_MS - 100);
    });
    rerender({ name: 'newname' });
    act(() => {
      jest.advanceTimersByTime(USERNAME_AVAILABILITY_DEBOUNCE_MS - 100);
    });
    expect(useUsernameAvailableQuery).not.toHaveBeenCalledWith(
      expect.objectContaining({ skip: false }),
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(useUsernameAvailableQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ variables: { username: 'newname' } }),
    );
  });

  it.each([
    [true, 'available'],
    [false, 'taken'],
  ])('maps usernameAvailable=%s to %s', (value, expected) => {
    useUsernameAvailableQuery.mockReturnValue({
      data: { usernameAvailable: value },
      loading: false,
      error: undefined,
    });
    const { result } = renderHook(() =>
      useUsernameAvailability('newname', 'oldname', true),
    );
    settle();
    expect(result.current).toBe(expected);
  });

  it('reports checking while the request is in flight', () => {
    useUsernameAvailableQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    });
    const { result } = renderHook(() =>
      useUsernameAvailability('newname', 'oldname', true),
    );
    settle();
    expect(result.current).toBe('checking');
  });

  it('degrades to unknown when the check errors', () => {
    useUsernameAvailableQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('RATE_LIMITED'),
    });
    const { result } = renderHook(() =>
      useUsernameAvailability('newname', 'oldname', true),
    );
    settle();
    expect(result.current).toBe('unknown');
  });
});
