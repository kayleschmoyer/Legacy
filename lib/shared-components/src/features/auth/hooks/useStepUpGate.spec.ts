import { act, renderHook } from '@testing-library/react';
import {
  clearStepUp,
  isStepUpFresh,
  markStepUpVerified,
  useStepUpGate,
} from './useStepUpGate';

const STEP_UP_KEY = 'ls_step_up_until';

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe('isStepUpFresh', () => {
  it('returns false when no entry exists', () => {
    expect(isStepUpFresh()).toBe(false);
  });

  it('returns false when the timestamp is in the past', () => {
    sessionStorage.setItem(
      STEP_UP_KEY,
      String(Math.floor(Date.now() / 1000) - 1),
    );
    expect(isStepUpFresh()).toBe(false);
  });

  it('returns true when the timestamp is in the future', () => {
    sessionStorage.setItem(
      STEP_UP_KEY,
      String(Math.floor(Date.now() / 1000) + 900),
    );
    expect(isStepUpFresh()).toBe(true);
  });
});

describe('markStepUpVerified', () => {
  it('stores the validUntil timestamp', () => {
    const ts = Math.floor(Date.now() / 1000) + 900;
    markStepUpVerified(ts);
    expect(sessionStorage.getItem(STEP_UP_KEY)).toBe(String(ts));
  });
});

describe('clearStepUp', () => {
  it('removes the stored timestamp', () => {
    sessionStorage.setItem(STEP_UP_KEY, '99999999');
    clearStepUp();
    expect(sessionStorage.getItem(STEP_UP_KEY)).toBeNull();
  });
});

describe('useStepUpGate', () => {
  it('fires the action immediately when step-up is already fresh', () => {
    sessionStorage.setItem(
      STEP_UP_KEY,
      String(Math.floor(Date.now() / 1000) + 900),
    );
    const { result } = renderHook(() => useStepUpGate());
    const action = jest.fn();

    act(() => {
      result.current.requireStepUp(action);
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.isPrompting).toBe(false);
  });

  it('sets isPrompting and defers the action when step-up is not fresh', () => {
    const { result } = renderHook(() => useStepUpGate());
    const action = jest.fn();

    act(() => {
      result.current.requireStepUp(action);
    });

    expect(result.current.isPrompting).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('clears isPrompting and executes the deferred action on onVerified', () => {
    const { result } = renderHook(() => useStepUpGate());
    const action = jest.fn();
    const validUntil = Math.floor(Date.now() / 1000) + 900;

    act(() => {
      result.current.requireStepUp(action);
    });
    act(() => {
      result.current.onVerified(validUntil);
    });

    expect(result.current.isPrompting).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STEP_UP_KEY)).toBe(String(validUntil));
  });

  it('clears isPrompting without executing the action on onDismiss', () => {
    const { result } = renderHook(() => useStepUpGate());
    const action = jest.fn();

    act(() => {
      result.current.requireStepUp(action);
    });
    act(() => {
      result.current.onDismiss();
    });

    expect(result.current.isPrompting).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
