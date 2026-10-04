import { act, renderHook, waitFor } from '@testing-library/react';
import {
  INVITE_CODE_DEBOUNCE_MS,
  useInviteCodeValidation,
} from './useInviteCodeValidation';
import type { InviteCodeLeague } from './joinLeagueTypes';

const LEAGUE: InviteCodeLeague = {
  leagueId: 7,
  leagueName: 'Legacy League',
  totalSpots: 12,
  availableSpots: 4,
  isFull: false,
  isAlreadyMember: false,
};

describe('useInviteCodeValidation (LS-8812, preserves the pre-redesign contract)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('is idle and never calls the server below 8 characters', () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC1', validate),
    );

    act(() => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
    });

    expect(validate).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('does not call the server for an 8-character code with invalid characters', () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    renderHook(() => useInviteCodeValidation('ABC-12XY', validate));

    act(() => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
    });

    expect(validate).not.toHaveBeenCalled();
  });

  it('debounces by 400ms before validating a complete code', () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    renderHook(() => useInviteCodeValidation('ABC12XYZ', validate));

    act(() => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS - 1);
    });
    expect(validate).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(validate).toHaveBeenCalledWith('ABC12XYZ');
  });

  it('reports checking while the request is in flight', () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC12XYZ', validate),
    );

    expect(result.current.status).toBe('checking');
  });

  it('normalizes the code to upper case before validating', () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    renderHook(() => useInviteCodeValidation(' abc12xyz ', validate));

    act(() => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
    });

    expect(validate).toHaveBeenCalledWith('ABC12XYZ');
  });

  it('resolves to valid for a joinable league', async () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC12XYZ', validate),
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('valid'));
    expect(result.current.league).toEqual(LEAGUE);
  });

  it('resolves to invalid when the code is unknown', async () => {
    const validate = jest.fn().mockResolvedValue(null);
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC12XYZ', validate),
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('invalid'));
  });

  it('treats a rejected lookup as an invalid code rather than throwing', async () => {
    const validate = jest.fn().mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC12XYZ', validate),
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('invalid'));
  });

  it('reports full for a league with no spots left', async () => {
    const validate = jest
      .fn()
      .mockResolvedValue({ ...LEAGUE, isFull: true, availableSpots: 0 });
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC12XYZ', validate),
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('full'));
  });

  it('reports alreadyMember ahead of full when both apply', async () => {
    const validate = jest
      .fn()
      .mockResolvedValue({ ...LEAGUE, isFull: true, isAlreadyMember: true });
    const { result } = renderHook(() =>
      useInviteCodeValidation('ABC12XYZ', validate),
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('alreadyMember'));
  });

  it('discards a stale response that lands after a newer code was entered', async () => {
    let resolveFirst: (value: InviteCodeLeague | null) => void = () =>
      undefined;
    const validate = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<InviteCodeLeague | null>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...LEAGUE, leagueName: 'Second League' });

    const { result, rerender } = renderHook(
      ({ code }: { code: string }) => useInviteCodeValidation(code, validate),
      { initialProps: { code: 'AAAAAAAA' } },
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    // User keeps typing — a second request supersedes the first.
    rerender({ code: 'BBBBBBBB' });
    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });

    // The first request finally answers, out of order.
    await act(async () => {
      resolveFirst({ ...LEAGUE, leagueName: 'Stale League' });
      // Let the superseded promise's .then run so the guard is exercised.
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.league?.leagueName).toBe('Second League'),
    );
  });

  it('clears a resolved league when the code is edited back below 8 characters', async () => {
    const validate = jest.fn().mockResolvedValue(LEAGUE);
    const { result, rerender } = renderHook(
      ({ code }: { code: string }) => useInviteCodeValidation(code, validate),
      { initialProps: { code: 'ABC12XYZ' } },
    );

    await act(async () => {
      jest.advanceTimersByTime(INVITE_CODE_DEBOUNCE_MS);
      // Flush the validation promise the timer just kicked off.
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status).toBe('valid'));

    rerender({ code: 'ABC12XY' });

    expect(result.current.status).toBe('idle');
    expect(result.current.league).toBeNull();
  });
});
