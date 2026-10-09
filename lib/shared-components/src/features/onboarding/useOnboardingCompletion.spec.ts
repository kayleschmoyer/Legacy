import { act, renderHook } from '@testing-library/react';
import { LOGGER } from '@legacy-sports/logging';
import { useOnboardingCompletion } from './useOnboardingCompletion';
import {
  LEGACY_ONBOARDING_KEY,
  type OnboardingStorage,
} from './onboardingCompletion';

interface PrefsResult {
  data?: { getUserPreferences: { onboardingCompletedAt: string | null } };
  loading: boolean;
  error?: Error;
}

const mockUsePrefs = jest.fn<PrefsResult, [unknown]>();
const mockUpdate = jest.fn<Promise<unknown>, [unknown]>();
jest.mock('@legacy-sports/graphql', () => ({
  useGetUserPreferencesQuery: (args: unknown): PrefsResult =>
    mockUsePrefs(args),
  useUpdateUserPreferencesMutation: () => [mockUpdate],
}));

const KEY = 'ls_onboarding_complete_7';
const STEP_KEY = 'ls_onboarding_step_7';
const serverNull: PrefsResult = {
  data: { getUserPreferences: { onboardingCompletedAt: null } },
  loading: false,
};
const serverDone: PrefsResult = {
  data: { getUserPreferences: { onboardingCompletedAt: '2026-01-01T00:00Z' } },
  loading: false,
};

function makeStorage(
  initial: Record<string, string> = {},
): OnboardingStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const render = (storage: OnboardingStorage, userId: number | null = 7) =>
  renderHook(() =>
    useOnboardingCompletion({ userId, storage, clearKeys: [STEP_KEY] }),
  );

describe('useOnboardingCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePrefs.mockReturnValue(serverNull);
    mockUpdate.mockResolvedValue({});
  });

  it('does not resolve while the server query is loading', () => {
    mockUsePrefs.mockReturnValue({ data: undefined, loading: true });
    const { result } = render(makeStorage());
    expect(result.current).toMatchObject({
      resolved: false,
      shouldAutoShow: false,
    });
  });

  it('auto-shows when neither server nor local is complete', () => {
    const { result } = render(makeStorage());
    expect(result.current).toMatchObject({
      resolved: true,
      shouldAutoShow: true,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('never auto-shows when the server flag is set, and seeds local', () => {
    mockUsePrefs.mockReturnValue(serverDone);
    const storage = makeStorage({ [STEP_KEY]: '3' });
    const { result } = render(storage);
    expect(result.current.shouldAutoShow).toBe(false);
    expect(storage.data.get(KEY)).toBe('true');
    expect(storage.data.has(STEP_KEY)).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('treats local-only completion as complete and backfills the server once', () => {
    const storage = makeStorage({ [KEY]: 'true' });
    const { result, rerender } = render(storage);
    rerender();
    expect(result.current.shouldAutoShow).toBe(false);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      variables: { input: { markOnboardingComplete: true } },
    });
  });

  it('migrates the legacy global key and backfills', () => {
    const storage = makeStorage({ [LEGACY_ONBOARDING_KEY]: 'true' });
    const { result } = render(storage);
    expect(result.current.shouldAutoShow).toBe(false);
    expect(storage.data.get(KEY)).toBe('true');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local flag on server failure without backfilling', () => {
    const warn = jest.spyOn(LOGGER, 'warn').mockImplementation(() => undefined);
    mockUsePrefs.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('offline'),
    });
    const incomplete = render(makeStorage());
    expect(incomplete.result.current.shouldAutoShow).toBe(true);
    const complete = render(makeStorage({ [KEY]: 'true' }));
    expect(complete.result.current.shouldAutoShow).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not auto-show and logs when local storage throws', () => {
    const error = jest
      .spyOn(LOGGER, 'error')
      .mockImplementation(() => undefined);
    const storage = makeStorage();
    storage.getItem = () => {
      throw new Error('SecurityError');
    };
    const { result } = render(storage);
    expect(result.current.shouldAutoShow).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('markComplete writes server and local once, and clears the step key', () => {
    const storage = makeStorage({ [STEP_KEY]: '2' });
    const { result } = render(storage);
    act(() => result.current.markComplete());
    act(() => result.current.markComplete());
    expect(storage.data.get(KEY)).toBe('true');
    expect(storage.data.has(STEP_KEY)).toBe(false);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.shouldAutoShow).toBe(false);
  });

  it('logs a failed server write instead of swallowing it', async () => {
    const error = jest
      .spyOn(LOGGER, 'error')
      .mockImplementation(() => undefined);
    mockUpdate.mockRejectedValue(new Error('network'));
    const { result } = render(makeStorage());
    await act(async () => {
      result.current.markComplete();
      await Promise.resolve();
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('does nothing without a user', () => {
    const { result } = render(makeStorage(), null);
    expect(result.current.resolved).toBe(false);
    act(() => result.current.markComplete());
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
